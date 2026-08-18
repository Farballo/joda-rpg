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

// mismo tope que LIMITE_RONDAS_ENCARE en game_state.py
const LIMITE_RONDAS_ENCARE = 5;

// mismos presets que usa el DM para juzgar encares y situaciones — acá solo sirven
// para traducir el modificador_dm de vuelta a su etiqueta al mostrar el desglose
const PRESETS_MODIFICADOR_DM = [
  { label: "🔥 Muy bueno", modificador: 4 },
  { label: "🙂 Bueno", modificador: 2 },
  { label: "😐 Normal", modificador: 0 },
  { label: "😬 Flojo", modificador: -2 },
  { label: "💀 Muy malo", modificador: -4 },
];

function etiquetaModificadorDm(modificador) {
  const preset = PRESETS_MODIFICADOR_DM.find((p) => p.modificador === modificador);
  return preset ? preset.label : `${modificador >= 0 ? "+" : ""}${modificador}`;
}

// desglose completo de una tirada: cada dado, el stat con su valor, la debilidad si
// afectó, el nivel de alcohol si afectó, y la decisión del DM si esta tirada pasó por
// el juicio en vivo (encares y situaciones) — para que quede clarísimo de dónde sale
// cada número, no solo el total
function desgloseTiradaHtml(msg) {
  const [d1, d2] = msg.dados_tirados;
  const stat = NOMBRES_STAT[msg.stat] || msg.stat;
  const filas = [`<li>🎲 Dado 1: <b>${d1}</b></li>`, `<li>🎲 Dado 2: <b>${d2}</b></li>`];

  const statBase = msg.stat_base !== undefined && msg.stat_base !== null ? msg.stat_base : msg.stat_valor;
  if (statBase !== undefined && statBase !== null) {
    filas.push(`<li>${stat}: <b>${statBase >= 0 ? "+" : ""}${statBase}</b></li>`);
  }

  if (msg.debilidad_nombre) {
    const mod = msg.debilidad_modificador || 0;
    filas.push(`<li>😵 Debilidad (${msg.debilidad_nombre}): <b>${mod >= 0 ? "+" : ""}${mod}</b></li>`);
  }

  if (msg.debuff_valor) {
    filas.push(`<li>😈 Debuff activo: <b>-${msg.debuff_valor}</b></li>`);
  }

  if (msg.modificador_na) {
    filas.push(`<li>Nivel de Alcohol: <b>${msg.modificador_na >= 0 ? "+" : ""}${msg.modificador_na}</b></li>`);
  }

  if (msg.modificador_dm !== undefined && msg.modificador_dm !== null) {
    filas.push(
      `<li>🎙️ Decisión del DM (${etiquetaModificadorDm(msg.modificador_dm)}): <b>${msg.modificador_dm >= 0 ? "+" : ""}${msg.modificador_dm}</b></li>`
    );
  }

  if (msg.es_ultimate) {
    filas.push(`<li>✨ Ultimate: <b>x2</b></li>`);
  }

  const totalFinal = msg.total_ajustado !== undefined && msg.total_ajustado !== null ? msg.total_ajustado : msg.total;
  filas.push(`<li class="desglose-total">Total: <b>${totalFinal}</b></li>`);

  return `<ul class="desglose-tirada">${filas.join("")}</ul>`;
}

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

