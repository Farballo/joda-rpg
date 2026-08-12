import httpx

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.2:3b"


async def narrar(contexto: str, cliente: httpx.AsyncClient | None = None) -> str | None:
    prompt = f"""Sos el narrador de un juego de rol tipo D&D ambientado en
una noche de joda argentina (previa, boliche, after). Escribí 2-3 líneas
de narración en tono irónico y picante, sin exagerar, en español rioplatense.
No repitas literalmente el contexto, narralo con humor.

Contexto: {contexto}"""

    cerrar_cliente = cliente is None
    client = cliente or httpx.AsyncClient(timeout=15.0)
    try:
        r = await client.post(OLLAMA_URL, json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
        })
        r.raise_for_status()
        return r.json()["response"].strip()
    except Exception:
        return None  # el DM narra manualmente, el juego no se rompe
    finally:
        if cerrar_cliente:
            await client.aclose()
