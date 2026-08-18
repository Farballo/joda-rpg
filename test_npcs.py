"""Flujo unificado de NPCs: revelar (global) y, aparte, iniciar encuentro (dirigido).

Ver plan_nochero.md secciones 2, 5.5 y 7. Todo pasa por el WebSocket del DM /
del jugador, que es como se usa de verdad.
"""

import pytest
from fastapi.testclient import TestClient

import game_state as gs
from app import app


@pytest.fixture(autouse=True)
def partida_fresca():
    gs.crear_partida()
    gs.iniciar_partida()
    yield
    gs.crear_partida()


@pytest.fixture
def client():
    return TestClient(app)


def zona_actual() -> str:
    return gs.game_state["mapa_actual"]["zonas"][0]["id"]


def unirse(client, nombre="Facu", personaje_id="intenso") -> str:
    res = client.post("/join", json={"nombre": nombre, "personaje_id": personaje_id})
    assert res.status_code == 200
    return res.json()["player_id"]


def _forzar_total(monkeypatch, total):
    """Reemplaza dice.tirar por una tirada de resultado fijo, para no depender del azar
    al testear el desenlace de un encare (HP del NPC, límite de rondas, etc)."""

    def tirar_falso(na, stat, stat_valor, tirador=None):
        return {
            "tipo": "normal",
            "dados_tirados": [3, 3],
            "suma_dados": 6,
            "stat_valor": stat_valor,
            "modificador_na": 0,
            "total": total,
        }

    monkeypatch.setattr(gs.dice, "tirar", tirar_falso)


def elegir_y_resolver(ws_dm, ws_jugador, npc_id, ataque_idx=0, modificador_dm=0, habilidad_npc_idx=0):
    """Una ronda completa de encare: el jugador elige el ataque (a la mesa, dice su frase
    en voz alta), y el DM la resuelve con un `modificador_dm` y elige con qué habilidad
    contraataca el NPC (sección 2 del plan, "Ajuste de dificultad en vivo"). Devuelve el
    `resultado_encare` que le llega al jugador."""
    ws_jugador.send_json({"type": "elegir_ataque_encare", "npc_id": npc_id, "ataque_idx": ataque_idx})
    ws_jugador.receive_json()  # estado propio, con la ronda pendiente
    ws_dm.receive_json()  # estado_completo del DM

    ws_dm.send_json({
        "type": "resolver_ronda_encare",
        "npc_id": npc_id,
        "modificador_dm": modificador_dm,
        "habilidad_npc_idx": habilidad_npc_idx,
    })
    resultado = ws_jugador.receive_json()  # resultado_encare
    ws_jugador.receive_json()  # estado post-ronda
    ws_dm.receive_json()  # estado_completo del DM
    return resultado


# --- revelar: mismo paso para ambiente y para NPCs de encuentro ---------------


def test_revelar_npc_ambiente_llega_a_todos_los_jugadores(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        with client.websocket_connect(f"/ws/player/{p1}") as ws1, \
             client.websocket_connect(f"/ws/player/{p2}") as ws2:
            ws1.receive_json()
            ws2.receive_json()

            ws_dm.send_json({"type": "revelar_npc", "npc_id": "vecina", "zona": zona_actual()})

            for ws in (ws1, ws2):
                revelado = ws.receive_json()
                assert revelado["type"] == "npc_revelado"
                assert revelado["npc"]["nombre"] == "La Vecina"
                assert revelado["zona"] == zona_actual()


def test_revelar_npc_de_encuentro_tambien_llega_a_todos_y_sin_encuentro_todavia(client):
    """Un NPC de levante se revela igual que uno de ambiente: lo ve todo el mundo."""
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        with client.websocket_connect(f"/ws/player/{p1}") as ws1, \
             client.websocket_connect(f"/ws/player/{p2}") as ws2:
            ws1.receive_json()
            ws2.receive_json()

            ws_dm.send_json({"type": "revelar_npc", "npc_id": "sofia", "zona": zona_actual()})

            for ws in (ws1, ws2):
                revelado = ws.receive_json()
                assert revelado["type"] == "npc_revelado"
                assert revelado["npc"]["nombre"] == "Sofía"

                estado = ws.receive_json()
                assert estado["type"] == "estado"
                # revelado sí, pero todavía sin encuentro para nadie
                assert estado["npcs_revelados"]["sofia"]["encuentro"] is None


def test_revelar_npc_en_zona_invalida_da_error(client):
    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "revelar_npc", "npc_id": "sofia", "zona": "no_existe"})
        err = ws_dm.receive_json()
        assert err["type"] == "error"


