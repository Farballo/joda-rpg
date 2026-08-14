const NOMBRES_STAT = {
  carisma: "Carisma",
  aguante: "Aguante",
  astucia: "Astucia",
  suerte: "Suerte",
};

const TEXTO_TIPO = {
  normal: "",
  papelon_automatico: "¡PAPELÓN AUTOMÁTICO! 🔥",
  exito_bonus: "¡ÉXITO CON BONUS! ⭐",
};

const NOMBRES_NA = [
  "Sobrio", "Sobrio",
  "Alegre", "Alegre",
  "Picante", "Picante",
  "Modo Caos", "Modo Caos",
  "Irrecuperable", "Irrecuperable",
  "Leyenda Urbana",
];
const NA_MAX = 10;

const NOMBRES_FASE = { previa: "Previa", boliche: "Boliche", after: "After", terminado: "Terminado" };

// Tramos de la escala de NA (sección 5.4 del plan). El nombre del tramo se
// usa como data-attribute para que el CSS vaya deformando la carta y la
// pantalla a medida que el jugador se pone en pedo.
const TRAMOS_NA = ["sobrio", "sobrio", "alegre", "alegre", "picante", "picante", "caos", "caos", "irrecuperable", "irrecuperable", "leyenda"];

let ws = null;
let prendas = [];
let npcs = [];
let personajeActual = null;
let personajes = [];
let indiceCarrusel = 0;

async function cargarPersonajes() {
  const res = await fetch("/data/personajes.json");
  return res.json();
}

function aplicarFase(fase) {
  document.body.dataset.fase = fase || "previa";
}

function aplicarTramoNa(na) {
  document.body.dataset.naTramo = TRAMOS_NA[na] || "sobrio";
}

async function cargarPrendas() {
  const res = await fetch("/data/prendas.json");
  prendas = await res.json();
}

async function cargarNpcs() {
  const res = await fetch("/data/npcs.json");
  npcs = await res.json();
}

function renderCarrusel() {
  const pista = document.getElementById("carrusel");
  const puntos = document.getElementById("carrusel-puntos");

  pista.innerHTML = personajes
    .map((p, i) => cartaHtml(p, { indice: i, clases: "carta-carrusel" }))
    .join("");

  puntos.innerHTML = personajes
    .map((p, i) => `<button type="button" class="carrusel-punto" data-idx="${i}" aria-label="${esc(p.nombre)}"></button>`)
    .join("");

  puntos.querySelectorAll(".carrusel-punto").forEach((b) => {
    b.addEventListener("click", () => irACarta(Number(b.dataset.idx)));
  });

  pista.querySelectorAll(".carta-carrusel").forEach((carta, i) => {
    carta.addEventListener("click", () => irACarta(i));
  });

  actualizarSeleccion();
}

function actualizarSeleccion() {
  const personaje = personajes[indiceCarrusel];
  if (!personaje) return;

  document.querySelectorAll("#carrusel .carta-carrusel").forEach((carta, i) => {
    carta.classList.toggle("carta-activa", i === indiceCarrusel);
  });

  document.querySelectorAll(".carrusel-punto").forEach((punto, i) => {
    punto.classList.toggle("carrusel-punto-activo", i === indiceCarrusel);
  });

  document.getElementById("btn-join-nombre").textContent = personaje.nombre;
  document.getElementById("btn-carrusel-prev").disabled = indiceCarrusel === 0;
  document.getElementById("btn-carrusel-next").disabled = indiceCarrusel === personajes.length - 1;
}

function irACarta(indice, comportamiento = "smooth") {
  indiceCarrusel = Math.max(0, Math.min(personajes.length - 1, indice));
  const carta = document.querySelectorAll("#carrusel .carta-carrusel")[indiceCarrusel];
  if (carta) carta.scrollIntoView({ behavior: comportamiento, inline: "center", block: "nearest" });
  actualizarSeleccion();
}

