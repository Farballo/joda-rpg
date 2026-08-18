const NOMBRES_NA = [
  "Sobrio", "Sobrio",
  "Alegre", "Alegre",
  "Picante", "Picante",
  "Modo Caos", "Modo Caos",
  "Irrecuperable", "Irrecuperable",
  "Leyenda Urbana",
];
const NA_MAX = 10;

// tramo visual (borde/barra del riel) por valor de NA, en paralelo a NOMBRES_NA
const TRAMOS_NA = [
  "sobrio", "sobrio",
  "alegre", "alegre",
  "picante", "picante",
  "caos", "caos",
  "irrecuperable", "irrecuperable",
  "leyenda",
];

const NOMBRES_FASE = { previa: "Previa", boliche: "Boliche", after: "After", terminado: "Terminado" };
const ORDEN_FASES = ["previa", "boliche", "after"];

const NOMBRES_STAT = { carisma: "Carisma", aguante: "Aguante", astucia: "Astucia", suerte: "Suerte" };

// mismo texto que OTRO_OPCION en game_state.py / jugador.js — la opción libre de una
// situación, donde el DM le dice al jugador qué stat tirar en voz alta
const OTRO_OPCION_SITUACION = "Otro (decide DM)";

// presets rápidos para juzgar en vivo lo que dijo el jugador: el modificador se suma
// directo a esa tirada (bonus si estuvo bueno, malus si estuvo flojo). Se usa tanto
// para rondas de encare como para situaciones de fase — mismo mecanismo en los dos.
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

// mismo tope que LIMITE_RONDAS_ENCARE en game_state.py
const LIMITE_RONDAS_ENCARE = 5;

// selección en curso del DM para resolver la ronda pendiente de un encare: no se manda
// nada al server hasta tocar "Resolver ronda" — viven acá afuera del DOM porque
// #encuentro-en-curso se re-renderiza entero en cada estado_completo (mismo patrón que
// menuJugadorAbierto/eventoConfigAbierto más abajo)
let modificadorDmSeleccionado = null;
let habilidadNpcSeleccionada = null; // 0-2, "libre", o null
let textoLibreHabilidad = "";
let statLibreHabilidad = "carisma";

// último estado_completo recibido, para poder re-renderizar #encuentro-en-curso sin
// esperar al próximo mensaje del server (ej. al abrir el form de habilidad "libre")
let ultimoNpcsRevelados = {};
let ultimoJugadoresDm = {};

let personajes = [];
let prendas = [];
let eventos = {};
let mapa = {};
let npcs = [];
let ws = null;
let eventosHabilitadosActual = {};
// host que se les pasa a los jugadores para conectarse desde otro dispositivo
// (IP en la wifi local, no "localhost" — ver EJECUTAR_EN_OTRA_PC.md sección 5).
// Si el fetch a /api/ip falla por lo que sea, cae de vuelta a location.host.
let hostParaJugadores = location.host;

// id del jugador cuyo menú (prendas / mover) está abierto en el riel, si hay alguno.
// El riel se re-renderiza entero en cada estado_completo, así que guardamos esto
// afuera del DOM para poder reabrirlo después de cada render.
let menuJugadorAbierto = null;

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

async function cargarIpLan() {
  try {
    const res = await fetch("/api/ip");
    if (!res.ok) throw new Error(`/api/ip respondió ${res.status}`);
    const { ip } = await res.json();
    if (!ip) throw new Error("/api/ip no devolvió una ip");
    const puerto = location.port ? `:${location.port}` : "";
    hostParaJugadores = `${ip}${puerto}`;
  } catch (err) {
    // sin red, o el endpoint no respondió — se queda con location.host
    console.warn("No se pudo obtener la IP de LAN, mostrando location.host:", err);
  }
  document.getElementById("config-url-jugador").textContent = `${hostParaJugadores}/jugador`;
}

function nombrePersonaje(personajeId) {
  const p = personajes.find((p) => p.id === personajeId);
  return p ? p.nombre : personajeId;
}

function nombrePrenda(prendaId) {
  const p = prendas.find((p) => p.id === prendaId);
  return p ? p.nombre : `#${prendaId}`;
}

function efectoPrenda(prendaId) {
  const p = prendas.find((p) => p.id === prendaId);
  return p ? p.efecto : "";
}

function jugadorEnEncuentro(playerId, npcsRevelados) {
  const enCurso = encuentroEnCurso(npcsRevelados);
  return enCurso !== null && enCurso.jugador_objetivo === playerId;
}

// NA de cada jugador la última vez que renderizamos, para poder animar solo el
// número que cambió (y no todos los del riel) en cada re-render
const naAnteriorPorJugador = {};

