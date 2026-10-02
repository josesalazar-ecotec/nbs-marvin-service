import asyncio, os, anthropic
from pathlib import Path
from datetime import datetime

cliente = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
FORMATOS_PATH = Path(os.getenv("AGENTE_PO_PATH", "/opt/agente-po/backend/formatos"))

def leer_formato(nombre: str) -> str:
    ruta = FORMATOS_PATH / f"{nombre}.md"
    if ruta.exists():
        return ruta.read_text(encoding="utf-8")
    return f"[Formato {nombre} no encontrado en {FORMATOS_PATH}]"

async def generar_documento(doc_key: str, system_prompt: str,
                             contexto_base: str) -> tuple[str, dict]:
    loop = asyncio.get_running_loop()
    def _llamar():
        return cliente.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=system_prompt,
            messages=[{"role": "user", "content": contexto_base}]
        )
    resp = await loop.run_in_executor(None, _llamar)
    return doc_key, {
        "contenido": resp.content[0].text,
        "generado_at": datetime.now().isoformat(),
        "modelo": "claude-sonnet-4-6"
    }

async def generar_4_documentos(transcripcion: str, contexto_atlas: dict,
                                metadata: dict) -> dict:
    fecha = datetime.now().strftime("%Y-%m-%d")
    contexto_base = f"""
TRANSCRIPCIÓN DE ENTREVISTA:
{transcripcion}

CONTEXTO TÉCNICO DE ATLAS (ERP NBS):
Módulos afectados: {', '.join(contexto_atlas.get('modulos', []))}
Tablas BD: {', '.join(contexto_atlas.get('tablas_bd', []))}
Información técnica: {contexto_atlas.get('fragmentos', '')}
Confianza ATLAS: {contexto_atlas.get('confianza', 0.0)}

METADATA:
Fecha: {fecha}
Solicitante: {metadata.get('solicitante_email', '')}
Título: {metadata.get('titulo', '')}
Autor: José Salazar Campodónico
Footer: Documento elaborado mediante uso de herramientas de IA
"""
    prompts = {
        "minuta":            leer_formato("minuta_marvin"),
        "resumen_ejecutivo": leer_formato("resumen_ejecutivo"),
        "levantamiento":     leer_formato("levantamiento"),
        "casos_uso":         leer_formato("casos_uso")
    }

    tareas = [
        generar_documento(key, prompt, contexto_base)
        for key, prompt in prompts.items()
    ]
    resultados = await asyncio.gather(*tareas, return_exceptions=True)

    documentos = {}
    for r in resultados:
        if isinstance(r, Exception):
            print(f"[MARVIN] Error generando documento: {r}")
        else:
            doc_key, doc_data = r
            documentos[doc_key] = doc_data

    return documentos
