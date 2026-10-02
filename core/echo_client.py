import httpx, os

ECHO_URL = "http://localhost:8401"
INTERNAL_KEY = os.getenv("ECHO_INTERNAL_KEY")

async def notificar_echo(slack_user_id: str, slack_channel: str,
                          tipo_resultado: str, payload: dict):
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(f"{ECHO_URL}/interno/marvin/resultado",
                json={"slack_user_id": slack_user_id,
                      "slack_channel": slack_channel,
                      "tipo_resultado": tipo_resultado,
                      "payload": payload},
                headers={"X-Internal-Key": INTERNAL_KEY})
    except Exception as e:
        print(f"[MARVIN] No se pudo notificar a ECHO: {e}")
        # No propagar — MARVIN sigue funcionando aunque ECHO falle
