import os, anthropic
from core.sesion import cargar_sesion, guardar_turno, obtener_transcripcion
from core.db import get_connection

cliente = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_ENTREVISTADOR = """Eres MARVIN, asistente de levantamiento de requerimientos
de la Universidad Tecnológica ECOTEC. Conduces entrevistas estructuradas en español.

REGLAS:
- Haz UNA SOLA pregunta por turno — nunca listes varias preguntas
- Espera la respuesta antes de formular la siguiente
- Profundiza en las respuestas antes de cambiar de tema
- Cubre: objetivo del requerimiento, usuarios afectados, proceso actual,
  proceso deseado, restricciones técnicas, criterios de aceptación
- Cuando tengas suficiente información para redactar el levantamiento,
  responde EXACTAMENTE con: [ENTREVISTA_COMPLETA]
- Máximo 12 preguntas por entrevista
- Tono profesional, empático, institucional ECOTEC"""

# Frases que distinguen un agotamiento de cuota/spend-limit institucional de
# cualquier otro error del SDK de Anthropic -- mismo criterio y misma cuota
# compartida que ATLAS (ver servicio/rag.py en /opt/atlas, LEARNINGS L43/L44:
# ATLAS, MARVIN y ECHO comparten el mismo ANTHROPIC_API_KEY vía
# /etc/nbs-platform.env, confirmado por hash sha256 idéntico en los tres
# procesos). Error real observado en ATLAS el 2026-09-14 (mismo key, aplica
# igual a MARVIN): anthropic.BadRequestError, HTTP 400, invalid_request_error,
# "You have reached your specified API usage limits." -- NO es un
# RateLimitError (429); se capturan ambas clases por separado, ya que son
# hermanas en la jerarquía del SDK (no relacionadas por herencia), no porque
# se espere que el 429 real traiga este mensaje hoy.
_FRASES_CUOTA_AGOTADA = ("spend limit", "usage limit")

_MENSAJE_CUOTA_AGOTADA = (
    "Servicio de IA temporalmente no disponible por mantenimiento "
    "institucional. Disponible nuevamente el 2026-10-01. Para consultas "
    "urgentes, contactar a soporte TI."
)


def _motivo_si_cuota_agotada(exc: Exception) -> str | None:
    """Retorna el texto del error si coincide con agotamiento de cuota
    institucional, None si no (mismo criterio que ATLAS servicio/rag.py)."""
    texto = str(exc).lower()
    if any(frase in texto for frase in _FRASES_CUOTA_AGOTADA):
        return str(exc)
    return None


def primera_pregunta(titulo: str, sesion_id: str) -> str:
    pregunta = (f"Hola, soy MARVIN. Voy a ayudarte a levantar el requerimiento "
                f"'{titulo}'. Para comenzar: ¿Puedes describir en tus propias palabras "
                f"qué problema o necesidad origina este requerimiento?")
    guardar_turno(sesion_id, "pregunta", pregunta, 1)
    return pregunta

