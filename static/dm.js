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
let eventosHabilitadosActual = {};

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

function efectoPrenda(prendaId) {
  const p = prendas.find((p) => p.id === prendaId);
  return p ? p.efecto : "";
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
              <span class="prenda-tag" title="${efectoPrenda(pid)}">
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

      const personaje = personajes.find((p) => p.id === j.personaje_id);
      const debilidadNombre = personaje ? personaje.debilidad.nombre : "Debilidad";
      const debilidadBtnTexto = j.debilidad_activa ? `😵 Desactivar: ${debilidadNombre}` : "😌 Activar debilidad";

      const cartaHtmlJugador = personaje
        ? cartaMiniHtml(personaje, { clases: "player-carta" })
        : `<div class="player-carta"></div>`;

      const zonaActual = zonasFase.find((z) => z.id === j.zona_actual);
      const estados = [
        j.modo_caos_activo ? `<span class="estado-badge estado-caos">🔥 Modo Caos</span>` : "",
        j.debilidad_activa ? `<span class="estado-badge estado-debilidad">😵 Debilidad</span>` : "",
        zonaActual ? `<span class="estado-badge estado-zona">${zonaActual.emoji} ${zonaActual.nombre}</span>` : "",
      ].join("");

      return `
      <li class="player-card">
        ${cartaHtmlJugador}
        <div class="player-cuerpo">
          <div class="player-head">
            <strong>${j.nombre}</strong>
            <span>${nombrePersonaje(j.personaje_id)}</span>
          </div>
          <div class="na-meter"><div class="na-fill" style="width:${pct}%"></div></div>
          <div class="na-label">NA ${j.na} / ${NA_MAX} — ${NOMBRES_NA[j.na]}</div>
          <div class="player-estados">${estados}</div>
          <div class="na-controls">
            <button data-action="menos" data-player="${id}" ${j.na <= 0 ? "disabled" : ""}>−1</button>
            <button data-action="mas" data-player="${id}" ${j.na >= NA_MAX ? "disabled" : ""}>+1</button>
          </div>
          <div class="debilidad-controls">
            <button data-action="toggle-debilidad" data-player="${id}" data-activa="${j.debilidad_activa}" class="${j.debilidad_activa ? "btn-debilidad-activa" : ""}">${debilidadBtnTexto}</button>
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
          ([npcId, info]) => `
          <span class="token-npc${info.encuentro && !info.encuentro.resuelto ? " token-npc-encuentro" : ""}">
            ${info.encuentro && !info.encuentro.resuelto ? "⏳ " : ""}${nombreNpc(npcId)}
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
}

function renderEncuentroEnCurso(npcsRevelados, jugadores) {
  const cont = document.getElementById("encuentro-en-curso");
  const enCurso = encuentroEnCurso(npcsRevelados);

  if (!enCurso) {
    cont.innerHTML = "";
    return;
  }

  const npc = npcs.find((n) => n.id === enCurso.npcId);
  const jugador = jugadores[enCurso.jugador_objetivo];
  cont.innerHTML = `
    <div class="encuentro-en-curso-banner">
      ⏳ <strong>${npc ? `${npc.avatar} ${npc.nombre}` : enCurso.npcId}</strong> está encarando a
      <strong>${jugador ? jugador.nombre : "?"}</strong> — ronda ${enCurso.rondas_jugadas + 1}.
      <span>Hasta que tire (o saques al NPC de escena) no se puede arrancar otro encuentro.</span>
    </div>`;
}