function renderJugadores(jugadores, mapaActual, npcsRevelados) {
  const riel = document.getElementById("riel-jugadores");
  const ids = Object.keys(jugadores);

  if (ids.length === 0) {
    riel.innerHTML = "<p class='dm-hint'>Todavía no se unió nadie.</p>";
    return;
  }

  const zonasFase = mapaActual.zonas || [];

  riel.innerHTML = ids
    .map((id) => {
      const j = jugadores[id];
      const tramo = TRAMOS_NA[j.na];
      const pct = (j.na / NA_MAX) * 100;
      const naCambio = id in naAnteriorPorJugador && naAnteriorPorJugador[id] !== j.na;
      naAnteriorPorJugador[id] = j.na;
      const personaje = personajes.find((p) => p.id === j.personaje_id);
      const debilidadNombre = personaje ? personaje.debilidad.nombre : "Debilidad";
      const cartaHtml = personaje ? cartaMiniHtml(personaje) : "";
      const zonaActual = zonasFase.find((z) => z.id === j.zona_actual);

      const prendasMenuHtml = j.prendas_activas.length
        ? j.prendas_activas
            .map(
              (pid) => `
              <div class="prenda-chip" title="${efectoPrenda(pid)}">
                ${nombrePrenda(pid)}
                <button data-action="resolver-prenda" data-player="${id}" data-prenda="${pid}" title="Sacarle esta prenda a ${j.nombre}">✕</button>
              </div>`
            )
            .join("")
        : `<p class="dm-hint" style="margin:0">Sin prenda.</p>`;

      const opcionesPrenda = prendas.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
      const opcionesZona = zonasFase
        .map((z) => `<option value="${z.id}" ${z.id === j.zona_actual ? "selected" : ""}>${z.emoji} ${z.nombre}</option>`)
        .join("");

      const badgesHtml = [
        jugadorEnEncuentro(id, npcsRevelados) ? `<span class="badge badge-turno">⏳ Encuentro</span>` : "",
        j.modo_caos_activo ? `<span class="badge badge-caos">🔥 Caos</span>` : "",
        j.debilidad_activa ? `<span class="badge badge-debil">😵 ${debilidadNombre}</span>` : "",
        j.prendas_activas.length ? `<span class="badge badge-prenda">🍺 ${j.prendas_activas.length}</span>` : "",
        zonaActual ? `<span class="badge badge-zona">${zonaActual.emoji} ${zonaActual.nombre}</span>` : "",
      ].join("");

      const debilidadBtnHtml = j.debilidad_activa
        ? `<button data-action="toggle-debilidad" data-player="${id}" data-activa="true" class="btn-activo" title="Desactivar la debilidad activa: ${debilidadNombre}"><span class="btn-icon">😵</span><span class="btn-label">Debilidad</span></button>`
        : `<button data-action="toggle-debilidad" data-player="${id}" data-activa="false" title="Activar la debilidad de ${j.nombre} (${debilidadNombre})"><span class="btn-icon">😌</span><span class="btn-label">Debilidad</span></button>`;

      return `
      <article class="jugador" data-tramo="${tramo}">
        <div class="jugador-menu" data-menu="${id}" data-abierto="${menuJugadorAbierto === id}">
          <div class="jugador-menu-titulo">Prendas activas</div>
          ${prendasMenuHtml}
          <select class="select-prenda" data-player="${id}" title="Elegí una prenda o dejá &quot;al azar&quot;">
            <option value="">🎲 Prenda al azar</option>
            ${opcionesPrenda}
          </select>
          <button class="btn-primario" data-action="repartir-prenda" data-player="${id}" title="Confirmar y repartir la prenda elegida">Repartir prenda</button>
          <div class="jugador-menu-titulo" style="margin-top:0.2rem">Mover a</div>
          <select class="select-zona" data-player="${id}" title="Mueve a ${j.nombre} apenas elegís la zona, sin botón de confirmar">${opcionesZona}</select>
        </div>

        <div class="jugador-head">
          <div class="jugador-carta">${cartaHtml}</div>
          <div>
            <div class="jugador-nombre">${j.nombre}</div>
            <div class="jugador-personaje">${nombrePersonaje(j.personaje_id)}</div>
            <div class="na-linea"><span class="na-valor${naCambio ? " na-valor-pop" : ""}">NA ${j.na} / ${NA_MAX}</span><span class="na-nombre">${NOMBRES_NA[j.na]}</span></div>
            <div class="na-barra"><div class="na-fill-v2${naCambio ? " na-fill-pop" : ""}" data-tramo="${tramo}" style="width:${pct}%"></div></div>
          </div>
        </div>

        <div class="badges">${badgesHtml}</div>

        <div class="jugador-controles">
          <div class="jugador-controles-fila">
            <button class="btn-na" data-action="menos" data-player="${id}" title="Bajar 1 Nivel de Alcohol a ${j.nombre}" ${j.na <= 0 ? "disabled" : ""}>−1 <span class="btn-label">NA</span></button>
            <button class="btn-na btn-na-mas" data-action="mas" data-player="${id}" title="Subir 1 Nivel de Alcohol a ${j.nombre}" ${j.na >= NA_MAX ? "disabled" : ""}>+1 <span class="btn-label">NA</span></button>
          </div>
          <div class="jugador-controles-fila">
            <button data-abre="${id}" title="Repartirle o sacarle una prenda a ${j.nombre}"><span class="btn-icon">🍺</span><span class="btn-label">Prendas</span></button>
            <button data-abre="${id}" title="Mover a ${j.nombre} de zona"><span class="btn-icon">📍</span><span class="btn-label">Mover</span></button>
            ${debilidadBtnHtml}
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function nombreNpc(npcId) {
  const n = npcs.find((n) => n.id === npcId);
  return n ? `${n.avatar} ${n.nombre}` : npcId;
}

function renderMapaVisual(jugadores, mapaActual, npcsRevelados, fase) {
  const cont = document.getElementById("mapa-visual");
  const nombreEl = document.getElementById("mapa-nombre-actual");
  const zonas = mapaActual.zonas || [];

  nombreEl.innerHTML = `🗺️ ${mapaActual.nombre || ""} <small>${NOMBRES_FASE[fase] || ""}</small>`;
  document.getElementById("pill-mapa-resumen").textContent =
    `${zonas.length} zonas · ${Object.keys(jugadores).length} jugadores · ${Object.keys(npcsRevelados || {}).length} NPCs`;

  if (!zonas.length) {
    cont.innerHTML = "<p>Sin mapa para esta fase.</p>";
    return;
  }

  cont.innerHTML = zonas
    .map((z) => {
      const jugadoresEnZona = Object.values(jugadores).filter((j) => j.zona_actual === z.id);
      const npcsEnZona = Object.entries(npcsRevelados).filter(([, info]) => info.zona === z.id);

      const tokensJugadorHtml = jugadoresEnZona
        .map((j) => {
          const personaje = personajes.find((p) => p.id === j.personaje_id);
          const avatarHtml = personaje ? cartaThumbHtml(personaje) : "";
          return `<span class="mapa-token mapa-token-jugador">${avatarHtml}${j.nombre}</span>`;
        })
        .join("");

      const tokensNpcHtml = npcsEnZona
        .map(([npcId, info]) => {
          const npc = npcs.find((n) => n.id === npcId);
          const enCurso = info.encuentro && !info.encuentro.resuelto;
          const claseNpc = enCurso
            ? "mapa-token-npc-encuentro"
            : npc && npc.importancia === "importante"
              ? "mapa-token-npc mapa-token-npc-importante"
              : "mapa-token-npc";
          return `<span class="mapa-token ${claseNpc}">${enCurso ? "⏳ " : ""}${npc ? npc.avatar : "❓"} ${npc ? npc.nombre : npcId}</span>`;
        })
        .join("");

      const pos = z.pos || { left: 0, top: 0, width: 30, height: 30 };
      const estilo = `left:${pos.left}%; top:${pos.top}%; width:${pos.width}%; height:${pos.height}%;`;

      return `
      <div class="mapa-zona" style="${estilo}">
        <div class="mapa-zona-nombre">${z.emoji} ${z.nombre}</div>
        <div class="mapa-zona-tokens">${tokensJugadorHtml}${tokensNpcHtml}</div>
      </div>`;
    })
    .join("");
}

const TIPOS_ENCUENTRO = ["levante", "confrontacion"];
const ETIQUETA_TIPO = { ambiente: "🎭 ambiente", levante: "💘 levante", confrontacion: "😤 confrontación" };

function esDeEncuentro(npc) {
  return npc && TIPOS_ENCUENTRO.includes(npc.tipo);
}

/** El encuentro sin resolver, si hay alguno: bloquea iniciar cualquier otro (bloqueo global). */
function encuentroEnCurso(npcsRevelados) {
  const entrada = Object.entries(npcsRevelados || {}).find(
    ([, info]) => info.encuentro && !info.encuentro.resuelto
  );
  return entrada ? { npcId: entrada[0], ...entrada[1].encuentro } : null;
}

function renderFormularioNpc(fase, mapaActual, npcsRevelados) {
  const selectNpc = document.getElementById("select-npc");
  const selectZona = document.getElementById("select-zona-npc");
  // el mazo completo de la fase, sin distinguir tipo: revelar es un solo paso para todos
  const disponibles = npcs.filter((n) => n.fase === fase && !(n.id in npcsRevelados));
  const zonas = mapaActual.zonas || [];

  selectNpc.innerHTML = disponibles.length
    ? disponibles
        .map((n) => `<option value="${n.id}">${n.avatar} ${n.nombre} — ${ETIQUETA_TIPO[n.tipo] || n.tipo}</option>`)
        .join("")
    : `<option value="">Ya revelaste todos los NPCs de esta fase</option>`;

  selectNpc.disabled = !disponibles.length;
  document.getElementById("btn-revelar-npc").disabled = !disponibles.length;

  selectZona.innerHTML = zonas.map((z) => `<option value="${z.id}">${z.emoji} ${z.nombre}</option>`).join("");

  document.getElementById("pill-npcs-mazo").textContent = `mazo de ${NOMBRES_FASE[fase]} · ${disponibles.length} quedan`;
}

function renderEncuentroEnCurso(npcsRevelados, jugadores) {
  const cont = document.getElementById("encuentro-en-curso");
  const enCurso = encuentroEnCurso(npcsRevelados);

  if (!enCurso) {
    cont.innerHTML = "";
    modificadorDmSeleccionado = null;
    habilidadNpcSeleccionada = null;
    return;
  }

  if (enCurso.npcId !== ultimoNpcEnCursoId) {
    modificadorDmSeleccionado = null;
    habilidadNpcSeleccionada = null;
  }

  const npc = npcs.find((n) => n.id === enCurso.npcId);
  const jugador = jugadores[enCurso.jugador_objetivo];
  const personajeJugador = jugador ? personajes.find((p) => p.id === jugador.personaje_id) : null;
  const nombreNpc = npc ? `${npc.avatar} ${npc.nombre}` : enCurso.npcId;
  const nombreJugador = jugador ? jugador.nombre : "?";

  const hp = enCurso.hp_npc;
  const hpMax = enCurso.hp_npc_max || 1;
  const debuffs = Object.entries(enCurso.debuffs_jugador || {});
  const debuffsHtml = debuffs.length
    ? debuffs.map(([stat, valor]) => `<span class="batalla-debuff">${NOMBRES_STAT[stat]} -${valor}</span>`).join("")
    : `<span class="dm-hint" style="margin:0">Sin debuffs activos.</span>`;

  const cabeceraHtml = `
    <div class="batalla-dm-cabecera">
      <div class="batalla-dm-carta">${npc ? cartaNpcHtml(npc) : ""}</div>
      <div class="batalla-dm-info">
        <div class="batalla-dm-vs"><b>${nombreNpc}</b> vs <b>${nombreJugador}</b></div>
        <div class="batalla-hp-barra"><div class="batalla-hp-fill" style="width:${Math.max(0, (hp / hpMax) * 100)}%"></div></div>
        <div class="batalla-hp-label">❤️ ${hp} / ${hpMax}</div>
        <span class="batalla-ronda">Ronda ${Math.min(enCurso.rondas_jugadas + 1, LIMITE_RONDAS_ENCARE)} / ${LIMITE_RONDAS_ENCARE}</span>
        <div class="batalla-debuffs">${debuffsHtml}</div>
      </div>
      <div class="batalla-dm-carta batalla-dm-carta-jugador">${personajeJugador ? cartaMiniHtml(personajeJugador) : ""}</div>
    </div>`;

  if (!enCurso.pendiente) {
    cont.innerHTML = `
      ${cabeceraHtml}
      <div class="banner-encuentro">
        <span style="font-size:1.1rem">⏳</span>
        <div>
          Esperando que <b>${nombreJugador}</b> elija un ataque contra <b>${nombreNpc}</b>.
          <small>Hasta que tire (o saques al NPC de escena) no se puede arrancar otro encuentro.</small>
        </div>
      </div>`;
    return;
  }

  const statTxt = NOMBRES_STAT[enCurso.pendiente.stat] || enCurso.pendiente.stat;
  const botonesModHtml = PRESETS_MODIFICADOR_DM.map(
    (p) => `
    <button type="button" class="btn-mod-dm${modificadorDmSeleccionado === p.modificador ? " btn-seleccionado" : ""}"
      data-action="elegir-modificador-dm" data-modificador="${p.modificador}">
      ${p.label} (${p.modificador > 0 ? "+" : ""}${p.modificador})
    </button>`
  ).join("");

  const habilidadesHtml = (npc ? npc.habilidades : []).map(
    (h, i) => `
    <button type="button" class="btn-habilidad-npc${habilidadNpcSeleccionada === i ? " btn-seleccionado" : ""}"
      data-action="elegir-habilidad-npc" data-idx="${i}" title="${esc(h.texto)}">
      ${h.nombre} <small>(${NOMBRES_STAT[h.stat_objetivo]})</small>
    </button>`
  ).join("");

  const libreSeleccionada = habilidadNpcSeleccionada === "libre";
  const formLibreHtml = libreSeleccionada
    ? `
      <div class="batalla-libre-form">
        <input type="text" id="input-texto-libre-habilidad" placeholder="Qué hace o dice el NPC" value="${esc(textoLibreHabilidad)}">
        <select id="select-stat-libre-habilidad">
          ${Object.keys(NOMBRES_STAT).map((s) => `<option value="${s}" ${statLibreHabilidad === s ? "selected" : ""}>${NOMBRES_STAT[s]}</option>`).join("")}
        </select>
      </div>`
    : "";

  const puedeResolver = modificadorDmSeleccionado !== null && habilidadNpcSeleccionada !== null;

  cont.innerHTML = `
    ${cabeceraHtml}
    <div class="banner-encuentro banner-encuentro-pendiente">
      <span style="font-size:1.1rem">🎙️</span>
      <div>
        <b>${nombreJugador}</b> ya tiró su frase (va a tirar ${statTxt}).
        <small>¿Cómo estuvo?</small>
        <div class="encuentro-dificultad-botones">${botonesModHtml}</div>
        <small>¿Con qué contraataca ${npc ? npc.nombre : "el NPC"}?</small>
        <div class="encuentro-dificultad-botones">
          ${habilidadesHtml}
          <button type="button" class="btn-habilidad-npc${libreSeleccionada ? " btn-seleccionado" : ""}"
            data-action="elegir-habilidad-npc" data-idx="libre">🎭 Libre</button>
        </div>
        ${formLibreHtml}
        <button type="button" class="btn-primario" id="btn-resolver-ronda-encare" data-npc="${enCurso.npcId}" ${puedeResolver ? "" : "disabled"}>
          🎲 Resolver ronda
        </button>
      </div>
    </div>`;
}

// id del NPC que estaba en curso la última vez que renderizamos — para animar solo
// la fila que recién arrancó su encuentro, no todas en cada re-render
let ultimoNpcEnCursoId = undefined;

function renderNpcsRevelados(npcsRevelados, jugadores, mapaActual) {
  const cont = document.getElementById("lista-npcs-revelados");
  const entradas = Object.entries(npcsRevelados || {});

  document.getElementById("pill-npcs-escena").textContent = `${entradas.length} NPCs`;

  if (!entradas.length) {
    cont.innerHTML = "<p class='dm-hint'>Todavía no revelaste ningún NPC.</p>";
    return;
  }

  const zonas = mapaActual.zonas || [];
  const enCurso = encuentroEnCurso(npcsRevelados);
  const hayEncuentro = enCurso !== null;
  const npcIdEnCurso = enCurso ? enCurso.npcId : null;
  const esEncuentroNuevo = ultimoNpcEnCursoId !== undefined && npcIdEnCurso !== null && npcIdEnCurso !== ultimoNpcEnCursoId;
  ultimoNpcEnCursoId = npcIdEnCurso;
  const idsJugadores = Object.keys(jugadores);
  const opcionesJugador = idsJugadores
    .map((id) => `<option value="${id}">${jugadores[id].nombre}</option>`)
    .join("");

  cont.innerHTML = entradas
    .map(([npcId, info]) => {
      const npc = npcs.find((n) => n.id === npcId);
      const zona = zonas.find((z) => z.id === info.zona);
      const encuentro = info.encuentro;
      const objetivo = encuentro ? jugadores[encuentro.jugador_objetivo] : null;
      const enCursoEsteNpc = encuentro && !encuentro.resuelto;
      const puedeAsignar = esDeEncuentro(npc) && !enCursoEsteNpc;

      const metaExtraHtml = enCursoEsteNpc
        ? `<span style="color:var(--violet);font-weight:700">⏳ con ${objetivo ? objetivo.nombre : "?"}</span>`
        : encuentro
          ? `<span style="color:var(--muted)">✅ ya resolvió con ${objetivo ? objetivo.nombre : "?"}</span>`
          : "";

      const bloqueado = hayEncuentro || !idsJugadores.length;
      const tituloBloqueo = hayEncuentro ? "Hay otro encuentro sin resolver" : "No hay jugadores en la partida";

      // el select + "Iniciar encuentro" no entran con texto legible en la columna
      // angosta de la derecha, así que van en una fila propia debajo del nombre
      const filaAsignarHtml = puedeAsignar
        ? `
          <div class="npc-accion">
            <select class="select-objetivo-encuentro" data-npc="${npcId}" ${bloqueado ? "disabled" : ""} title="Elegí a quién le arrancás el encuentro">${opcionesJugador}</select>
            <button class="btn-primario" data-action="iniciar-encuentro" data-npc="${npcId}" ${bloqueado ? "disabled" : ""} title="${bloqueado ? tituloBloqueo : "Le asigna el turno de este encuentro al jugador elegido — lo mismo que pasa si el jugador le da Hablar al NPC desde su celu"}">💬 Iniciar encuentro</button>
          </div>`
        : "";

      const claseNueva = enCursoEsteNpc && esEncuentroNuevo ? " entrada-destacada" : "";

      return `
      <div class="npc-fila${claseNueva}" data-estado="${enCursoEsteNpc ? "encuentro" : ""}">
        <div class="npc-avatar">${npc ? npc.avatar : "❓"}</div>
        <div>
          <div class="npc-nombre">${npc ? npc.nombre : npcId}</div>
          <div class="npc-meta">
            <span class="npc-tag">${npc ? ETIQUETA_TIPO[npc.tipo] || npc.tipo : "?"}</span>
            ${zona ? `<span class="npc-tag">${zona.emoji} ${zona.nombre}</span>` : ""}
            ${metaExtraHtml}
          </div>
        </div>
        <button class="btn-x" data-action="ocultar-npc" data-npc="${npcId}" title="Sacar a ${npc ? npc.nombre : npcId} de escena">✕</button>
        ${filaAsignarHtml}
      </div>`;
    })
    .join("");
}

// como máximo un mapa por fase: un <select> simple por nombre, sin ver el layout de
// zonas — eso ya lo mira en el mapa real una vez que arranca la partida
function renderConfigMapas(mapasHabilitados) {
  const cont = document.getElementById("config-mapas");
  const fases = ["previa", "boliche", "after"];

  cont.innerHTML = fases
    .map((fase) => {
      const variantes = mapa[fase] || [];
      const elegidoId = ((mapasHabilitados && mapasHabilitados[fase]) || [])[0];

      const opciones = variantes
        .map((v) => `<option value="${v.id}" ${v.id === elegidoId ? "selected" : ""}>${v.nombre}</option>`)
        .join("");

      return `
        <div class="config-mapas-fase">
          <label for="select-mapa-${fase}">${NOMBRES_FASE[fase]}</label>
          <select id="select-mapa-${fase}" data-fase="${fase}">${opciones}</select>
        </div>`;
    })
    .join("");
}

function renderConfigJugadores(jugadores) {
  const cont = document.getElementById("config-lista-jugadores");
  const ids = Object.keys(jugadores);

  if (ids.length === 0) {
    cont.innerHTML = "<li>Todavía no se unió nadie.</li>";
    return;
  }

  cont.innerHTML = ids
    .map((id) => {
      const personaje = personajes.find((p) => p.id === jugadores[id].personaje_id);
      const thumb = personaje ? cartaThumbHtml(personaje) : "";
      return `
      <li class="config-jugador-card">
        <span class="config-jugador-thumb">${thumb}</span>
        <span class="config-jugador-nombre"><strong>${jugadores[id].nombre}</strong> — ${nombrePersonaje(jugadores[id].personaje_id)}</span>
        <button type="button" data-action="expulsar" data-player="${id}">✕ Sacar</button>
      </li>`;
    })
    .join("");
}

// fases con el <details> de eventos desplegado — el panel se re-renderiza entero en
// cada estado nuevo (por ejemplo, cada vez que se tilda un checkbox), así que sin esto
// se te cerraría solo apenas tocás algo adentro
const fasesEventosAbiertas = new Set();

function renderConfigEventos(eventosHabilitados) {
  const cont = document.getElementById("config-eventos");
  const fases = ["previa", "boliche", "after"];

  cont.innerHTML = fases
    .map((fase) => {
      const todosFase = eventos[fase] || [];
      const habilitadosFase = (eventosHabilitados && eventosHabilitados[fase]) || todosFase.map((e) => e.titulo);
      const habilitadosSet = new Set(habilitadosFase);
      const excluidos = todosFase.filter((e) => !habilitadosSet.has(e.titulo));

      const filasHabilitadas = habilitadosFase
        .map((titulo, i) => {
          const evento = todosFase.find((e) => e.titulo === titulo);
          if (!evento) return "";
          return `
          <li class="config-evento-row" title="${esc(evento.texto)}">
            <input type="checkbox" checked data-fase="${fase}" data-titulo="${evento.titulo}">
            <span class="config-evento-orden">${i + 1}</span>
            <span class="config-evento-titulo">${evento.titulo}</span>
            <div class="config-evento-mover">
              <button type="button" data-action="evento-arriba" data-fase="${fase}" data-titulo="${evento.titulo}" ${i === 0 ? "disabled" : ""}>▲</button>
              <button type="button" data-action="evento-abajo" data-fase="${fase}" data-titulo="${evento.titulo}" ${i === habilitadosFase.length - 1 ? "disabled" : ""}>▼</button>
            </div>
          </li>`;
        })
        .join("");

      const filasExcluidas = excluidos
        .map(
          (evento) => `
          <li class="config-evento-row config-evento-row-excluido" title="${esc(evento.texto)}">
            <input type="checkbox" data-fase="${fase}" data-titulo="${evento.titulo}">
            <span class="config-evento-orden">—</span>
            <span class="config-evento-titulo">${evento.titulo}</span>
          </li>`
        )
        .join("");

      return `
        <details class="config-eventos-fase" data-fase="${fase}" ${fasesEventosAbiertas.has(fase) ? "open" : ""}>
          <summary class="config-eventos-fase-resumen">
            <h3>${NOMBRES_FASE[fase]}</h3>
            <span class="config-eventos-fase-contador">${habilitadosFase.length} / ${todosFase.length} habilitados</span>
          </summary>
          <div class="config-eventos-fase-body">
            <div class="config-eventos-fase-head">
              <button type="button" class="btn-seleccionar-todo-eventos" data-fase="${fase}">Seleccionar todo</button>
            </div>
            <ul class="config-eventos-lista">${filasHabilitadas}${filasExcluidas}</ul>
          </div>
        </details>`;
    })
    .join("");

  // "toggle" no burbujea, así que no se puede delegar en #config-eventos: hay que
  // escuchar cada <details> por separado, cada vez que se re-renderizan
  cont.querySelectorAll(".config-eventos-fase").forEach((detalle) => {
    detalle.addEventListener("toggle", () => {
      if (detalle.open) fasesEventosAbiertas.add(detalle.dataset.fase);
      else fasesEventosAbiertas.delete(detalle.dataset.fase);
    });
  });
}

const TEXTO_TIPO = {
  normal: "",
  papelon_automatico: " — PAPELÓN AUTOMÁTICO",
  exito_bonus: " — ÉXITO CON BONUS",
};

const CLASE_TIPO_LOG = { normal: "normal", papelon_automatico: "papelon", exito_bonus: "bonus" };

const ETIQUETA_TIPO_HISTORIAL = { situacion: "📋", levante: "💘", confrontacion: "😤" };

function renderPuntajeDm(jugadores) {
  const cont = document.getElementById("ranking-puntaje");
  const ids = Object.keys(jugadores);

  if (!ids.length) {
    cont.innerHTML = "<p>Todavía no se unió nadie.</p>";
    return;
  }

  const ordenados = ids.map((id) => ({ id, ...jugadores[id] })).sort((a, b) => b.puntaje - a.puntaje);

  cont.innerHTML = ordenados
    .map((j, i) => {
      const historialHtml = (j.historial || []).length
        ? j.historial
            .slice()
            .reverse()
            .map(
              (h) =>
                `<li>${ETIQUETA_TIPO_HISTORIAL[h.tipo] || "🎲"} ${h.nombre} — ${h.exito ? `✅ +${h.puntos}` : "❌ 0"}</li>`
            )
            .join("")
        : "<li>Sin historial todavía.</li>";

      return `
      <details class="puntaje-jugador-card">
        <summary>#${i + 1} ${j.nombre} — ${j.puntaje} pts</summary>
        <ul class="puntaje-jugador-historial">${historialHtml}</ul>
      </details>`;
    })
    .join("");
}

// desglosa dado + dado, stat con su valor, y los modificadores que hayan aplicado
// (NA y/o el del DM en encares/situaciones resueltas en dos pasos) — así el DM ve de
// dónde sale el total sin tener que hacer la cuenta a mano
function desgloseTirada(e) {
  const stat = NOMBRES_STAT[e.stat] || e.stat;
  const partes = [`🎲 ${e.dados_tirados[0]} + ${e.dados_tirados[1]}`];

  const statBase = e.stat_base === undefined || e.stat_base === null ? e.stat_valor : e.stat_base;
  partes.push(statBase === undefined || statBase === null ? stat : `${stat} ${statBase >= 0 ? "+" : ""}${statBase}`);

  if (e.debilidad_nombre) {
    const mod = e.debilidad_modificador || 0;
    partes.push(`😵 ${e.debilidad_nombre} ${mod >= 0 ? "+" : ""}${mod}`);
  }
  if (e.debuff_valor) {
    partes.push(`😈 Debuff -${e.debuff_valor}`);
  }
  if (e.modificador_na) {
    partes.push(`NA ${e.modificador_na >= 0 ? "+" : ""}${e.modificador_na}`);
  }
  // ojo con la comparación: un modificador_dm en 0 es "Normal", un juicio válido del
  // DM — distinto a que la tirada nunca haya pasado por ese paso (undefined)
  if (e.modificador_dm !== undefined && e.modificador_dm !== null) {
    partes.push(`DM ${etiquetaModificadorDm(e.modificador_dm)}`);
  }
  // solo las rondas de encare traen "dano" (total ya con la Defensa del NPC
  // restada) — sin esto el DM solo ve el total crudo y no le cierra la cuenta
  // de por qué el HP bajó menos de lo que esperaba
  if (e.dano !== undefined && e.dano !== null) {
    partes.push(`💥 ${e.dano} de daño`);
  }

  return partes.join(" · ");
}

// -1 = todavía no renderizamos nada: evita animar como "nueva" toda la lista que
// puede venir de golpe la primera vez que el DM (re)carga la página
let ultimoLogLength = -1;

function renderLog(logEventos) {
  const cont = document.getElementById("log-eventos");

  if (logEventos.length === 0) {
    cont.innerHTML = "<p class='dm-hint'>Todavía no hubo tiradas.</p>";
    ultimoLogLength = 0;
    return;
  }

  const hayEntradaNueva = ultimoLogLength !== -1 && logEventos.length > ultimoLogLength;
  ultimoLogLength = logEventos.length;

  cont.innerHTML = logEventos
    .slice()
    .reverse()
    .map((e, i) => {
      const claseTipo = CLASE_TIPO_LOG[e.tipo] || "normal";
      const claseNueva = i === 0 && hayEntradaNueva ? " entrada-destacada" : "";
      return `
      <div class="log-item${claseNueva}" data-tipo="${claseTipo}">
        <div>
          <div>${e.jugador} <small>${e.contexto || "tirada libre"}</small></div>
          <small>${desgloseTirada(e)}${TEXTO_TIPO[e.tipo] || ""}</small>
        </div>
        <div class="log-total">${e.total}</div>
      </div>`;
    })
    .join("");
}

// título de la última situación activa que ya vimos — para animar solo la fila que
// se acaba de activar, no todas las filas en cada re-render
let ultimoTituloSituacionActiva = undefined;

// título de la tarjeta cuyo panel de "⚙️ configurar dificultad" está abierto, si hay
// alguno — igual que menuJugadorAbierto en el riel: la lista se re-renderiza entera en
// cada estado nuevo, así que esto vive afuera del DOM para poder reabrirlo después
let eventoConfigAbierto = null;

function renderEventos(fase, eventosUsados, situacionActual, eventosHabilitadosFase, dificultadesPersonalizadas) {
  const cont = document.getElementById("lista-eventos");
  const todosFase = eventos[fase];

  if (!todosFase) {
    cont.innerHTML = "<p>Sin eventos de referencia para esta fase.</p>";
    return;
  }

  const eventosFase = (eventosHabilitadosFase || [])
    .map((titulo) => todosFase.find((e) => e.titulo === titulo))
    .filter(Boolean);

  const usados = new Set((eventosUsados && eventosUsados[fase]) || []);
  const usadosCount = eventosFase.filter((e) => usados.has(e.titulo)).length;
  document.getElementById("pill-eventos-total").textContent = `${usadosCount} / ${eventosFase.length}`;
  document.getElementById("pill-eventos-usados").textContent = `${usadosCount} de ${eventosFase.length} usadas`;

  const tituloActivo = situacionActual ? situacionActual.titulo : null;
  const esSituacionNueva = ultimoTituloSituacionActiva !== undefined && tituloActivo !== ultimoTituloSituacionActiva;
  ultimoTituloSituacionActiva = tituloActivo;

  if (!eventosFase.length) {
    cont.innerHTML = "<p>No hay eventos habilitados para esta fase (configuralos en el lobby).</p>";
    return;
  }

  const personalizadas = (dificultadesPersonalizadas && dificultadesPersonalizadas[fase]) || {};

  cont.innerHTML = eventosFase
    .map((e) => {
      const esActiva = situacionActual && situacionActual.titulo === e.titulo;
      const esUsada = usados.has(e.titulo);
      const stats = (e.opciones || []).map((o) => o.stat).join(" / ");
      const estado = esActiva ? "activa" : esUsada ? "usada" : "";
      const textoBtn = esActiva ? "En uso" : esUsada ? "Repetir" : "Usar";
      const claseNueva = esActiva && esSituacionNueva ? " entrada-destacada" : "";

      const tieneCustom = e.titulo in personalizadas;
      const dificultadMostrada = tieneCustom ? personalizadas[e.titulo] : e.dificultad;

      return `
      <div class="evento-fila${claseNueva}" data-estado="${estado}">
        <div class="evento-fila-cabecera">
          <div>${e.titulo}<br><small>dificultad ${dificultadMostrada}${tieneCustom ? " ✏️" : ""} · ${stats}</small></div>
          <div class="evento-fila-botones">
            <button class="btn-usar-evento" data-titulo="${e.titulo}" ${esActiva ? "disabled" : ""}>${textoBtn}</button>
            <button data-config-abre="${e.titulo}" title="Configurar la dificultad de esta situación">⚙️</button>
          </div>
        </div>
        <div class="evento-config" data-config="${e.titulo}" data-abierto="${eventoConfigAbierto === e.titulo}">
          <label>Dificultad
            <input type="number" class="input-dificultad-evento" data-titulo="${e.titulo}" value="${dificultadMostrada}">
          </label>
          <div class="evento-config-botones">
            <button class="btn-primario" data-action="guardar-dificultad-evento" data-titulo="${e.titulo}">Guardar</button>
            ${tieneCustom ? `<button data-action="restablecer-dificultad-evento" data-titulo="${e.titulo}" title="Volver a la dificultad de referencia (${e.dificultad})">↺ Restablecer</button>` : ""}
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderSituacionActual(situacion, jugadores) {
  const cont = document.getElementById("situacion-actual-card");

  if (!situacion) {
    cont.innerHTML = "<p>Sin situación activa.</p>";
    return;
  }

  const opcionesPillsHtml = (situacion.opciones || [])
    .map((o) => `<span class="pill pill-opcion">${o.texto} <i>· ${o.stat}</i></span>`)
    .join("");

  let estadoHtml;
  if (situacion.resuelta) {
    estadoHtml = `<div class="resultado-box">Resuelta por <b>${situacion.resuelta_por}</b> — ${situacion.exito ? "✅ éxito" : "❌ fracaso"} <span style="color:var(--muted)">(${situacion.opcion_elegida || "sin opción"})</span></div>`;
  } else if (situacion.pendiente) {
    // mismo mecanismo que un encare pendiente: el jugador ya dijo su frase en voz alta,
    // falta que el DM la juzgue y ahí recién se tira
    const jugador = (jugadores || {})[situacion.pendiente.player_id];
    const nombreJugador = jugador ? jugador.nombre : "?";
    const statTxt = NOMBRES_STAT[situacion.pendiente.stat] || situacion.pendiente.stat;
    const opcionTxt = situacion.pendiente.opcion && situacion.pendiente.opcion !== OTRO_OPCION_SITUACION
      ? ` · "${situacion.pendiente.opcion}"`
      : "";
    const botonesHtml = PRESETS_MODIFICADOR_DM.map(
      (p) => `
      <button type="button" data-action="resolver-situacion-pendiente" data-modificador="${p.modificador}">
        ${p.label} (${p.modificador > 0 ? "+" : ""}${p.modificador})
      </button>`
    ).join("");

    estadoHtml = `
      <div class="banner-encuentro banner-encuentro-pendiente">
        <span style="font-size:1.1rem">🎙️</span>
        <div>
          <b>${nombreJugador}</b> ya dijo lo suyo (va a tirar ${statTxt}${opcionTxt}).
          <small>¿Cómo estuvo? Elegí y se tira al toque:</small>
          <div class="encuentro-dificultad-botones">${botonesHtml}</div>
        </div>
      </div>`;
  } else {
    estadoHtml = `<p class="situacion-pendiente">⏳ Sin resolver todavía.</p>`;
  }

  cont.innerHTML = `
    <h3 class="situacion-titulo">${situacion.titulo}</h3>
    <p class="situacion-texto">${situacion.texto}</p>
    <div class="pill-row">
      <span class="pill pill-dificultad">🎲 Dificultad ${situacion.dificultad}</span>
      ${opcionesPillsHtml}
      <span class="pill pill-otro">🎭 Otro (decide DM)</span>
    </div>
    ${estadoHtml}`;
}

function avanzarFase() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "avanzar_fase" }));
}