/** Al deslizar con el dedo el scroll manda: recalculamos cuál quedó centrada. */
function sincronizarConScroll() {
  const pista = document.getElementById("carrusel");
  const centro = pista.scrollLeft + pista.clientWidth / 2;
  const cartas = [...pista.querySelectorAll(".carta-carrusel")];
  if (!cartas.length) return;

  let masCerca = 0;
  let menorDistancia = Infinity;
  cartas.forEach((carta, i) => {
    const distancia = Math.abs(carta.offsetLeft + carta.offsetWidth / 2 - centro);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      masCerca = i;
    }
  });

  if (masCerca !== indiceCarrusel) {
    indiceCarrusel = masCerca;
    actualizarSeleccion();
  }
}

function mostrarReveal(personaje, alCerrar) {
  const overlay = document.getElementById("reveal-overlay");
  const slot = document.getElementById("reveal-carta-slot");

  slot.innerHTML = cartaHtml(personaje, { clases: "carta-reveal" });
  overlay.classList.remove("oculto");

  document.getElementById("btn-reveal-listo").onclick = () => {
    overlay.classList.add("oculto");
    alCerrar();
  };
}

function renderMiCarta(personaje) {
  document.getElementById("mi-carta-thumb").innerHTML = cartaThumbHtml(personaje);
  document.getElementById("mi-personaje-nombre").textContent = personaje.nombre;
  document.getElementById("mi-carta-slot").innerHTML = cartaHtml(personaje, { clases: "carta-grande" });
}

async function unirse(nombre, personajeId) {
  const res = await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, personaje_id: personajeId }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "No se pudo unir a la partida");
  }

  return res.json();
}

function renderStats(personaje) {
  const cont = document.getElementById("stats");
  cont.innerHTML = Object.entries(personaje.stats)
    .map(
      ([stat, valor]) => `
      <button type="button" class="btn-stat" data-stat="${stat}">
        ${NOMBRES_STAT[stat]} (${valor >= 0 ? "+" : ""}${valor})
      </button>`
    )
    .join("");

  cont.querySelectorAll(".btn-stat").forEach((btn) => {
    btn.addEventListener("click", () => tirarDado(btn.dataset.stat));
  });
}

function tirarDado(stat, contexto) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "tirar_dado", stat, contexto: contexto || null }));
}

function mostrarResultado(msg) {
  const cont = document.getElementById("resultado-tirada");
  const texto = document.getElementById("resultado-texto");
  const extra = TEXTO_TIPO[msg.tipo] || "";
  const prefijo = msg.contexto ? `${msg.contexto} — ` : "";
  const exitoTexto = msg.exito === undefined ? "" : msg.exito ? "<br>✅ ¡Lo lograste!" : "<br>❌ No lo lograste.";
  texto.innerHTML = `
    ${prefijo}${NOMBRES_STAT[msg.stat]}: sacaste ${msg.dados_tirados[0]} + ${msg.dados_tirados[1]} → total ${msg.total}
    ${extra ? `<br>${extra}` : ""}
    ${exitoTexto}
  `;
  cont.classList.remove("oculto");
}

function actualizarNa(na) {
  document.getElementById("na-fill").style.width = `${(na / NA_MAX) * 100}%`;
  document.getElementById("na-label").textContent = `${na} / ${NA_MAX} — ${NOMBRES_NA[na]}`;
  aplicarTramoNa(na);
}

function renderModoCaos(activo) {
  const cont = document.getElementById("modo-caos");

  if (!activo || !personajeActual) {
    cont.classList.add("oculto");
    cont.innerHTML = "";
    return;
  }

  const mc = personajeActual.modo_caos;
  cont.classList.remove("oculto");
  cont.innerHTML = `
    <div class="eyebrow">MODO CAOS ACTIVO</div>
    <h2>${mc.nombre}</h2>
    <p>${mc.efecto}</p>
    <p class="consecuencia"><strong>Consecuencia:</strong> ${mc.consecuencia}</p>
  `;
}

const OTRO_OPCION = "Otro (decide DM)";
let tiradaAnimacionId = null;

function intentarSituacion(opcion, stat) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  mostrarOverlayTirada();
  ws.send(JSON.stringify({ type: "intentar_situacion", opcion: opcion || null, stat }));
}