# --- iniciar encuentro sobre un NPC ya revelado ------------------------------


def test_iniciar_encuentro_requiere_que_el_npc_este_revelado(client):
    player_id = unirse(client)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "sofia", "jugador_objetivo": player_id})
        err = ws_dm.receive_json()
        assert err["type"] == "error"
        assert "revelalo" in err["detail"]


def test_iniciar_encuentro_llega_solo_al_jugador_objetivo(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        with client.websocket_connect(f"/ws/player/{p1}") as ws1, \
             client.websocket_connect(f"/ws/player/{p2}") as ws2:
            ws1.receive_json()
            ws2.receive_json()

            ws_dm.send_json({"type": "revelar_npc", "npc_id": "sofia", "zona": zona_actual()})
            for ws in (ws1, ws2):
                ws.receive_json()  # npc_revelado
                ws.receive_json()  # estado

            ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "sofia", "jugador_objetivo": p1})

            estado1 = ws1.receive_json()
            encuentro = estado1["npcs_revelados"]["sofia"]["encuentro"]
            assert encuentro["jugador_objetivo"] == p1
            assert encuentro["resuelto"] is False
            assert encuentro["npc"]["hot"] == 6

    # p2 no recibió nada nuevo: para él sofía sigue revelada pero sin encuentro
    assert gs.npcs_revelados_para_jugador(p2)["sofia"]["encuentro"] is None


def test_iniciar_encuentro_sobre_un_npc_de_ambiente_da_error(client):
    player_id = unirse(client)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "revelar_npc", "npc_id": "vecina", "zona": zona_actual()})
        ws_dm.receive_json()

        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "vecina", "jugador_objetivo": player_id})
        err = ws_dm.receive_json()
        assert err["type"] == "error"


def test_iniciar_encuentro_random_elige_entre_los_revelados(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": None, "jugador_objetivo": player_id})
        msg = ws_dm.receive_json()
        assert msg["type"] == "estado_completo"
        assert msg["npcs_revelados"]["sofia"]["encuentro"]["jugador_objetivo"] == player_id


def test_iniciar_encuentro_random_sin_npcs_revelados_da_error(client):
    player_id = unirse(client)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": None, "jugador_objetivo": player_id})
        err = ws_dm.receive_json()
        assert err["type"] == "error"


# --- hablar con npc: el jugador arranca su propio encuentro desde la carta ---


def test_hablar_con_npc_de_levante_inicia_el_encuentro_para_ese_jugador(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "hablar_con_npc", "npc_id": "sofia"})
        estado = ws.receive_json()
        assert estado["type"] == "estado"
        encuentro = estado["npcs_revelados"]["sofia"]["encuentro"]
        assert encuentro["jugador_objetivo"] == player_id
        assert encuentro["resuelto"] is False

    assert gs.game_state["npcs_revelados"]["sofia"]["encuentro"]["jugador_objetivo"] == player_id


