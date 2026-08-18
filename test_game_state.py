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


def test_crear_partida_arranca_con_un_mapa_elegido_por_fase():
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_cruza"]
    assert gs.game_state["mapas_habilitados"]["boliche"] == ["boliche_a"]
    assert gs.game_state["mapas_habilitados"]["after"] == ["after_cruza"]


def test_crear_partida_no_inicia_la_partida_todavia():
    assert gs.game_state["partida_iniciada"] is False


def test_iniciar_partida_marca_el_flag():
    gs.iniciar_partida()
    assert gs.game_state["partida_iniciada"] is True


def test_configurar_mapas_restringe_las_variantes_habilitadas():
    gs.configurar_mapas({"previa": ["depto_banana"]})
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_banana"]
    # las demás fases no se tocan
    assert gs.game_state["mapas_habilitados"]["boliche"] == ["boliche_a"]


def test_configurar_mapas_ignora_ids_invalidos_pero_conserva_los_validos():
    gs.configurar_mapas({"previa": ["depto_banana", "no_existe"]})
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_banana"]


def test_configurar_mapas_rechaza_dejar_una_fase_sin_mapa():
    with pytest.raises(ValueError):
        gs.configurar_mapas({"previa": []})
    # no se aplicó el cambio inválido
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_cruza"]


def test_configurar_mapas_rechaza_mas_de_un_mapa_por_fase():
    with pytest.raises(ValueError):
        gs.configurar_mapas({"previa": ["depto_cruza", "depto_banana"]})
    # no se aplicó el cambio inválido
    assert gs.game_state["mapas_habilitados"]["previa"] == ["depto_cruza"]


def test_configurar_mapas_rechaza_fase_invalida():
    with pytest.raises(ValueError):
        gs.configurar_mapas({"fase_inventada": ["algo"]})


def test_configurar_mapas_re_elige_el_mapa_actual_si_quedo_deshabilitado():
    gs.game_state["mapa_actual"] = next(v for v in gs.MAPA["previa"] if v["id"] == "depto_cruza")
    gs.configurar_mapas({"previa": ["depto_banana"]})
    assert gs.game_state["mapa_actual"]["id"] == "depto_banana"


def test_configurar_mapas_no_toca_el_mapa_actual_si_sigue_siendo_el_elegido():
    gs.game_state["mapa_actual"] = next(v for v in gs.MAPA["previa"] if v["id"] == "depto_cruza")
    gs.configurar_mapas({"previa": ["depto_cruza"]})
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


def test_siguiente_situacion_sin_personalizar_usa_la_del_evento():
    situacion = gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")
    assert situacion["dificultad"] == 13


def test_configurar_dificultad_evento_la_pisa_al_elegir_esa_situacion():
    gs.configurar_dificultad_evento("¿Quién trae alcohol?", 18)
    situacion = gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")
    assert situacion["dificultad"] == 18


def test_configurar_dificultad_evento_no_toca_el_dato_original_del_archivo():
    gs.configurar_dificultad_evento("¿Quién trae alcohol?", 18)
    assert gs.EVENTOS["previa"][0]["dificultad"] == 13


def test_configurar_dificultad_evento_persiste_entre_elecciones():
    gs.configurar_dificultad_evento("¿Quién trae alcohol?", 18)
    gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")
    otra_vez = gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")
    assert otra_vez["dificultad"] == 18


def test_configurar_dificultad_evento_con_none_restablece_la_del_archivo():
    gs.configurar_dificultad_evento("¿Quién trae alcohol?", 18)
    gs.configurar_dificultad_evento("¿Quién trae alcohol?", None)
    situacion = gs.siguiente_situacion("elegir", "¿Quién trae alcohol?")
    assert situacion["dificultad"] == 13


def test_configurar_dificultad_evento_con_titulo_invalido_da_error():
    with pytest.raises(ValueError):
        gs.configurar_dificultad_evento("Evento que no existe", 18)


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


def test_situacion_exitosa_suma_puntaje_y_queda_en_el_historial(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])
    gs.resolver_situacion_pendiente()

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 1
    assert jugador["historial"] == [{"tipo": "situacion", "nombre": situacion["titulo"], "exito": True, "puntos": 1}]


def test_situacion_fallida_no_suma_puntaje_pero_queda_en_el_historial(monkeypatch):
    _forzar_total(monkeypatch, -999)
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])
    gs.resolver_situacion_pendiente()

    jugador = gs.game_state["jugadores"][player_id]
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == [{"tipo": "situacion", "nombre": situacion["titulo"], "exito": False, "puntos": 0}]


