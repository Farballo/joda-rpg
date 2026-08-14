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
STATS_JUGABLES = {"carisma", "aguante", "astucia", "suerte"}
OTRO_OPCION = "Otro (decide DM)"  # opción libre de una situación: el jugador tira el stat que el DM le diga en voz alta

MAPA_VACIO = {"id": None, "nombre": "", "zonas": []}

CARTAS_DIR = DATA_DIR / "personajes_cartas"
CARTAS_WEB_DIR = CARTAS_DIR / "web"
EXTENSIONES_CARTA = (".webp", ".png", ".jpg", ".jpeg")


def _normalizar_nombre_carta(nombre: str) -> str:
    return nombre.lower().replace("_", "").replace("-", "").replace(" ", "")


def cartas_disponibles() -> dict[str, str]:
    """Mapea personaje_id -> URL de su carta ilustrada, para los que tengan una.

    Prioriza las copias livianas de `web/` (ver optimizar_cartas.py) pero cae al
    master si todavía no se optimizó, así tirar un PNG nuevo a la carpeta
    alcanza para que aparezca sin tocar código. Los personajes que no tengan
    archivo quedan afuera del dict y el frontend les dibuja una carta.
    """
    ids_por_normalizado = {_normalizar_nombre_carta(p["id"]): p["id"] for p in PERSONAJES}
    encontradas: dict[str, str] = {}

    # el master primero y web/ después, para que la versión liviana pise al master
    for carpeta in (CARTAS_DIR, CARTAS_WEB_DIR):
        if not carpeta.is_dir():
            continue
        for archivo in sorted(carpeta.iterdir()):
            if not archivo.is_file() or archivo.suffix.lower() not in EXTENSIONES_CARTA:
                continue
            personaje_id = ids_por_normalizado.get(_normalizar_nombre_carta(archivo.stem))
            if personaje_id is None:
                continue
            encontradas[personaje_id] = f"/data/{archivo.relative_to(DATA_DIR).as_posix()}"

    return encontradas


def elegir_mapa_random(fase: str, habilitados: list[str] | None = None) -> dict:
    variantes = MAPA.get(fase, [])
    if habilitados:
        variantes = [v for v in variantes if v["id"] in habilitados] or variantes
    if not variantes:
        return dict(MAPA_VACIO)
    return random.choice(variantes)


def estado_inicial() -> dict:
    return {
        "partida_creada": False,  # el DM tiene que crear la partida antes de que /join acepte a nadie
        # el DM pasó de la pantalla de configuración (lobby) al dashboard de juego
        "partida_iniciada": False,
        "fase": "previa",  # "previa" | "boliche" | "after" | "terminado"
        "jugadores": {},
        # "<npc_id>": {"zona": "barra", "encuentro": None | {"jugador_objetivo": "<player_id>", "resuelto": False}}
        # El reveal es siempre global (todos ven al NPC en el mapa); el encuentro es el paso
        # aparte, dirigido a un jugador, que solo aplica a los tipos levante/confrontacion.
        "npcs_revelados": {},
        "situacion_actual": None,  # evento activo (dict completo de eventos.json) o None
        "eventos_usados": {"previa": [], "boliche": [], "after": []},  # títulos ya mostrados, por fase
        "log_eventos": [],
        "mapa_actual": elegir_mapa_random("previa"),  # {"id", "nombre", "zonas"} — variante de data/mapa.json en uso
        # variante de mapa.json elegida por fase, configurable en el lobby previo a la
        # partida — como máximo una por fase (se guarda como lista de 0 o 1 elemento
        # para no tener que tocar elegir_mapa_random/_aplicar_mapa, que ya trabajan con listas)
        "mapas_habilitados": {fase: [variantes[0]["id"]] for fase, variantes in MAPA.items() if variantes},
        # títulos de eventos.json habilitados por fase, en el orden en que se listan durante la partida,
        # configurable en el lobby previo a la partida
        "eventos_habilitados": {fase: [e["titulo"] for e in eventos_lista] for fase, eventos_lista in EVENTOS.items()},
        # dificultad a medida del DM por evento, por fase — "<titulo>": N pisa la
        # dificultad de referencia de ese evento en data/eventos.json. Se configura
        # durante la partida (rueda ⚙️ en cada tarjeta), no en el lobby como las dos de
        # arriba, y sobrevive a los cambios de fase (si el DM vuelve a una fase con
        # retroceder_fase, la personalización sigue ahí)
        "dificultades_personalizadas": {fase: {} for fase in EVENTOS},
    }


