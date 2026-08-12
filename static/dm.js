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

let personajes = [];
let prendas = [];
let eventos = {};
let mapa = {};
let npcs = [];
let ws = null;

async function cargarPersonajes() {
  const res = await fetch("/data/personajes.json");
  personajes = await res.json();
}

async function cargarPrendas() {
  const res = await fetch("/data/prendas.json");
  prendas = await res.json();
}

async function cargarEventos() {
  const res = await fetch("/data/eventos.json");
  eventos = await res.json();
}

async function cargarMapa() {
  const res = await fetch("/data/mapa.json");
  mapa = await res.json();
}

async function cargarNpcs() {
  const res = await fetch("/data/npcs.json");
  npcs = await res.json();
}

function nombrePersonaje(personajeId) {
  const p = personajes.find((p) => p.id === personajeId);
  return p ? p.nombre : personajeId;
}

function nombrePrenda(prendaId) {
  const p = prendas.find((p) => p.id === prendaId);
  return p ? p.nombre : `#${prendaId}`;
}

function renderJugadores(jugadores, mapaActual) {
  const lista = document.getElementById("lista-jugadores");
  const ids = Object.keys(jugadores);

  if (ids.length === 0) {
    lista.innerHTML = "<li>Todavía no se unió nadie.</li>";
    return;
  }

  const zonasFase = mapaActual.zonas || [];

  lista.innerHTML = ids
    .map((id) => {
      const j = jugadores[id];
      const pct = (j.na / NA_MAX) * 100;
      const prendasHtml = j.prendas_activas.length
        ? j.prendas_activas
            .map(
              (pid) => `
              <span class="prenda-tag">
                ${nombrePrenda(pid)}
                <button data-action="resolver-prenda" data-player="${id}" data-prenda="${pid}">✕</button>
              </span>`
            )
            .join("")
        : `<span class="sin-prenda">Sin prenda</span>`;

      const opcionesPrenda = prendas.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
      const opcionesZona = zonasFase
        .map((z) => `<option value="${z.id}" ${z.id === j.zona_actual ? "selected" : ""}>${z.emoji} ${z.nombre}</option>`)
        .join("");

      return `
      <li class="player-card">
        <div class="player-head">
          <strong>${j.nombre}</strong>
          <span>${nombrePersonaje(j.personaje_id)}</span>
        </div>
        <div class="na-meter"><div class="na-fill" style="width:${pct}%"></div></div>
        <div class="na-label">NA ${j.na} / ${NA_MAX} — ${NOMBRES_NA[j.na]}</div>
        <div class="na-controls">
          <button data-action="menos" data-player="${id}" ${j.na <= 0 ? "disabled" : ""}>−1</button>
          <button data-action="mas" data-player="${id}" ${j.na >= NA_MAX ? "disabled" : ""}>+1</button>
        </div>
        <div class="prendas-activas">${prendasHtml}</div>
        <div class="prenda-controls">
          <select class="select-prenda" data-player="${id}">
            <option value="">🎲 Random</option>
            ${opcionesPrenda}
          </select>
          <button data-action="repartir-prenda" data-player="${id}">Repartir prenda</button>
        </div>
        <div class="zona-controls">
          <select class="select-zona" data-player="${id}">${opcionesZona}</select>
          <button data-action="mover-jugador" data-player="${id}">Mover</button>
        </div>
      </li>`;
    })
    .join("");
}

function nombreNpc(npcId) {
  const n = npcs.find((n) => n.id === npcId);
  return n ? `${n.avatar} ${n.nombre}` : npcId;
}

function renderMapaVisual(jugadores, mapaActual, npcsRevelados) {
  const cont = document.getElementById("mapa-visual");
  const nombreEl = document.getElementById("mapa-nombre-actual");
  const zonas = mapaActual.zonas || [];

  nombreEl.textContent = mapaActual.nombre || "";

  if (!zonas.length) {
    cont.innerHTML = "<p>Sin mapa para esta fase.</p>";
    return;
  }

  cont.innerHTML = zonas
    .map((z) => {
      const jugadoresEnZona = Object.values(jugadores).filter((j) => j.zona_actual === z.id);
      const npcsEnZona = Object.entries(npcsRevelados).filter(([, info]) => info.zona === z.id);

      const tokensHtml = jugadoresEnZona.map((j) => `<span class="token-jugador">${j.nombre}</span>`).join("");

      const npcsHtml = npcsEnZona
        .map(
          ([npcId]) => `
          <span class="token-npc">
            ${nombreNpc(npcId)}
            <button data-action="ocultar-npc" data-npc="${npcId}">✕</button>
          </span>`
        )
        .join("");

      const pos = z.pos || { left: 0, top: 0, width: 30, height: 30 };
      const estilo = `left:${pos.left}%; top:${pos.top}%; width:${pos.width}%; height:${pos.height}%;`;

      return `
      <div class="zona-box" style="${estilo}">
        <div class="zona-header">${z.emoji} ${z.nombre}</div>
        <div class="zona-tokens">${tokensHtml}${npcsHtml}</div>
      </div>`;
    })
    .join("");
}