function retrocederFase() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "retroceder_fase" }));
}

function ajustarNa(playerId, delta) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "ajustar_na", player_id: playerId, delta }));
}

function toggleDebilidad(playerId, activa) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: activa ? "desactivar_debilidad" : "activar_debilidad", player_id: playerId }));
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

function configurarDificultadEvento(titulo, dificultad) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "configurar_dificultad_evento", titulo, dificultad }));
}

function iniciarEncuentro(npcId, jugadorObjetivo) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !npcId || !jugadorObjetivo) return;
  ws.send(JSON.stringify({ type: "iniciar_encuentro", npc_id: npcId, jugador_objetivo: jugadorObjetivo }));
}

function resolverRondaEncare(npcId, modificadorDm, habilidadNpcIdx, statObjetivoLibre, textoLibre) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "resolver_ronda_encare",
    npc_id: npcId,
    modificador_dm: modificadorDm,
    habilidad_npc_idx: habilidadNpcIdx,
    stat_objetivo_libre: statObjetivoLibre,
    texto_libre: textoLibre,
  }));
}

function resolverSituacionPendiente(modificadorDm) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "resolver_situacion_pendiente", modificador_dm: modificadorDm }));
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

function cerrarIntroParaTodos() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "cerrar_intro_para_todos" }));
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

