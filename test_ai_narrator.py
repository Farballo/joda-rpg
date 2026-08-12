import asyncio

import httpx

import ai_narrator


def narrar_con_handler(handler):
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return asyncio.run(ai_narrator.narrar("contexto de prueba", cliente=client))


def test_narrar_devuelve_texto_limpio_en_exito():
    def handler(request):
        return httpx.Response(200, json={"response": "  una noche interesante  "})

    assert narrar_con_handler(handler) == "una noche interesante"


def test_narrar_devuelve_none_si_ollama_no_responde():
    def handler(request):
        raise httpx.ConnectError("no hay nadie escuchando", request=request)

    assert narrar_con_handler(handler) is None


def test_narrar_devuelve_none_si_ollama_tira_error_http():
    def handler(request):
        return httpx.Response(500)

    assert narrar_con_handler(handler) is None


def test_narrar_devuelve_none_si_la_respuesta_no_tiene_el_campo_esperado():
    def handler(request):
        return httpx.Response(200, json={"algo_inesperado": True})

    assert narrar_con_handler(handler) is None