function renderFormularioNpc(fase, mapaActual) {
  const selectNpc = document.getElementById("select-npc");
  const selectZona = document.getElementById("select-zona-npc");
  const npcsFase = npcs.filter((n) => n.fase === fase && n.tipo === "ambiente");
  const zonas = mapaActual.zonas || [];

  selectNpc.innerHTML = npcsFase.length
    ? npcsFase.map((n) => `<option value="${n.id}">${n.avatar} ${n.nombre} (${n.apodo})</option>`).join("")
    : `<option value="">Sin NPCs ambiente para esta fase</option>`;

  selectZona.innerHTML = zonas.map((z) => `<option value="${z.id}">${z.emoji} ${z.nombre}</option>`).join("");
}

function renderFormularioMapa(fase, mapaActual) {
  const select = document.getElementById("select-mapa");
  const variantes = mapa[fase] || [];

  select.innerHTML =
    `<option value="">🎲 Random</option>` +
    variantes.map((v) => `<option value="${v.id}" ${v.id === mapaActual.id ? "selected" : ""}>${v.nombre}</option>`).join("");
}

function renderFormularioEncuentro(fase, jugadores, npcsRevelados) {
  const selectNpc = document.getElementById("select-npc-encuentro");
  const selectJugador = document.getElementById("select-jugador-objetivo");

  const disponibles = npcs.filter(
    (n) =>
      (n.tipo === "levante" || n.tipo === "confrontacion") &&
      n.fase === fase &&
      (!(n.id in npcsRevelados) || npcsRevelados[n.id].resuelto)
  );

  selectNpc.innerHTML =
    `<option value="">🎲 Random</option>` +
    disponibles.map((n) => `<option value="${n.id}">${n.avatar} ${n.nombre} (${n.tipo})</option>`).join("");

  const idsJugadores = Object.keys(jugadores);
  selectJugador.innerHTML = idsJugadores.length
    ? idsJugadores.map((id) => `<option value="${id}">${jugadores[id].nombre}</option>`).join("")
    : `<option value="">Sin jugadores</option>`;
}

function renderEncuentrosActivos(npcsRevelados, jugadores) {
  const cont = document.getElementById("lista-encuentros");
  const entradas = Object.entries(npcsRevelados).filter(([, info]) => "jugador_objetivo" in info);

  if (!entradas.length) {
    cont.innerHTML = "<p>Sin encuentros activos.</p>";
    return;
  }

  cont.innerHTML = entradas
    .map(([npcId, info]) => {
      const npc = npcs.find((n) => n.id === npcId);
      const jugador = jugadores[info.jugador_objetivo];
      const estado = info.resuelto ? "✅ resuelto" : "⏳ pendiente";
      return `<div class="encuentro-card">${npc ? `${npc.avatar} ${npc.nombre}` : npcId} → ${jugador ? jugador.nombre : "?"} — ${estado}</div>`;
    })
    .join("");
}

const TEXTO_TIPO = {
  normal: "",
  papelon_automatico: " — PAPELÓN AUTOMÁTICO",
  exito_bonus: " — ÉXITO CON BONUS",
};

function renderLog(logEventos) {
  const lista = document.getElementById("log-eventos");

  if (logEventos.length === 0) {
    lista.innerHTML = "<li>Todavía no hubo tiradas.</li>";
    return;
  }

  lista.innerHTML = logEventos
    .slice()
    .reverse()
    .map((e) => {
      const accion = e.contexto ? `${e.contexto} (${e.stat})` : `tiró ${e.stat}`;
      return `<li>${e.jugador} ${accion} → ${e.dados_tirados[0]} + ${e.dados_tirados[1]}, total ${e.total}${TEXTO_TIPO[e.tipo] || ""}</li>`;
    })
    .join("");
}

