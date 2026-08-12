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

function renderJugadores(jugadores, fase) {
  const lista = document.getElementById("lista-jugadores");
  const ids = Object.keys(jugadores);

  if (ids.length === 0) {
    lista.innerHTML = "<li>Todavía no se unió nadie.</li>";
    return;
  }

  const zonasFase = mapa[fase] || [];

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

function renderMapa(jugadores, fase, npcsRevelados) {
  const cont = document.getElementById("mapa-zonas");
  const zonasFase = mapa[fase] || [];

  if (!zonasFase.length) {
    cont.innerHTML = "<p>Sin mapa para esta fase.</p>";
    return;
  }

  cont.innerHTML = zonasFase
    .map((z) => {
      const jugadoresEnZona = Object.values(jugadores).filter((j) => j.zona_actual === z.id);
      const npcsEnZona = Object.entries(npcsRevelados).filter(([, info]) => info.zona === z.id);

      const tokensHtml = jugadoresEnZona.length
        ? jugadoresEnZona.map((j) => `<span class="token-jugador">${j.nombre}</span>`).join("")
        : `<span class="zona-vacia">—</span>`;

      const npcsHtml = npcsEnZona
        .map(
          ([npcId]) => `
          <span class="token-npc">
            ${nombreNpc(npcId)}
            <button data-action="ocultar-npc" data-npc="${npcId}">✕</button>
          </span>`
        )
        .join("");

      return `
      <div class="zona-card">
        <div class="zona-header">${z.emoji} ${z.nombre}</div>
        <div class="zona-tokens">${tokensHtml}${npcsHtml}</div>
      </div>`;
    })
    .join("");
}

function renderFormularioNpc(fase) {
  const selectNpc = document.getElementById("select-npc");
  const selectZona = document.getElementById("select-zona-npc");
  const npcsFase = npcs.filter((n) => n.fase === fase);
  const zonasFase = mapa[fase] || [];

  selectNpc.innerHTML = npcsFase.length
    ? npcsFase.map((n) => `<option value="${n.id}">${n.avatar} ${n.nombre} (${n.apodo})</option>`).join("")
    : `<option value="">Sin NPCs para esta fase</option>`;

  selectZona.innerHTML = zonasFase.map((z) => `<option value="${z.id}">${z.emoji} ${z.nombre}</option>`).join("");
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
    .map((e) => `<li>${e.jugador} tiró ${e.stat} → ${e.dados_tirados[0]} + ${e.dados_tirados[1]}, total ${e.total}${TEXTO_TIPO[e.tipo] || ""}</li>`)
    .join("");
}

function renderEventos(fase) {
  const cont = document.getElementById("lista-eventos");
  const eventosFase = eventos[fase];

  if (!eventosFase) {
    cont.innerHTML = "<p>Sin eventos de referencia para esta fase.</p>";
    return;
  }

  cont.innerHTML = eventosFase
    .map((e) => `
      <div class="evento-card">
        <div class="evento-titulo">${e.titulo}</div>
        <p>${e.texto}</p>
      </div>`)
    .join("");
}

function avanzarFase() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "avanzar_fase" }));
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

function conectarWs() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/dm`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "estado_completo") {
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      renderJugadores(msg.jugadores, msg.fase);
      renderLog(msg.log_eventos);
      renderEventos(msg.fase);
      renderMapa(msg.jugadores, msg.fase, msg.npcs_revelados);
      renderFormularioNpc(msg.fase);

      const btnFase = document.getElementById("btn-avanzar-fase");
      btnFase.disabled = msg.fase === "terminado";
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

document.getElementById("mapa-zonas").addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-action="ocultar-npc"]');
  if (!btn) return;
  ocultarNpc(btn.dataset.npc);
});

document.getElementById("btn-revelar-npc").addEventListener("click", () => {
  const npcId = document.getElementById("select-npc").value;
  const zona = document.getElementById("select-zona-npc").value;
  revelarNpc(npcId, zona);
});

document.getElementById("btn-avanzar-fase").addEventListener("click", avanzarFase);

(async function init() {
  await cargarPersonajes();
  await cargarPrendas();
  await cargarEventos();
  await cargarMapa();
  await cargarNpcs();
  conectarWs();
})();