game_state = estado_inicial()


def crear_partida() -> None:
    nuevo = estado_inicial()
    nuevo["partida_creada"] = True
    game_state.clear()
    game_state.update(nuevo)


def iniciar_partida() -> None:
    game_state["partida_iniciada"] = True


def configurar_mapas(config: dict[str, list[str]]) -> None:
    """Como máximo un mapa por fase: el DM elige uno solo (dropdown por nombre en el
    panel), no una lista de variantes habilitadas entre las que se sortea."""
    for fase, ids in config.items():
        if fase not in MAPA:
            raise ValueError(f"fase inválida: {fase}")
        validos = {v["id"] for v in MAPA[fase]}
        ids_filtrados = [i for i in ids if i in validos]
        if not ids_filtrados:
            raise ValueError(f"tenés que elegir un mapa para la fase {fase}")
        if len(ids_filtrados) > 1:
            raise ValueError(f"solo puede haber un mapa elegido por fase ({fase})")
        game_state["mapas_habilitados"][fase] = ids_filtrados

    fase_actual = game_state["fase"]
    habilitados_actual = game_state["mapas_habilitados"].get(fase_actual)
    if habilitados_actual and game_state["mapa_actual"].get("id") not in habilitados_actual:
        _aplicar_mapa(elegir_mapa_random(fase_actual, habilitados_actual))


def configurar_eventos(config: dict[str, list[str]]) -> None:
    for fase, titulos in config.items():
        if fase not in EVENTOS:
            raise ValueError(f"fase inválida: {fase}")
        validos = {e["titulo"] for e in EVENTOS[fase]}
        vistos = set()
        titulos_filtrados = []
        for titulo in titulos:
            if titulo in validos and titulo not in vistos:
                vistos.add(titulo)
                titulos_filtrados.append(titulo)
        game_state["eventos_habilitados"][fase] = titulos_filtrados


def expulsar_jugador(player_id: str) -> None:
    game_state["jugadores"].pop(player_id, None)
    # el NPC sigue revelado (el reveal es global), pero su encuentro con este jugador se cae
    for info in game_state["npcs_revelados"].values():
        encuentro = info.get("encuentro")
        if encuentro and encuentro["jugador_objetivo"] == player_id:
            info["encuentro"] = None


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
        "debilidad_activa": False,
        "zona_actual": zonas[0]["id"] if zonas else None,
        "puntaje": 0,
        "historial": [],
    }
    return player_id


def get_personaje(personaje_id: str) -> dict | None:
    return next((p for p in PERSONAJES if p["id"] == personaje_id), None)


def desglose_stat(jugador: dict, personaje: dict, stat: str) -> dict:
    """Como `stat_efectivo`, pero además devuelve de dónde sale ese número: el stat
    base del personaje, y si la debilidad activa lo está afectando (y con qué
    modificador) — para poder mostrar el desglose completo de una tirada en pantalla,
    no solo el valor final ya sumado.
    """
    stat_base = personaje["stats"][stat]
    debilidad = personaje["debilidad"]
    debilidad_aplica = jugador["debilidad_activa"] and debilidad["stat"] == stat
    return {
        "stat_valor": stat_base + (debilidad["modificador"] if debilidad_aplica else 0),
        "stat_base": stat_base,
        "debilidad_nombre": debilidad["nombre"] if debilidad_aplica else None,
        "debilidad_modificador": debilidad["modificador"] if debilidad_aplica else None,
    }


