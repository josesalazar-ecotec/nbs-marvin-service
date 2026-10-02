import os
from core.db import get_connection
from core.sesion import actualizar_estado, cargar_sesion
from datetime import datetime

async def enviar_a_supervision(sesion_id: str, documentos: dict,
                                proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor()

    for tipo_doc, doc_data in documentos.items():
        cur.execute("""
            INSERT INTO documentos
              (proyecto_id, tipo, contenido_md, estado, bloqueado, generado_con_ia)
            VALUES (%s, %s, %s, 'pendiente', 0, 1)
            ON DUPLICATE KEY UPDATE
              contenido_md = VALUES(contenido_md),
              estado = 'pendiente',
              bloqueado = 0
        """, (proyecto_id, tipo_doc, doc_data["contenido"]))

    cur.execute("""
        UPDATE proyectos SET estado_ciclo = 'levantamiento_completado'
        WHERE id = %s AND canal_origen = 'slack_marvin'
    """, (proyecto_id,))

    conn.commit()
    cur.close(); conn.close()

    actualizar_estado(sesion_id, "pendiente_aprobacion", proyecto_id=proyecto_id)

async def procesar_aprobacion(sesion_id: str, proyecto_id: int,
                               aprobado_por: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE documentos SET bloqueado = 1, estado = 'aprobado'
        WHERE proyecto_id = %s AND bloqueado = 0
    """, (proyecto_id,))

    cur.execute("""
        UPDATE proyectos SET estado_ciclo = 'en_desarrollo'
        WHERE id = %s
    """, (proyecto_id,))

    conn.commit()

    cur.execute("""
        SELECT tipo, contenido_md FROM documentos
        WHERE proyecto_id = %s AND bloqueado = 1
    """, (proyecto_id,))
    docs_aprobados = cur.fetchall()
    cur.close(); conn.close()

    from core.atlas_client import indexar_en_atlas
    indexados = []
    no_indexados = []
    omitidos_readonly = []
    for tipo, contenido in docs_aprobados:
        status = await indexar_en_atlas(tipo, contenido, proyecto_id, aprobado_por)
        if status == "indexado":
            indexados.append(tipo)
        elif status == "omitido_readonly":
            omitidos_readonly.append(tipo)
        else:
            no_indexados.append(tipo)

    from core.jira_client import crear_ticket_jira
    jira_result = await crear_ticket_jira(sesion_id, proyecto_id)

    actualizar_estado(sesion_id, "aprobada",
                      aprobada_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                      aprobada_por=aprobado_por,
                      jira_ticket=jira_result.get("ticket_id", ""))

    sesion = cargar_sesion(sesion_id)
    from core.echo_client import notificar_echo
    await notificar_echo(
        slack_user_id=sesion["slack_user_id"],
        slack_channel=sesion["slack_channel"],
        tipo_resultado="aprobacion_completada",
        payload={
            "proyecto_id": proyecto_id,
            "documentos": indexados,
            "no_indexados": no_indexados,
            "omitidos_readonly": omitidos_readonly,
            "jira": jira_result,
            "mensaje": f"✅ Tu requerimiento fue aprobado. Ticket: {jira_result.get('ticket_id', 'N/D')}"
        }
    )

    return {"indexados": indexados, "no_indexados": no_indexados,
            "omitidos_readonly": omitidos_readonly, "jira": jira_result}