def siguiente_pregunta(sesion_id: str, respuesta_usuario: str) -> tuple[str, bool]:
    """Retorna (siguiente_pregunta, entrevista_completa).

    Si la API de Anthropic falla por agotamiento de cuota institucional,
    retorna (mensaje_claro, False) en vez de dejar propagar la excepción --
    la entrevista NO se marca completada (False) para no confundir "cuota
    agotada" con "entrevista terminada"; el usuario puede reintentar más
    tarde y la sesión sigue en estado 'en_entrevista'. Cualquier otro error
    de la API sigue su curso normal (se re-levanta)."""
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) as total FROM marvin_turnos WHERE sesion_id=%s", (sesion_id,))
    total_turnos = cur.fetchone()["total"]
    cur.close(); conn.close()

    guardar_turno(sesion_id, "respuesta", respuesta_usuario, total_turnos + 1)

    transcripcion = obtener_transcripcion(sesion_id)
    sesion = cargar_sesion(sesion_id)

    messages = [{"role": "user", "content": f"""
TÍTULO DEL REQUERIMIENTO: {sesion['titulo']}
SOLICITANTE: {sesion['solicitante_email']}

HISTORIAL DE LA ENTREVISTA:
{transcripcion}

Basándote en el historial, formula la siguiente pregunta o responde [ENTREVISTA_COMPLETA].
"""}]

    try:
        resp = cliente.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=SYSTEM_ENTREVISTADOR,
            messages=messages
        )
    except (anthropic.BadRequestError, anthropic.RateLimitError) as exc:
        motivo = _motivo_si_cuota_agotada(exc)
        if motivo:
            return _MENSAJE_CUOTA_AGOTADA, False
        raise  # otro BadRequestError/RateLimitError real -- sigue su curso normal

    contenido = resp.content[0].text.strip()

    MARCADORES_FIN = [
        "[entrevista_completa]",
        "[entrevista completa]",
        "entrevista_completa",
        "entrevista completa",
        "suficiente información",
        "suficiente informacion",
    ]
    contenido_norm = contenido.lower().replace("_", " ").replace("-", " ")
    turno_actual = total_turnos + 2

    if any(m in contenido_norm for m in MARCADORES_FIN) or turno_actual >= 24:
        return (
            "Gracias, tengo suficiente información para elaborar tu levantamiento. "
            "En unos minutos recibirás los documentos en Slack.", True
        )

    num_pregunta = (total_turnos // 2) + 1
    progreso = f"\n\n_(Pregunta {num_pregunta} de ~8)_"
    guardar_turno(sesion_id, "pregunta", contenido, total_turnos + 2)
    return contenido + progreso, False


async def generar_supuestos(titulo: str, contexto_atlas: dict) -> str:
    """Genera supuestos pre-entrevista consultando contexto de ATLAS.
    Se llama antes de primera_pregunta() y se guarda en proyectos.supuestos_pre_entrevista.
    Permite medir divergencia entre lo asumido y lo descubierto en entrevista (doc 50 A7).

    Si la API falla por cuota institucional agotada, retorna el mensaje claro
    en vez de un supuesto -- se guarda igual en supuestos_pre_entrevista, así
    que queda visible que esa corrida no tuvo supuestos reales generados."""
    modulos = ", ".join(contexto_atlas.get("modulos", [])) or "no identificados"
    tablas = ", ".join(contexto_atlas.get("tablas_bd", [])) or "no identificadas"
    confianza = contexto_atlas.get("confianza", 0.0)

    if confianza < 0.1:
        return (
            "SUPUESTOS PRE-ENTREVISTA (contexto ATLAS no disponible):\n"
            "- El módulo afectado no pudo identificarse en el grafo ERP\n"
            "- Se asume que el requerimiento es nuevo o modifica funcionalidad no indexada\n"
            "- Complejidad estimada: indeterminada\n"
            "- Los usuarios afectados se determinarán en entrevista"
        )

    try:
        resp = cliente.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system="Eres MARVIN. Genera supuestos pre-entrevista concisos basados en contexto técnico del ERP NBS de ECOTEC.",
            messages=[{"role": "user", "content": f"""
Requerimiento: {titulo}
Módulos ERP identificados: {modulos}
Tablas BD relacionadas: {tablas}
Confianza ATLAS: {confianza:.2f}

Genera exactamente 4 supuestos pre-entrevista en este formato:
SUPUESTOS PRE-ENTREVISTA:
- El módulo afectado es: [módulo]
- El flujo actual opera sobre: [tablas/proceso]
- Los usuarios afectados son: [rol estimado]
- La complejidad estimada es: [baja/media/alta]

Sé específico con los datos de ATLAS. Sin introducciones."""}]
        )
    except (anthropic.BadRequestError, anthropic.RateLimitError) as exc:
        motivo = _motivo_si_cuota_agotada(exc)
        if motivo:
            return _MENSAJE_CUOTA_AGOTADA
        raise
    return resp.content[0].text.strip()


PROMPT_RESUMEN = """Basándote en la entrevista, genera un resumen de validación
con exactamente 4 puntos:
1. Objetivo principal del requerimiento (1 oración)
2. Usuarios afectados (lista breve)
3. Cambio principal que se busca (1 oración)
4. Restricción o criterio más importante

Termina con: "¿Este resumen refleja correctamente tu necesidad? (sí/no)"
Sé conciso. Sin introducciones."""

async def generar_resumen_validacion(sesion_id: str) -> str:
    from core.sesion import obtener_transcripcion, cargar_sesion
    transcripcion = obtener_transcripcion(sesion_id)
    sesion = cargar_sesion(sesion_id)
    try:
        resp = cliente.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=PROMPT_RESUMEN,
            messages=[{"role": "user", "content": f"""
REQUERIMIENTO: {sesion['titulo']}
ENTREVISTA:
{transcripcion}
"""}]
        )
    except (anthropic.BadRequestError, anthropic.RateLimitError) as exc:
        motivo = _motivo_si_cuota_agotada(exc)
        if motivo:
            return _MENSAJE_CUOTA_AGOTADA
        raise
    return resp.content[0].text.strip()
