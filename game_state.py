import json
import random
import uuid
from pathlib import Path

import dice

DATA_DIR = Path(__file__).parent / "data"

with open(DATA_DIR / "personajes.json", encoding="utf-8") as f:
    PERSONAJES = json.load(f)

with open(DATA_DIR / "prendas.json", encoding="utf-8") as f:
    PRENDAS = json.load(f)

with open(DATA_DIR / "eventos.json", encoding="utf-8") as f:
    EVENTOS = json.load(f)

with open(DATA_DIR / "mapa.json", encoding="utf-8") as f:
    MAPA = json.load(f)

with open(DATA_DIR / "npcs.json", encoding="utf-8") as f:
    NPCS = json.load(f)

FASES = ["previa", "boliche", "after", "terminado"]
TIPOS_ENCUENTRO = {"levante", "confrontacion"}
UMBRAL_MISTERIO_LEVANTE = 8  # NA a partir del cual el NPC de levante llega sin revelar

MAPA_VACIO = {"id": None, "nombre": "", "zonas": []}


def elegir_mapa_random(fase: str) -> dict:
    variantes = MAPA.get(fase, [])
    if not variantes:
        return dict(MAPA_VACIO)
    return random.choice(variantes)


def elegir_mapa(fase: str, mapa_id: str) -> dict:
    variante = next((v for v in MAPA.get(fase, []) if v["id"] == mapa_id), None)
    if variante is None:
        raise ValueError(f"mapa_id inválido para la fase {fase}: {mapa_id}")
    return variante


def estado_inicial() -> dict:
    return {
        "partida_creada": False,  # el DM tiene que crear la partida antes de que /join acepte a nadie
        "fase": "previa",  # "previa" | "boliche" | "after" | "terminado"
        "jugadores": {},
        # "<npc_id>": {"zona": "barra"} (ambiente) o {"jugador_objetivo": "<player_id>", "resuelto": False} (levante/confrontacion)
        "npcs_revelados": {},
        "situacion_actual": None,  # evento activo (dict completo de eventos.json) o None
        "eventos_usados": {"previa": [], "boliche": [], "after": []},  # títulos ya mostrados, por fase
        "log_eventos": [],
        "mapa_actual": elegir_mapa_random("previa"),  # {"id", "nombre", "zonas"} — variante de data/mapa.json en uso
    }


game_state = estado_inicial()


def crear_partida() -> None:
    nuevo = estado_inicial()
    nuevo["partida_creada"] = True
    game_state.clear()
    game_state.update(nuevo)


def crear_jugador(nombre: str, personaje_id: str) -> str:
    if not game_state["partida_creada"]:
        raise ValueError("Todavía no se creó la partida. Esperá a que el DM la inicie.")
    if not any(p["id"] == personaje_id for p in PERSONAJES):
        raise ValueError(f"personaje_id inválido: {personaje_id}")

    zonas = game_state["mapa_actual"]["zonas"]
    player_id = str(uuid.uuid4())
    game_state["jugadores"][player_id] = {
        "nombre": nombre,
        "personaje_id": personaje_id,
        "na": 0,
        "modo_caos_activo": False,
        "prendas_activas": [],
        "habilidad_usada_fase": False,
        "habilidad_usada_noche": False,
        "zona_actual": zonas[0]["id"] if zonas else None,
    }
    return player_id


def get_personaje(personaje_id: str) -> dict | None:
    return next((p for p in PERSONAJES if p["id"] == personaje_id), None)


def ajustar_na(player_id: str, delta: int) -> None:
    jugador = game_state["jugadores"][player_id]
    jugador["na"] = max(0, min(10, jugador["na"] + delta))
    jugador["modo_caos_activo"] = jugador["na"] >= 6


def repartir_prenda(player_id: str, prenda_id: int | None) -> int:
    jugador = game_state["jugadores"][player_id]

    if prenda_id is None:
        disponibles = [p["id"] for p in PRENDAS if p["id"] not in jugador["prendas_activas"]]
        prenda_id = random.choice(disponibles or [p["id"] for p in PRENDAS])
    elif not any(p["id"] == prenda_id for p in PRENDAS):
        raise ValueError(f"prenda_id inválido: {prenda_id}")

    if prenda_id not in jugador["prendas_activas"]:
        jugador["prendas_activas"].append(prenda_id)
    return prenda_id