def test_hablar_con_npc_de_ambiente_da_error(client):
    """Ambiente no admite encuentro: "Hablar" en esas cartas queda como antes, sin mecánica."""
    player_id = unirse(client)
    gs.revelar_npc("vecina", zona_actual())

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "hablar_con_npc", "npc_id": "vecina"})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_hablar_con_npc_avisa_a_los_demas_jugadores_para_cerrar_la_carta(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("sofia", zona_actual())

    with client.websocket_connect(f"/ws/player/{p1}") as ws1, \
         client.websocket_connect(f"/ws/player/{p2}") as ws2:
        ws1.receive_json()
        ws2.receive_json()

        ws1.send_json({"type": "hablar_con_npc", "npc_id": "sofia"})
        ws1.receive_json()  # estado propio, con el encuentro ya asignado

        aviso = ws2.receive_json()
        assert aviso == {"type": "ocultar_carta_npc", "npc_id": "sofia"}


def test_hablar_con_npc_respeta_el_bloqueo_global(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("sofia", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("sofia", p1)

    with client.websocket_connect(f"/ws/player/{p2}") as ws2:
        ws2.receive_json()
        ws2.send_json({"type": "hablar_con_npc", "npc_id": "hermano_mayor"})
        err = ws2.receive_json()
        assert err["type"] == "error"
        assert "sin resolver" in err["detail"]


# --- bloqueo global de un encuentro por vez ----------------------------------


def test_no_se_puede_iniciar_un_segundo_encuentro_con_otro_npc(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "hermano_mayor", "jugador_objetivo": player_id})
        err = ws_dm.receive_json()
        assert err["type"] == "error"
        assert "sin resolver" in err["detail"]


def test_el_bloqueo_es_global_y_no_por_jugador(client):
    """Otro jugador tampoco puede arrancar un encuentro paralelo (decisión: bloqueo global)."""
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("sofia", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("sofia", p1)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "hermano_mayor", "jugador_objetivo": p2})
        err = ws_dm.receive_json()
        assert err["type"] == "error"


def test_resolver_el_encuentro_desbloquea_el_siguiente(client, monkeypatch):
    """Con un golpe que le baja todo el HP de una, el encuentro queda resuelto ahí."""
    _forzar_total(monkeypatch, 999)
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("morocho_after", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("morocho_after", p1)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{p1}") as ws1:
        ws_dm.receive_json()
        ws1.receive_json()

        resultado = elegir_y_resolver(ws_dm, ws1, "morocho_after", ataque_idx=0)
        assert resultado["type"] == "resultado_encare"
        assert resultado["resuelto"] is True

        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "hermano_mayor", "jugador_objetivo": p2})
        msg = ws_dm.receive_json()
        assert msg["type"] == "estado_completo"
        assert msg["npcs_revelados"]["hermano_mayor"]["encuentro"]["jugador_objetivo"] == p2


def test_ocultar_el_npc_cancela_su_encuentro_y_desbloquea(client):
    """La vía del DM para destrabar un encuentro que quedó colgado."""
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "ocultar_npc", "npc_id": "sofia"})
        ws_dm.receive_json()

        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "hermano_mayor", "jugador_objetivo": player_id})
        msg = ws_dm.receive_json()
        assert msg["type"] == "estado_completo"
        assert msg["npcs_revelados"]["hermano_mayor"]["encuentro"] is not None


# --- un NPC de encuentro no se agota ----------------------------------------


def test_npc_resuelto_se_puede_reasignar_a_otro_jugador(client, monkeypatch):
    _forzar_total(monkeypatch, 999)
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", p1)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{p1}") as ws1:
        ws_dm.receive_json()
        ws1.receive_json()
        elegir_y_resolver(ws_dm, ws1, "morocho_after", ataque_idx=0)

        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "morocho_after", "jugador_objetivo": p2})
        msg = ws_dm.receive_json()
        assert msg["type"] == "estado_completo"
        encuentro = msg["npcs_revelados"]["morocho_after"]["encuentro"]
        assert encuentro["jugador_objetivo"] == p2
        assert encuentro["resuelto"] is False