function mostrarPantalla(partidaCreada, partidaIniciada) {
  const dashboardVisible = partidaCreada && partidaIniciada;

  document.getElementById("pantalla-crear-partida").classList.toggle("oculto", partidaCreada);
  document.getElementById("pantalla-configuracion").classList.toggle("oculto", !partidaCreada || partidaIniciada);

  // el topbar denso (sala-chip + stepper de fase) solo tiene sentido con la partida
  // en curso; en las pantallas de crear/configurar queda el topbar simple de siempre
  document.getElementById("dashboard-shell").classList.toggle("oculto", !dashboardVisible);
  document.getElementById("topbar-simple").classList.toggle("oculto", dashboardVisible);

  document.getElementById("btn-nueva-partida").classList.toggle("oculto", !partidaCreada);
}

function crearPartida() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "crear_partida" }));
}

function confirmarNuevaPartida() {
  if (confirm("¿Crear una partida nueva? Se van a desconectar todos los jugadores actuales.")) {
    crearPartida();
  }
}

function iniciarPartida() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "iniciar_partida" }));
}

function configurarMapas(mapas) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "configurar_mapas", mapas }));
}

function configurarEventos(fase, titulos) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "configurar_eventos", eventos: { [fase]: titulos } }));
}

function crearJugadorDummy(nombre, personajeId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "crear_jugador_dummy", nombre, personaje_id: personajeId }));
}