def resolver_prenda(player_id: str, prenda_id: int) -> None:
    jugador = game_state["jugadores"][player_id]
    if prenda_id in jugador["prendas_activas"]:
        jugador["prendas_activas"].remove(prenda_id)


def mover_jugador(player_id: str, zona: str) -> None:
    jugador = game_state["jugadores"][player_id]
    zonas_validas = {z["id"] for z in game_state["mapa_actual"]["zonas"]}
    if zona not in zonas_validas:
        raise ValueError(f"zona inválida en el mapa actual: {zona}")
    jugador["zona_actual"] = zona


def get_npc(npc_id: str) -> dict | None:
    return next((n for n in NPCS if n["id"] == npc_id), None)


def revelar_npc(npc_id: str, zona: str) -> None:
    if get_npc(npc_id) is None:
        raise ValueError(f"npc_id inválido: {npc_id}")
    zonas_validas = {z["id"] for z in game_state["mapa_actual"]["zonas"]}
    if zona not in zonas_validas:
        raise ValueError(f"zona inválida en el mapa actual: {zona}")
    game_state["npcs_revelados"][npc_id] = {"zona": zona}


def ocultar_npc(npc_id: str) -> None:
    game_state["npcs_revelados"].pop(npc_id, None)


def _encuentro_disponible(npc_id: str) -> bool:
    info = game_state["npcs_revelados"].get(npc_id)
    return info is None or info.get("resuelto", False)


def revelar_npc_encuentro(npc_id: str | None, modo: str, jugador_objetivo: str) -> str:
    if jugador_objetivo not in game_state["jugadores"]:
        raise ValueError(f"player_id inválido: {jugador_objetivo}")

    fase = game_state["fase"]

    if modo == "random":
        candidatos = [
            n["id"] for n in NPCS
            if n.get("tipo") in TIPOS_ENCUENTRO
            and n["fase"] == fase
            and _encuentro_disponible(n["id"])
        ]
        if not candidatos:
            raise ValueError(f"No quedan NPCs de encuentro disponibles para la fase {fase}")
        npc_id = random.choice(candidatos)
    elif modo == "elegir":
        npc = get_npc(npc_id)
        if npc is None or npc.get("tipo") not in TIPOS_ENCUENTRO:
            raise ValueError(f"npc_id inválido: {npc_id}")
        if not _encuentro_disponible(npc_id):
            raise ValueError(f"{npc_id} ya tiene un encuentro activo sin resolver con otro jugador")
    else:
        raise ValueError(f"modo inválido: {modo}")

    game_state["npcs_revelados"][npc_id] = {
        "jugador_objetivo": jugador_objetivo,
        "resuelto": False,
    }
    return npc_id


def npc_con_misterio(npc: dict, jugador: dict) -> dict:
    if npc.get("tipo") == "levante" and jugador["na"] >= UMBRAL_MISTERIO_LEVANTE:
        return {
            **npc,
            "nombre": "❓",
            "apodo": "???",
            "avatar": "❓",
            "frase_reveal": "Alguien te llama la atención, pero estás demasiado en pedo para verlo bien.",
            "puntaje_lindura": None,
        }
    return npc


def npcs_revelados_para_jugador(player_id: str) -> dict:
    resultado = {}
    for npc_id, info in game_state["npcs_revelados"].items():
        npc = get_npc(npc_id)
        if npc is None:
            continue
        if npc.get("tipo") == "ambiente" or info.get("jugador_objetivo") == player_id:
            resultado[npc_id] = info
    return resultado


def _npc_de_encuentro_valido(npc_id: str, player_id: str, tipo_esperado: str) -> tuple[dict, dict]:
    info = game_state["npcs_revelados"].get(npc_id)
    if info is None:
        raise ValueError(f"npc_id inválido: {npc_id}")
    if info.get("jugador_objetivo") != player_id:
        raise ValueError("Este encuentro no es tuyo")
    if info.get("resuelto"):
        raise ValueError("Ya intentaste este encuentro")

    npc = get_npc(npc_id)
    if npc is None or npc.get("tipo") != tipo_esperado:
        raise ValueError(f"npc_id no es de tipo {tipo_esperado}: {npc_id}")
    return npc, info


