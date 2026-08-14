"""Flujo unificado de NPCs: revelar (global) y, aparte, iniciar encuentro (dirigido).

Ver plan_joda_rpg.md secciones 2, 5.5 y 7. Todo pasa por el WebSocket del DM /
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
            assert encuentro["npc"]["puntaje_lindura"] == 6

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


def test_resolver_el_encuentro_desbloquea_el_siguiente(client):
    """morocho_after es de 1 sola ronda: una tirada alcanza para resolverlo."""
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("morocho_after", zona_actual())
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("morocho_after", p1)

    with client.websocket_connect(f"/ws/player/{p1}") as ws1:
        ws1.receive_json()
        ws1.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        resultado = ws1.receive_json()
        assert resultado["type"] == "resultado_encare"
        assert resultado["resuelto"] is True

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
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


def test_npc_resuelto_se_puede_reasignar_a_otro_jugador(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", p1)

    with client.websocket_connect(f"/ws/player/{p1}") as ws1:
        ws1.receive_json()
        ws1.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        ws1.receive_json()

    with client.websocket_connect("/ws/dm") as ws_dm:
        ws_dm.receive_json()
        ws_dm.send_json({"type": "iniciar_encuentro", "npc_id": "morocho_after", "jugador_objetivo": p2})
        msg = ws_dm.receive_json()
        assert msg["type"] == "estado_completo"
        encuentro = msg["npcs_revelados"]["morocho_after"]["encuentro"]
        assert encuentro["jugador_objetivo"] == p2
        assert encuentro["resuelto"] is False


def test_npc_resuelto_se_puede_reasignar_al_mismo_jugador(client):
    player_id = unirse(client)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        ws.receive_json()

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
    # pero la carta del encuentro llega sin identidad ni puntaje
    assert visto["encuentro"]["npc"]["nombre"] == "❓"
    assert visto["encuentro"]["npc"]["puntaje_lindura"] is None


def test_sin_na_alto_el_encuentro_de_levante_llega_revelado(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    encuentro = gs.npcs_revelados_para_jugador(player_id)["sofia"]["encuentro"]
    assert encuentro["npc"]["nombre"] == "Sofía"
    assert encuentro["npc"]["puntaje_lindura"] == 6


def test_el_misterio_cae_al_resolver_el_intento(client):
    """morocho_after es de 1 sola ronda: una tirada alcanza para resolverlo y revelarlo."""
    player_id = unirse(client)
    gs.ajustar_na(player_id, gs.UMBRAL_MISTERIO_LEVANTE)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        resultado = ws.receive_json()
        assert resultado["puntaje_lindura"] == 7

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


def test_otro_jugador_no_puede_tirar_el_encuentro_ajeno(client):
    p1 = unirse(client, "Facu", "intenso")
    p2 = unirse(client, "Juli", "rama")
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", p1)

    with client.websocket_connect(f"/ws/player/{p2}") as ws2:
        ws2.receive_json()
        ws2.send_json({"type": "intentar_encare", "npc_id": "sofia", "opcion_idx": 0})
        err = ws2.receive_json()
        assert err["type"] == "error"


def test_no_se_puede_tirar_dos_veces_el_mismo_encuentro(client):
    """morocho_after es de 1 sola ronda: la primera tirada ya resuelve el encuentro."""
    player_id = unirse(client)
    gs.revelar_npc("morocho_after", zona_actual())
    gs.iniciar_encuentro("morocho_after", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        ws.receive_json()
        ws.receive_json()  # estado post-resolución

        ws.send_json({"type": "intentar_encare", "npc_id": "morocho_after", "opcion_idx": 0})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_opcion_idx_fuera_de_rango_da_error(client):
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "hermano_mayor", "opcion_idx": 5})
        err = ws.receive_json()
        assert err["type"] == "error"


def test_stat_otro_invalido_da_error(client):
    player_id = unirse(client)
    gs.revelar_npc("hermano_mayor", zona_actual())
    gs.iniciar_encuentro("hermano_mayor", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "hermano_mayor", "stat_otro": "fuerza"})
        err = ws.receive_json()
        assert err["type"] == "error"


# --- árbol de diálogo: rondas, acumulado, "Otro" -----------------------------


def test_arbol_de_dos_rondas_acumula_y_recien_resuelve_en_la_ultima(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()

        ws.send_json({"type": "intentar_encare", "npc_id": "sofia", "opcion_idx": 0})
        ronda1 = ws.receive_json()
        assert ronda1["resuelto"] is False
        assert ronda1["siguiente_nodo"]["texto"]
        assert len(ronda1["siguiente_nodo"]["opciones"]) == 2
        encuentro_parcial = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
        assert encuentro_parcial["resuelto"] is False
        assert encuentro_parcial["rondas_jugadas"] == 1
        assert encuentro_parcial["acumulado"] == ronda1["total"]
        ws.receive_json()  # estado post-ronda-1

        ws.send_json({"type": "intentar_encare", "npc_id": "sofia", "opcion_idx": 0})
        ronda2 = ws.receive_json()
        assert ronda2["resuelto"] is True
        assert ronda2["acumulado"] == ronda1["total"] + ronda2["total"]
        assert ronda2["dificultad_total"] == 12 * 2
        assert ronda2["puntaje_lindura"] == 6
        ws.receive_json()  # estado post-resolución

    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["resuelto"] is True
    assert encuentro["rondas_jugadas"] == 2
    assert len(encuentro["tiradas"]) == 2


def test_arbol_de_tres_rondas_confrontacion_varia_el_stat_por_opcion(client):
    player_id = unirse(client)
    gs.revelar_npc("patovica", zona_actual())
    gs.iniciar_encuentro("patovica", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()

        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "opcion_idx": 0})
        ronda1 = ws.receive_json()
        assert ronda1["stat"] == "carisma"
        ws.receive_json()

        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "opcion_idx": 0})
        ronda2 = ws.receive_json()
        assert ronda2["stat"] == "suerte"
        ws.receive_json()

        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "opcion_idx": 0})
        ronda3 = ws.receive_json()
        assert ronda3["resuelto"] is True
        assert ronda3["stat"] == "suerte"
        assert ronda3["dificultad_total"] == 14 * 3
        ws.receive_json()

    encuentro = gs.game_state["npcs_revelados"]["patovica"]["encuentro"]
    assert encuentro["rondas_jugadas"] == 3
    assert encuentro["acumulado"] == ronda1["total"] + ronda2["total"] + ronda3["total"]


def test_otro_corta_el_encuentro_en_la_primera_ronda_de_un_arbol_de_profundidad_3(client):
    player_id = unirse(client)
    gs.revelar_npc("patovica", zona_actual())
    gs.iniciar_encuentro("patovica", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "stat_otro": "aguante"})
        resultado = ws.receive_json()
        assert resultado["resuelto"] is True
        assert resultado["stat"] == "aguante"
        assert resultado["respuesta"] is None
        assert resultado["dificultad_total"] == 14  # una sola ronda jugada
        ws.receive_json()

    encuentro = gs.game_state["npcs_revelados"]["patovica"]["encuentro"]
    assert encuentro["rondas_jugadas"] == 1
    assert encuentro["resuelto"] is True


def test_otro_a_mitad_de_arbol_calcula_la_dificultad_con_las_rondas_jugadas_hasta_ahi(client):
    player_id = unirse(client)
    gs.revelar_npc("patovica", zona_actual())
    gs.iniciar_encuentro("patovica", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "opcion_idx": 0})
        ws.receive_json()
        ws.receive_json()

        ws.send_json({"type": "intentar_encare", "npc_id": "patovica", "stat_otro": "astucia"})
        resultado = ws.receive_json()
        assert resultado["resuelto"] is True
        assert resultado["dificultad_total"] == 14 * 2
        ws.receive_json()

    encuentro = gs.game_state["npcs_revelados"]["patovica"]["encuentro"]
    assert encuentro["rondas_jugadas"] == 2


def test_el_nodo_visible_no_expone_respuesta_ni_siguiente_ni_el_arbol_completo(client):
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    encuentro = gs.npcs_revelados_para_jugador(player_id)["sofia"]["encuentro"]
    assert "arbol" not in encuentro["npc"]
    assert encuentro["nodo"]["texto"] == "Te mira de reojo, atenta a lo que decís."
    for opcion in encuentro["nodo"]["opciones"]:
        assert set(opcion.keys()) == {"texto", "stat"}


def test_el_log_del_dm_registra_una_sola_entrada_por_encuentro_resuelto(client):
    """El log se llena al resolver el encuentro completo, no ronda por ronda."""
    player_id = unirse(client)
    gs.revelar_npc("sofia", zona_actual())
    gs.iniciar_encuentro("sofia", player_id)

    with client.websocket_connect(f"/ws/player/{player_id}") as ws:
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "sofia", "opcion_idx": 0})
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "intentar_encare", "npc_id": "sofia", "opcion_idx": 0})
        ws.receive_json()
        ws.receive_json()

    assert len(gs.game_state["log_eventos"]) == 1
    assert gs.game_state["log_eventos"][0]["contexto"] == "Sofía"


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