def test_elegir_opcion_situacion_deja_la_ronda_pendiente_sin_tirar(monkeypatch):
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])

    assert gs.game_state["situacion_actual"]["pendiente"] == {
        "player_id": player_id, "stat": opcion["stat"], "opcion": opcion["texto"]
    }
    assert gs.game_state["situacion_actual"]["resuelta"] is False
    assert gs.game_state["jugadores"][player_id]["historial"] == []


def test_no_se_puede_elegir_opcion_de_situacion_si_ya_hay_una_pendiente():
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]
    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])

    with pytest.raises(ValueError):
        gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])


def test_resolver_situacion_pendiente_sin_eleccion_previa_da_error():
    gs.crear_jugador("Facu", "intenso")
    gs.siguiente_situacion("random")

    with pytest.raises(ValueError):
        gs.resolver_situacion_pendiente()


def test_modificador_dm_de_situacion_puede_convertir_un_fracaso_en_exito(monkeypatch):
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    _forzar_total(monkeypatch, situacion["dificultad"] - 3)  # solo, sería fracaso
    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])
    resultado = gs.resolver_situacion_pendiente(modificador_dm=4)

    assert resultado["total_ajustado"] == situacion["dificultad"] + 1
    assert resultado["exito"] is True
    assert gs.game_state["jugadores"][player_id]["puntaje"] == 1


def test_modificador_dm_de_situacion_puede_convertir_un_exito_en_fracaso(monkeypatch):
    player_id = gs.crear_jugador("Facu", "intenso")
    situacion = gs.siguiente_situacion("random")
    opcion = situacion["opciones"][0]

    _forzar_total(monkeypatch, situacion["dificultad"] + 3)  # solo, sería éxito
    gs.elegir_opcion_situacion(player_id, opcion["stat"], opcion["texto"])
    resultado = gs.resolver_situacion_pendiente(modificador_dm=-4)

    assert resultado["total_ajustado"] == situacion["dificultad"] - 1
    assert resultado["exito"] is False
    assert gs.game_state["jugadores"][player_id]["puntaje"] == 0


