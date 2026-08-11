import random

SOCIALES = {"carisma", "presencia"}
LOGICAS = {"astucia"}


def d6() -> int:
    return random.randint(1, 6)


def modificador_na(na: int, stat: str) -> int:
    if 2 <= na <= 3 and stat in SOCIALES:
        return 2
    if 4 <= na <= 5:
        if stat in SOCIALES:
            return 4
        if stat in LOGICAS:
            return -2
    if 8 <= na <= 9:
        return -2  # Irrecuperable: penalización pareja, a cualquier stat
    return 0


def tirar(na: int, stat: str, stat_valor: int, tirador=d6) -> dict:
    dado1 = tirador()
    dado2 = tirador()
    suma_dados = dado1 + dado2
    modificador = modificador_na(na, stat)
    total = suma_dados + stat_valor + modificador

    if dado1 == 1 and dado2 == 1:
        tipo = "papelon_automatico"
    elif dado1 == 6 and dado2 == 6:
        tipo = "exito_bonus"
    else:
        tipo = "normal"

    return {
        "tipo": tipo,
        "dados_tirados": [dado1, dado2],
        "suma_dados": suma_dados,
        "stat_valor": stat_valor,
        "modificador_na": modificador,
        "total": total,
    }
