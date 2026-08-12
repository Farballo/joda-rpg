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

function tirarDado(stat, contexto) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "tirar_dado", stat, contexto: contexto || null }));
}

function mostrarResultado(msg) {
  const cont = document.getElementById("resultado-tirada");
  const texto = document.getElementById("resultado-texto");
  const extra = TEXTO_TIPO[msg.tipo] || "";
  const prefijo = msg.contexto ? `${msg.contexto} — ` : "";
  texto.innerHTML = `
    ${prefijo}${NOMBRES_STAT[msg.stat]}: sacaste ${msg.dados_tirados[0]} + ${msg.dados_tirados[1]} → total ${msg.total}
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
  if (situacion.opciones && situacion.opciones.length) {
    opcionesCont.innerHTML = situacion.opciones
      .map(
        (op, i) =>
          `<button type="button" class="btn-stat btn-opcion-situacion" data-stat="${op.stat}" data-idx="${i}">${op.texto} (${NOMBRES_STAT[op.stat]})</button>`
      )
      .join("");
    opcionesCont.querySelectorAll(".btn-opcion-situacion").forEach((btn) => {
      const opcion = situacion.opciones[Number(btn.dataset.idx)];
      btn.addEventListener("click", () => tirarDado(opcion.stat, opcion.texto));
    });
  } else {
    opcionesCont.innerHTML = "";
  }
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

function intentarLevante(npcId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "intentar_levante", npc_id: npcId }));
}

function intentarConfrontacion(npcId, stat) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "intentar_confrontacion", npc_id: npcId, stat }));
}

function renderAccionesNpc(npc) {
  const lindura = document.getElementById("npc-card-lindura");
  const acciones = document.getElementById("npc-card-actions");
  lindura.innerHTML = "";

  if (npc.tipo === "levante") {
    lindura.innerHTML =
      npc.puntaje_lindura === null || npc.puntaje_lindura === undefined
        ? `<p class="lindura-misterio">❓ No se ve bien quién es...</p>`
        : `<p class="lindura-valor">Atractivo: ${npc.puntaje_lindura} / 10</p>`;
    acciones.innerHTML = `
      <button type="button" id="btn-intentar-levante">Intentar chamuyo</button>
      <button type="button" id="btn-npc-ignorar">Ignorar</button>`;
    document.getElementById("btn-intentar-levante").addEventListener("click", () => intentarLevante(npc.id));
    document.getElementById("btn-npc-ignorar").addEventListener("click", ocultarCartaNpc);
  } else if (npc.tipo === "confrontacion") {
    acciones.innerHTML =
      npc.opciones.map((op, i) => `<button type="button" class="btn-opcion-confrontacion" data-idx="${i}">${op.texto}</button>`).join("") +
      `<button type="button" id="btn-npc-ignorar">Ignorar</button>`;
    acciones.querySelectorAll(".btn-opcion-confrontacion").forEach((btn) => {
      const opcion = npc.opciones[Number(btn.dataset.idx)];
      btn.addEventListener("click", () => intentarConfrontacion(npc.id, opcion.stat));
    });
    document.getElementById("btn-npc-ignorar").addEventListener("click", ocultarCartaNpc);
  } else {
    acciones.innerHTML = `
      <button type="button" id="btn-npc-hablar">Hablar</button>
      <button type="button" id="btn-npc-ignorar">Ignorar</button>`;
    document.getElementById("btn-npc-hablar").addEventListener("click", ocultarCartaNpc);
    document.getElementById("btn-npc-ignorar").addEventListener("click", ocultarCartaNpc);
  }
}

function mostrarCartaNpc(npc) {
  document.getElementById("npc-card-avatar").textContent = npc.avatar;
  document.getElementById("npc-card-nombre").textContent = npc.nombre;
  document.getElementById("npc-card-apodo").textContent = npc.apodo;
  document.getElementById("npc-card-frase").textContent = `"${npc.frase_reveal}"`;
  renderAccionesNpc(npc);
  document.getElementById("npc-card-overlay").classList.remove("oculto");
}

function mostrarResultadoLevante(msg) {
  document.getElementById("npc-card-lindura").innerHTML = `<p class="lindura-valor">Atractivo real: ${msg.puntaje_lindura} / 10</p>`;
  const texto = msg.exito ? "¡Le gustaste! 🎉" : "No hubo onda esta vez...";
  document.getElementById("npc-card-actions").innerHTML = `
    <p>${texto}<br>Sacaste ${msg.dados_tirados[0]} + ${msg.dados_tirados[1]}, total ${msg.total}.</p>
    <button type="button" id="btn-cerrar-resultado">Cerrar</button>`;
  document.getElementById("btn-cerrar-resultado").addEventListener("click", ocultarCartaNpc);
}

function mostrarResultadoConfrontacion(msg) {
  document.getElementById("npc-card-actions").innerHTML = `
    <p>Tirada de ${NOMBRES_STAT[msg.stat]}: ${msg.dados_tirados[0]} + ${msg.dados_tirados[1]}, total ${msg.total}.<br>El DM decide qué pasa.</p>
    <button type="button" id="btn-cerrar-resultado">Cerrar</button>`;
  document.getElementById("btn-cerrar-resultado").addEventListener("click", ocultarCartaNpc);
}

function ocultarCartaNpc() {
  document.getElementById("npc-card-overlay").classList.add("oculto");
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
      renderSituacion(msg.situacion_actual);
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      renderMapaJugador(msg.mapa_actual, msg.jugadores_en_mapa, msg.npcs_revelados, playerId);
    }
    if (msg.type === "npc_revelado") {
      mostrarCartaNpc(msg.npc);
    }
    if (msg.type === "resultado_levante") {
      mostrarResultadoLevante(msg);
    }
    if (msg.type === "resultado_confrontacion") {
      mostrarResultadoConfrontacion(msg);
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
  document.getElementById("form-join").classList.add("oculto");
  document.getElementById("pantalla-espera").classList.remove("oculto");
  document.getElementById("nombre-confirmado").textContent = nombre;

  const personajes = await cargarPersonajes();
  personajeActual = personajes.find((p) => p.id === personajeId);
  renderStats(personajeActual);
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