function mostrarOverlayTirada() {
  const overlay = document.getElementById("tirada-overlay");
  const animacion = document.getElementById("tirada-animacion");
  const resultado = document.getElementById("tirada-resultado");

  overlay.classList.remove("oculto");
  animacion.classList.remove("oculto");
  resultado.classList.add("oculto");

  let ticks = 0;
  clearInterval(tiradaAnimacionId);
  tiradaAnimacionId = setInterval(() => {
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    document.getElementById("tirada-dados-animados").textContent = `🎲 ${d1}   🎲 ${d2}`;
    ticks++;
    if (ticks > 10) clearInterval(tiradaAnimacionId);
  }, 80);
}

function mostrarResultadoSituacion(msg) {
  clearInterval(tiradaAnimacionId);
  document.getElementById("tirada-animacion").classList.add("oculto");

  const cont = document.getElementById("tirada-resultado");
  const extra = TEXTO_TIPO[msg.tipo] || "";
  const exitoTexto = msg.exito ? "✅ ¡Lo lograste!" : "❌ No lo lograste.";
  cont.innerHTML = `
    <div class="tirada-dados-final">🎲 ${msg.dados_tirados[0]}   🎲 ${msg.dados_tirados[1]}</div>
    <p>${NOMBRES_STAT[msg.stat]}: total ${msg.total}${extra ? ` — ${extra}` : ""}</p>
    <p class="tirada-exito">${exitoTexto}</p>
    <button type="button" id="btn-cerrar-tirada">Cerrar</button>
  `;
  cont.classList.remove("oculto");
  document.getElementById("btn-cerrar-tirada").addEventListener("click", ocultarOverlayTirada);
}

function ocultarOverlayTirada() {
  document.getElementById("tirada-overlay").classList.add("oculto");
}

function renderSituacion(situacion) {
  const cont = document.getElementById("situacion-actual");

  if (!situacion) {
    cont.classList.add("oculto");
    return;
  }

  cont.classList.remove("oculto");
  document.getElementById("situacion-titulo").textContent = situacion.titulo;
  document.getElementById("situacion-texto").textContent = situacion.texto;

  const opcionesCont = document.getElementById("situacion-opciones");

  if (situacion.resuelta) {
    const resultadoTexto = situacion.exito ? "✅ Salió bien" : "❌ Salió mal";
    opcionesCont.innerHTML = `<p class="situacion-resuelta">Resuelta por <strong>${situacion.resuelta_por}</strong> — ${resultadoTexto}</p>`;
    return;
  }

  const opciones = situacion.opciones || [];
  const opcionesHtml = opciones
    .map((op, i) => `<button type="button" class="btn-stat btn-opcion-situacion" data-idx="${i}">${op.texto} (${NOMBRES_STAT[op.stat]})</button>`)
    .join("");

  const otroStatsHtml = Object.keys(NOMBRES_STAT)
    .map((stat) => `<button type="button" class="btn-stat btn-opcion-otro" data-stat="${stat}">${NOMBRES_STAT[stat]}</button>`)
    .join("");

  opcionesCont.innerHTML = `
    ${opcionesHtml}
    <button type="button" id="btn-situacion-otro">🎭 Otro (decide DM)</button>
    <div id="situacion-otro-stats" class="oculto">
      <p class="situacion-otro-hint">El DM te dice qué stat tirar:</p>
      ${otroStatsHtml}
    </div>
  `;

  opcionesCont.querySelectorAll(".btn-opcion-situacion").forEach((btn) => {
    const opcion = opciones[Number(btn.dataset.idx)];
    btn.addEventListener("click", () => intentarSituacion(opcion.texto, opcion.stat));
  });

  document.getElementById("btn-situacion-otro").addEventListener("click", () => {
    document.getElementById("situacion-otro-stats").classList.remove("oculto");
  });

  opcionesCont.querySelectorAll(".btn-opcion-otro").forEach((btn) => {
    btn.addEventListener("click", () => intentarSituacion(OTRO_OPCION, btn.dataset.stat));
  });
}

