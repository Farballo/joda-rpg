from dice import tirar, modificador_na


def secuencia(*valores):
    it = iter(valores)
    return lambda: next(it)


def test_tirada_normal_suma_los_dos_dados():
    resultado = tirar(na=0, stat="carisma", stat_valor=2, tirador=secuencia(3, 4))
    assert resultado["tipo"] == "normal"
    assert resultado["dados_tirados"] == [3, 4]
    assert resultado["suma_dados"] == 7
    assert resultado["modificador_na"] == 0
    assert resultado["total"] == 9  # 7 + 2 + 0


def test_siempre_tira_dos_dados_sin_importar_el_na():
    resultado = tirar(na=9, stat="aguante", stat_valor=0, tirador=secuencia(5, 2))
    assert resultado["dados_tirados"] == [5, 2]
    assert resultado["suma_dados"] == 7


def test_dobles_1_1_es_papelon_automatico():
    resultado = tirar(na=0, stat="carisma", stat_valor=4, tirador=secuencia(1, 1))
    assert resultado["tipo"] == "papelon_automatico"
    assert resultado["suma_dados"] == 2


def test_dobles_6_6_es_exito_con_bonus():
    resultado = tirar(na=0, stat="aguante", stat_valor=0, tirador=secuencia(6, 6))
    assert resultado["tipo"] == "exito_bonus"
    assert resultado["suma_dados"] == 12


def test_un_solo_1_no_es_papelon():
    resultado = tirar(na=0, stat="carisma", stat_valor=0, tirador=secuencia(1, 4))
    assert resultado["tipo"] == "normal"


def test_un_solo_6_no_es_exito_bonus():
    resultado = tirar(na=0, stat="carisma", stat_valor=0, tirador=secuencia(6, 2))
    assert resultado["tipo"] == "normal"


def test_modificador_na_sobrio_0_1_no_modifica():
    assert modificador_na(0, "carisma") == 0
    assert modificador_na(1, "carisma") == 0


def test_modificador_na_alegre_2_3_suma_2_en_stat_social():
    assert modificador_na(2, "carisma") == 2
    assert modificador_na(3, "carisma") == 2
    assert modificador_na(2, "astucia") == 0


def test_modificador_na_picante_4_5_suma_4_social_y_resta_2_logicas():
    assert modificador_na(4, "carisma") == 4
    assert modificador_na(5, "carisma") == 4
    assert modificador_na(4, "astucia") == -2
    assert modificador_na(5, "astucia") == -2
    assert modificador_na(4, "aguante") == 0


def test_modificador_na_modo_caos_6_7_no_modifica():
    assert modificador_na(6, "carisma") == 0
    assert modificador_na(7, "carisma") == 0


def test_modificador_na_irrecuperable_8_9_resta_2_a_cualquier_stat():
    assert modificador_na(8, "carisma") == -2
    assert modificador_na(9, "aguante") == -2
    assert modificador_na(8, "astucia") == -2


def test_modificador_na_leyenda_urbana_10_no_modifica():
    assert modificador_na(10, "carisma") == 0