function expulsarJugador(playerId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "expulsar_jugador", player_id: playerId }));
}

let errorTimeoutId = null;

function mostrarError(detalle) {
  const cont = document.getElementById("dm-error");
  cont.textContent = `⚠️ ${detalle}`;
  cont.classList.remove("oculto");
  clearTimeout(errorTimeoutId);
  errorTimeoutId = setTimeout(() => cont.classList.add("oculto"), 5000);
}

function actualizarSalaChip(jugadores) {
  document.getElementById("sala-chip-host").textContent = `${hostParaJugadores}/jugador`;
  document.getElementById("sala-chip-conectados").textContent = Object.keys(jugadores).length;
}

function actualizarFaseStepper(fase) {
  const idx = fase === "terminado" ? ORDEN_FASES.length : ORDEN_FASES.indexOf(fase);
  document.querySelectorAll(".fase-paso").forEach((li) => {
    const i = ORDEN_FASES.indexOf(li.dataset.fase);
    li.dataset.estado = i < idx ? "hecha" : i === idx ? "activa" : "";
  });
}

function conectarWs() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocolo}://${location.host}/ws/dm`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "estado_completo") {
      mostrarPantalla(msg.partida_creada, msg.partida_iniciada);
      document.getElementById("fase-actual").textContent = NOMBRES_FASE[msg.fase] || msg.fase;
      document.body.dataset.fase = msg.fase || "previa";
      eventosHabilitadosActual = msg.eventos_habilitados || {};
      ultimoNpcsRevelados = msg.npcs_revelados || {};
      ultimoJugadoresDm = msg.jugadores || {};
      renderConfigMapas(msg.mapas_habilitados);
      renderConfigEventos(msg.eventos_habilitados);
      renderConfigJugadores(msg.jugadores);
      actualizarSalaChip(msg.jugadores);
      actualizarFaseStepper(msg.fase);
      renderJugadores(msg.jugadores, msg.mapa_actual, msg.npcs_revelados);
      renderLog(msg.log_eventos);
      renderEventos(msg.fase, msg.eventos_usados, msg.situacion_actual, eventosHabilitadosActual[msg.fase], msg.dificultades_personalizadas);
      renderSituacionActual(msg.situacion_actual, msg.jugadores);
      renderMapaVisual(msg.jugadores, msg.mapa_actual, msg.npcs_revelados, msg.fase);
      renderFormularioNpc(msg.fase, msg.mapa_actual, msg.npcs_revelados);
      renderEncuentroEnCurso(msg.npcs_revelados, msg.jugadores);
      renderNpcsRevelados(msg.npcs_revelados, msg.jugadores, msg.mapa_actual);
      renderPuntajeDm(msg.jugadores);

      const btnFase = document.getElementById("btn-avanzar-fase");
      btnFase.disabled = msg.fase === "terminado";

      const btnRetroceder = document.getElementById("btn-retroceder-fase");
      btnRetroceder.disabled = msg.fase === "previa";
    }

    if (msg.type === "error") {
      mostrarError(msg.detail);
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

document.getElementById("riel-jugadores").addEventListener("click", (e) => {
  const abre = e.target.closest("[data-abre]");
  if (abre) {
    const id = abre.dataset.abre;
    menuJugadorAbierto = menuJugadorAbierto === id ? null : id;
    document.querySelectorAll(".jugador-menu").forEach((m) => {
      m.dataset.abierto = String(m.dataset.menu === menuJugadorAbierto);
    });
    return;
  }

  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  if (btn.dataset.action === "menos" || btn.dataset.action === "mas") {
    ajustarNa(btn.dataset.player, btn.dataset.action === "mas" ? 1 : -1);
  }

  if (btn.dataset.action === "repartir-prenda") {
    const select = btn.closest(".jugador-menu").querySelector(".select-prenda");
    const prendaId = select.value === "" ? null : Number(select.value);
    repartirPrenda(btn.dataset.player, prendaId);
  }

  if (btn.dataset.action === "resolver-prenda") {
    resolverPrenda(btn.dataset.player, btn.dataset.prenda);
  }

  if (btn.dataset.action === "toggle-debilidad") {
    toggleDebilidad(btn.dataset.player, btn.dataset.activa === "true");
  }
});

// "Mover a" no tiene botón de confirmar: el select dispara el movimiento en su
// propio onchange (a diferencia de "Repartir prenda", que sí necesita un botón
// porque ahí hay que elegir prenda + random antes de confirmar).
document.getElementById("riel-jugadores").addEventListener("change", (e) => {
  if (e.target.classList.contains("select-zona")) {
    moverJugador(e.target.dataset.player, e.target.value);
  }
});

document.addEventListener("click", (e) => {
  if (!menuJugadorAbierto) return;
  if (e.target.closest(".jugador-menu") || e.target.closest("[data-abre]")) return;
  menuJugadorAbierto = null;
  document.querySelectorAll(".jugador-menu").forEach((m) => (m.dataset.abierto = "false"));
});

document.getElementById("btn-revelar-npc").addEventListener("click", () => {
  const npcId = document.getElementById("select-npc").value;
  const zona = document.getElementById("select-zona-npc").value;
  revelarNpc(npcId, zona);
});

document.getElementById("encuentro-en-curso").addEventListener("click", (e) => {
  const modBtn = e.target.closest('button[data-action="elegir-modificador-dm"]');
  if (modBtn) {
    modificadorDmSeleccionado = Number(modBtn.dataset.modificador);
    modBtn.parentElement.querySelectorAll(".btn-mod-dm").forEach((b) => b.classList.remove("btn-seleccionado"));
    modBtn.classList.add("btn-seleccionado");
    const btnResolver = document.getElementById("btn-resolver-ronda-encare");
    if (btnResolver) btnResolver.disabled = !(modificadorDmSeleccionado !== null && habilidadNpcSeleccionada !== null);
    return;
  }

  const habBtn = e.target.closest('button[data-action="elegir-habilidad-npc"]');
  if (habBtn) {
    habilidadNpcSeleccionada = habBtn.dataset.idx === "libre" ? "libre" : Number(habBtn.dataset.idx);
    // "libre" hace aparecer/desaparecer el form de texto+stat: re-renderiza entero
    // en vez de solo togglear clases, a diferencia del preset de modificador_dm
    renderEncuentroEnCurso(ultimoNpcsRevelados, ultimoJugadoresDm);
    return;
  }

  const btnResolver = e.target.closest('button[id="btn-resolver-ronda-encare"]');
  if (btnResolver) {
    const inputTexto = document.getElementById("input-texto-libre-habilidad");
    const selectStat = document.getElementById("select-stat-libre-habilidad");
    if (habilidadNpcSeleccionada === "libre") {
      textoLibreHabilidad = inputTexto ? inputTexto.value : "";
      statLibreHabilidad = selectStat ? selectStat.value : "carisma";
    }
    resolverRondaEncare(
      btnResolver.dataset.npc, modificadorDmSeleccionado, habilidadNpcSeleccionada, statLibreHabilidad, textoLibreHabilidad
    );
    modificadorDmSeleccionado = null;
    habilidadNpcSeleccionada = null;
    textoLibreHabilidad = "";
  }
});

// el input/select del form "libre" no deben perder el foco/valor por el listener de
// arriba: sus propios cambios no disparan nada hasta tocar "Resolver ronda"
document.getElementById("encuentro-en-curso").addEventListener("input", (e) => {
  if (e.target.id === "input-texto-libre-habilidad") textoLibreHabilidad = e.target.value;
});

document.getElementById("situacion-actual-card").addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-action="resolver-situacion-pendiente"]');
  if (!btn) return;
  resolverSituacionPendiente(Number(btn.dataset.modificador));
});

