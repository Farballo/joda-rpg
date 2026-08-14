import pytest

import game_state as gs


def _forzar_total(monkeypatch, total):
    """Reemplaza dice.tirar por una tirada de resultado fijo, para no depender del azar
    al testear si el puntaje se registra según `exito` (sección 6 del plan)."""

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


@pytest.fixture(autouse=True)
def partida_fresca():
    gs.crear_partida()
    yield
    gs.crear_partida()


def test_crear_partida_arranca_con_todos_los_mapas_habilitados():
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_cruza", "depto_banana"]
    assert gs.game_state["mapas_habilitados"]["boliche"] == ["boliche_a", "boliche_b"]
    assert gs.game_state["mapas_habilitados"]["after"] == ["after_cruza", "after_banana"]


def test_crear_partida_no_inicia_la_partida_todavia():
    assert gs.game_state["partida_iniciada"] is False


def test_iniciar_partida_marca_el_flag():
    gs.iniciar_partida()
    assert gs.game_state["partida_iniciada"] is True


def test_configurar_mapas_restringe_las_variantes_habilitadas():
    gs.configurar_mapas({"previa": ["depto_banana"]})
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_banana"]
    # las demás fases no se tocan
    assert gs.game_state["mapas_habilitados"]["boliche"] == ["boliche_a", "boliche_b"]


def test_configurar_mapas_ignora_ids_invalidos_pero_conserva_los_validos():
    gs.configurar_mapas({"previa": ["depto_banana", "no_existe"]})
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_banana"]


def test_configurar_mapas_rechaza_dejar_una_fase_sin_mapas():
    with pytest.raises(ValueError):
        gs.configurar_mapas({"previa": []})
    # no se aplicó el cambio inválido
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_cruza", "depto_banana"]


def test_configurar_mapas_rechaza_fase_invalida():
    with pytest.raises(ValueError):
        gs.configurar_mapas({"fase_inventada": ["algo"]})


def test_configurar_mapas_re_elige_el_mapa_actual_si_quedo_deshabilitado():
    gs.game_state["mapa_actual"] = next(v for v in gs.MAPA["previa"] if v["id"] == "depto_cruza")
    gs.configurar_mapas({"previa": ["depto_banana"]})
    assert gs.game_state["mapa_actual"]["id"] == "depto_banana"


def test_configurar_mapas_no_toca_el_mapa_actual_si_sigue_habilitado():
    gs.game_state["mapa_actual"] = next(v for v in gs.MAPA["previa"] if v["id"] == "depto_cruza")
    gs.configurar_mapas({"previa": ["depto_cruza", "depto_banana"]})
    assert gs.game_state["mapa_actual"]["id"] == "depto_cruza"


def test_avanzar_fase_solo_elige_entre_mapas_habilitados():
    gs.configurar_mapas({"boliche": ["boliche_b"]})
    gs.avanzar_fase()
    assert gs.game_state["mapa_actual"]["id"] == "boliche_b"


def test_crear_partida_arranca_con_todos_los_eventos_habilitados():
    titulos_previa = [e["titulo"] for e in gs.EVENTOS["previa"]]
    assert gs.game_state["eventos_habilitados"]["previa"] == titulos_previa


def test_configurar_eventos_restringe_y_ordena():
    gs.configurar_eventos({"previa": ["Primer papelón", "¿Quién trae alcohol?"]})
    assert gs.game_state["eventos_habilitados"]["previa"] == ["Primer papelón", "¿Quién trae alcohol?"]
    # las demás fases no se tocan
    assert gs.game_state["eventos_habilitados"]["boliche"] == [e["titulo"] for e in gs.EVENTOS["boliche"]]


def test_configurar_eventos_ignora_titulos_invalidos_y_duplicados():
    gs.configurar_eventos({"previa": ["Primer papelón", "no existe", "Primer papelón"]})
    assert gs.game_state["eventos_habilitados"]["previa"] == ["Primer papelón"]


def test_configurar_eventos_permite_dejar_una_fase_sin_eventos():
    gs.configurar_eventos({"previa": []})
    assert gs.game_state["eventos_habilitados"]["previa"] == []


def test_configurar_eventos_rechaza_fase_invalida():
    with pytest.raises(ValueError):
        gs.configurar_eventos({"fase_inventada": ["algo"]})