function elegirOpcionSituacion(opcion, stat) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "elegir_opcion_situacion", opcion: opcion || null, stat }));
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
    ${desgloseTiradaHtml(msg)}
    ${extra ? `<p>${extra}</p>` : ""}
    <p class="tirada-exito">${exitoTexto}</p>
    <button type="button" id="btn-cerrar-tirada">Cerrar</button>
  `;
  cont.classList.remove("oculto");
  document.getElementById("btn-cerrar-tirada").addEventListener("click", ocultarOverlayTirada);
}

function ocultarOverlayTirada() {
  document.getElementById("tirada-overlay").classList.add("oculto");
}

function renderSituacion(situacion, jugadoresEnMapa) {
  const cont = document.getElementById("situacion-actual");

  if (!situacion) {
    cont.classList.add("oculto");
    return;
  }

  cont.classList.remove("oculto");
  document.getElementById("situacion-titulo").textContent = situacion.titulo;
  document.getElementById("situacion-texto").textContent = situacion.texto;
  document.getElementById("situacion-dificultad").textContent = `🎯 Dificultad ${situacion.dificultad}`;

  const opcionesCont = document.getElementById("situacion-opciones");

  if (situacion.resuelta) {
    const resultadoTexto = situacion.exito ? "✅ Salió bien" : "❌ Salió mal";
    opcionesCont.innerHTML = `<p class="situacion-resuelta">Resuelta por <strong>${situacion.resuelta_por}</strong> — ${resultadoTexto}</p>`;
    return;
  }

  // igual que en un encuentro: alguien ya dijo su frase y el DM todavía no la juzgó —
  // nadie puede elegir opción mientras tanto (server también lo bloquea)
  if (situacion.pendiente) {
    const jugador = (jugadoresEnMapa || []).find((j) => j.player_id === situacion.pendiente.player_id);
    const nombre = jugador ? jugador.nombre : "Alguien";
    opcionesCont.innerHTML = `<p class="encuentro-esperando-dm">🎙️ <strong>${nombre}</strong> ya dijo lo suyo — esperando que el DM lo juzgue...</p>`;
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
    btn.addEventListener("click", () => elegirOpcionSituacion(opcion.texto, opcion.stat));
  });

  document.getElementById("btn-situacion-otro").addEventListener("click", () => {
    document.getElementById("situacion-otro-stats").classList.remove("oculto");
  });

  opcionesCont.querySelectorAll(".btn-opcion-otro").forEach((btn) => {
    btn.addEventListener("click", () => elegirOpcionSituacion(OTRO_OPCION, btn.dataset.stat));
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

// qué se está mostrando del encuentro en pantalla ("<npc_id>:nodo" o "<npc_id>:espera"),
// para no re-renderizarlo en cada `estado` salvo que cambie de verdad
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

// se completa con cada "estado": si ya gastó su ultimate en esta fase, el botón
// queda deshabilitado hasta que el DM avance/retroceda de fase
let ultimateUsadoFase = false;

function actualizarCabeceraBatalla(npc, encuentro) {
  document.getElementById("encuentro-npc-carta").innerHTML = cartaNpcHtml(npc);
  document.getElementById("encuentro-nombre").textContent = npc.nombre;
  document.getElementById("encuentro-apodo").textContent = npc.apodo;

  const hp = encuentro.hp_npc;
  const hpMax = encuentro.hp_npc_max || 1;
  document.getElementById("encuentro-hp-fill").style.width = `${Math.max(0, (hp / hpMax) * 100)}%`;
  document.getElementById("encuentro-hp-label").textContent = `❤️ ${hp} / ${hpMax}`;

  const esLevante = npc.tipo === "levante";
  const valorOMisterio = (v) => (v === null || v === undefined ? "❓" : v);
  document.getElementById("encuentro-npc-stats").innerHTML = `
    <span class="batalla-stat">${esLevante ? "🔥 Hot" : "😵 Locura"} ${valorOMisterio(esLevante ? npc.hot : npc.locura)}</span>
    <span class="batalla-stat">${esLevante ? "💫 Crazy" : "🗿 Dureza"} ${valorOMisterio(esLevante ? npc.crazy : npc.dureza)}</span>
    <span class="batalla-stat">⚔️ Ataque ${npc.ataque}</span>
    <span class="batalla-stat">🛡️ Defensa ${npc.defensa}</span>
  `;

  document.getElementById("encuentro-ronda").textContent =
    `Ronda ${Math.min(encuentro.rondas_jugadas + 1, LIMITE_RONDAS_ENCARE)} / ${LIMITE_RONDAS_ENCARE}`;

  const debuffs = Object.entries(encuentro.debuffs_jugador || {});
  document.getElementById("encuentro-debuffs").innerHTML = debuffs.length
    ? debuffs.map(([stat, valor]) => `<span class="batalla-debuff">${NOMBRES_STAT[stat]} -${valor}</span>`).join("")
    : "";

  if (personajeActual) {
    document.getElementById("encuentro-jugador-carta").innerHTML = cartaMiniHtml(personajeActual);
  }
}

function renderEligiendoAtaque(npc, encuentro) {
  actualizarCabeceraBatalla(npc, encuentro);

  const acciones = document.getElementById("encuentro-actions");
  const botonesAtaque = (personajeActual.ataques || [])
    .map((a, i) => `<button type="button" class="btn-ataque-encare" data-idx="${i}">${a.nombre} <small>(${NOMBRES_STAT[a.stat]})</small></button>`)
    .join("");
  const ultimate = personajeActual.ultimate;

  acciones.innerHTML = `
    ${botonesAtaque}
    <button type="button" id="btn-ataque-ultimate" class="btn-ataque-ultimate" ${ultimateUsadoFase ? "disabled" : ""}
      title="${ultimateUsadoFase ? "Ya usaste tu ultimate en esta fase de la noche" : "Duplica el daño de esta ronda — una sola vez por fase"}">
      ✨ ${ultimate.nombre} <small>(${NOMBRES_STAT[ultimate.stat]})</small>
    </button>`;

  acciones.querySelectorAll(".btn-ataque-encare").forEach((btn) => {
    btn.addEventListener("click", () => elegirAtaqueEncare(npc.id, Number(btn.dataset.idx)));
  });
  document.getElementById("btn-ataque-ultimate").addEventListener("click", () => {
    if (!ultimateUsadoFase) elegirAtaqueEncare(npc.id, "ultimate");
  });
}

/* Entre elegir el ataque y que el DM la resuelva, el jugador dice su frase en voz alta
   en la mesa — el server no necesita saber qué dijo, solo que hay una ronda pendiente. */
function renderEsperandoDm(npc, encuentro) {
  actualizarCabeceraBatalla(npc, encuentro);
  document.getElementById("encuentro-actions").innerHTML = `
    <p class="encuentro-esperando-dm">🎙️ Decilo en voz alta — el DM está evaluando cómo te fue...</p>`;
}

function elegirAtaqueEncare(npcId, ataqueIdx) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "elegir_ataque_encare", npc_id: npcId, ataque_idx: ataqueIdx }));

  const info = ultimosNpcsRevelados[npcId];
  if (info && info.encuentro) {
    encuentroEnPantalla = `${npcId}:espera`;
    renderEsperandoDm(info.encuentro.npc, info.encuentro);
  }
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

  const clave = `${pendiente.npcId}:${pendiente.pendiente ? "espera" : "eligiendo"}`;
  if (clave === encuentroEnPantalla) {
    // el sub-estado no cambió, pero HP/debuffs/ronda pueden haber avanzado igual —
    // se refresca solo la cabecera, sin tocar los botones de acción
    actualizarCabeceraBatalla(pendiente.npc, pendiente);
    return;
  }
  encuentroEnPantalla = clave;

  if (pendiente.pendiente) {
    renderEsperandoDm(pendiente.npc, pendiente);
  } else {
    renderEligiendoAtaque(pendiente.npc, pendiente);
  }
  overlay.classList.remove("oculto");
}

let encareAnimacionId = null;

/* Mismo ritual visual que cualquier otra tirada (tirar_dado, situaciones): un par de
   dados girando un momento antes de revelar el desglose — así el encare no se siente
   distinto al resto solo porque el resultado viene de un mensaje aparte del server. */
function animarDadosEncare(callback) {
  const acciones = document.getElementById("encuentro-actions");
  acciones.innerHTML = `<div class="tirada-dados-rolando" id="encare-dados-animados">🎲 …   🎲 …</div>`;

  let ticks = 0;
  clearInterval(encareAnimacionId);
  encareAnimacionId = setInterval(() => {
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const el = document.getElementById("encare-dados-animados");
    if (el) el.textContent = `🎲 ${d1}   🎲 ${d2}`;
    ticks++;
    if (ticks > 8) {
      clearInterval(encareAnimacionId);
      callback();
    }
  }, 80);
}

function mostrarResultadoEncare(msg) {
  mostrandoResultadoEncuentro = true;

  document.getElementById("encuentro-hp-fill").style.width = `${Math.max(0, (msg.hp_npc / (msg.hp_npc_max || 1)) * 100)}%`;
  document.getElementById("encuentro-hp-label").textContent = `❤️ ${msg.hp_npc} / ${msg.hp_npc_max}`;
  document.getElementById("encuentro-ronda").textContent =
    `Ronda ${Math.min(msg.rondas_jugadas + 1, LIMITE_RONDAS_ENCARE)} / ${LIMITE_RONDAS_ENCARE}`;

  const npc = npcs.find((n) => n.id === msg.npc_id);
  const magnitudDebuff = npc ? npc.ataque : "?";
  const golpeTexto = msg.dano > 0
    ? `💥 <b>${msg.nombre_ataque}</b> le hizo ${msg.dano} de daño${msg.es_ultimate ? " — ¡ultimate!" : ""}.`
    : `🛡️ <b>${msg.nombre_ataque}</b> no le hizo daño esta vez.`;

  const acciones = document.getElementById("encuentro-actions");

  if (!msg.resuelto) {
    const contraataqueTexto = `😈 Contraataca con <b>${msg.nombre_habilidad_npc}</b>: "${msg.texto_habilidad_npc}"
      — ${NOMBRES_STAT[msg.stat_debuffado]} -${magnitudDebuff} el resto del encuentro.`;
    // antes esto avanzaba solo a los 2 segundos; ahora hay que tocar "Continuar" —
    // así cada uno lee el desglose (y la mesa reacciona a la tirada) a su propio ritmo
    acciones.innerHTML = `
      ${desgloseTiradaHtml(msg)}
      <p>${golpeTexto}</p>
      <p>${contraataqueTexto}</p>
      <button type="button" id="btn-continuar-encuentro">Continuar</button>`;
    document.getElementById("btn-continuar-encuentro").addEventListener("click", () => {
      mostrandoResultadoEncuentro = false;
      const info = ultimosNpcsRevelados[msg.npc_id];
      if (info && info.encuentro) {
        encuentroEnPantalla = `${msg.npc_id}:eligiendo`;
        renderEligiendoAtaque(info.encuentro.npc, info.encuentro);
      }
    });
    return;
  }

  const exitoTexto = msg.exito ? "✅ ¡Lo conquistaste!" : "❌ No lo lograste a tiempo.";
  acciones.innerHTML = `
    ${desgloseTiradaHtml(msg)}
    <p>${golpeTexto}</p>
    <p>${exitoTexto}</p>
    ${msg.exito ? `<p class="lindura-valor">🏆 +${msg.puntaje} puntos</p>` : ""}
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

