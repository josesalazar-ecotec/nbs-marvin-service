import fitz, uuid, os
import base64
import anthropic
from pathlib import Path
from docx import Document as DocxDocument
import pandas as pd

UPLOADS_DIR = Path("/opt/marvin/uploads_tmp")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

OCR_DISPONIBLE = os.path.exists("/opt/models/unlimited-ocr/run_ocr.py")
TESSERACT_DISPONIBLE = False
try:
    import pytesseract
    TESSERACT_DISPONIBLE = True
except ImportError:
    pass

class IngestaSubagente:
    async def procesar(self, archivo) -> dict:
        contenido_raw = await archivo.read()
        MAX_UPLOAD_BYTES = 10 * 1024 * 1024
        if len(contenido_raw) > MAX_UPLOAD_BYTES:
            raise ValueError(
                f"Archivo demasiado grande ({len(contenido_raw)//1024//1024}MB). "
                f"Máximo permitido: 10MB."
            )
        mime = archivo.content_type
        nombre = archivo.filename
        req_id = str(uuid.uuid4())[:8]
        tmp_path = UPLOADS_DIR / f"{req_id}_{nombre}"

        try:
            tmp_path.write_bytes(contenido_raw)
            if mime == "application/pdf":
                texto = self._procesar_pdf(tmp_path)
            elif "wordprocessingml" in mime or nombre.endswith(".docx"):
                texto = self._procesar_docx(tmp_path)
            elif mime in ("text/csv",) or nombre.endswith(".csv"):
                texto = self._procesar_csv(tmp_path)
            elif mime in ("image/png", "image/jpeg"):
                texto = self._ocr(tmp_path)
            else:
                texto = contenido_raw.decode("utf-8", errors="ignore")
        finally:
            tmp_path.unlink(missing_ok=True)

        return self._resumir(texto, nombre)

    def _procesar_pdf(self, path: Path) -> str:
        doc = fitz.open(str(path))
        texto = "\n".join(page.get_text() for page in doc)
        if len(texto.strip()) < 100:
            return self._ocr(path)
        return texto

    def _ocr(self, path: Path) -> str:
        if OCR_DISPONIBLE:
            try:
                import subprocess
                r = subprocess.run(
                    ["python3", "/opt/models/unlimited-ocr/run_ocr.py", str(path)],
                    capture_output=True, text=True, timeout=60
                )
                if r.stdout and len(r.stdout.strip()) > 20:
                    return r.stdout
            except Exception:
                pass
        elif TESSERACT_DISPONIBLE:
            from PIL import Image
            img = Image.open(str(path))
            return pytesseract.image_to_string(img, lang="spa")
        return self._describir_imagen(path)

    def _describir_imagen(self, path) -> str:
        """Descripción visual con Claude vision — para imágenes sin texto."""
        try:
            cliente = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            with open(str(path), "rb") as f:
                imagen_bytes = f.read()
            ext = path.suffix.lower().lstrip(".")
            media_types = {
                "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "png": "image/png", "gif": "image/gif", "webp": "image/webp"
            }
            media_type = media_types.get(ext, "image/png")
            imagen_b64 = base64.standard_b64encode(imagen_bytes).decode("utf-8")
            resp = cliente.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": imagen_b64
                            }
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe esta imagen en español de forma detallada "
                                "para incluirla como anexo en una minuta de reunión "
                                "institucional. Incluye: qué muestra la imagen, "
                                "textos visibles, tablas o diagramas identificados, "
                                "y su posible relevancia para un requerimiento de "
                                "sistema. Sé específico y formal."
                            )
                        }
                    ]
                }]
            )
            return resp.content[0].text.strip()
        except Exception as e:
            return f"[Descripción visual no disponible: {e}]"

    def _procesar_docx(self, path: Path) -> str:
        doc = DocxDocument(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    def _procesar_csv(self, path: Path) -> str:
        df = pd.read_csv(str(path))
        return df.to_markdown(index=False)

    def _resumir(self, texto: str, nombre: str) -> dict:
        palabras = texto.split()
        resumen = " ".join(palabras[:200]) + ("..." if len(palabras) > 200 else "")
        return {
            "archivo": nombre,
            "texto_completo": texto,
            "resumen": resumen,
            "caracteres": len(texto),
            "tipo": "imagen" if nombre.lower().endswith(
                ('.png','.jpg','.jpeg','.gif','.webp')) else "documento"
        }