def test_siguiente_situacion_random_solo_elige_entre_habilitados():
    gs.configurar_eventos({"previa": ["Primer papelón"]})
    for _ in range(5):
        situacion = gs.siguiente_situacion("random")
        assert situacion["titulo"] == "Primer papelón"


def test_siguiente_situacion_elegir_rechaza_evento_deshabilitado():
    gs.configurar_eventos({"previa": ["Primer papelón"]})
    with pytest.raises(ValueError):
        gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")


def test_siguiente_situacion_sin_eventos_habilitados_da_error():
    gs.configurar_eventos({"previa": []})
    with pytest.raises(ValueError):
        gs.siguiente_situacion("random")


def test_expulsar_jugador_lo_saca_de_la_partida():
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.expulsar_jugador(player_id)
    assert player_id not in gs.game_state["jugadores"]


def test_expulsar_jugador_inexistente_no_rompe():
    gs.expulsar_jugador("no-existe")


def test_expulsar_jugador_limpia_sus_encuentros_pendientes_pero_deja_al_npc_revelado():
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)

    gs.expulsar_jugador(player_id)

    # el reveal es global, el NPC sigue en escena; lo que se cae es el encuentro
    assert "sofia" in gs.game_state["npcs_revelados"]
    assert gs.game_state["npcs_revelados"]["sofia"]["encuentro"] is None
    assert gs.encuentro_en_curso() is None


def test_expulsar_jugador_no_toca_encuentros_de_otros_jugadores():
    p1 = gs.crear_jugador("Facu", "intenso")
    p2 = gs.crear_jugador("Juli", "rama")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", p2)

    gs.expulsar_jugador(p1)

    assert gs.game_state["npcs_revelados"]["sofia"]["encuentro"]["jugador_objetivo"] == p2


# --- puntaje e historial ------------------------------------------------------


def test_crear_jugador_arranca_con_puntaje_en_cero_y_sin_historial():
    player_id = gs.crear_jugador("Facu", "intenso")
    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == []


def test_intentar_situacion_exitosa_suma_puntaje_y_queda_en_el_historial(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    gs.intentar_situacion(player_id, opcion["stat"], opcion["texto"])

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 1
    assert jugador["historial"] == [{"tipo": "situacion", "nombre": situacion["titulo"], "exito": True, "puntos": 1}]


def test_intentar_situacion_fallida_no_suma_puntaje_pero_queda_en_el_historial(monkeypatch):
    _forzar_total(monkeypatch, -999)
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    gs.intentar_situacion(player_id, opcion["stat"], opcion["texto"])

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == [{"tipo": "situacion", "nombre": situacion["titulo"], "exito": False, "puntos": 0}]


def test_intentar_encare_de_levante_exitoso_suma_el_puntaje_lindura(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("morocho_after", "living")
    gs.iniciar_encuentro("morocho_after", player_id)

    resultado = gs.intentar_encare(player_id, "morocho_after", opcion_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    assert resultado["resuelto"] is True
    assert jugador["puntaje"] == 7  # puntaje_lindura de morocho_after
    assert jugador["historial"] == [
        {"tipo": "levante", "nombre": "El Morocho de Ojos Claros", "exito": True, "puntos": 7}
    ]


def test_intentar_encare_de_confrontacion_exitosa_suma_un_punto(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    gs.intentar_encare(player_id, "hermano_mayor", opcion_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 1
    assert jugador["historial"] == [
        {"tipo": "confrontacion", "nombre": "El Hermano Mayor", "exito": True, "puntos": 1}
    ]


def test_intentar_encare_fallido_no_suma_puntos_pero_registra_el_fracaso(monkeypatch):
    _forzar_total(monkeypatch, -999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    gs.intentar_encare(player_id, "hermano_mayor", opcion_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == [
        {"tipo": "confrontacion", "nombre": "El Hermano Mayor", "exito": False, "puntos": 0}
    ]


def test_intentar_encare_de_varias_rondas_solo_registra_el_resultado_una_vez(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)
    jugador = gs.game_state["jugadores"][player_id]

    resultado_ronda_1 = gs.intentar_encare(player_id, "sofia", opcion_idx=0)
    assert resultado_ronda_1["resuelto"] is False
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == []

    resultado_ronda_2 = gs.intentar_encare(player_id, "sofia", opcion_idx=0)
    assert resultado_ronda_2["resuelto"] is True
    assert jugador["puntaje"] == 6  # puntaje_lindura de sofía
    assert len(jugador["historial"]) == 1