document.getElementById("lista-npcs-revelados").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  if (btn.dataset.action === "ocultar-npc") {
    ocultarNpc(btn.dataset.npc);
  }

  if (btn.dataset.action === "iniciar-encuentro") {
    const select = btn.parentElement.querySelector(".select-objetivo-encuentro");
    iniciarEncuentro(btn.dataset.npc, select.value);
  }
});

document.getElementById("btn-situacion-random").addEventListener("click", () => siguienteSituacion("random"));

document.getElementById("btn-elegir-situacion").addEventListener("click", () => {
  document.getElementById("card-eventos").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.getElementById("lista-eventos").addEventListener("click", (e) => {
  const abre = e.target.closest("[data-config-abre]");
  if (abre) {
    const titulo = abre.dataset.configAbre;
    eventoConfigAbierto = eventoConfigAbierto === titulo ? null : titulo;
    document.querySelectorAll(".evento-config").forEach((panel) => {
      panel.dataset.abierto = String(panel.dataset.config === eventoConfigAbierto);
    });
    return;
  }

  const btnUsar = e.target.closest(".btn-usar-evento");
  if (btnUsar) {
    siguienteSituacion("elegir", btnUsar.dataset.titulo);
    return;
  }

  const btnGuardar = e.target.closest('[data-action="guardar-dificultad-evento"]');
  if (btnGuardar) {
    const input = btnGuardar.closest(".evento-config").querySelector(".input-dificultad-evento");
    const valor = input.value === "" ? null : Number(input.value);
    configurarDificultadEvento(btnGuardar.dataset.titulo, valor);
    eventoConfigAbierto = null;
    return;
  }

  const btnRestablecer = e.target.closest('[data-action="restablecer-dificultad-evento"]');
  if (btnRestablecer) {
    configurarDificultadEvento(btnRestablecer.dataset.titulo, null);
    eventoConfigAbierto = null;
  }
});

document.getElementById("btn-avanzar-fase").addEventListener("click", avanzarFase);

document.getElementById("btn-retroceder-fase").addEventListener("click", retrocederFase);

document.getElementById("btn-narrar-ia").addEventListener("click", (e) => {
  e.target.disabled = true;
  e.target.textContent = "Narrando... (puede tardar unos segundos)";
  narrarIA();
});

document.getElementById("btn-crear-partida").addEventListener("click", crearPartida);

document.getElementById("btn-nueva-partida").addEventListener("click", confirmarNuevaPartida);
document.getElementById("btn-nueva-partida-dash").addEventListener("click", confirmarNuevaPartida);

document.getElementById("btn-puntaje").addEventListener("click", () => {
  document.getElementById("overlay-puntaje").classList.remove("oculto");
});

document.getElementById("btn-cerrar-intro-dm").addEventListener("click", cerrarIntroParaTodos);

document.getElementById("btn-cerrar-puntaje-dm").addEventListener("click", () => {
  document.getElementById("overlay-puntaje").classList.add("oculto");
});

document.getElementById("config-mapas").addEventListener("change", (e) => {
  const select = e.target.closest("select[data-fase]");
  if (!select) return;
  configurarMapas({ [select.dataset.fase]: [select.value] });
});

document.getElementById("config-eventos").addEventListener("change", (e) => {
  const checkbox = e.target.closest('input[type="checkbox"][data-fase]');
  if (!checkbox) return;

  const fase = checkbox.dataset.fase;
  const titulo = checkbox.dataset.titulo;
  const actual = (eventosHabilitadosActual[fase] || []).slice();

  if (checkbox.checked) {
    if (!actual.includes(titulo)) actual.push(titulo);
  } else {
    const idx = actual.indexOf(titulo);
    if (idx !== -1) actual.splice(idx, 1);
  }

  configurarEventos(fase, actual);
});

document.getElementById("config-eventos").addEventListener("click", (e) => {
  const btnTodo = e.target.closest(".btn-seleccionar-todo-eventos");
  if (btnTodo) {
    const fase = btnTodo.dataset.fase;
    const todosTitulos = (eventos[fase] || []).map((ev) => ev.titulo);
    configurarEventos(fase, todosTitulos);
    return;
  }

  const btnMover = e.target.closest('button[data-action="evento-arriba"], button[data-action="evento-abajo"]');
  if (!btnMover) return;

  const fase = btnMover.dataset.fase;
  const titulo = btnMover.dataset.titulo;
  const actual = (eventosHabilitadosActual[fase] || []).slice();
  const idx = actual.indexOf(titulo);
  if (idx === -1) return;

  const destino = btnMover.dataset.action === "evento-arriba" ? idx - 1 : idx + 1;
  if (destino < 0 || destino >= actual.length) return;

  [actual[idx], actual[destino]] = [actual[destino], actual[idx]];
  configurarEventos(fase, actual);
});

document.getElementById("config-lista-jugadores").addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-action="expulsar"]');
  if (!btn) return;
  if (confirm("¿Sacar a este jugador de la partida?")) {
    expulsarJugador(btn.dataset.player);
  }
});

document.getElementById("form-agregar-dummy").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("input-dummy-nombre");
  const select = document.getElementById("select-dummy-personaje");
  const nombre = input.value.trim();
  if (!nombre) return;

  crearJugadorDummy(nombre, select.value);
  input.value = "";
});

document.getElementById("btn-empezar-partida").addEventListener("click", iniciarPartida);

function poblarSelectDummyPersonaje() {
  const select = document.getElementById("select-dummy-personaje");
  select.innerHTML = personajes.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
}

(async function init() {
  await cargarPersonajes();
  await cargarPrendas();
  await cargarEventos();
  await cargarMapa();
  await cargarNpcs();
  await cargarCartas();
  await cargarCartasNpc();
  await cargarIpLan();
  poblarSelectDummyPersonaje();
  conectarWs();
})();