def test_npc_resuelto_se_puede_reasignar_al_mismo_jugador(client, monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = unirse(client)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()
        elegir_y_resolver(ws_dm, ws, "morocho_after", ataque_idx=0)

    gs.iniciar_encuentro("morocho_after", player_id)
    assert gs.game_state["npcs_revelados"]["morocho_after"]["encuentro"]["resuelto"] is False


def test_revelar_de_nuevo_un_npc_lo_mueve_de_zona_sin_perder_el_encuentro(client):
    player_id = unirse(client)
    zonas = gs.game_state["mapa_actual"]["zonas"]
    gs.revelar_npc("sofia", zonas[0]["id"])
    gs.iniciar_encuentro("sofia", player_id)

    gs.revelar_npc("sofia", zonas[1]["id"])

    info = gs.game_state["npcs_revelados"]["sofia"]
    assert info["zona"] == zonas[1]["id"]
    assert info["encuentro"]["jugador_objetivo"] == player_id


# --- misterio de lindura -----------------------------------------------------


def test_misterio_de_lindura_solo_afecta_la_carta_del_encuentro(client):
    """Con NA alto, el NPC de levante se ve normal en el mapa pero el encuentro llega a ciegas."""
    player_id = unirse(client)
    gs.ajustar_na(player_id, gs.UMBRAL_MISTERIO_LEVANTE)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    visto = gs.npcs_revelados_para_jugador(player_id)["sofia"]
    # el NPC sigue en el mapa como para todos (el reveal fue público)
    assert visto["zona"] == zona_actual()
    # pero la carta del encuentro llega sin identidad ni stats de puntaje
    assert visto["encuentro"]["npc"]["nombre"] == "❓"
    assert visto["encuentro"]["npc"]["hot"] is None


def test_sin_na_alto_el_encuentro_de_levante_llega_revelado(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    encuentro = gs.npcs_revelados_para_jugador(player_id)["sofia"]["encuentro"]
    assert encuentro["npc"]["nombre"] == "Sofía"
    assert encuentro["npc"]["hot"] == 6


def test_el_misterio_cae_al_resolver_el_intento(client, monkeypatch):
    """Con un golpe que le baja todo el HP de una, el encuentro se resuelve y revela."""
    _forzar_total(monkeypatch, 999)
    player_id = unirse(client)
    gs.ajustar_na(player_id, gs.UMBRAL_MISTERIO_LEVANTE)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()
        resultado = elegir_y_resolver(ws_dm, ws, "morocho_after", ataque_idx=0)
        assert resultado["resuelto"] is True
        assert resultado["exito"] is True

    encuentro = gs.npcs_revelados_para_jugador(player_id)["morocho_after"]["encuentro"]
    assert encuentro["npc"]["nombre"] == "El Morocho de Ojos Claros"


def test_confrontacion_nunca_lleva_misterio(client):
    player_id = unirse(client)
    gs.ajustar_na(player_id, 10)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    encuentro = gs.npcs_revelados_para_jugador(player_id)["hermano_mayor"]["encuentro"]
    assert encuentro["npc"]["nombre"] == "El Hermano Mayor"


# --- el encuentro sigue siendo la única parte con turno ----------------------


def test_otro_jugador_no_puede_elegir_opcion_en_el_encuentro_ajeno(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", p1)

    with client.websocket_connect(f"/ws/player/{p2}") as ws2:
        ws2.receive_json()
        ws2.send_json({"type": "elegir_ataque_encare", "npc_id": "sofia", "ataque_idx": 0})
        err = ws2.receive_json()
        assert err["type"] == "error"


def test_no_se_puede_elegir_opcion_dos_veces_en_el_mismo_encuentro(client, monkeypatch):
    """Con un golpe que resuelve el encuentro de una, la ronda siguiente ya no es válida."""
    _forzar_total(monkeypatch, 999)
    player_id = unirse(client)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()
        elegir_y_resolver(ws_dm, ws, "morocho_after", ataque_idx=0)

        ws.send_json({"type": "elegir_ataque_encare", "npc_id": "morocho_after", "ataque_idx": 0})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_no_se_puede_elegir_una_segunda_opcion_mientras_hay_una_pendiente(client):
    """El jugador ya dijo su frase y está esperando al DM: no puede elegir otra vez."""
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "elegir_ataque_encare", "npc_id": "hermano_mayor", "ataque_idx": 0})
        ws.receive_json()  # estado, con la ronda pendiente

        ws.send_json({"type": "elegir_ataque_encare", "npc_id": "hermano_mayor", "ataque_idx": 1})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_resolver_ronda_encare_sin_ninguna_ronda_pendiente_da_error(client):
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "resolver_ronda_encare", "npc_id": "hermano_mayor", "modificador_dm": 0})
        err = ws_dm.receive_json()
        assert err["type"] == "error"


def test_ataque_idx_fuera_de_rango_da_error(client):
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "elegir_ataque_encare", "npc_id": "hermano_mayor", "ataque_idx": 5})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_ataque_idx_invalido_da_error(client):
    """Cualquier valor que no sea 0-2 ni "ultimate" es inválido."""
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "elegir_ataque_encare", "npc_id": "hermano_mayor", "ataque_idx": "no_existe"})
        err = ws.receive_json()
        assert err["type"] == "error"


# --- ajuste de dificultad en vivo del DM (modificador_dm) --------------------