def test_encare_de_levante_exitoso_suma_puntaje_segun_formula(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("morocho_after", "living")
    gs.iniciar_encuentro("morocho_after", player_id)

    gs.elegir_ataque_encare(player_id, "morocho_after", 0)
    resultado = gs.resolver_ronda_encare("morocho_after", habilidad_npc_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    assert resultado["resuelto"] is True
    assert resultado["exito"] is True
    # round((hot=7 + crazy=3) / 2) = 5, + bonus de eficiencia (5 rondas límite - 1 jugada) = 4
    assert jugador["puntaje"] == 9
    assert jugador["historial"] == [
        {"tipo": "levante", "nombre": "El Morocho de Ojos Claros", "exito": True, "puntos": 9}
    ]


def test_encare_de_confrontacion_exitosa_suma_puntaje_segun_formula(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    gs.elegir_ataque_encare(player_id, "hermano_mayor", 0)
    gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    # round((locura=4 + dureza=6) / 2) = 5, + bonus de eficiencia (5 - 1) = 4
    assert jugador["puntaje"] == 9
    assert jugador["historial"] == [
        {"tipo": "confrontacion", "nombre": "El Hermano Mayor", "exito": True, "puntos": 9}
    ]


def test_encare_fallido_al_llegar_al_limite_de_rondas_no_suma_puntos(monkeypatch):
    _forzar_total(monkeypatch, -999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    resultado = None
    for _ in range(gs.LIMITE_RONDAS_ENCARE):
        gs.elegir_ataque_encare(player_id, "hermano_mayor", 0)
        resultado = gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    jugador = gs.game_state["jugadores"][player_id]
    assert resultado["resuelto"] is True
    assert resultado["exito"] is False
    assert resultado["hp_npc"] == gs.get_npc("hermano_mayor")["hp"]  # nunca le bajó el HP
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == [
        {"tipo": "confrontacion", "nombre": "El Hermano Mayor", "exito": False, "puntos": 0}
    ]


def test_encare_de_varias_rondas_solo_registra_el_resultado_una_vez(monkeypatch):
    _forzar_total(monkeypatch, 11)  # 11 - defensa(2) = 9 de daño por ronda, hp(18) baja a 0 en 2 rondas
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)
    jugador = gs.game_state["jugadores"][player_id]

    gs.elegir_ataque_encare(player_id, "sofia", 0)
    resultado_ronda_1 = gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)
    assert resultado_ronda_1["resuelto"] is False
    assert resultado_ronda_1["hp_npc"] == 9
    assert jugador["puntaje"] == 0
    assert jugador["historial"] == []

    gs.elegir_ataque_encare(player_id, "sofia", 0)
    resultado_ronda_2 = gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)
    assert resultado_ronda_2["resuelto"] is True
    assert resultado_ronda_2["hp_npc"] == 0
    # round((hot=6 + crazy=4) / 2) = 5, + bonus de eficiencia (5 - 2 rondas) = 3
    assert jugador["puntaje"] == 8
    assert len(jugador["historial"]) == 1


def test_modificador_dm_aumenta_el_dano_de_esa_ronda(monkeypatch):
    """El DM juzga que la frase estuvo buenísima: el bonus se nota en el daño de esa ronda."""
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    _forzar_total(monkeypatch, 2)  # 2 - defensa(1) = 1 de daño sin el bonus del DM
    gs.elegir_ataque_encare(player_id, "hermano_mayor", 0)
    resultado = gs.resolver_ronda_encare("hermano_mayor", modificador_dm=4, habilidad_npc_idx=0)

    assert resultado["total_ajustado"] == 6
    assert resultado["dano"] == 5
    assert resultado["hp_npc"] == gs.get_npc("hermano_mayor")["hp"] - 5


def test_modificador_dm_negativo_puede_dejar_el_dano_en_cero(monkeypatch):
    """El DM juzga que la frase fue un papelón: el malus se come el daño de esa ronda."""
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    _forzar_total(monkeypatch, 3)  # 3 - defensa(1) = 2 de daño sin el malus del DM
    gs.elegir_ataque_encare(player_id, "hermano_mayor", 0)
    resultado = gs.resolver_ronda_encare("hermano_mayor", modificador_dm=-4, habilidad_npc_idx=0)

    assert resultado["total_ajustado"] == -1
    assert resultado["dano"] == 0  # el daño nunca es negativo
    assert resultado["hp_npc"] == gs.get_npc("hermano_mayor")["hp"]


def test_contraataque_del_npc_aplica_debuff_al_stat_elegido(monkeypatch):
    _forzar_total(monkeypatch, 5)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)

    gs.elegir_ataque_encare(player_id, "sofia", 0)  # carisma
    gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)  # habilidad 0 de sofía debilita carisma

    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["debuffs_jugador"] == {"carisma": 3}  # ataque de sofía


def test_debuff_resta_del_stat_valor_en_la_ronda_siguiente(monkeypatch):
    _forzar_total(monkeypatch, 5)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)

    gs.elegir_ataque_encare(player_id, "sofia", 0)  # carisma
    gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)  # debuff carisma -3

    gs.elegir_ataque_encare(player_id, "sofia", 0)  # carisma otra vez, ya debuffeado
    resultado = gs.resolver_ronda_encare("sofia", habilidad_npc_idx=1)

    personaje = gs.get_personaje("intenso")
    assert resultado["debuff_valor"] == 3
    assert resultado["stat_valor"] == personaje["stats"]["carisma"] - 3


def test_debuff_pisa_en_vez_de_acumularse_sobre_el_mismo_stat(monkeypatch):
    _forzar_total(monkeypatch, 5)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)

    gs.elegir_ataque_encare(player_id, "sofia", 0)
    gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)  # debuff carisma -3

    gs.elegir_ataque_encare(player_id, "sofia", 2)  # suerte, no toca carisma
    gs.resolver_ronda_encare("sofia", habilidad_npc_idx=0)  # otra vez debuff carisma -3

    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["debuffs_jugador"]["carisma"] == 3  # pisó, no se sumó a 6


def test_habilidad_npc_libre_permite_al_dm_elegir_el_stat_debuffado(monkeypatch):
    _forzar_total(monkeypatch, 5)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("sofia", "living")
    gs.iniciar_encuentro("sofia", player_id)

    gs.elegir_ataque_encare(player_id, "sofia", 0)
    resultado = gs.resolver_ronda_encare(
        "sofia", habilidad_npc_idx="libre", stat_objetivo_libre="suerte", texto_libre="Te tira una mirada rara"
    )

    assert resultado["stat_debuffado"] == "suerte"
    assert resultado["texto_habilidad_npc"] == "Te tira una mirada rara"
    encuentro = gs.game_state["npcs_revelados"]["sofia"]["encuentro"]
    assert encuentro["debuffs_jugador"] == {"suerte": 3}