function renderPrendas(prendaIds) {
  const cont = document.getElementById("prendas-activas");

  if (!prendaIds.length) {
    cont.innerHTML = "<p>Sin prenda activa.</p>";
    return;
  }

  cont.innerHTML = prendaIds
    .map((id) => {
      const p = prendas.find((p) => p.id === id);
      return `
      <div class="prenda-card">
        <div class="prenda-title">${p ? p.nombre : `#${id}`}</div>
        <p>${p ? p.efecto : ""}</p>
      </div>`;
    })
    .join("");
}

function renderDebilidad(activa) {
  const cont = document.getElementById("debilidad-activa");

  if (!activa || !personajeActual) {
    cont.classList.add("oculto");
    cont.innerHTML = "";
    return;
  }

  const d = personajeActual.debilidad;
  const signo = d.modificador >= 0 ? "+" : "";
  cont.classList.remove("oculto");
  cont.innerHTML = `
    <div class="eyebrow">DEBILIDAD ACTIVA</div>
    <h2>${d.nombre}</h2>
    <p>${d.descripcion}</p>
    <p class="consecuencia"><strong>Modificador:</strong> ${signo}${d.modificador} a ${NOMBRES_STAT[d.stat]}</p>
  `;
}

function renderMapaJugador(mapaActual, jugadoresEnMapa, npcsRevelados, miPlayerId) {
  document.getElementById("mapa-fase-nombre").textContent = mapaActual.nombre || "";

  const cont = document.getElementById("mapa-zonas-jugador");
  const zonas = mapaActual.zonas || [];

  if (!zonas.length) {
    cont.innerHTML = "<p>Sin mapa para esta fase.</p>";
    return;
  }

  cont.innerHTML = zonas
    .map((z) => {
      const enZona = jugadoresEnMapa.filter((j) => j.zona_actual === z.id);
      const npcsEnZona = Object.entries(npcsRevelados).filter(([, info]) => info.zona === z.id);

      const tokensHtml = enZona.length
        ? enZona
            .map((j) => `<span class="token-jugador">${j.nombre}${j.player_id === miPlayerId ? " (vos)" : ""}</span>`)
            .join("")
        : `<span class="zona-vacia">—</span>`;

      const npcsHtml = npcsEnZona
        .map(([npcId]) => {
          const n = npcs.find((n) => n.id === npcId);
          return `<span class="token-npc">${n ? `${n.avatar} ${n.nombre}` : npcId}</span>`;
        })
        .join("");

      return `
      <div class="zona-card">
        <div class="zona-header">${z.emoji} ${z.nombre}</div>
        <div class="zona-tokens">${tokensHtml}${npcsHtml}</div>
      </div>`;
    })
    .join("");
}

function intentarEncare(npcId, opcionIdx, statOtro) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "intentar_encare",
    npc_id: npcId,
    opcion_idx: opcionIdx === undefined ? null : opcionIdx,
    stat_otro: statOtro === undefined ? null : statOtro,
  }));
}

function hablarConNpc(npcId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "hablar_con_npc", npc_id: npcId }));
}

// npc_id de la carta de reveal en pantalla, para poder cerrarla si el server avisa
// que ya arrancó un encuentro sobre ella (la tocó otro jugador, o la asignó el DM)
let npcCardNpcId = null;

/* La carta de reveal es puramente cosmética y llega a todos por igual, sin importar
   el tipo de NPC. Si es de levante/confrontación, "Hablar" además arranca el
   encuentro con quien lo toque primero — el resto la ve desaparecer (ver
   "ocultar_carta_npc"), así no queda gente tratando de arrancar el mismo encuentro. */
function mostrarCartaNpc(npc) {
  npcCardNpcId = npc.id;
  document.getElementById("npc-card-avatar").textContent = npc.avatar;
  document.getElementById("npc-card-nombre").textContent = npc.nombre;
  document.getElementById("npc-card-apodo").textContent = npc.apodo;
  document.getElementById("npc-card-frase").textContent = `"${npc.frase_reveal}"`;

  const esDeEncuentro = npc.tipo === "levante" || npc.tipo === "confrontacion";

  const acciones = document.getElementById("npc-card-actions");
  acciones.innerHTML = `
    <button type="button" id="btn-npc-hablar">Hablar</button>
    <button type="button" id="btn-npc-ignorar">Ignorar</button>`;
  document.getElementById("btn-npc-hablar").addEventListener("click", () => {
    if (esDeEncuentro) hablarConNpc(npc.id);
    ocultarCartaNpc();
  });
  document.getElementById("btn-npc-ignorar").addEventListener("click", ocultarCartaNpc);

  document.getElementById("npc-card-overlay").classList.remove("oculto");
}

function ocultarCartaNpc() {
  npcCardNpcId = null;
  document.getElementById("npc-card-overlay").classList.add("oculto");
}

// npc_id del encuentro que está en pantalla, para no re-renderizarlo en cada `estado`
let encuentroEnPantalla = null;
// mientras se muestra el resultado de la tirada, `estado` no puede cerrar el overlay
let mostrandoResultadoEncuentro = false;
let ultimosNpcsRevelados = {};

function encuentroPendiente(npcsRevelados) {
  const entrada = Object.entries(npcsRevelados || {}).find(
    ([, info]) => info.encuentro && !info.encuentro.resuelto
  );
  return entrada ? { npcId: entrada[0], ...entrada[1].encuentro } : null;
}

function renderNodoEncuentro(npc, nodo) {
  document.getElementById("encuentro-avatar").textContent = npc.avatar;
  document.getElementById("encuentro-nombre").textContent = npc.nombre;
  document.getElementById("encuentro-apodo").textContent = npc.apodo;
  document.getElementById("encuentro-frase").textContent = `"${nodo.texto}"`;

  const lindura = document.getElementById("encuentro-lindura");
  lindura.innerHTML =
    npc.tipo !== "levante"
      ? ""
      : npc.puntaje_lindura === null || npc.puntaje_lindura === undefined
        ? `<p class="lindura-misterio">❓ Estás demasiado en pedo para reconocerlo...</p>`
        : `<p class="lindura-valor">Atractivo: ${npc.puntaje_lindura} / 10</p>`;

  const acciones = document.getElementById("encuentro-actions");
  const opcionesHtml = nodo.opciones
    .map((op, i) => `<button type="button" class="btn-opcion-confrontacion" data-idx="${i}">${op.texto}</button>`)
    .join("");

  const otroStatsHtml =
    npc.tipo === "levante"
      ? ""
      : `<div id="encuentro-otro-stats" class="oculto">
          <p class="situacion-otro-hint">El DM te dice qué stat tirar:</p>
          ${Object.keys(NOMBRES_STAT)
            .map((stat) => `<button type="button" class="btn-stat btn-opcion-otro" data-stat="${stat}">${NOMBRES_STAT[stat]}</button>`)
            .join("")}
        </div>`;

  acciones.innerHTML = `
    ${opcionesHtml}
    <button type="button" id="btn-encuentro-otro">🎭 Otro (el DM decide)</button>
    ${otroStatsHtml}
  `;

  acciones.querySelectorAll(".btn-opcion-confrontacion").forEach((btn) => {
    btn.addEventListener("click", () => intentarEncare(npc.id, Number(btn.dataset.idx), null));
  });

  document.getElementById("btn-encuentro-otro").addEventListener("click", () => {
    if (npc.tipo === "levante") {
      intentarEncare(npc.id, null, "carisma");
    } else {
      document.getElementById("encuentro-otro-stats").classList.remove("oculto");
    }
  });

  acciones.querySelectorAll(".btn-opcion-otro").forEach((btn) => {
    btn.addEventListener("click", () => intentarEncare(npc.id, null, btn.dataset.stat));
  });
}

function renderEncuentro(npcsRevelados) {
  ultimosNpcsRevelados = npcsRevelados || {};
  if (mostrandoResultadoEncuentro) return;

  const overlay = document.getElementById("encuentro-overlay");
  const pendiente = encuentroPendiente(ultimosNpcsRevelados);

  if (!pendiente) {
    encuentroEnPantalla = null;
    overlay.classList.add("oculto");
    return;
  }
  if (pendiente.npcId === encuentroEnPantalla) return;

  encuentroEnPantalla = pendiente.npcId;
  renderNodoEncuentro(pendiente.npc, pendiente.nodo);
  overlay.classList.remove("oculto");
}

function mostrarResultadoEncare(msg) {
  mostrandoResultadoEncuentro = true;

  if (!msg.resuelto) {
    document.getElementById("encuentro-actions").innerHTML = `<p>${msg.respuesta || ""}</p>`;
    setTimeout(() => {
      mostrandoResultadoEncuentro = false;
      const npc = ultimosNpcsRevelados[msg.npc_id] && ultimosNpcsRevelados[msg.npc_id].encuentro.npc;
      if (npc) renderNodoEncuentro(npc, msg.siguiente_nodo);
    }, 1400);
    return;
  }

  const exitoTexto = msg.exito ? "✅ ¡Salió bien!" : "❌ No salió como esperabas.";
  if (msg.puntaje_lindura !== undefined) {
    document.getElementById("encuentro-lindura").innerHTML = `<p class="lindura-valor">Atractivo real: ${msg.puntaje_lindura} / 10</p>`;
  }
  document.getElementById("encuentro-actions").innerHTML = `
    <p>${msg.respuesta ? `${msg.respuesta}<br>` : ""}Acumulado ${msg.acumulado} vs dificultad ${msg.dificultad_total}.</p>
    <p>${exitoTexto}</p>
    <button type="button" id="btn-cerrar-encuentro">Cerrar</button>`;
  document.getElementById("btn-cerrar-encuentro").addEventListener("click", cerrarEncuentro);
}

function cerrarEncuentro() {
  mostrandoResultadoEncuentro = false;
  encuentroEnPantalla = null;
  document.getElementById("encuentro-overlay").classList.add("oculto");
  renderEncuentro(ultimosNpcsRevelados);
}

const ETIQUETA_TIPO_HISTORIAL = { situacion: "📋", levante: "💘", confrontacion: "😤" };

function renderPuntaje(puntaje, historial) {
  document.getElementById("chip-puntaje-valor").textContent = puntaje;
  document.getElementById("puntaje-overlay-valor").textContent = puntaje;

  const lista = document.getElementById("puntaje-historial-lista");
  if (!historial || !historial.length) {
    lista.innerHTML = "<li>Todavía no tenés nada en tu historial.</li>";
    return;
  }

  lista.innerHTML = historial
    .slice()
    .reverse()
    .map((h) => {
      const etiqueta = ETIQUETA_TIPO_HISTORIAL[h.tipo] || "🎲";
      const resultado = h.exito ? `✅ +${h.puntos}` : "❌ 0";
      return `<li>${etiqueta} ${h.nombre} — ${resultado}</li>`;
    })
    .join("");
}

function mostrarNarracion(texto) {
  document.getElementById("narracion-ia-texto").textContent = texto;
  document.getElementById("narracion-ia").classList.remove("oculto");
}

function limpiarSesionGuardada() {
  localStorage.removeItem("player_id");
  localStorage.removeItem("nombre");
  localStorage.removeItem("personaje_id");
}

function reiniciarSesion(mensaje) {
  limpiarSesionGuardada();
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  if (mensaje) alert(mensaje);
  location.reload();
}

function salirDePartida() {
  if (!confirm("¿Salir de la partida?")) return;
  reiniciarSesion(null);
}

function conectarWsJugador(playerId) {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/player/${playerId}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "resultado_tirada") {
      mostrarResultado(msg);
    }
    if (msg.type === "estado") {
      actualizarNa(msg.na);
      renderPrendas(msg.prendas);
      renderModoCaos(msg.modo_caos_activo);
      renderDebilidad(msg.debilidad_activa);
      renderSituacion(msg.situacion_actual);
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      aplicarFase(msg.fase);
      renderMapaJugador(msg.mapa_actual, msg.jugadores_en_mapa, msg.npcs_revelados, playerId);
      renderEncuentro(msg.npcs_revelados);
      renderPuntaje(msg.puntaje, msg.historial);
    }
    if (msg.type === "npc_revelado") {
      mostrarCartaNpc(msg.npc);
    }
    if (msg.type === "ocultar_carta_npc") {
      if (npcCardNpcId === msg.npc_id) ocultarCartaNpc();
    }
    if (msg.type === "resultado_encare") {
      mostrarResultadoEncare(msg);
    }
    if (msg.type === "resultado_situacion") {
      mostrarResultadoSituacion(msg);
    }
    if (msg.type === "error") {
      clearInterval(tiradaAnimacionId);
      ocultarOverlayTirada();
      alert(msg.detail);
    }
    if (msg.type === "narracion") {
      mostrarNarracion(msg.texto);
    }
    if (msg.type === "partida_terminada") {
      reiniciarSesion("El DM inició una partida nueva. Volvés a la pantalla de unirte.");
    }
  };

  ws.onclose = (event) => {
    if (event.code === 4404) {
      reiniciarSesion("Tu partida anterior ya no existe. Unite de nuevo.");
      return;
    }
    setTimeout(() => conectarWsJugador(playerId), 2000);
  };
}

async function mostrarPantallaJuego(nombre, personajeId) {
  document.getElementById("pantalla-join").classList.add("oculto");
  document.getElementById("pantalla-espera").classList.remove("oculto");
  document.getElementById("nombre-confirmado").textContent = nombre;

  personajeActual = personajes.find((p) => p.id === personajeId);
  renderStats(personajeActual);
  renderMiCarta(personajeActual);
  await cargarPrendas();
  await cargarNpcs();
}

(async function init() {
  document.getElementById("btn-toggle-mapa").addEventListener("click", () => {
    document.getElementById("vista-mapa").classList.remove("oculto");
  });

  document.getElementById("btn-cerrar-mapa").addEventListener("click", () => {
    document.getElementById("vista-mapa").classList.add("oculto");
  });

  document.getElementById("btn-salir-partida").addEventListener("click", salirDePartida);

  document.getElementById("chip-puntaje").addEventListener("click", () => {
    document.getElementById("puntaje-overlay").classList.remove("oculto");
  });

  document.getElementById("btn-cerrar-puntaje").addEventListener("click", () => {
    document.getElementById("puntaje-overlay").classList.add("oculto");
  });

  document.getElementById("btn-mi-carta").addEventListener("click", () => {
    document.getElementById("mi-carta-overlay").classList.remove("oculto");
  });

  document.getElementById("btn-cerrar-mi-carta").addEventListener("click", () => {
    document.getElementById("mi-carta-overlay").classList.add("oculto");
  });

  personajes = await cargarPersonajes();
  await cargarCartas();

  const playerIdGuardado = localStorage.getItem("player_id");
  const nombreGuardado = localStorage.getItem("nombre");
  const personajeIdGuardado = localStorage.getItem("personaje_id");

  if (playerIdGuardado && nombreGuardado && personajeIdGuardado) {
    await mostrarPantallaJuego(nombreGuardado, personajeIdGuardado);
    conectarWsJugador(playerIdGuardado);
    return;
  }

  renderCarrusel();
  irACarta(0, "auto");

  const pista = document.getElementById("carrusel");
  let scrollTimeout = null;
  pista.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(sincronizarConScroll, 80);
  });

  pista.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      irACarta(indiceCarrusel - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      irACarta(indiceCarrusel + 1);
    }
  });

  document.getElementById("btn-carrusel-prev").addEventListener("click", () => irACarta(indiceCarrusel - 1));
  document.getElementById("btn-carrusel-next").addEventListener("click", () => irACarta(indiceCarrusel + 1));

  document.getElementById("form-join").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("input-nombre").value.trim();
    const personaje = personajes[indiceCarrusel];
    const error = document.getElementById("error-join");
    error.textContent = "";

    if (!nombre) {
      error.textContent = "Poné tu nombre.";
      return;
    }
    if (!personaje) {
      error.textContent = "Elegí un personaje.";
      return;
    }

    try {
      const { player_id } = await unirse(nombre, personaje.id);
      localStorage.setItem("player_id", player_id);
      localStorage.setItem("nombre", nombre);
      localStorage.setItem("personaje_id", personaje.id);

      mostrarReveal(personaje, async () => {
        await mostrarPantallaJuego(nombre, personaje.id);
        conectarWsJugador(player_id);
      });
    } catch (err) {
      error.textContent = err.message;
    }
  });
})();
