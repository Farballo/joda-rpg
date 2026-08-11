const NOMBRES_NA = [
  "Sobrio", "Sobrio",
  "Alegre", "Alegre",
  "Picante", "Picante",
  "Modo Caos", "Modo Caos",
  "Irrecuperable", "Irrecuperable",
  "Leyenda Urbana",
];
const NA_MAX = 10;

let personajes = [];
let ws = null;

async function cargarPersonajes() {
  const res = await fetch("/data/personajes.json");
  personajes = await res.json();
}

function nombrePersonaje(personajeId) {
  const p = personajes.find((p) => p.id === personajeId);
  return p ? p.nombre : personajeId;
}

function renderJugadores(jugadores) {
  const lista = document.getElementById("lista-jugadores");
  const ids = Object.keys(jugadores);

  if (ids.length === 0) {
    lista.innerHTML = "<li>Todavía no se unió nadie.</li>";
    return;
  }

  lista.innerHTML = ids
    .map((id) => {
      const j = jugadores[id];
      const pct = (j.na / NA_MAX) * 100;
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
      </li>`;
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
    .map((e) => `<li>${e.jugador} tiró ${e.stat} → ${e.dados_tirados[0]} + ${e.dados_tirados[1]}, total ${e.total}${TEXTO_TIPO[e.tipo] || ""}</li>`)
    .join("");
}

function ajustarNa(playerId, delta) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "ajustar_na", player_id: playerId, delta }));
}

function conectarWs() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/dm`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "estado_completo") {
      document.getElementById("fase-actual").textContent = msg.fase;
      renderJugadores(msg.jugadores);
      renderLog(msg.log_eventos);
    }
  };

  ws.onclose = () => {
    setTimeout(conectarWs, 2000);
  };
}

document.getElementById("lista-jugadores").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const delta = btn.dataset.action === "mas" ? 1 : -1;
  ajustarNa(btn.dataset.player, delta);
});

(async function init() {
  await cargarPersonajes();
  conectarWs();
})();