def intentar_levante(player_id: str, npc_id: str) -> dict:
    npc, info = _npc_de_encuentro_valido(npc_id, player_id, "levante")
    jugador = game_state["jugadores"][player_id]
    personaje = get_personaje(jugador["personaje_id"])

    resultado = dice.tirar(jugador["na"], "carisma", personaje["stats"]["carisma"])
    info["resuelto"] = True

    return {
        **resultado,
        "npc_id": npc_id,
        "exito": resultado["total"] >= npc["dificultad_chamuyo"],
        "puntaje_lindura": npc["puntaje_lindura"],
    }


def intentar_confrontacion(player_id: str, npc_id: str, stat: str) -> dict:
    npc, info = _npc_de_encuentro_valido(npc_id, player_id, "confrontacion")

    stats_validos = {op["stat"] for op in npc["opciones"]}
    if stat not in stats_validos:
        raise ValueError(f"stat inválido para este NPC: {stat}")

    jugador = game_state["jugadores"][player_id]
    personaje = get_personaje(jugador["personaje_id"])

    resultado = dice.tirar(jugador["na"], stat, personaje["stats"][stat])
    info["resuelto"] = True

    return {**resultado, "npc_id": npc_id, "stat": stat}


def siguiente_situacion(modo: str, titulo: str | None = None) -> dict:
    fase = game_state["fase"]
    eventos_fase = EVENTOS.get(fase, [])
    if not eventos_fase:
        raise ValueError(f"No hay eventos definidos para la fase {fase}")

    if modo == "random":
        usados = set(game_state["eventos_usados"].get(fase, []))
        disponibles = [e for e in eventos_fase if e["titulo"] not in usados]
        evento = random.choice(disponibles or eventos_fase)
    elif modo == "elegir":
        evento = next((e for e in eventos_fase if e["titulo"] == titulo), None)
        if evento is None:
            raise ValueError(f"titulo inválido para la fase {fase}: {titulo}")
    else:
        raise ValueError(f"modo inválido: {modo}")

    game_state["situacion_actual"] = evento
    if evento["titulo"] not in game_state["eventos_usados"][fase]:
        game_state["eventos_usados"][fase].append(evento["titulo"])
    return evento


def _aplicar_mapa(mapa: dict) -> None:
    game_state["mapa_actual"] = mapa
    game_state["npcs_revelados"] = {}
    zonas = mapa.get("zonas", [])
    zona_default = zonas[0]["id"] if zonas else None
    for jugador in game_state["jugadores"].values():
        jugador["zona_actual"] = zona_default


def cambiar_mapa(mapa_id: str | None = None) -> dict:
    fase = game_state["fase"]
    mapa = elegir_mapa(fase, mapa_id) if mapa_id else elegir_mapa_random(fase)
    _aplicar_mapa(mapa)
    return mapa


def _entrar_a_fase(nueva_fase: str) -> None:
    game_state["fase"] = nueva_fase
    game_state["situacion_actual"] = None
    _aplicar_mapa(elegir_mapa_random(nueva_fase))

    if nueva_fase == "after":
        # Leyenda Urbana (NA 10) vuelve a Modo Caos (NA 6) al empezar el After — sección 5.4 del plan
        for jugador in game_state["jugadores"].values():
            if jugador["na"] == 10:
                jugador["na"] = 6


def avanzar_fase() -> None:
    idx = FASES.index(game_state["fase"])
    if idx >= len(FASES) - 1:
        return
    _entrar_a_fase(FASES[idx + 1])


def retroceder_fase() -> None:
    idx = FASES.index(game_state["fase"])
    if idx <= 0:
        return
    _entrar_a_fase(FASES[idx - 1])


def registrar_tirada(player_id: str, stat: str, resultado: dict, contexto: str | None = None) -> None:
    jugador = game_state["jugadores"][player_id]
    game_state["log_eventos"].append({
        "jugador": jugador["nombre"],
        "stat": stat,
        "contexto": contexto,
        "tipo": resultado["tipo"],
        "dados_tirados": resultado["dados_tirados"],
        "total": resultado["total"],
    })