function renderEventos(fase, eventosUsados, situacionActual) {
  const cont = document.getElementById("lista-eventos");
  const eventosFase = eventos[fase];

  if (!eventosFase) {
    cont.innerHTML = "<p>Sin eventos de referencia para esta fase.</p>";
    return;
  }

  const usados = new Set((eventosUsados && eventosUsados[fase]) || []);

  cont.innerHTML = eventosFase
    .map((e) => {
      const esActiva = situacionActual && situacionActual.titulo === e.titulo;
      const clases = ["evento-card"];
      if (usados.has(e.titulo)) clases.push("evento-usado");
      if (esActiva) clases.push("evento-activo");

      return `
      <div class="${clases.join(" ")}">
        <div class="evento-titulo">${e.titulo}</div>
        <p>${e.texto}</p>
        <button class="btn-usar-evento" data-titulo="${e.titulo}">${esActiva ? "En uso" : "Usar esta"}</button>
      </div>`;
    })
    .join("");

  cont.querySelectorAll(".btn-usar-evento").forEach((btn) => {
    btn.addEventListener("click", () => siguienteSituacion("elegir", btn.dataset.titulo));
  });
}

function renderSituacionActual(situacion) {
  const cont = document.getElementById("situacion-actual-card");

  if (!situacion) {
    cont.innerHTML = "<p>Sin situación activa.</p>";
    return;
  }

  const opcionesHtml = situacion.opciones
    ? `<div class="situacion-opciones-dm">${situacion.opciones
        .map((o) => `<span class="opcion-pill">${o.texto} → ${o.stat}</span>`)
        .join("")}</div>`
    : "";

  cont.innerHTML = `
    <div class="situacion-card">
      <div class="evento-titulo">${situacion.titulo}</div>
      <p>${situacion.texto}</p>
      ${opcionesHtml}
    </div>`;
}

function avanzarFase() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "avanzar_fase" }));
}

function retrocederFase() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "retroceder_fase" }));
}

function cambiarMapa(mapaId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "cambiar_mapa", mapa_id: mapaId || null }));
}

function ajustarNa(playerId, delta) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "ajustar_na", player_id: playerId, delta }));
}

function repartirPrenda(playerId, prendaId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "repartir_prenda", player_id: playerId, prenda_id: prendaId }));
}

function resolverPrenda(playerId, prendaId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "resolver_prenda", player_id: playerId, prenda_id: Number(prendaId) }));
}

function moverJugador(playerId, zona) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "mover_jugador", player_id: playerId, zona }));
}

function revelarNpc(npcId, zona) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !npcId) return;
  ws.send(JSON.stringify({ type: "revelar_npc", npc_id: npcId, zona }));
}

function ocultarNpc(npcId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "ocultar_npc", npc_id: npcId }));
}

function siguienteSituacion(modo, titulo) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "siguiente_situacion", modo, titulo: titulo || null }));
}

function revelarEncuentro() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const npcId = document.getElementById("select-npc-encuentro").value;
  const jugadorObjetivo = document.getElementById("select-jugador-objetivo").value;
  if (!jugadorObjetivo) return;
  const modo = npcId === "" ? "random" : "elegir";
  ws.send(JSON.stringify({ type: "revelar_npc_encuentro", npc_id: npcId || null, modo, jugador_objetivo: jugadorObjetivo }));
}

function narrarIA() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const promptExtra = document.getElementById("narrar-prompt-extra").value.trim();
  ws.send(JSON.stringify({ type: "narrar_ia", prompt_extra: promptExtra }));
}

function broadcastearNarracion(texto) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !texto) return;
  ws.send(JSON.stringify({ type: "broadcastear_narracion", texto }));
}

function mostrarResultadoNarracion(texto) {
  const cont = document.getElementById("resultado-narracion");
  const parrafo = document.getElementById("narracion-texto");
  const btnCompartir = document.getElementById("btn-broadcast-narracion");

  if (texto) {
    parrafo.textContent = texto;
    btnCompartir.disabled = false;
    btnCompartir.onclick = () => broadcastearNarracion(texto);
  } else {
    parrafo.textContent = "Ollama no respondió (¿está corriendo? ¿bajaste el modelo?). Narrá vos.";
    btnCompartir.disabled = true;
  }
  cont.classList.remove("oculto");
}