def test_ultimate_duplica_el_dano_de_esa_ronda(monkeypatch):
    _forzar_total(monkeypatch, 5)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    gs.elegir_ataque_encare(player_id, "hermano_mayor", "ultimate")
    resultado = gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    assert resultado["total_ajustado"] == 10  # (5 + 0) * 2
    assert resultado["dano"] == 9  # 10 - defensa(1)


def test_ultimate_solo_se_puede_usar_una_vez_por_fase(monkeypatch):
    _forzar_total(monkeypatch, 999)  # resuelve el encuentro de un solo golpe
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)
    gs.elegir_ataque_encare(player_id, "hermano_mayor", "ultimate")
    gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    gs.revelar_npc("vecino_6am", "living")
    gs.iniciar_encuentro("vecino_6am", player_id)
    with pytest.raises(ValueError):
        gs.elegir_ataque_encare(player_id, "vecino_6am", "ultimate")


def test_ultimate_se_resetea_al_cambiar_de_fase(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)
    gs.elegir_ataque_encare(player_id, "hermano_mayor", "ultimate")
    gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    gs.avanzar_fase()

    assert gs.game_state["jugadores"][player_id]["ultimate_usado_fase"] is False


def test_desglose_stat_sin_debilidad_activa():
    player_id = gs.crear_jugador("Facu", "intenso")
    jugador = gs.game_state["jugadores"][player_id]
    personaje = gs.get_personaje("intenso")

    desglose = gs.desglose_stat(jugador, personaje, "astucia")

    assert desglose["stat_base"] == -2
    assert desglose["stat_valor"] == -2
    assert desglose["debilidad_nombre"] is None
    assert desglose["debilidad_modificador"] is None


def test_desglose_stat_con_debilidad_activa_en_el_stat_que_afecta():
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.activar_debilidad(player_id)
    jugador = gs.game_state["jugadores"][player_id]
    personaje = gs.get_personaje("intenso")

    desglose = gs.desglose_stat(jugador, personaje, "astucia")

    assert desglose["stat_base"] == -2
    assert desglose["stat_valor"] == -4  # -2 base + -2 de la debilidad
    assert desglose["debilidad_nombre"] == "No puede quedarse quieto"
    assert desglose["debilidad_modificador"] == -2


def test_desglose_stat_con_debilidad_activa_en_otro_stat_no_afecta():
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.activar_debilidad(player_id)  # la debilidad de "intenso" es sobre astucia
    jugador = gs.game_state["jugadores"][player_id]
    personaje = gs.get_personaje("intenso")

    desglose = gs.desglose_stat(jugador, personaje, "carisma")

    assert desglose["stat_valor"] == desglose["stat_base"] == 4
    assert desglose["debilidad_nombre"] is None


def test_resolver_ronda_encare_incluye_el_desglose_de_debilidad(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.activar_debilidad(player_id)
    gs.revelar_npc("hermano_mayor", "living")
    gs.iniciar_encuentro("hermano_mayor", player_id)

    # ataque_idx 2 de "intenso" ("Se arriesga sin pensar") es justo el que tira
    # astucia, la debilidad de este personaje
    gs.elegir_ataque_encare(player_id, "hermano_mayor", 2)
    resultado = gs.resolver_ronda_encare("hermano_mayor", habilidad_npc_idx=0)

    assert resultado["stat"] == "astucia"
    assert resultado["stat_base"] == -2
    assert resultado["debilidad_nombre"] == "No puede quedarse quieto"
    assert resultado["debilidad_modificador"] == -2


def test_resolver_situacion_pendiente_incluye_el_desglose_de_debilidad(monkeypatch):
    _forzar_total(monkeypatch, 999)
    player_id = gs.crear_jugador("Facu", "intenso")
    gs.activar_debilidad(player_id)
    gs.siguiente_situacion("random")

    gs.elegir_opcion_situacion(player_id, "astucia", gs.OTRO_OPCION)
    resultado = gs.resolver_situacion_pendiente()

    assert resultado["stat_base"] == -2
    assert resultado["debilidad_nombre"] == "No puede quedarse quieto"
    assert resultado["debilidad_modificador"] == -2