def test_modificador_dm_se_suma_al_total_de_esa_ronda(client):
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()

        resultado = elegir_y_resolver(ws_dm, ws, "hermano_mayor", ataque_idx=0, modificador_dm=4)
        assert resultado["modificador_dm"] == 4
        assert resultado["total_ajustado"] == resultado["total"] + 4


def test_npcs_revelados_para_jugador_marca_pendiente_mientras_espera_al_dm(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    gs.elegir_ataque_encare(player_id, "sofia", 0)

    visible = gs.npcs_revelados_para_jugador(player_id)["sofia"]["encuentro"]
    # "pendiente" llega como booleano: el detalle crudo (qué ataque eligió, que el DM
    # necesita para resolver) no se filtra al jugador
    assert visible["pendiente"] is True


# --- combate por HP: rondas, daño, contraataque -------------------------------


def test_el_hp_del_npc_baja_con_cada_ronda_y_recien_resuelve_al_llegar_a_cero(client, monkeypatch):
    _forzar_total(monkeypatch, 11)  # 11 - defensa(2) = 9 de daño por ronda, hp(18) baja a 0 en 2
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()

        ronda1 = elegir_y_resolver(ws_dm, ws, "sofia", ataque_idx=0)
        assert ronda1["resuelto"] is False
        assert ronda1["hp_npc"] == 9
        encuentro_parcial = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
        assert encuentro_parcial["resuelto"] is False
        assert encuentro_parcial["rondas_jugadas"] == 1

        ronda2 = elegir_y_resolver(ws_dm, ws, "sofia", ataque_idx=0)
        assert ronda2["resuelto"] is True
        assert ronda2["exito"] is True
        assert ronda2["hp_npc"] == 0

    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["resuelto"] is True
    assert encuentro["rondas_jugadas"] == 2
    assert len(encuentro["tiradas"]) == 2


def test_pierde_el_encuentro_si_llega_al_limite_de_rondas_sin_bajar_el_hp(client, monkeypatch):
    _forzar_total(monkeypatch, -999)
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()

        resultado = None
        for _ in range(gs.LIMITE_RONDAS_ENCARE):
            resultado = elegir_y_resolver(ws_dm, ws, "hermano_mayor", ataque_idx=0)

        assert resultado["resuelto"] is True
        assert resultado["exito"] is False


def test_el_contraataque_del_npc_llega_al_jugador_en_el_resultado_de_la_ronda(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()

        resultado = elegir_y_resolver(ws_dm, ws, "sofia", ataque_idx=0, habilidad_npc_idx=0)
        assert resultado["nombre_habilidad_npc"] == "Te ignora de golpe"
        assert resultado["stat_debuffado"] == "carisma"

    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["debuffs_jugador"] == {"carisma": 3}


def test_el_encuentro_visible_no_expone_las_habilidades_del_npc(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    encuentro = gs.npcs_revelados_para_jugador(player_id)["sofia"]["encuentro"]
    assert "habilidades" not in encuentro["npc"]
    assert encuentro["pendiente"] is False
    assert encuentro["hp_npc"] == 18
    assert encuentro["hp_npc_max"] == 18


def test_el_log_del_dm_registra_una_entrada_por_ronda_de_encuentro(client, monkeypatch):
    """Un encare de varias rondas deja una entrada por ronda en el log, no solo la
    última — si no, el DM pierde de vista cómo le fue al jugador en las rondas
    intermedias."""
    _forzar_total(monkeypatch, 11)  # 2 rondas para bajar el hp(18) de sofía a 0
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm, \
         client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws_dm.receive_json()
        ws.receive_json()

        elegir_y_resolver(ws_dm, ws, "sofia", ataque_idx=0)
        elegir_y_resolver(ws_dm, ws, "sofia", ataque_idx=0)

    assert len(gs.game_state["log_eventos"]) == 2
    assert gs.game_state["log_eventos"][0]["contexto"] == "Sofía (ronda 1)"
    assert gs.game_state["log_eventos"][1]["contexto"] == "Sofía (ronda 2)"


def test_cambiar_de_fase_limpia_revelados_y_encuentros(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "avanzar_fase"})
        msg = ws_dm.receive_json()
        assert msg["npcs_revelados"] == {}

    assert gs.encuentro_en_curso() is None