def stat_efectivo(jugador: dict, personaje: dict, stat: str) -> int:
    return desglose_stat(jugador, personaje, stat)["stat_valor"]


def activar_debilidad(player_id: str) -> None:
    game_state["jugadores"][player_id]["debilidad_activa"] = True


def desactivar_debilidad(player_id: str) -> None:
    game_state["jugadores"][player_id]["debilidad_activa"] = False


def ajustar_na(player_id: str, delta: int) -> None:
    jugador = game_state["jugadores"][player_id]
    jugador["na"] = max(0, min(10, jugador["na"] + delta))
    jugador["modo_caos_activo"] = jugador["na"] >= 6


def _registrar_resultado(player_id: str, tipo: str, nombre: str, exito: bool, puntos: int) -> None:
    jugador = game_state["jugadores"][player_id]
    jugador["puntaje"] += puntos
    jugador["historial"].append({"tipo": tipo, "nombre": nombre, "exito": exito, "puntos": puntos})


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
    """Revela un NPC de cualquier tipo en una zona del mapa, para todos los jugadores.

    El reveal es un solo paso común a `ambiente`, `levante` y `confrontacion`: el NPC
    aparece en escena y lo ve todo el mundo. La mecánica de levante/confrontación se
    dispara después, aparte, con `iniciar_encuentro`.
    """
    if get_npc(npc_id) is None:
        raise ValueError(f"npc_id inválido: {npc_id}")
    zonas_validas = {z["id"] for z in game_state["mapa_actual"]["zonas"]}
    if zona not in zonas_validas:
        raise ValueError(f"zona inválida en el mapa actual: {zona}")

    # re-revelarlo lo mueve de zona sin perder el encuentro que pueda tener encima
    previo = game_state["npcs_revelados"].get(npc_id, {})
    game_state["npcs_revelados"][npc_id] = {"zona": zona, "encuentro": previo.get("encuentro")}


def ocultar_npc(npc_id: str) -> None:
    """Saca al NPC de la escena (y con él, cualquier encuentro suyo en curso)."""
    game_state["npcs_revelados"].pop(npc_id, None)


def encuentro_en_curso() -> tuple[str, dict] | None:
    """`(npc_id, encuentro)` del encuentro sin resolver, si hay alguno.

    El bloqueo es **global**: no puede haber más de un encuentro sin resolver en toda
    la partida a la vez, aunque sea con NPCs y jugadores distintos — en la mesa real el
    DM narra un encuentro por vez.
    """
    for npc_id, info in game_state["npcs_revelados"].items():
        encuentro = info.get("encuentro")
        if encuentro and not encuentro["resuelto"]:
            return npc_id, encuentro
    return None


def puede_iniciar_encuentro(npc_id: str) -> bool:
    """True si ese NPC está revelado y es de un tipo que admite encuentro.

    No mira si su encuentro anterior ya se resolvió: un NPC de encuentro **no se agota**,
    una vez resuelto se le puede asignar otro encuentro al mismo o a otro jugador.
    """
    if npc_id not in game_state["npcs_revelados"]:
        return False
    npc = get_npc(npc_id)
    return npc is not None and npc.get("tipo") in TIPOS_ENCUENTRO