// null = todavía no sabemos si la partida arrancó; se completa con el primer "estado"
let partidaIniciadaConocida = null;
let yaEntroAlJuego = false;

function conectarWsJugador(playerId) {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/player/${playerId}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "estado") {
      if (!yaEntroAlJuego) {
        const antesIniciada = partidaIniciadaConocida;
        partidaIniciadaConocida = msg.partida_iniciada;

        if (!partidaIniciadaConocida) {
          mostrarVistaEsperandoInicio();
        } else {
          yaEntroAlJuego = true;
          if (antesIniciada === false) {
            // veníamos esperando en la pantalla anterior y el DM la arrancó ahora
            reproducirComienzoDeNoche();
          } else {
            // ya estaba iniciada desde que nos conectamos (nos unimos tarde, o
            // recargamos la página en medio de la partida) — directo al juego, sin
            // la animación de arranque
            mostrarVistaJuego();
          }
        }
      }

      actualizarNa(msg.na);
      renderPrendas(msg.prendas);
      renderModoCaos(msg.modo_caos_activo);
      renderDebilidad(msg.debilidad_activa);
      ultimateUsadoFase = msg.ultimate_usado_fase;
      renderSituacion(msg.situacion_actual, msg.jugadores_en_mapa);
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
      mostrandoResultadoEncuentro = true;
      animarDadosEncare(() => mostrarResultadoEncare(msg));
    }
    if (msg.type === "resultado_situacion") {
      // la espera (el DM juzgando) ya se mostró in-line en la card de la situación;
      // acá recién arranca el ritual de la tirada, breve, y después el resultado
      mostrarOverlayTirada();
      setTimeout(() => mostrarResultadoSituacion(msg), 700);
    }
    if (msg.type === "error") {
      clearInterval(tiradaAnimacionId);
      ocultarOverlayTirada();
      alert(msg.detail);
    }
    if (msg.type === "narracion") {
      mostrarNarracion(msg.texto);
    }
    if (msg.type === "cerrar_intro") {
      cerrarIntro();
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

const TEXTO_INTRO_NOCHE =
  "🌙 Arrancó la noche. A partir de acá el DM va a ir marcando situaciones y NPCs — vos tirás los dados y decidís cómo salir de cada una. Che, avisale a los demás si alguno todavía no la vio. ¡Que la suerte (o el chamuyo) te acompañe!";

/** Todo lo que hay que tener listo antes de mostrar cualquier pantalla del juego
 * (carta propia, prendas, npcs) — corre una sola vez, sea cual sea la pantalla que
 * termine viéndose (espera de inicio o el juego directamente). */
async function prepararJugador(nombre, personajeId) {
  document.getElementById("pantalla-join").classList.add("oculto");
  document.getElementById("nombre-confirmado").textContent = nombre;

  personajeActual = personajes.find((p) => p.id === personajeId);
  renderMiCarta(personajeActual);
  document.getElementById("esperando-inicio-carta").innerHTML = personajeActual ? cartaThumbHtml(personajeActual) : "";
  await cargarPrendas();
  await cargarNpcs();
}

function mostrarVistaEsperandoInicio() {
  document.getElementById("pantalla-espera").classList.add("oculto");
  document.getElementById("pantalla-esperando-inicio").classList.remove("oculto");
}

function mostrarVistaJuego() {
  document.getElementById("pantalla-esperando-inicio").classList.add("oculto");
  document.getElementById("pantalla-espera").classList.remove("oculto");
}

/** El DM acaba de arrancar la partida mientras esperábamos: 2 segundos de "Comenzando
 * la noche" y después la tarjeta de introducción, antes de entrar al juego de verdad. */
function reproducirComienzoDeNoche() {
  mostrarVistaJuego();
  document.getElementById("comenzando-overlay").classList.remove("oculto");
  setTimeout(() => {
    document.getElementById("comenzando-overlay").classList.add("oculto");
    mostrarIntro();
  }, 2000);
}

function mostrarIntro() {
  document.getElementById("intro-texto").textContent = TEXTO_INTRO_NOCHE;
  document.getElementById("intro-overlay").classList.remove("oculto");
}

function cerrarIntro() {
  document.getElementById("intro-overlay").classList.add("oculto");
}

(async function init() {
  document.getElementById("btn-toggle-mapa").addEventListener("click", (e) => {
    const vistaMapa = document.getElementById("vista-mapa");
    const abrir = vistaMapa.classList.contains("oculto");
    vistaMapa.classList.toggle("oculto", !abrir);
    e.target.textContent = abrir ? "← Volver a la partida" : "🗺️ ¿Qué está pasando?";
  });

  document.getElementById("btn-salir-partida").addEventListener("click", salirDePartida);
  document.getElementById("btn-salir-espera").addEventListener("click", salirDePartida);

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

  document.getElementById("btn-cerrar-intro").addEventListener("click", cerrarIntro);

  personajes = await cargarPersonajes();
  await cargarCartas();
  await cargarCartasNpc();

  const playerIdGuardado = localStorage.getItem("player_id");
  const nombreGuardado = localStorage.getItem("nombre");
  const personajeIdGuardado = localStorage.getItem("personaje_id");

  if (playerIdGuardado && nombreGuardado && personajeIdGuardado) {
    await prepararJugador(nombreGuardado, personajeIdGuardado);
    mostrarVistaEsperandoInicio(); // por defecto, hasta que el primer "estado" diga otra cosa
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

      await prepararJugador(nombre, personaje.id);
      mostrarVistaEsperandoInicio(); // por defecto, debajo del reveal, hasta que sepamos si ya arrancó
      // el reveal de la carta tapa todo (z-index alto): no importa el orden entre
      // esto y que llegue el primer "estado" por WS, nunca se ve la pantalla de abajo
      // hasta que el jugador toca "Entrar a la noche"
      mostrarReveal(personaje, () => {});
      conectarWsJugador(player_id);
    } catch (err) {
      error.textContent = err.message;
    }
  });
})();