function renderNpcsRevelados(npcsRevelados, jugadores, mapaActual) {
  const cont = document.getElementById("lista-npcs-revelados");
  const entradas = Object.entries(npcsRevelados || {});

  if (!entradas.length) {
    cont.innerHTML = "<p>Todavía no revelaste ningún NPC.</p>";
    return;
  }

  const zonas = mapaActual.zonas || [];
  const hayEncuentro = encuentroEnCurso(npcsRevelados) !== null;
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

      let accionHtml = "";
      if (!esDeEncuentro(npc)) {
        accionHtml = `<p class="npc-revelado-nota">Ambiente — sin mecánica de encuentro.</p>`;
      } else if (encuentro && !encuentro.resuelto) {
        accionHtml = `<p class="npc-revelado-pendiente">⏳ Encuentro en curso con <strong>${objetivo ? objetivo.nombre : "?"}</strong> — esperando su tirada.</p>`;
      } else {
        const resueltoHtml = encuentro
          ? `<p class="npc-revelado-nota">✅ Ya resolvió con ${objetivo ? objetivo.nombre : "?"}. Se lo podés volver a asignar.</p>`
          : "";
        const bloqueado = hayEncuentro || !idsJugadores.length;
        const hint = hayEncuentro
          ? `<p class="npc-revelado-nota">Hay otro encuentro sin resolver.</p>`
          : !idsJugadores.length
            ? `<p class="npc-revelado-nota">No hay jugadores en la partida.</p>`
            : "";
        accionHtml = `
          ${resueltoHtml}
          <div class="npc-revelado-acciones">
            <select class="select-objetivo-encuentro" data-npc="${npcId}" ${bloqueado ? "disabled" : ""}>${opcionesJugador}</select>
            <button data-action="iniciar-encuentro" data-npc="${npcId}" ${bloqueado ? "disabled" : ""}>💬 Iniciar encuentro</button>
          </div>
          ${hint}`;
      }

      return `
      <div class="npc-revelado-card">
        <div class="npc-revelado-head">
          <strong>${npc ? `${npc.avatar} ${npc.nombre}` : npcId}</strong>
          <button data-action="ocultar-npc" data-npc="${npcId}" title="Sacar de escena">✕</button>
        </div>
        <div class="npc-revelado-meta">
          <span class="npc-revelado-tag">${npc ? ETIQUETA_TIPO[npc.tipo] || npc.tipo : "?"}</span>
          ${zona ? `<span class="npc-revelado-tag">${zona.emoji} ${zona.nombre}</span>` : ""}
        </div>
        ${accionHtml}
      </div>`;
    })
    .join("");
}

function renderMiniPreview(variante) {
  const zonas = variante.zonas || [];
  return `<div class="mapa-mini-preview">${zonas
    .map((z) => {
      const pos = z.pos || { left: 0, top: 0, width: 30, height: 30 };
      const estilo = `left:${pos.left}%; top:${pos.top}%; width:${pos.width}%; height:${pos.height}%;`;
      return `<div class="mapa-mini-zona" style="${estilo}">${z.emoji}</div>`;
    })
    .join("")}</div>`;
}

function renderConfigMapas(mapasHabilitados) {
  const cont = document.getElementById("config-mapas");
  const fases = ["previa", "boliche", "after"];

  cont.innerHTML = fases
    .map((fase) => {
      const variantes = mapa[fase] || [];
      const habilitados = new Set((mapasHabilitados && mapasHabilitados[fase]) || variantes.map((v) => v.id));

      const cards = variantes
        .map(
          (v) => `
          <label class="mapa-config-card">
            <input type="checkbox" data-fase="${fase}" data-mapa="${v.id}" ${habilitados.has(v.id) ? "checked" : ""}>
            <div class="mapa-config-card-nombre">${v.nombre}</div>
            ${renderMiniPreview(v)}
          </label>`
        )
        .join("");

      return `
        <div class="config-mapas-fase">
          <h3>${NOMBRES_FASE[fase]}</h3>
          <div class="config-mapas-cards">${cards}</div>
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
          <li class="config-evento-row">
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
          <li class="config-evento-row config-evento-row-excluido">
            <input type="checkbox" data-fase="${fase}" data-titulo="${evento.titulo}">
            <span class="config-evento-orden">—</span>
            <span class="config-evento-titulo">${evento.titulo}</span>
          </li>`
        )
        .join("");

      return `
        <div class="config-eventos-fase">
          <div class="config-eventos-fase-head">
            <h3>${NOMBRES_FASE[fase]}</h3>
            <button type="button" class="btn-seleccionar-todo-eventos" data-fase="${fase}">Seleccionar todo</button>
          </div>
          <ul class="config-eventos-lista">${filasHabilitadas}${filasExcluidas}</ul>
        </div>`;
    })
    .join("");
}

const TEXTO_TIPO = {
  normal: "",
  papelon_automatico: " — PAPELÓN AUTOMÁTICO",
  exito_bonus: " — ÉXITO CON BONUS",
};

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

