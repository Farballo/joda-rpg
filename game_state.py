import json
import random
import uuid
from pathlib import Path

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

game_state = {
    "fase": "previa",  # "previa" | "boliche" | "after" | "terminado"
    "jugadores": {},
    "npcs_revelados": {},  # "<npc_id>": {"zona": "barra"}
    "log_eventos": [],
}


def crear_jugador(nombre: str, personaje_id: str) -> str:
    if not any(p["id"] == personaje_id for p in PERSONAJES):
        raise ValueError(f"personaje_id inválido: {personaje_id}")

    player_id = str(uuid.uuid4())
    game_state["jugadores"][player_id] = {
        "nombre": nombre,
        "personaje_id": personaje_id,
        "na": 0,
        "modo_caos_activo": False,
        "prendas_activas": [],
        "habilidad_usada_fase": False,
        "habilidad_usada_noche": False,
        "zona_actual": MAPA[game_state["fase"]][0]["id"],
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
    zonas_validas = {z["id"] for z in MAPA[game_state["fase"]]}
    if zona not in zonas_validas:
        raise ValueError(f"zona inválida para la fase {game_state['fase']}: {zona}")
    jugador["zona_actual"] = zona


def get_npc(npc_id: str) -> dict | None:
    return next((n for n in NPCS if n["id"] == npc_id), None)


def revelar_npc(npc_id: str, zona: str) -> None:
    if get_npc(npc_id) is None:
        raise ValueError(f"npc_id inválido: {npc_id}")
    zonas_validas = {z["id"] for z in MAPA[game_state["fase"]]}
    if zona not in zonas_validas:
        raise ValueError(f"zona inválida para la fase {game_state['fase']}: {zona}")
    game_state["npcs_revelados"][npc_id] = {"zona": zona}


def ocultar_npc(npc_id: str) -> None:
    game_state["npcs_revelados"].pop(npc_id, None)


def avanzar_fase() -> None:
    idx = FASES.index(game_state["fase"])
    if idx >= len(FASES) - 1:
        return

    nueva_fase = FASES[idx + 1]
    game_state["fase"] = nueva_fase
    game_state["npcs_revelados"] = {}

    zonas_nueva_fase = MAPA.get(nueva_fase)
    if zonas_nueva_fase:
        zona_default = zonas_nueva_fase[0]["id"]
        for jugador in game_state["jugadores"].values():
            jugador["zona_actual"] = zona_default

    if nueva_fase == "after":
        # Leyenda Urbana (NA 10) vuelve a Modo Caos (NA 6) al empezar el After — sección 5.4 del plan
        for jugador in game_state["jugadores"].values():
            if jugador["na"] == 10:
                jugador["na"] = 6


def registrar_tirada(player_id: str, stat: str, resultado: dict) -> None:
    jugador = game_state["jugadores"][player_id]
    game_state["log_eventos"].append({
        "jugador": jugador["nombre"],
        "stat": stat,
        "tipo": resultado["tipo"],
        "dados_tirados": resultado["dados_tirados"],
        "total": resultado["total"],
    })
