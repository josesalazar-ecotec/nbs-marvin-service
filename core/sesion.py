import uuid
from core.db import get_connection

def crear_sesion(slack_user_id: str, slack_channel: str,
                 titulo: str, solicitante_email: str) -> str:
    sesion_id = str(uuid.uuid4())
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO marvin_sesiones
          (id, slack_user_id, slack_channel, titulo, solicitante_email, estado)
        VALUES (%s, %s, %s, %s, %s, 'iniciada')
    """, (sesion_id, slack_user_id, slack_channel, titulo, solicitante_email))
    conn.commit()
    cur.close(); conn.close()
    return sesion_id

def cargar_sesion(sesion_id: str) -> dict | None:
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM marvin_sesiones WHERE id = %s", (sesion_id,))
    sesion = cur.fetchone()
    cur.close(); conn.close()
    return sesion

def guardar_turno(sesion_id: str, tipo: str, contenido: str, orden: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO marvin_turnos (sesion_id, orden, tipo, contenido)
        VALUES (%s, %s, %s, %s)
    """, (sesion_id, orden, tipo, contenido))
    conn.commit()
    cur.close(); conn.close()

def obtener_transcripcion(sesion_id: str) -> str:
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT tipo, contenido FROM marvin_turnos
        WHERE sesion_id = %s ORDER BY orden ASC
    """, (sesion_id,))
    turnos = cur.fetchall()
    cur.close(); conn.close()
    lineas = []
    for t in turnos:
        prefijo = "MARVIN" if t["tipo"] == "pregunta" else "USUARIO"
        lineas.append(f"{prefijo}: {t['contenido']}")
    return "\n".join(lineas)

def actualizar_estado(sesion_id: str, estado: str, **kwargs):
    permitidos = {
        "transcripcion", "contexto_atlas", "proyecto_id",
        "cerrada_at", "aprobada_at", "aprobada_por", "jira_ticket"
    }
    campos = {k: v for k, v in kwargs.items() if k in permitidos}
    conn = get_connection()
    cur = conn.cursor()
    sets = ["estado = %s"] + [f"{k} = %s" for k in campos]
    vals = [estado] + list(campos.values()) + [sesion_id]
    cur.execute(f"UPDATE marvin_sesiones SET {', '.join(sets)} WHERE id = %s", vals)
    conn.commit()
    cur.close(); conn.close()
