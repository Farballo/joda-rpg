from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai_narrator
import dice
from game_state import (
    activar_debilidad,
    ajustar_na,
    avanzar_fase,
    cartas_disponibles,
    configurar_dificultad_evento,
    configurar_eventos,
    configurar_mapas,
    crear_jugador,
    crear_partida,
    desactivar_debilidad,
    desglose_stat,
    elegir_opcion_encare,
    elegir_opcion_situacion,
    expulsar_jugador,
    game_state,
    get_npc,
    get_personaje,
    iniciar_encuentro,
    iniciar_partida,
    mover_jugador,
    npcs_revelados_para_jugador,
    ocultar_npc,
    registrar_tirada,
    repartir_prenda,
    resolver_prenda,
    resolver_ronda_encare,
    resolver_situacion_pendiente,
    retroceder_fase,
    revelar_npc,
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
        "partida_iniciada": game_state["partida_iniciada"],
        "jugadores": game_state["jugadores"],
        "fase": game_state["fase"],
        "npcs_revelados": game_state["npcs_revelados"],
        "situacion_actual": game_state["situacion_actual"],
        "eventos_usados": game_state["eventos_usados"],
        "log_eventos": game_state["log_eventos"],
        "mapa_actual": game_state["mapa_actual"],
        "mapas_habilitados": game_state["mapas_habilitados"],
        "eventos_habilitados": game_state["eventos_habilitados"],
        "dificultades_personalizadas": game_state["dificultades_personalizadas"],
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
        "debilidad_activa": jugador["debilidad_activa"],
        "prendas": jugador["prendas_activas"],
        "puntaje": jugador["puntaje"],
        "historial": jugador["historial"],
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


async def broadcast_ocultar_carta_npc(npc_id: str):
    """Una vez que un NPC entra en un encuentro, la carta de reveal ('Hablar'/'Ignorar')
    deja de tener sentido en la pantalla de los demás jugadores: se cierra para todos."""
    mensaje = {"type": "ocultar_carta_npc", "npc_id": npc_id}
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


@app.get("/api/cartas")
async def get_cartas():
    """personaje_id -> URL de su carta ilustrada. Los que faltan no vienen en el dict."""
    return cartas_disponibles()


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

            elif msg.get("type") == "iniciar_partida":
                iniciar_partida()
                await broadcast_estado_dm()

            elif msg.get("type") == "configurar_mapas":
                try:
                    configurar_mapas(msg.get("mapas", {}))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "crear_jugador_dummy":
                nombre = (msg.get("nombre") or "").strip()
                if not nombre:
                    await websocket.send_json({"type": "error", "detail": "Poné un nombre para el jugador"})
                    continue

                try:
                    crear_jugador(nombre, msg.get("personaje_id"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "expulsar_jugador":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                expulsar_jugador(player_id)
                ws_jugador = player_connections.pop(player_id, None)
                if ws_jugador is not None:
                    try:
                        await ws_jugador.close(code=4404)
                    except Exception:
                        pass

                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "avanzar_fase":
                avanzar_fase()
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "retroceder_fase":
                retroceder_fase()
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()

            elif msg.get("type") == "configurar_eventos":
                try:
                    configurar_eventos(msg.get("eventos", {}))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await broadcast_estado_dm()

            elif msg.get("type") == "ajustar_na":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                ajustar_na(player_id, msg.get("delta", 0))
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "activar_debilidad":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                activar_debilidad(player_id)
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "desactivar_debilidad":
                player_id = msg.get("player_id")
                if player_id not in game_state["jugadores"]:
                    await websocket.send_json({"type": "error", "detail": f"player_id inválido: {player_id}"})
                    continue

                desactivar_debilidad(player_id)
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

            elif msg.get("type") == "iniciar_encuentro":
                jugador_objetivo = msg.get("jugador_objetivo")

                try:
                    npc_id = iniciar_encuentro(msg.get("npc_id") or None, jugador_objetivo)
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                # el encuentro viaja dentro del `estado` del jugador objetivo (ya filtrado
                # por el misterio de lindura si corresponde), no como mensaje aparte
                await enviar_estado_jugador(jugador_objetivo)
                await broadcast_estado_dm()
                await broadcast_ocultar_carta_npc(npc_id)

            elif msg.get("type") == "resolver_ronda_encare":
                npc_id = msg.get("npc_id")

                try:
                    resultado = resolver_ronda_encare(npc_id, msg.get("modificador_dm", 0))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                jugador_objetivo = resultado["jugador_objetivo"]
                if resultado["resuelto"]:
                    npc = get_npc(npc_id)
                    registrar_tirada(
                        jugador_objetivo, resultado["stat"], {**resultado, "total": resultado["total_ajustado"]}, npc["nombre"]
                    )

                ws_jugador = player_connections.get(jugador_objetivo)
                if ws_jugador is not None:
                    try:
                        await ws_jugador.send_json({"type": "resultado_encare", **resultado})
                    except Exception:
                        player_connections.pop(jugador_objetivo, None)

                await enviar_estado_jugador(jugador_objetivo)
                await broadcast_estado_dm()

            elif msg.get("type") == "resolver_situacion_pendiente":
                try:
                    resultado = resolver_situacion_pendiente(msg.get("modificador_dm", 0))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                player_id = resultado["player_id"]
                situacion_titulo = game_state["situacion_actual"]["titulo"]
                opcion = resultado["opcion"]
                contexto = f"{situacion_titulo} — {opcion}" if opcion else situacion_titulo
                registrar_tirada(
                    player_id, resultado["stat"], {**resultado, "total": resultado["total_ajustado"]}, contexto
                )

                ws_jugador = player_connections.get(player_id)
                if ws_jugador is not None:
                    try:
                        await ws_jugador.send_json({"type": "resultado_situacion", **resultado})
                    except Exception:
                        player_connections.pop(player_id, None)

                await broadcast_estado_todos_jugadores()
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

            elif msg.get("type") == "configurar_dificultad_evento":
                try:
                    configurar_dificultad_evento(msg.get("titulo"), msg.get("dificultad"))
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

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
                desglose = desglose_stat(jugador, personaje, stat)
                resultado = {**dice.tirar(jugador["na"], stat, desglose["stat_valor"]), **desglose}
                registrar_tirada(player_id, stat, resultado, contexto)

                await websocket.send_json({"type": "resultado_tirada", "stat": stat, "contexto": contexto, **resultado})
                await broadcast_estado_dm()

            elif msg.get("type") == "hablar_con_npc":
                npc_id = msg.get("npc_id")
                try:
                    iniciar_encuentro(npc_id, player_id)
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()
                await broadcast_ocultar_carta_npc(npc_id)

            elif msg.get("type") == "elegir_opcion_encare":
                try:
                    elegir_opcion_encare(
                        player_id, msg.get("npc_id"), msg.get("opcion_idx"), msg.get("stat_otro")
                    )
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                # todavía no se tira nada: el jugador dice su frase en voz alta y el DM
                # la juzga con "resolver_ronda_encare" (WS /ws/dm), que sí tira los dados
                await enviar_estado_jugador(player_id)
                await broadcast_estado_dm()

            elif msg.get("type") == "elegir_opcion_situacion":
                stat = msg.get("stat")
                opcion = msg.get("opcion")
                try:
                    elegir_opcion_situacion(player_id, stat, opcion)
                except ValueError as e:
                    await websocket.send_json({"type": "error", "detail": str(e)})
                    continue

                # todavía no se tira nada: el jugador dice su frase en voz alta y el DM
                # la juzga con "resolver_situacion_pendiente" (WS /ws/dm), que sí tira
                await broadcast_estado_todos_jugadores()
                await broadcast_estado_dm()
    except WebSocketDisconnect:
        player_connections.pop(player_id, None)
