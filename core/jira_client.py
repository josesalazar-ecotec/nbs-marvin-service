from jira import JIRA
import os
from core.db import get_connection

MAPEO_PROYECTO_JIRA = {
    "default":    os.getenv("JIRA_PROYECTO_DEFAULT", "STI"),
    "financiero": "ESF",
    "academico":  "NBSECO",
    "sistemas":   "STI",
    "docente":    "SON",
}

def get_jira():
    return JIRA(server="https://nbsecotec.atlassian.net",
                basic_auth=(os.getenv("JIRA_EMAIL"), os.getenv("JIRA_TOKEN")))

async def crear_ticket_jira(sesion_id: str, proyecto_id: int) -> dict:
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM proyectos WHERE id = %s", (proyecto_id,))
    proyecto = cur.fetchone()
    cur.execute("SELECT contenido_md FROM documentos WHERE proyecto_id=%s AND tipo='resumen_ejecutivo' LIMIT 1",
                (proyecto_id,))
    resumen_row = cur.fetchone()
    cur.close(); conn.close()

    if not proyecto:
        return {"error": "Proyecto no encontrado"}

    categoria = (proyecto.get("categoria") or "default").lower()
    jira_project = MAPEO_PROYECTO_JIRA.get(categoria, MAPEO_PROYECTO_JIRA["default"])
    description = (resumen_row["contenido_md"][:2000] if resumen_row
                   else "Ver documentos en plataforma NBS.")

    try:
        jira = get_jira()
        issue = jira.create_issue(
            project=jira_project,
            summary=f"[MARVIN] {(proyecto.get('nombre') or proyecto.get('descripcion', 'Requerimiento'))[:80]}",
            description=description,
            issuetype={"name": "Story"},
            labels=["marvin", "requerimiento", categoria]
        )
        return {"ticket_id": issue.key,
                "url": f"https://nbsecotec.atlassian.net/browse/{issue.key}",
                "proyecto_jira": jira_project}
    except Exception as e:
        print(f"[MARVIN] Error Jira: {e}")
        return {"error": str(e), "ticket_id": None}
