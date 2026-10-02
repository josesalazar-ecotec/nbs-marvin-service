from fastapi import FastAPI, Form, UploadFile, File, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
import io
import os
from core.sesion import crear_sesion, cargar_sesion, actualizar_estado
from core.entrevistador import primera_pregunta, siguiente_pregunta, generar_resumen_validacion
from core.ingesta import IngestaSubagente
from core.documentos import generar_4_documentos
from core.supervision import enviar_a_supervision, procesar_aprobacion
from core.atlas_client import obtener_contexto
from core.db import get_connection
import asyncio

_whisper_model = None

app = FastAPI(title="MARVIN", version="1.0.0")
ingesta = IngestaSubagente()

@app.on_event("startup")
async def precargar_whisper():
    global _whisper_model
    loop = asyncio.get_running_loop()
    try:
        def _cargar():
            import whisper
            return whisper.load_model("base")
        _whisper_model = await loop.run_in_executor(None, _cargar)
        print("[MARVIN] Modelo Whisper pre-cargado OK")
    except Exception as e:
        print(f"[MARVIN] Whisper no disponible: {e}")

@app.post("/entrevista/iniciar")
async def iniciar_entrevista(
    titulo: str = Form(...),
    slack_user_id: str = Form(...),
    slack_channel: str = Form(...),
    solicitante_email: str = Form(...)
):
    sesion_id = crear_sesion(slack_user_id, slack_channel, titulo, solicitante_email)

    # A7 -- Pre-registro de hipotesis (doc 50): consultar ATLAS antes de iniciar
    # entrevista y guardar supuestos para medir divergencia post-entrevista.
    try:
        from core.atlas_client import obtener_contexto
        from core.entrevistador import generar_supuestos
        contexto_atlas = await obtener_contexto(titulo)
        supuestos = await generar_supuestos(titulo, contexto_atlas)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE marvin_sesiones SET supuestos_pre_entrevista = %s WHERE id = %s",
            (supuestos, sesion_id)
        )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        print(f"[MARVIN] supuestos_pre_entrevista no generados: {e}")
        # No bloquear la entrevista si falla

    pregunta = primera_pregunta(titulo, sesion_id)
    actualizar_estado(sesion_id, "en_entrevista")
    return {"sesion_id": sesion_id, "pregunta": pregunta}

