from fastapi.testclient import TestClient

import game_state as gs
from app import app

client = TestClient(app)


def test_cartas_disponibles_encuentra_las_tres_que_existen():
    cartas = gs.cartas_disponibles()
    assert set(cartas) == {"rama", "gymbro", "timido"}


def test_cartas_disponibles_matchea_gym_bro_png_con_el_id_gymbro():
    # el archivo master se llama "gym_bro.png" pero el id del personaje es "gymbro"
    assert "gymbro" in gs.cartas_disponibles()


def test_cartas_disponibles_prefiere_la_version_liviana_de_web():
    for url in gs.cartas_disponibles().values():
        assert "/personajes_cartas/web/" in url


def test_cartas_disponibles_devuelve_urls_servibles():
    for url in gs.cartas_disponibles().values():
        assert url.startswith("/data/")
        assert client.get(url).status_code == 200


def test_cartas_disponibles_no_inventa_personajes():
    ids_validos = {p["id"] for p in gs.PERSONAJES}
    assert set(gs.cartas_disponibles()) <= ids_validos


def test_endpoint_cartas_responde_el_mismo_mapa():
    res = client.get("/api/cartas")
    assert res.status_code == 200
    assert res.json() == gs.cartas_disponibles()


def test_personajes_sin_carta_quedan_fuera_para_que_el_front_les_dibuje_una():
    cartas = gs.cartas_disponibles()
    assert "intenso" not in cartas
    assert "suertudo" not in cartas
    assert "fachero" not in cartas