function renderEventos(fase, eventosUsados, situacionActual, eventosHabilitadosFase) {
  const cont = document.getElementById("lista-eventos");
  const todosFase = eventos[fase];

  if (!todosFase) {
    cont.innerHTML = "<p>Sin eventos de referencia para esta fase.</p>";
    return;
  }

  const eventosFase = (eventosHabilitadosFase || [])
    .map((titulo) => todosFase.find((e) => e.titulo === titulo))
    .filter(Boolean);

  if (!eventosFase.length) {
    cont.innerHTML = "<p>No hay eventos habilitados para esta fase (configuralos en el lobby).</p>";
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

  const opcionesHtml =
    situacion.opciones && situacion.opciones.length
      ? `<div class="situacion-opciones-dm">${situacion.opciones
          .map((o) => `<span class="opcion-pill">${o.texto} → ${o.stat}</span>`)
          .join("")}<span class="opcion-pill opcion-pill-otro">🎭 Otro (decide DM) → cualquier stat</span></div>`
      : "";

  const estadoHtml = situacion.resuelta
    ? `<p class="situacion-resuelta">Resuelta por <strong>${situacion.resuelta_por}</strong> — ${situacion.exito ? "✅ éxito" : "❌ fracaso"} (${situacion.opcion_elegida || "sin opción"})</p>`
    : `<p class="situacion-pendiente">⏳ Sin resolver todavía.</p>`;

  cont.innerHTML = `
    <div class="situacion-card">
      <div class="evento-titulo">${situacion.titulo}</div>
      <p>${situacion.texto}</p>
      <div class="situacion-meta">🎲 dificultad ${situacion.dificultad}</div>
      ${opcionesHtml}
      ${estadoHtml}
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

function iniciarEncuentro(npcId, jugadorObjetivo) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !npcId || !jugadorObjetivo) return;
  ws.send(JSON.stringify({ type: "iniciar_encuentro", npc_id: npcId, jugador_objetivo: jugadorObjetivo }));
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

function mostrarPantalla(partidaCreada, partidaIniciada) {
  document.getElementById("pantalla-crear-partida").classList.toggle("oculto", partidaCreada);
  document.getElementById("pantalla-configuracion").classList.toggle("oculto", !partidaCreada || partidaIniciada);
  document.getElementById("dm-dashboard").classList.toggle("oculto", !partidaCreada || !partidaIniciada);
  document.getElementById("btn-nueva-partida").classList.toggle("oculto", !partidaCreada);
}

function crearPartida() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "crear_partida" }));
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
      renderConfigMapas(msg.mapas_habilitados);
      renderConfigEventos(msg.eventos_habilitados);
      renderConfigJugadores(msg.jugadores);
      renderJugadores(msg.jugadores, msg.mapa_actual);
      renderLog(msg.log_eventos);
      renderEventos(msg.fase, msg.eventos_usados, msg.situacion_actual, eventosHabilitadosActual[msg.fase]);
      renderSituacionActual(msg.situacion_actual);
      renderMapaVisual(msg.jugadores, msg.mapa_actual, msg.npcs_revelados);
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

  if (btn.dataset.action === "toggle-debilidad") {
    toggleDebilidad(btn.dataset.player, btn.dataset.activa === "true");
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

document.getElementById("btn-avanzar-fase").addEventListener("click", avanzarFase);

document.getElementById("btn-retroceder-fase").addEventListener("click", retrocederFase);

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

document.getElementById("config-mapas").addEventListener("change", (e) => {
  const checkbox = e.target.closest('input[type="checkbox"][data-fase]');
  if (!checkbox) return;

  const fase = checkbox.dataset.fase;
  const checkboxesFase = document.querySelectorAll(`#config-mapas input[type="checkbox"][data-fase="${fase}"]`);
  const seleccionados = Array.from(checkboxesFase)
    .filter((c) => c.checked)
    .map((c) => c.dataset.mapa);

  if (seleccionados.length === 0) {
    checkbox.checked = true; // no se puede dejar una fase sin mapas habilitados
    return;
  }

  configurarMapas({ [fase]: seleccionados });
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

function initTabs() {
  const botones = document.querySelectorAll(".dm-tab-btn");
  const paneles = document.querySelectorAll(".dm-tab-panel");

  function activarTab(tab) {
    botones.forEach((b) => b.classList.toggle("dm-tab-btn-activo", b.dataset.tab === tab));
    paneles.forEach((p) => p.classList.toggle("oculto", p.dataset.tabPanel !== tab));
  }

  botones.forEach((b) => b.addEventListener("click", () => activarTab(b.dataset.tab)));
  activarTab(botones[0].dataset.tab);
}

(async function init() {
  await cargarPersonajes();
  await cargarPrendas();
  await cargarEventos();
  await cargarMapa();
  await cargarNpcs();
  await cargarCartas();
  poblarSelectDummyPersonaje();
  initTabs();
  conectarWs();
})();