def iniciar_encuentro(npc_id: str | None, jugador_objetivo: str) -> str:
    """Arranca un encuentro de levante/confrontación sobre un NPC **ya revelado**.

    `npc_id=None` elige al azar entre los NPCs revelados que admitan encuentro.
    """
    if jugador_objetivo not in game_state["jugadores"]:
        raise ValueError(f"player_id inválido: {jugador_objetivo}")

    en_curso = encuentro_en_curso()
    if en_curso is not None:
        npc_bloqueante = get_npc(en_curso[0])
        nombre = npc_bloqueante["nombre"] if npc_bloqueante else en_curso[0]
        raise ValueError(
            f"Ya hay un encuentro sin resolver ({nombre}). Esperá a que se resuelva o sacá al NPC de la escena"
        )

    if npc_id is None:
        candidatos = [nid for nid in game_state["npcs_revelados"] if puede_iniciar_encuentro(nid)]
        if not candidatos:
            raise ValueError("No hay NPCs de levante/confrontación revelados. Revelá uno antes de iniciar el encuentro")
        npc_id = random.choice(candidatos)
    elif npc_id not in game_state["npcs_revelados"]:
        raise ValueError(f"{npc_id} todavía no está revelado: revelalo antes de iniciar el encuentro")
    elif not puede_iniciar_encuentro(npc_id):
        raise ValueError(f"{npc_id} no es un NPC de levante ni de confrontación")

    game_state["npcs_revelados"][npc_id]["encuentro"] = {
        "jugador_objetivo": jugador_objetivo,
        "resuelto": False,
        "nodo_actual": get_npc(npc_id)["arbol"]["inicio"],
        "acumulado": 0,
        "rondas_jugadas": 0,
        "tiradas": [],
        # la opción que el jugador ya eligió para esta ronda, esperando que el DM la
        # resuelva con `resolver_ronda_encare` (ver esa función) — None mientras el
        # jugador no eligió nada todavía
        "pendiente": None,
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
    """Los NPCs revelados como los ve un jugador puntual.

    La **existencia** del NPC es global: todos ven a todos los revelados en el mapa.
    Lo único dirigido es el estado del **encuentro**: solo el `jugador_objetivo` lo
    recibe (con el NPC ya filtrado por el misterio de lindura si corresponde); para el
    resto viaja en `None`, así no se enteran de con quién está el encuentro en curso.
    """
    jugador = game_state["jugadores"].get(player_id)
    resultado = {}

    for npc_id, info in game_state["npcs_revelados"].items():
        npc = get_npc(npc_id)
        if npc is None:
            continue

        encuentro = info.get("encuentro")
        visible = None
        if encuentro and jugador and encuentro["jugador_objetivo"] == player_id:
            # el misterio cae al resolver el intento, sin importar el NA (sección 2 del plan)
            npc_visible = npc if encuentro["resuelto"] else npc_con_misterio(npc, jugador)
            # el árbol completo (con las respuestas y ramas futuras) es spoiler: el jugador
            # solo recibe el nodo actual, sin las respuestas ni el destino de cada opción
            npc_sin_arbol = {k: v for k, v in npc_visible.items() if k != "arbol"}
            # "pendiente" en crudo (con stat/respuesta/siguiente) es para uso interno del
            # DM al resolver la ronda — el jugador solo necesita saber si hay una pendiente
            hay_pendiente = encuentro["pendiente"] is not None
            encuentro_sin_pendiente_crudo = {k: v for k, v in encuentro.items() if k != "pendiente"}
            visible = {**encuentro_sin_pendiente_crudo, "npc": npc_sin_arbol, "pendiente": hay_pendiente}
            if not encuentro["resuelto"] and not hay_pendiente:
                nodo = npc["arbol"]["nodos"][encuentro["nodo_actual"]]
                visible["nodo"] = {
                    "texto": nodo["texto"],
                    "opciones": [{"texto": o["texto"], "stat": o["stat"]} for o in nodo["opciones"]],
                }

        resultado[npc_id] = {"zona": info.get("zona"), "encuentro": visible}

    return resultado


def _npc_de_encuentro_valido(npc_id: str, player_id: str) -> tuple[dict, dict]:
    info = game_state["npcs_revelados"].get(npc_id)
    if info is None:
        raise ValueError(f"npc_id inválido: {npc_id}")

    encuentro = info.get("encuentro")
    if encuentro is None or encuentro["jugador_objetivo"] != player_id:
        raise ValueError("Este encuentro no es tuyo")
    if encuentro["resuelto"]:
        raise ValueError("Ya intentaste este encuentro")

    npc = get_npc(npc_id)
    if npc is None or npc.get("tipo") not in TIPOS_ENCUENTRO:
        raise ValueError(f"npc_id no es de tipo levante ni confrontación: {npc_id}")
    return npc, encuentro


def elegir_opcion_encare(player_id: str, npc_id: str, opcion_idx: int | None = None, stat_otro: str | None = None) -> dict:
    """Primer paso de una ronda de encare: el jugador elige qué opción intenta.

    No tira los dados todavía — a la mesa, en este momento el jugador dice en voz alta
    su frase/movida libremente, y recién después el DM juzga qué tan bien le salió con
    `resolver_ronda_encare` (que aplica el `modificador_dm` y ahí sí tira). Deja la
    elección en `encuentro["pendiente"]` hasta que eso pase.
    """
    npc, encuentro = _npc_de_encuentro_valido(npc_id, player_id)
    if encuentro["pendiente"] is not None:
        raise ValueError("Ya elegiste una opción para esta ronda, estás esperando al DM")

    nodo = npc["arbol"]["nodos"][encuentro["nodo_actual"]]

    if stat_otro is not None:
        if stat_otro not in STATS_JUGABLES:
            raise ValueError(f"stat inválido: {stat_otro}")
        stat, respuesta, siguiente = stat_otro, None, None
    else:
        if opcion_idx is None or not (0 <= opcion_idx < len(nodo["opciones"])):
            raise ValueError(f"opcion_idx inválido para este nodo: {opcion_idx}")
        opcion = nodo["opciones"][opcion_idx]
        stat, respuesta, siguiente = opcion["stat"], opcion["respuesta"], opcion["siguiente"]

    encuentro["pendiente"] = {"stat": stat, "respuesta": respuesta, "siguiente": siguiente}
    return {"npc_id": npc_id, "jugador_objetivo": player_id, "stat": stat}


def _npc_de_ronda_pendiente(npc_id: str) -> tuple[dict, dict]:
    info = game_state["npcs_revelados"].get(npc_id)
    if info is None:
        raise ValueError(f"npc_id inválido: {npc_id}")

    encuentro = info.get("encuentro")
    if encuentro is None or encuentro["resuelto"]:
        raise ValueError("No hay un encuentro sin resolver para este NPC")
    if encuentro["pendiente"] is None:
        raise ValueError("Todavía no hay ninguna ronda esperando resolución del DM")

    npc = get_npc(npc_id)
    return npc, encuentro


def resolver_ronda_encare(npc_id: str, modificador_dm: int = 0) -> dict:
    """Segundo paso de una ronda de encare: el DM juzga cómo estuvo lo que dijo el
    jugador y tira los dados, con `modificador_dm` como bonus/malus a esa tirada (sube
    o baja la dificultad real de esa ronda sin tocar la escala de `dificultad_chamuyo`/
    `dificultad` del NPC). Se suma al `acumulado` y, si la opción elegida no tenía
    `siguiente` nodo, ahí se resuelve el encuentro completo (dificultad total = escala
    del NPC por rondas jugadas) y se registra el resultado en el puntaje del jugador.
    """
    npc, encuentro = _npc_de_ronda_pendiente(npc_id)
    pendiente = encuentro["pendiente"]
    stat, respuesta, siguiente = pendiente["stat"], pendiente["respuesta"], pendiente["siguiente"]
    player_id = encuentro["jugador_objetivo"]

    jugador = game_state["jugadores"][player_id]
    personaje = get_personaje(jugador["personaje_id"])
    desglose = desglose_stat(jugador, personaje, stat)
    resultado = {**dice.tirar(jugador["na"], stat, desglose["stat_valor"]), **desglose}
    total_ajustado = resultado["total"] + modificador_dm

    encuentro["pendiente"] = None
    encuentro["acumulado"] += total_ajustado
    encuentro["rondas_jugadas"] += 1
    tirada = {**resultado, "modificador_dm": modificador_dm, "total_ajustado": total_ajustado}
    encuentro["tiradas"].append(tirada)

    if siguiente is not None:
        encuentro["nodo_actual"] = siguiente
        nodo_siguiente = npc["arbol"]["nodos"][siguiente]
        return {
            **tirada,
            "resuelto": False,
            "npc_id": npc_id,
            "jugador_objetivo": player_id,
            "stat": stat,
            "respuesta": respuesta,
            "siguiente_nodo": {
                "texto": nodo_siguiente["texto"],
                "opciones": [{"texto": o["texto"], "stat": o["stat"]} for o in nodo_siguiente["opciones"]],
            },
        }

    es_levante = npc["tipo"] == "levante"
    dificultad_por_ronda = npc["dificultad_chamuyo"] if es_levante else npc["dificultad"]
    dificultad_total = dificultad_por_ronda * encuentro["rondas_jugadas"]
    exito = encuentro["acumulado"] >= dificultad_total
    encuentro["resuelto"] = True

    puntos = (npc["puntaje_lindura"] if exito else 0) if es_levante else (1 if exito else 0)
    _registrar_resultado(player_id, npc["tipo"], npc["nombre"], exito, puntos)

    respuesta_final = {
        **tirada,
        "resuelto": True,
        "npc_id": npc_id,
        "jugador_objetivo": player_id,
        "stat": stat,
        "exito": exito,
        "acumulado": encuentro["acumulado"],
        "dificultad_total": dificultad_total,
        "respuesta": respuesta,
    }
    if es_levante:
        respuesta_final["puntaje_lindura"] = npc["puntaje_lindura"]
    return respuesta_final


def configurar_dificultad_evento(titulo: str, dificultad: int | None) -> None:
    """Personaliza la dificultad de un evento puntual de la fase actual — la rueda ⚙️
    de cada tarjeta en el panel del DM. `dificultad=None` la restablece a la de
    referencia de `data/eventos.json`. Se guarda por fase y sobrevive a los cambios de
    fase; no toca el dato original del archivo.
    """
    fase = game_state["fase"]
    if not any(e["titulo"] == titulo for e in EVENTOS.get(fase, [])):
        raise ValueError(f"titulo inválido para la fase {fase}: {titulo}")

    if dificultad is None:
        game_state["dificultades_personalizadas"][fase].pop(titulo, None)
    else:
        game_state["dificultades_personalizadas"][fase][titulo] = dificultad


def siguiente_situacion(modo: str, titulo: str | None = None) -> dict:
    fase = game_state["fase"]
    habilitados = set(game_state["eventos_habilitados"].get(fase, []))
    eventos_fase = [e for e in EVENTOS.get(fase, []) if e["titulo"] in habilitados]
    if not eventos_fase:
        raise ValueError(f"No hay eventos habilitados para la fase {fase}")

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

    dificultad_custom = game_state["dificultades_personalizadas"].get(fase, {}).get(evento["titulo"])

    situacion = {
        "resuelta": False,
        "resuelta_por": None,
        "exito": None,
        "opcion_elegida": None,
        # igual que en los encuentros: la elección del jugador queda acá hasta que el
        # DM la juzgue con `resolver_situacion_pendiente` — ver esa función
        "pendiente": None,
        **evento,
        "dificultad": dificultad_custom if dificultad_custom is not None else evento["dificultad"],
    }
    game_state["situacion_actual"] = situacion
    if evento["titulo"] not in game_state["eventos_usados"][fase]:
        game_state["eventos_usados"][fase].append(evento["titulo"])
    return situacion


def elegir_opcion_situacion(player_id: str, stat: str, opcion: str | None = None) -> dict:
    """Primer paso de una situación de fase: el jugador elige qué opción/stat intenta.

    Mismo patrón de dos pasos que el encare (`elegir_opcion_encare`): todavía no tira
    los dados — a la mesa, el jugador dice su frase/movida en voz alta, y recién cuando
    el DM la escucha y juzga con `resolver_situacion_pendiente` (que aplica un
    `modificador_dm`) se tira de verdad. Deja la elección en `situacion["pendiente"]`.
    """
    if player_id not in game_state["jugadores"]:
        raise ValueError(f"player_id inválido: {player_id}")

    situacion = game_state["situacion_actual"]
    if situacion is None:
        raise ValueError("No hay ninguna situación activa")
    if situacion["resuelta"]:
        raise ValueError("Esta situación ya fue resuelta")
    if situacion["pendiente"] is not None:
        raise ValueError("Ya hay alguien esperando que el DM juzgue esta situación")

    if opcion == OTRO_OPCION:
        if stat not in STATS_JUGABLES:
            raise ValueError(f"stat inválido: {stat}")
    else:
        stats_definidos = {op["stat"] for op in situacion["opciones"]}
        if stat not in stats_definidos:
            raise ValueError(f"stat inválido para esta situación: {stat}")

    situacion["pendiente"] = {"player_id": player_id, "stat": stat, "opcion": opcion}
    return {"player_id": player_id, "stat": stat, "opcion": opcion}


def resolver_situacion_pendiente(modificador_dm: int = 0) -> dict:
    """Segundo paso: el DM juzga cómo estuvo lo que dijo el jugador y tira los dados,
    con `modificador_dm` como bonus/malus a esa tirada puntual — mismo mecanismo que
    `resolver_ronda_encare`, no toca la `dificultad` de la situación en sí.
    """
    situacion = game_state["situacion_actual"]
    if situacion is None:
        raise ValueError("No hay ninguna situación activa")
    pendiente = situacion["pendiente"]
    if pendiente is None:
        raise ValueError("Todavía no hay nadie esperando resolución del DM para esta situación")

    player_id, stat, opcion = pendiente["player_id"], pendiente["stat"], pendiente["opcion"]
    jugador = game_state["jugadores"][player_id]
    personaje = get_personaje(jugador["personaje_id"])

    desglose = desglose_stat(jugador, personaje, stat)
    resultado = {**dice.tirar(jugador["na"], stat, desglose["stat_valor"]), **desglose}
    total_ajustado = resultado["total"] + modificador_dm
    exito = total_ajustado >= situacion["dificultad"]

    situacion["pendiente"] = None
    situacion["resuelta"] = True
    situacion["resuelta_por"] = jugador["nombre"]
    situacion["exito"] = exito
    situacion["opcion_elegida"] = opcion

    _registrar_resultado(player_id, "situacion", situacion["titulo"], exito, 1 if exito else 0)

    return {
        **resultado,
        "modificador_dm": modificador_dm,
        "total_ajustado": total_ajustado,
        "stat": stat,
        "exito": exito,
        "dificultad": situacion["dificultad"],
        "player_id": player_id,
        "opcion": opcion,
    }


def _aplicar_mapa(mapa: dict) -> None:
    game_state["mapa_actual"] = mapa
    game_state["npcs_revelados"] = {}
    zonas = mapa.get("zonas", [])
    zona_default = zonas[0]["id"] if zonas else None
    for jugador in game_state["jugadores"].values():
        jugador["zona_actual"] = zona_default


def _entrar_a_fase(nueva_fase: str) -> None:
    game_state["fase"] = nueva_fase
    game_state["situacion_actual"] = None
    habilitados = game_state["mapas_habilitados"].get(nueva_fase)
    _aplicar_mapa(elegir_mapa_random(nueva_fase, habilitados))

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
        # desglose para el log del DM (sección "Tiradas en vivo"): no todas las
        # tiradas tienen todos estos campos (una libre no tiene modificador_dm, por
        # ejemplo, y stat_base/debilidad_* solo están si vienen de desglose_stat)
        "suma_dados": resultado.get("suma_dados"),
        "stat_valor": resultado.get("stat_valor"),
        "stat_base": resultado.get("stat_base"),
        "modificador_na": resultado.get("modificador_na"),
        "modificador_dm": resultado.get("modificador_dm"),
        "debilidad_nombre": resultado.get("debilidad_nombre"),
        "debilidad_modificador": resultado.get("debilidad_modificador"),
    })
