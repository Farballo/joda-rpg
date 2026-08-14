import pytest
from fastapi.testclient import TestClient

import game_state as gs
from app import app


@pytest.fixture(autouse=True)
def partida_fresca():
    gs.crear_partida()
    yield
    gs.crear_partida()


@pytest.fixture
def client():
    return TestClient(app)


def test_crear_partida_no_marca_partida_iniciada(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.send_json({"type": "crear_partida"})
        msg = ws.receive_json()
        assert msg["partida_creada"] is True
        assert msg["partida_iniciada"] is False


def test_iniciar_partida_marca_el_flag_en_el_broadcast(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "iniciar_partida"})
        msg = ws.receive_json()
        assert msg["partida_iniciada"] is True


def test_configurar_mapas_actualiza_el_estado_del_dm(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "configurar_mapas", "mapas": {"previa": ["depto_banana"]}})
        msg = ws.receive_json()
        assert msg["mapas_habilitados"]["previa"] == ["depto_banana"]


def test_configurar_mapas_invalido_devuelve_error_y_no_rompe_la_conexion(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "configurar_mapas", "mapas": {"previa": []}})
        err = ws.receive_json()
        assert err["type"] == "error"

        ws.send_json({"type": "avanzar_fase"})
        msg = ws.receive_json()
        assert msg["type"] == "estado_completo"


def test_configurar_eventos_actualiza_el_estado_del_dm(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "configurar_eventos", "eventos": {"previa": ["Primer papelón"]}})
        msg = ws.receive_json()
        assert msg["eventos_habilitados"]["previa"] == ["Primer papelón"]


def test_configurar_eventos_invalido_devuelve_error_y_no_rompe_la_conexion(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "configurar_eventos", "eventos": {"fase_inventada": ["algo"]}})
        err = ws.receive_json()
        assert err["type"] == "error"

        ws.send_json({"type": "avanzar_fase"})
        msg = ws.receive_json()
        assert msg["type"] == "estado_completo"


def test_crear_jugador_dummy_lo_agrega_a_la_partida(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "crear_jugador_dummy", "nombre": "Dummy", "personaje_id": "intenso"})
        msg = ws.receive_json()
        assert len(msg["jugadores"]) == 1
        assert list(msg["jugadores"].values())[0]["nombre"] == "Dummy"


def test_crear_jugador_dummy_sin_nombre_da_error(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "crear_jugador_dummy", "nombre": "  ", "personaje_id": "intenso"})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_expulsar_jugador_lo_saca_y_cierra_su_conexion(client):
    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()

        res = client.post("/join", json={"nombre": "Facu", "personaje_id": "intenso"})
        player_id = res.json()["player_id"]
        ws_dm.receive_json()  # estado_completo por el broadcast de /join

        with client.websocket_connect(f"/ws/player/{player_id}") as ws_player:
            ws_player.receive_json()  # estado inicial

            ws_dm.send_json({"type": "expulsar_jugador", "player_id": player_id})
            msg = ws_dm.receive_json()
            assert player_id not in msg["jugadores"]

            with pytest.raises(Exception):
                ws_player.receive_json()


def test_expulsar_jugador_inexistente_da_error(client):
    with client.websocket_connect("/ws/dm") as ws:
        ws.receive_json()
        ws.send_json({"type": "expulsar_jugador", "player_id": "no-existe"})
        err = ws.receive_json()
        assert err["type"] == "error"
