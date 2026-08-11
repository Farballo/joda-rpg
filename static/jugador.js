const NOMBRES_STAT = {
  carisma: "Carisma",
  aguante: "Aguante",
  astucia: "Astucia",
  presencia: "Presencia",
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

let ws = null;

async function cargarPersonajes() {
  const res = await fetch("/data/personajes.json");
  return res.json();
}

function renderPersonajes(personajes) {
  const cont = document.getElementById("personajes");
  cont.innerHTML = personajes
    .map(
      (p) => `
      <label class="personaje-card">
        <input type="radio" name="personaje_id" value="${p.id}">
        <strong>${p.nombre}</strong>
        <p><em>${p.frase}</em></p>
      </label>`
    )
    .join("");
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

function tirarDado(stat) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "tirar_dado", stat }));
}

function mostrarResultado(msg) {
  const cont = document.getElementById("resultado-tirada");
  const texto = document.getElementById("resultado-texto");
  const extra = TEXTO_TIPO[msg.tipo] || "";
  texto.innerHTML = `
    ${NOMBRES_STAT[msg.stat]}: sacaste ${msg.dados_tirados[0]} + ${msg.dados_tirados[1]} → total ${msg.total}
    ${extra ? `<br>${extra}` : ""}
  `;
  cont.classList.remove("oculto");
}

function actualizarNa(na) {
  document.getElementById("na-fill").style.width = `${(na / NA_MAX) * 100}%`;
  document.getElementById("na-label").textContent = `NA ${na} / ${NA_MAX} — ${NOMBRES_NA[na]}`;
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
    }
  };

  ws.onclose = () => {
    setTimeout(() => conectarWsJugador(playerId), 2000);
  };
}

async function mostrarPantallaJuego(nombre, personajeId) {
  document.getElementById("form-join").classList.add("oculto");
  document.getElementById("pantalla-espera").classList.remove("oculto");
  document.getElementById("nombre-confirmado").textContent = nombre;

  const personajes = await cargarPersonajes();
  const personaje = personajes.find((p) => p.id === personajeId);
  renderStats(personaje);
}

(async function init() {
  const playerIdGuardado = localStorage.getItem("player_id");
  const nombreGuardado = localStorage.getItem("nombre");
  const personajeIdGuardado = localStorage.getItem("personaje_id");

  if (playerIdGuardado && nombreGuardado && personajeIdGuardado) {
    await mostrarPantallaJuego(nombreGuardado, personajeIdGuardado);
    conectarWsJugador(playerIdGuardado);
    return;
  }

  const personajes = await cargarPersonajes();
  renderPersonajes(personajes);

  document.getElementById("form-join").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("input-nombre").value.trim();
    const personajeInput = document.querySelector('input[name="personaje_id"]:checked');
    const error = document.getElementById("error-join");
    error.textContent = "";

    if (!nombre) {
      error.textContent = "Poné tu nombre.";
      return;
    }
    if (!personajeInput) {
      error.textContent = "Elegí un personaje.";
      return;
    }

    try {
      const { player_id } = await unirse(nombre, personajeInput.value);
      localStorage.setItem("player_id", player_id);
      localStorage.setItem("nombre", nombre);
      localStorage.setItem("personaje_id", personajeInput.value);
      await mostrarPantallaJuego(nombre, personajeInput.value);
      conectarWsJugador(player_id);
    } catch (err) {
      error.textContent = err.message;
    }
  });
})();