@app.post("/entrevista/responder")
async def responder(
    sesion_id: str = Form(...),
    respuesta: str = Form(...)
):
    sesion = cargar_sesion(sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if sesion["estado"] != "en_entrevista":
        raise HTTPException(status_code=400, detail=f"Sesión en estado {sesion['estado']}")

    COMANDOS_CANCELAR = ["/cancelar", "cancelar", "salir", "/salir", "exit", "abort"]
    if respuesta.strip().lower() in COMANDOS_CANCELAR:
        actualizar_estado(sesion_id, "cancelada")
        return {
            "completada": False,
            "cancelada": True,
            "mensaje": "Entrevista cancelada. Cuando quieras retomar el requerimiento, puedes iniciar una nueva entrevista."
        }

    pregunta_siguiente, completada = siguiente_pregunta(sesion_id, respuesta)

    if completada:
        resumen = await generar_resumen_validacion(sesion_id)
        actualizar_estado(sesion_id, "validando_resumen")
        from core.sesion import guardar_turno
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
        total = cur.fetchone()["t"]; cur.close(); conn.close()
        guardar_turno(sesion_id, "pregunta", resumen, total + 1)
        return {
            "completada": False,
            "validando": True,
            "resumen": resumen,
            "mensaje": resumen
        }

    return {"pregunta": pregunta_siguiente, "completada": False}

async def _cerrar_y_generar(sesion_id: str):
    from core.sesion import obtener_transcripcion
    from core.echo_client import notificar_echo
    try:
        sesion = cargar_sesion(sesion_id)
        transcripcion = obtener_transcripcion(sesion_id)
        contexto_atlas = await obtener_contexto(sesion["titulo"])

        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO proyectos
              (nombre, estado_ciclo, canal_origen, slack_user_id, slack_channel, entrevista_id)
            VALUES (%s, 'entrevista_realizada', 'slack_marvin', %s, %s, %s)
            ON DUPLICATE KEY UPDATE
              nombre = VALUES(nombre),
              slack_user_id = VALUES(slack_user_id)
        """, (sesion["titulo"], sesion["slack_user_id"],
              sesion["slack_channel"], sesion_id))
        conn.commit()
        proyecto_id = cur.lastrowid
        if not proyecto_id:
            cur.execute("SELECT id FROM proyectos WHERE entrevista_id=%s", (sesion_id,))
            proyecto_id = cur.fetchone()[0]

        # A7 -- copiar supuestos_pre_entrevista de sesion a proyecto
        try:
            cur2 = conn.cursor()
            cur2.execute(
                "SELECT supuestos_pre_entrevista FROM marvin_sesiones WHERE id = %s",
                (sesion_id,)
            )
            row = cur2.fetchone()
            if row and row[0]:
                cur2.execute(
                    "UPDATE proyectos SET supuestos_pre_entrevista = %s WHERE id = %s",
                    (row[0], proyecto_id)
                )
                conn.commit()
            cur2.close()
        except Exception as e:
            print(f"[MARVIN] Error copiando supuestos a proyectos: {e}")

        cur.close(); conn.close()

        documentos = await generar_4_documentos(
            transcripcion, contexto_atlas,
            {"titulo": sesion["titulo"], "solicitante_email": sesion["solicitante_email"]}
        )
        await enviar_a_supervision(sesion_id, documentos, proyecto_id)
        await notificar_echo(
            slack_user_id=sesion["slack_user_id"],
            slack_channel=sesion["slack_channel"],
            tipo_resultado="aprobacion_requerida",
            payload={"proyecto_id": proyecto_id,
                     "documentos": list(documentos.keys()),
                     "mensaje": "📋 Tu levantamiento está listo. José lo revisará y te notificará."}
        )
    except Exception as e:
        print(f"[MARVIN] ERROR en _cerrar_y_generar sesion={sesion_id}: {e}")
        try:
            actualizar_estado(sesion_id, "error")
            sesion = cargar_sesion(sesion_id)
            if sesion:
                await notificar_echo(
                    slack_user_id=sesion["slack_user_id"],
                    slack_channel=sesion["slack_channel"],
                    tipo_resultado="error",
                    payload={"mensaje": "⚠️ Ocurrió un error procesando tu requerimiento. "
                                        "Por favor contacta a José Salazar para continuar."}
                )
        except Exception as e2:
            print(f"[MARVIN] ERROR notificando fallo: {e2}")

@app.post("/entrevista/confirmar")
async def confirmar_resumen(
    sesion_id: str = Form(...),
    confirmado: str = Form(...)
):
    sesion = cargar_sesion(sesion_id)
    if not sesion or sesion["estado"] != "validando_resumen":
        raise HTTPException(status_code=400, detail="Sesión no en estado de validación")

    if confirmado.lower() in ("si", "sí", "yes", "correcto", "ok"):
        actualizar_estado(sesion_id, "documentos_generados")
        asyncio.create_task(_cerrar_y_generar(sesion_id))
        return {"confirmado": True,
                "mensaje": "Perfecto. Generando documentos... te avisaré en Slack."}
    else:
        actualizar_estado(sesion_id, "en_entrevista")
        aclaracion = ("Entendido. ¿Qué parte del resumen no refleja correctamente "
                     "tu necesidad? Cuéntame y continuamos.")
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
        total = cur.fetchone()["t"]; cur.close(); conn.close()
        from core.sesion import guardar_turno
        guardar_turno(sesion_id, "pregunta", aclaracion, total + 1)
        return {"confirmado": False, "pregunta": aclaracion}


@app.post("/entrevista/subir-documento")
async def subir_documento(
    sesion_id: str = Form(...),
    archivo: UploadFile = File(...)
):
    try:
        resultado = await ingesta.procesar(archivo)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
    total = cur.fetchone()["t"]; cur.close(); conn.close()
    from core.sesion import guardar_turno
    guardar_turno(sesion_id, "respuesta",
                  f"[ARCHIVO: {resultado['archivo']}]\n{resultado['resumen']}", total + 1)
    return {"procesado": True, "resumen": resultado["resumen"]}

@app.post("/supervision/aprobar")
async def aprobar(
    proyecto_id: int,
    sesion_id: str,
    aprobado_por: str,
    x_admin_key: str = Header(default="")
):
    admin_key = os.getenv("ECHO_ADMIN_KEY", "")
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=403, detail="No autorizado")
    resultado = await procesar_aprobacion(sesion_id, proyecto_id, aprobado_por)
    return {"status": "aprobado", **resultado}

@app.get("/proyectos")
async def listar_proyectos():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, codigo, nombre, tipo, estado_ciclo, created_at, updated_at
        FROM proyectos ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/proyectos/{proyecto_id}")
async def obtener_proyecto(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM proyectos WHERE id = %s", (proyecto_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return row

@app.get("/documentos/{proyecto_id}")
async def listar_documentos(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, proyecto_id, tipo, estado, bloqueado, version, generado_por, created_at
        FROM documentos WHERE proyecto_id = %s ORDER BY tipo
    """, (proyecto_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/documentos/{proyecto_id}/{tipo}/contenido")
async def contenido_documento(proyecto_id: int, tipo: str):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, tipo, contenido, estado, bloqueado, version
        FROM documentos WHERE proyecto_id = %s AND tipo = %s
        ORDER BY version DESC LIMIT 1
    """, (proyecto_id, tipo))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return row

@app.post("/api/v2/entrevistas/responder-voz")
async def api_responder_voz(
    audio: UploadFile = File(...),
    proyecto_id: str = Form(...),
    bloque_actual: str = Form("A"),
    turno_numero: str = Form("1"),
):
    global _whisper_model
    if not _whisper_model:
        raise HTTPException(status_code=503, detail="Whisper no disponible")

    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    try:
        contenido = await audio.read()
        tmp.write(contenido)
        tmp.close()

        loop = asyncio.get_running_loop()
        def _transcribir():
            result = _whisper_model.transcribe(tmp.name, language="es")
            return result["text"].strip()

        texto = await loop.run_in_executor(None, _transcribir)
    finally:
        os.unlink(tmp.name)

    if not texto:
        raise HTTPException(status_code=422, detail="No se detectó audio")

    # Reutilizar lógica de api_responder con el texto transcrito
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT entrevista_id FROM proyectos WHERE id = %s",
                (int(proyecto_id),))
    row = cur.fetchone()
    cur.close(); conn.close()

    sesion_id = row["entrevista_id"] if row and row["entrevista_id"] else ""
    if not sesion_id:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    from core.entrevistador import siguiente_pregunta, generar_resumen_validacion
    pregunta_siguiente, completada = siguiente_pregunta(sesion_id, texto)

    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s",
                (sesion_id,))
    total = cur.fetchone()["t"]; cur.close(); conn.close()

    if completada:
        resumen = await generar_resumen_validacion(sesion_id)
        actualizar_estado(sesion_id, "validando_resumen")
        from core.sesion import guardar_turno
        guardar_turno(sesion_id, "pregunta", resumen, total + 1)
        return {
            "transcripcion": texto,
            "completada": False,
            "validando": True,
            "resumen": resumen,
            "mensaje": resumen,
            "bloque_tematico": bloque_actual,
        }

    return {
        "transcripcion": texto,
        "pregunta": pregunta_siguiente,
        "completada": False,
        "bloque_tematico": bloque_actual,
        "turno_numero": total,
        "id": total,
    }

@app.post("/api/v2/tts")
async def api_tts(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    texto = body.get("texto", "").strip()
    if not texto:
        raise HTTPException(status_code=422, detail="texto requerido")
    voz = body.get("voice", "es-EC-LuisNeural")
    # rate no se pasa a edge-tts directamente pero lo aceptamos por compatibilidad

    loop = asyncio.get_running_loop()
    def _generar():
        import asyncio as _asyncio
        import edge_tts as _edge
        async def _run():
            tts = _edge.Communicate(texto, voice=voz)
            buf = io.BytesIO()
            async for chunk in tts.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            buf.seek(0)
            return buf.read()
        return _asyncio.run(_run())

    audio_bytes = await loop.run_in_executor(None, _generar)
    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=marvin.mp3"}
    )

@app.get("/api/v2/autor")
async def api_autor():
    import json
    from pathlib import Path
    ruta = Path("/opt/marvin/config_autor.json")
    if not ruta.exists():
        return {"nombre": "José Salazar Campodónico",
                "cargo": "Subdirector de Tecnología  ",
                "institucion": "Universidad Tecnológica ECOTEC",
                "email": "josalazar@ecotec.edu.ec",
                "footer_documento": "Documento elaborado mediante uso de herramientas de IA"}
    return json.loads(ruta.read_text())

@app.post("/api/v2/entrevistas/cerrar")
async def api_cerrar_entrevista(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    proyecto_id = int(body.get("proyecto_id", 0))
    sesion_id = body.get("sesion_id", "")

    if not sesion_id and proyecto_id:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT entrevista_id FROM proyectos WHERE id = %s", (proyecto_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        sesion_id = row["entrevista_id"] if row and row["entrevista_id"] else ""

    if not sesion_id:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    sesion = cargar_sesion(sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    actualizar_estado(sesion_id, "documentos_generados")
    asyncio.create_task(_cerrar_y_generar(sesion_id))

    return {
        "ok": True,
        "sesion_id": sesion_id,
        "mensaje": "Generando documentos. Revisa la sección Documentos en unos minutos."
    }

@app.post("/api/v2/entrevistas/generar-resumen")
async def api_generar_resumen(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    proyecto_id = int(body.get("proyecto_id", 0))
    sesion_id = body.get("sesion_id", "")

    if not sesion_id and proyecto_id:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT entrevista_id FROM proyectos WHERE id=%s", (proyecto_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        sesion_id = row["entrevista_id"] if row and row["entrevista_id"] else ""

    if not sesion_id:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    from core.entrevistador import generar_resumen_validacion
    resumen = await generar_resumen_validacion(sesion_id)

    import markdown as _md
    try:
        html_content = _md.markdown(resumen)
    except Exception:
        html_content = f"<p>{resumen}</p>"

    return {
        "resumen": resumen,
        "sesion_id": sesion_id,
        "proyecto_id": proyecto_id,
        "modo": "prueba",
        "html_content": html_content,
        "url_descarga_html": None,
        "url_descarga_docx": None,
    }

@app.get("/salud")
async def salud():
    return {"status": "ok", "agente": "MARVIN", "version": "1.0.0"}

@app.get("/proyectos")
async def listar_proyectos():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, codigo, nombre, tipo, estado_ciclo, created_at, updated_at
        FROM proyectos ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/proyectos/{proyecto_id}")
async def obtener_proyecto(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM proyectos WHERE id = %s", (proyecto_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return row

@app.get("/documentos/{proyecto_id}")
async def listar_documentos(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, proyecto_id, tipo, estado, bloqueado, version, generado_por, created_at
        FROM documentos WHERE proyecto_id = %s ORDER BY tipo
    """, (proyecto_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/documentos/{proyecto_id}/{tipo}/contenido")
async def contenido_documento(proyecto_id: int, tipo: str):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, tipo, contenido, estado, bloqueado, version
        FROM documentos WHERE proyecto_id = %s AND tipo = %s
        ORDER BY version DESC LIMIT 1
    """, (proyecto_id, tipo))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return row

# ============================================================
# ADAPTADOR /api/v2/ — compatibilidad con frontend NBS PO v2
# ============================================================

@app.post("/api/v2/requerimientos")
async def api_crear_requerimiento(
    nombre: str = Form(...),
    tipo: str = Form("nuevo"),
    descripcion: str = Form(""),
    es_prueba: str = Form("0"),
    solicitante_email: str = Form("josalazar@ecotec.edu.ec"),
):
    sesion_id = crear_sesion("web_user", "web", nombre, solicitante_email)
    pregunta = primera_pregunta(nombre, sesion_id)
    actualizar_estado(sesion_id, "en_entrevista")

    # A7 -- supuestos pre-entrevista
    try:
        from core.atlas_client import obtener_contexto
        from core.entrevistador import generar_supuestos
        contexto_atlas = await obtener_contexto(nombre)
        supuestos = await generar_supuestos(nombre, contexto_atlas)
        conn2 = get_connection()
        cur2 = conn2.cursor()
        cur2.execute(
            "UPDATE marvin_sesiones SET supuestos_pre_entrevista = %s WHERE id = %s",
            (supuestos, sesion_id)
        )
        conn2.commit(); cur2.close(); conn2.close()
    except Exception as e:
        print(f"[MARVIN] supuestos_pre_entrevista no generados: {e}")

    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id FROM proyectos WHERE entrevista_id = %s", (sesion_id,))
    row = cur.fetchone()
    cur.close(); conn.close()

    proyecto_id = row["id"] if row else None

    return {
        "id": proyecto_id,
        "sesion_id": sesion_id,
        "nombre": nombre,
        "tipo": tipo,
        "estado_ciclo": "entrevista_en_proceso",
        "primera_pregunta": pregunta,
    }

@app.get("/api/v2/requerimientos")
async def api_listar_requerimientos():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, codigo, nombre, tipo, estado_ciclo, es_prueba,
               created_at, updated_at, entrevista_id
        FROM proyectos ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/api/v2/requerimientos/{proyecto_id}")
async def api_obtener_requerimiento(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM proyectos WHERE id = %s", (proyecto_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return row

@app.post("/api/v2/entrevistas/iniciar")
async def api_iniciar_entrevista(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    proyecto_id = int(body.get("proyecto_id", 0))
    solicitante_email = body.get("solicitante_email", "josalazar@ecotec.edu.ec")
    if not proyecto_id:
        raise HTTPException(status_code=422, detail="proyecto_id requerido")
    # dummy assignments to maintain function signature compatibility
    _ = proyecto_id
    _ = solicitante_email
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM proyectos WHERE id = %s", (proyecto_id,))
    proyecto = cur.fetchone()
    cur.close(); conn.close()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    sesion_id = crear_sesion("web_user", "web", proyecto["nombre"], solicitante_email)
    pregunta = primera_pregunta(proyecto["nombre"], sesion_id)
    actualizar_estado(sesion_id, "en_entrevista")

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE proyectos SET entrevista_id = %s, estado_ciclo = 'entrevista_en_proceso' WHERE id = %s",
        (sesion_id, proyecto_id)
    )
    conn.commit(); cur.close(); conn.close()

    # A7 -- supuestos pre-entrevista
    try:
        from core.atlas_client import obtener_contexto
        from core.entrevistador import generar_supuestos
        contexto_atlas = await obtener_contexto(proyecto["nombre"])
        supuestos = await generar_supuestos(proyecto["nombre"], contexto_atlas)
        conn2 = get_connection()
        cur2 = conn2.cursor()
        cur2.execute(
            "UPDATE marvin_sesiones SET supuestos_pre_entrevista = %s WHERE id = %s",
            (supuestos, sesion_id)
        )
        conn2.commit(); cur2.close(); conn2.close()
    except Exception as e:
        print(f"[MARVIN] supuestos_pre_entrevista no generados: {e}")

    return {
        "sesion_id": sesion_id,
        "pregunta": pregunta,
        "bloque_tematico": "A",
        "turno_numero": 1,
    }

@app.post("/api/v2/entrevistas/responder")
async def api_responder(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    sesion_id = body.get("sesion_id", "")
    respuesta = body.get("respuesta") or body.get("contenido", "")

    # Compatibilidad frontend: Entrevista.jsx envia proyecto_id en vez de
    # sesion_id -- resolver sesion_id real via proyectos.entrevista_id.
    if not sesion_id and body.get("proyecto_id"):
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT entrevista_id FROM proyectos WHERE id = %s", (body["proyecto_id"],))
        row = cur.fetchone()
        cur.close(); conn.close()
        if row and row["entrevista_id"]:
            sesion_id = row["entrevista_id"]

    if not sesion_id or not respuesta:
        raise HTTPException(status_code=422, detail="sesion_id y respuesta requeridos")
    from core.entrevistador import siguiente_pregunta, generar_resumen_validacion
    pregunta_siguiente, completada = siguiente_pregunta(sesion_id, respuesta)

    if completada:
        resumen = await generar_resumen_validacion(sesion_id)
        actualizar_estado(sesion_id, "validando_resumen")
        from core.sesion import guardar_turno, obtener_transcripcion
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
        total = cur.fetchone()["t"]; cur.close(); conn.close()
        guardar_turno(sesion_id, "pregunta", resumen, total + 1)
        return {
            "completada": False,
            "validando": True,
            "resumen": resumen,
            "mensaje": resumen,
            "bloque_tematico": "G",
        }

    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
    total = cur.fetchone()["t"]; cur.close(); conn.close()

    return {
        "pregunta": pregunta_siguiente,
        "completada": False,
        "bloque_tematico": "A",
        "turno_numero": total,
        "id": total,
    }

@app.post("/api/v2/entrevistas/confirmar")
async def api_confirmar(request: Request):
    try:
        body = await request.json()
    except Exception:
        form = await request.form()
        body = dict(form)
    sesion_id = body.get("sesion_id", "")
    confirmado = body.get("confirmado", "")
    if not sesion_id:
        raise HTTPException(status_code=422, detail="sesion_id requerido")
    sesion = cargar_sesion(sesion_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    if confirmado.lower() in ("si", "sí", "yes", "correcto", "ok"):
        actualizar_estado(sesion_id, "documentos_generados")
        asyncio.create_task(_cerrar_y_generar(sesion_id))
        return {"confirmado": True, "mensaje": "Generando documentos..."}
    else:
        actualizar_estado(sesion_id, "en_entrevista")
        from core.sesion import guardar_turno
        aclaracion = "Entendido. ¿Qué parte no refleja correctamente tu necesidad?"
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
        total = cur.fetchone()["t"]; cur.close(); conn.close()
        guardar_turno(sesion_id, "pregunta", aclaracion, total + 1)
        return {"confirmado": False, "pregunta": aclaracion}

@app.get("/api/v2/entrevistas/historial/{proyecto_id}")
async def api_historial(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT entrevista_id FROM proyectos WHERE id = %s", (proyecto_id,))
    row = cur.fetchone()
    if not row or not row["entrevista_id"]:
        cur.close(); conn.close()
        return []
    sesion_id = row["entrevista_id"]
    cur.execute("""
        SELECT id, orden as turno_numero, tipo, contenido, creado_at as created_at
        FROM marvin_turnos WHERE sesion_id = %s ORDER BY orden ASC
    """, (sesion_id,))
    turnos = cur.fetchall()
    cur.close(); conn.close()
    return [{"id": t["id"], "turno_numero": t["turno_numero"],
             "rol": "entrevistador" if t["tipo"] == "pregunta" else "solicitante",
             "contenido": t["contenido"], "bloque_tematico": "A",
             "created_at": str(t["created_at"])} for t in turnos]

@app.get("/api/v2/entrevistas/outputs/{proyecto_id}")
async def api_outputs(proyecto_id: int):
    return {"url_descarga_docx": None, "url_descarga_html": None}

@app.get("/api/v2/documentos/proyecto/{proyecto_id}")
async def api_documentos_proyecto(proyecto_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, proyecto_id, tipo, estado, bloqueado, version,
               contenido_md, generado_con_ia, created_at
        FROM documentos WHERE proyecto_id = %s ORDER BY tipo
    """, (proyecto_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/api/v2/documentos/{documento_id}/contenido")
async def api_contenido_documento(documento_id: int):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM documentos WHERE id = %s", (documento_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return row

@app.post("/api/v2/documentos/{documento_id}/aprobar")
async def api_aprobar_documento(documento_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE documentos SET estado = 'aprobado', bloqueado = 1 WHERE id = %s",
        (documento_id,)
    )
    conn.commit(); cur.close(); conn.close()
    return {"ok": True, "documento_id": documento_id}

@app.post("/api/v2/entrevistas/adjunto")
async def api_adjunto(
    sesion_id: str = Form(...),
    archivo: UploadFile = File(...),
    proyecto_id: str = Form(""),
    turno_id: str = Form(""),
):
    try:
        resultado = await ingesta.procesar(archivo)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    from core.sesion import guardar_turno
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) as t FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
    total = cur.fetchone()["t"]; cur.close(); conn.close()
    tipo_archivo = resultado.get('tipo', 'documento')
    contenido_turno = (
        f"[ARCHIVO ADJUNTO]\n"
        f"Nombre: {resultado['archivo']}\n"
        f"Tipo: {tipo_archivo}\n"
        f"Contenido/Resumen: {resultado['resumen']}\n"
        f"Caracteres extraídos: {resultado['caracteres']}"
    )
    guardar_turno(sesion_id, "respuesta", contenido_turno, total + 1)
    return {"procesado": True, "resumen": resultado["resumen"], "resumen_ia": resultado["resumen"]}

@app.post("/api/v2/entrevistas/pausar")
async def api_pausar(sesion_id: str = Form(...)):
    actualizar_estado(sesion_id, "pausada")
    return {"ok": True}

@app.post("/api/v2/entrevistas/retomar")
async def api_retomar(sesion_id: str = Form(...)):
    actualizar_estado(sesion_id, "en_entrevista")
    return {"ok": True}

@app.post("/api/v2/requerimientos/{proyecto_id}/modo-prueba")
async def api_modo_prueba(proyecto_id: int, es_prueba: str = Form("1")):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE proyectos SET es_prueba = %s WHERE id = %s",
                (1 if es_prueba == "1" else 0, proyecto_id))
    conn.commit(); cur.close(); conn.close()
    return {"ok": True}

@app.post("/api/v2/requerimientos/{proyecto_id}/limpiar-prueba")
async def api_limpiar_prueba(proyecto_id: int):
    return {"ok": True}

@app.post("/api/v2/requerimientos/subir-archivo")
async def api_subir_archivo(
    proyecto_id: str = Form(...),
    archivos: list[UploadFile] = File(default=[]),
):
    return {"ok": True, "archivos": len(archivos)}
