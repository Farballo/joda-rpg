import json
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

with open(DATA_DIR / "personajes.json", encoding="utf-8") as f:
    PERSONAJES = json.load(f)

with open(DATA_DIR / "prendas.json", encoding="utf-8") as f:
    PRENDAS = json.load(f)

with open(DATA_DIR / "eventos.json", encoding="utf-8") as f:
    EVENTOS = json.load(f)

game_state = {
    "fase": "previa",  # "previa" | "boliche" | "after" | "terminado"
    "jugadores": {},
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
    }
    return player_id


def get_personaje(personaje_id: str) -> dict | None:
    return next((p for p in PERSONAJES if p["id"] == personaje_id), None)


def ajustar_na(player_id: str, delta: int) -> None:
    jugador = game_state["jugadores"][player_id]
    jugador["na"] = max(0, min(10, jugador["na"] + delta))
    jugador["modo_caos_activo"] = jugador["na"] >= 6


def registrar_tirada(player_id: str, stat: str, resultado: dict) -> None:
    jugador = game_state["jugadores"][player_id]
    game_state["log_eventos"].append({
        "jugador": jugador["nombre"],
        "stat": stat,
        "tipo": resultado["tipo"],
        "dados_tirados": resultado["dados_tirados"],
        "total": resultado["total"],
    })
