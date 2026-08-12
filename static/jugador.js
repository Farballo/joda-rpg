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

const NOMBRES_FASE = { previa: "Previa", boliche: "Boliche", after: "After", terminado: "Terminado" };

let ws = null;
let prendas = [];
let mapa = {};
let npcs = [];
let personajeActual = null;

async function cargarPersonajes() {
  const res = await fetch("/data/personajes.json");
  return res.json();
}

async function cargarPrendas() {
  const res = await fetch("/data/prendas.json");
  prendas = await res.json();
}

async function cargarMapa() {
  const res = await fetch("/data/mapa.json");
  mapa = await res.json();
}

async function cargarNpcs() {
  const res = await fetch("/data/npcs.json");
  npcs = await res.json();
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

function resolverPrenda(prendaId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "resolver_prenda", prenda_id: Number(prendaId) }));
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
        <button type="button" class="btn-resolver-prenda" data-prenda="${id}">Ya la cumplí — Resolver</button>
      </div>`;
    })
    .join("");

  cont.querySelectorAll(".btn-resolver-prenda").forEach((btn) => {
    btn.addEventListener("click", () => resolverPrenda(btn.dataset.prenda));
  });
}

function renderMapaJugador(fase, jugadoresEnMapa, npcsRevelados, miPlayerId) {
  document.getElementById("mapa-fase-nombre").textContent = NOMBRES_FASE[fase] || fase;

  const cont = document.getElementById("mapa-zonas-jugador");
  const zonasFase = mapa[fase] || [];

  if (!zonasFase.length) {
    cont.innerHTML = "<p>Sin mapa para esta fase.</p>";
    return;
  }

  cont.innerHTML = zonasFase
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

function mostrarCartaNpc(npc) {
  document.getElementById("npc-card-avatar").textContent = npc.avatar;
  document.getElementById("npc-card-nombre").textContent = npc.nombre;
  document.getElementById("npc-card-apodo").textContent = npc.apodo;
  document.getElementById("npc-card-frase").textContent = `"${npc.frase_reveal}"`;
  document.getElementById("npc-card-overlay").classList.remove("oculto");
}

function ocultarCartaNpc() {
  document.getElementById("npc-card-overlay").classList.add("oculto");
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
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      renderMapaJugador(msg.fase, msg.jugadores_en_mapa, msg.npcs_revelados, playerId);
    }
    if (msg.type === "npc_revelado") {
      mostrarCartaNpc(msg.npc);
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
  personajeActual = personajes.find((p) => p.id === personajeId);
  renderStats(personajeActual);
  await cargarPrendas();
  await cargarMapa();
  await cargarNpcs();
}

(async function init() {
  document.getElementById("btn-toggle-mapa").addEventListener("click", () => {
    document.getElementById("vista-mapa").classList.remove("oculto");
  });

  document.getElementById("btn-cerrar-mapa").addEventListener("click", () => {
    document.getElementById("vista-mapa").classList.add("oculto");
  });

  document.getElementById("btn-npc-hablar").addEventListener("click", ocultarCartaNpc);
  document.getElementById("btn-npc-ignorar").addEventListener("click", ocultarCartaNpc);

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