function mostrarPantalla(partidaCreada) {
  document.getElementById("pantalla-crear-partida").classList.toggle("oculto", partidaCreada);
  document.getElementById("dm-dashboard").classList.toggle("oculto", !partidaCreada);
  document.getElementById("btn-nueva-partida").classList.toggle("oculto", !partidaCreada);
}

function crearPartida() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "crear_partida" }));
}

function conectarWs() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/dm`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "estado_completo") {
      mostrarPantalla(msg.partida_creada);
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      renderJugadores(msg.jugadores, msg.mapa_actual);
      renderLog(msg.log_eventos);
      renderEventos(msg.fase, msg.eventos_usados, msg.situacion_actual);
      renderSituacionActual(msg.situacion_actual);
      renderMapaVisual(msg.jugadores, msg.mapa_actual, msg.npcs_revelados);
      renderFormularioNpc(msg.fase, msg.mapa_actual);
      renderFormularioMapa(msg.fase, msg.mapa_actual);
      renderFormularioEncuentro(msg.fase, msg.jugadores, msg.npcs_revelados);
      renderEncuentrosActivos(msg.npcs_revelados, msg.jugadores);

      const btnFase = document.getElementById("btn-avanzar-fase");
      btnFase.disabled = msg.fase === "terminado";

      const btnRetroceder = document.getElementById("btn-retroceder-fase");
      btnRetroceder.disabled = msg.fase === "previa";
    }

    if (msg.type === "resultado_narracion") {
      const btn = document.getElementById("btn-narrar-ia");
      btn.disabled = false;
      btn.textContent = "🪄 Narrar con IA";
      mostrarResultadoNarracion(msg.texto);
    }
  };

  ws.onclose = () => {
    setTimeout(conectarWs, 2000);
  };
}

document.getElementById("lista-jugadores").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  if (btn.dataset.action === "menos" || btn.dataset.action === "mas") {
    const delta = btn.dataset.action === "mas" ? 1 : -1;
    ajustarNa(btn.dataset.player, delta);
  }

  if (btn.dataset.action === "repartir-prenda") {
    const select = btn.parentElement.querySelector(".select-prenda");
    const prendaId = select.value === "" ? null : Number(select.value);
    repartirPrenda(btn.dataset.player, prendaId);
  }

  if (btn.dataset.action === "resolver-prenda") {
    resolverPrenda(btn.dataset.player, btn.dataset.prenda);
  }

  if (btn.dataset.action === "mover-jugador") {
    const select = btn.parentElement.querySelector(".select-zona");
    moverJugador(btn.dataset.player, select.value);
  }
});

document.getElementById("mapa-visual").addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-action="ocultar-npc"]');
  if (!btn) return;
  ocultarNpc(btn.dataset.npc);
});

document.getElementById("btn-revelar-npc").addEventListener("click", () => {
  const npcId = document.getElementById("select-npc").value;
  const zona = document.getElementById("select-zona-npc").value;
  revelarNpc(npcId, zona);
});

document.getElementById("btn-revelar-encuentro").addEventListener("click", revelarEncuentro);

document.getElementById("btn-situacion-random").addEventListener("click", () => siguienteSituacion("random"));

document.getElementById("btn-avanzar-fase").addEventListener("click", avanzarFase);

document.getElementById("btn-retroceder-fase").addEventListener("click", retrocederFase);

document.getElementById("btn-cambiar-mapa").addEventListener("click", () => {
  const select = document.getElementById("select-mapa");
  cambiarMapa(select.value || null);
});

document.getElementById("btn-narrar-ia").addEventListener("click", (e) => {
  e.target.disabled = true;
  e.target.textContent = "Narrando... (puede tardar unos segundos)";
  narrarIA();
});

document.getElementById("btn-crear-partida").addEventListener("click", crearPartida);

document.getElementById("btn-nueva-partida").addEventListener("click", () => {
  if (confirm("¿Crear una partida nueva? Se van a desconectar todos los jugadores actuales.")) {
    crearPartida();
  }
});

(async function init() {
  await cargarPersonajes();
  await cargarPrendas();
  await cargarEventos();
  await cargarMapa();
  await cargarNpcs();
  conectarWs();
})();
