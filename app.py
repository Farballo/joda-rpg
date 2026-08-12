from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai_narrator
import dice
from game_state import (
    ajustar_na,
    avanzar_fase,
    cambiar_mapa,
    crear_jugador,
    crear_partida,
    game_state,
    get_npc,
    get_personaje,
    intentar_confrontacion,
    intentar_levante,
    mover_jugador,
    npc_con_misterio,
    npcs_revelados_para_jugador,
    ocultar_npc,
    registrar_tirada,
    repartir_prenda,
    resolver_prenda,
    retroceder_fase,
    revelar_npc,
    revelar_npc_encuentro,
    siguiente_situacion,
)

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
        "partida_creada": game_state["partida_creada"],
        "jugadores": game_state["jugadores"],
        "fase": game_state["fase"],
        "npcs_revelados": game_state["npcs_revelados"],
        "situacion_actual": game_state["situacion_actual"],
        "eventos_usados": game_state["eventos_usados"],
        "log_eventos": game_state["log_eventos"],
        "mapa_actual": game_state["mapa_actual"],
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
        "zona_actual": jugador["zona_actual"],
        "npcs_revelados": npcs_revelados_para_jugador(player_id),
        "situacion_actual": game_state["situacion_actual"],
        "mapa_actual": game_state["mapa_actual"],
        "jugadores_en_mapa": [
            {"player_id": pid, "nombre": j["nombre"], "zona_actual": j["zona_actual"]}
            for pid, j in game_state["jugadores"].items()
        ],
    }


async def enviar_estado_jugador(player_id: str):
    ws = player_connections.get(player_id)
    if ws is None:
        return
    try:
        await ws.send_json(estado_jugador_msg(player_id))
    except Exception:
        player_connections.pop(player_id, None)


async def broadcast_estado_todos_jugadores():
    for player_id in list(game_state["jugadores"].keys()):
        await enviar_estado_jugador(player_id)


async def broadcast_npc_revelado(npc: dict, zona: str):
    mensaje = {"type": "npc_revelado", "npc": npc, "zona": zona}
    for player_id in list(player_connections.keys()):
        ws = player_connections.get(player_id)
        if ws is None:
            continue
        try:
            await ws.send_json(mensaje)
        except Exception:
            player_connections.pop(player_id, None)


async def enviar_npc_revelado_dirigido(player_id: str, npc: dict):
    ws = player_connections.get(player_id)
    if ws is None:
        return
    try:
        await ws.send_json({"type": "npc_revelado", "npc": npc, "zona": None})
    except Exception:
        player_connections.pop(player_id, None)


async def broadcast_narracion(texto: str):
    mensaje = {"type": "narracion", "texto": texto}
    for player_id in list(player_connections.keys()):
        ws = player_connections.get(player_id)
        if ws is None:
            continue
        try:
            await ws.send_json(mensaje)
        except Exception:
            player_connections.pop(player_id, None)


async def expulsar_jugadores_actuales():
    mensaje = {"type": "partida_terminada"}
    for player_id, ws in list(player_connections.items()):
        try:
            await ws.send_json(mensaje)
        except Exception:
            pass
    player_connections.clear()


def construir_contexto_narracion(prompt_extra: str) -> str:
    partes = [f"Fase actual: {game_state['fase']}"]
    situacion = game_state["situacion_actual"]
    if situacion:
        partes.append(f"Situación en curso: {situacion['titulo']} — {situacion['texto']}")
    if prompt_extra:
        partes.append(prompt_extra)
    return ". ".join(partes)


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

    await broadcast_estado_todos_jugadores()
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

            if msg.get("type") == "crear_partida":
                await expulsar_jugadores_actuales()
                crear_partida()
                await broadcast_estado_dm()

            elif msg.get("type") == "avanzar_fase":
                avanzar_fase()
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "retroceder_fase":
                retroceder_fase()
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "cambiar_mapa":
                try:
                    cambiar_mapa(msg.get("mapa_id"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "ajustar_na":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                ajustar_na(player_id, msg.get("delta", 0))
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "repartir_prenda":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                try:
                    repartir_prenda(player_id, msg.get("prenda_id"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "resolver_prenda":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                resolver_prenda(player_id, msg.get("prenda_id"))
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "mover_jugador":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                try:
                    mover_jugador(player_id, msg.get("zona"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "revelar_npc":
                npc_id = msg.get("npc_id")
                zona = msg.get("zona")

                try:
                    revelar_npc(npc_id, zona)
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_npc_revelado(get_npc(npc_id), zona)
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "revelar_npc_encuentro":
                jugador_objetivo = msg.get("jugador_objetivo")
                if jugador_objetivo not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {jugador_objetivo}"})
                    continue

                try:
                    npc_id = revelar_npc_encuentro(msg.get("npc_id"), msg.get("modo", "elegir"), jugador_objetivo)
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                jugador = game_state["jugadores"][jugador_objetivo]
                npc = npc_con_misterio(get_npc(npc_id), jugador)
                await enviar_npc_revelado_dirigido(jugador_objetivo, npc)
                await enviar_estado_jugador(jugador_objetivo)
                await broadcast_estado_dm()

            elif msg.get("type") == "ocultar_npc":
                ocultar_npc(msg.get("npc_id"))
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "siguiente_situacion":
                try:
                    siguiente_situacion(msg.get("modo", "random"), msg.get("titulo"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "narrar_ia":
                contexto = construir_contexto_narracion(msg.get("prompt_extra", ""))
                texto = await ai_narrator.narrar(contexto)
                await websocket.send_json({"type": "resultado_narracion", "texto": texto})

            elif msg.get("type") == "broadcastear_narracion":
                texto = msg.get("texto")
                if texto:
                    await broadcast_narracion(texto)
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

                contexto = msg.get("contexto")
                resultado = dice.tirar(jugador["na"], stat, personaje["stats"][stat])
                registrar_tirada(player_id, stat, resultado, contexto)

                await websocket.send_json({"type": "resultado_tirada", "stat": stat, "contexto": contexto, **resultado})
                await broadcast_estado_dm()

            elif msg.get("type") == "resolver_prenda":
                resolver_prenda(player_id, msg.get("prenda_id"))
                await websocket.send_json(estado_jugador_msg(player_id))
                await broadcast_estado_dm()

            elif msg.get("type") == "intentar_levante":
                try:
                    resultado = intentar_levante(player_id, msg.get("npc_id"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await websocket.send_json({"type": "resultado_levante", **resultado})
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "intentar_confrontacion":
                try:
                    resultado = intentar_confrontacion(player_id, msg.get("npc_id"), msg.get("stat"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await websocket.send_json({"type": "resultado_confrontacion", **resultado})
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()
    except WebSocketDisconnect:
        player_connections.pop(player_id, None)
