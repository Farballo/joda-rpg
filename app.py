from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import dice
from game_state import ajustar_na, crear_jugador, game_state, get_personaje, registrar_tirada

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")

dm_connections: list[WebSocket] = []
player_connections: dict[str, WebSocket] = {}


class JoinRequest(BaseModel):
    nombre: str
    personaje_id: str


def estado_completo_msg():
    return {
        "type": "estado_completo",
        "jugadores": game_state["jugadores"],
        "fase": game_state["fase"],
        "log_eventos": game_state["log_eventos"],
    }


async def broadcast_estado_dm():
    mensaje = estado_completo_msg()
    for ws in list(dm_connections):
        try:
            await ws.send_json(mensaje)
        except Exception:
            dm_connections.remove(ws)


def estado_jugador_msg(player_id: str):
    jugador = game_state["jugadores"][player_id]
    return {
        "type": "estado",
        "na": jugador["na"],
        "modo_caos_activo": jugador["modo_caos_activo"],
        "prendas": jugador["prendas_activas"],
        "fase": game_state["fase"],
    }


async def enviar_estado_jugador(player_id: str):
    ws = player_connections.get(player_id)
    if ws is None:
        return
    try:
        await ws.send_json(estado_jugador_msg(player_id))
    except Exception:
        player_connections.pop(player_id, None)


@app.get("/dm")
async def get_dm():
    return FileResponse("static/dm.html")


@app.get("/jugador")
async def get_jugador():
    return FileResponse("static/jugador.html")


@app.post("/join")
async def join(req: JoinRequest):
    try:
        player_id = crear_jugador(req.nombre, req.personaje_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await broadcast_estado_dm()
    return {"player_id": player_id}


@app.websocket("/ws/dm")
async def ws_dm(websocket: WebSocket):
    await websocket.accept()
    dm_connections.append(websocket)
    await websocket.send_json(estado_completo_msg())
    try:
        while True:
            msg = await websocket.receive_json()

            if msg.get("type") == "ajustar_na":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                ajustar_na(player_id, msg.get("delta", 0))
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()
    except WebSocketDisconnect:
        dm_connections.remove(websocket)


@app.websocket("/ws/player/{player_id}")
async def ws_player(websocket: WebSocket, player_id: str):
    if player_id not in game_state["jugadores"]:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    player_connections[player_id] = websocket
    await websocket.send_json(estado_jugador_msg(player_id))
    try:
        while True:
            msg = await websocket.receive_json()

            if msg.get("type") == "tirar_dado":
                stat = msg.get("stat")
                jugador = game_state["jugadores"][player_id]
                personaje = get_personaje(jugador["personaje_id"])

                if stat not in personaje["stats"]:
                    await websocket.send_json({"type": "error", "detail": f"stat inválido: {stat}"})
                    continue

                resultado = dice.tirar(jugador["na"], stat, personaje["stats"][stat])
                registrar_tirada(player_id, stat, resultado)

                await websocket.send_json({"type": "resultado_tirada", "stat": stat, **resultado})
                await broadcast_estado_dm()
    except WebSocketDisconnect:
        player_connections.pop(player_id, None)
