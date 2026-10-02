import httpx, os
from datetime import datetime

ATLAS_URL = "http://localhost:8300"
ATLAS_KEY = os.getenv("ATLAS_API_KEY_MARVIN")

async def obtener_contexto(requerimiento: str, modulo_hint: str = "") -> dict:
    async with httpx.AsyncClient(timeout=90) as c:
        r = await c.post(f"{ATLAS_URL}/contexto-tecnico",
            json={"requerimiento": requerimiento,
                  "modulo_hint": modulo_hint,
                  "tipo": "full"},
            headers={"X-API-Key": ATLAS_KEY})
        return r.json() if r.status_code == 200 else {}

async def indexar_en_atlas(tipo: str, contenido: str,
                            proyecto_id: int, aprobado_por: str) -> str:
    async with httpx.AsyncClient(timeout=90) as c:
        r = await c.post(f"{ATLAS_URL}/aprendizaje/aprobar",
            json={"pregunta": f"Documento {tipo} proyecto {proyecto_id}",
                  "respuesta": contenido,
                  "fuente_chunk": contenido[:500],
                  "aprobado_por": aprobado_por,
                  "proyecto_id": str(proyecto_id),
                  "tipo_documento": tipo,
                  "fecha_aprobacion": datetime.now().isoformat()},
            headers={"X-API-Key": ATLAS_KEY})
        if r.status_code != 200:
            return "error"
        return r.json().get("status", "error")
