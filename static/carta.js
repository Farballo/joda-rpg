/* Componente de carta de personaje, compartido entre /jugador y /dm.
 *
 * Los personajes que tienen una carta ilustrada en data/personajes_cartas/
 * se muestran con esa imagen. A los que todavía no la tienen les dibujamos
 * una carta con los mismos datos de personajes.json, respetando el marco de
 * "Noche de Boliche" para que convivan sin desentonar en el carrusel.
 * Ver optimizar_cartas.py y el endpoint GET /api/cartas.
 */

const NOMBRES_STAT_CARTA = {
  carisma: "Carisma",
  aguante: "Aguante",
  astucia: "Astucia",
  suerte: "Suerte",
};

const ICONOS_STAT = {
  carisma: "❤️",
  aguante: "🛡️",
  astucia: "🧠",
  suerte: "🍀",
};

let cartasPorPersonaje = {};

async function cargarCartas() {
  try {
    const res = await fetch("/api/cartas");
    cartasPorPersonaje = await res.json();
  } catch {
    cartasPorPersonaje = {}; // sin cartas ilustradas dibujamos todas, el juego sigue
  }
  return cartasPorPersonaje;
}

function urlCarta(personajeId) {
  return cartasPorPersonaje[personajeId] || null;
}

function esc(texto) {
  return String(texto ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function monograma(personaje) {
  // "El Profe Rama" -> "R": salteamos el artículo para no terminar con seis "E"
  const palabras = personaje.nombre.split(" ").filter((p) => !/^(el|la|los|las)$/i.test(p));
  return (palabras[0] || personaje.nombre).charAt(0).toUpperCase();
}

function numeroCarta(personaje, indice) {
  const n = indice === undefined ? personaje.id.length : indice + 1;
  return `ND-BOL-${String(n).padStart(3, "0")}`;
}

function statsHtml(personaje) {
  return Object.entries(personaje.stats)
    .map(
      ([stat, valor]) => `
      <div class="carta-stat">
        <span class="carta-stat-icono">${ICONOS_STAT[stat] || "🎲"}</span>
        <span class="carta-stat-label">${esc(NOMBRES_STAT_CARTA[stat] || stat).toUpperCase()}</span>
        <span class="carta-stat-valor">${valor > 0 ? "+" : ""}${valor}</span>
      </div>`
    )
    .join("");
}

function cartaDibujadaHtml(personaje, indice) {
  const d = personaje.debilidad;
  const mc = personaje.modo_caos;
  const signo = d.modificador >= 0 ? "+" : "";

  // El contenido va en un lienzo absoluto: si no, el texto empuja la caja y le
  // rompe el aspect-ratio cuando la carta se muestra chica (panel del DM).
  return `
    <div class="carta-lienzo">
    <div class="carta-cabecera">
      <span class="carta-titulo">NOCHE DE BOLICHE</span>
      <span class="carta-copa">🍸</span>
    </div>
    <div class="carta-estrellas">${"★".repeat(5)}</div>

    <div class="carta-retrato">
      <span class="carta-monograma">${esc(monograma(personaje))}</span>
      <div class="carta-nombre-banner">${esc(personaje.nombre).toUpperCase()}</div>
    </div>

    <div class="carta-frase">“${esc(personaje.frase)}”</div>

    <div class="carta-stats">${statsHtml(personaje)}</div>

    <div class="carta-paneles">
      <div class="carta-panel carta-panel-caos">
        <div class="carta-panel-tipo">MODO CAOS</div>
        <div class="carta-panel-nombre">${esc(mc.nombre)}</div>
        <p class="carta-panel-texto">${esc(mc.efecto)}</p>
      </div>
      <div class="carta-panel carta-panel-debilidad">
        <div class="carta-panel-tipo">DEBILIDAD</div>
        <div class="carta-panel-nombre">${esc(d.nombre)}</div>
        <p class="carta-panel-texto">${esc(d.descripcion)}</p>
        <div class="carta-panel-mod">
          <span>${esc(NOMBRES_STAT_CARTA[d.stat] || d.stat).toUpperCase()}</span>
          <span class="carta-mod-valor">${signo}${d.modificador}</span>
        </div>
      </div>
    </div>

    <div class="carta-pie">
      <span>${numeroCarta(personaje, indice)}</span>
      <span>© NOCHE DE BOLICHE</span>
    </div>
    </div>`;
}

/** Carta completa. Usa la ilustración si existe; si no, la dibuja. */
function cartaHtml(personaje, opciones = {}) {
  const { indice, clases = "", atributos = "" } = opciones;
  const url = urlCarta(personaje.id);

  const cuerpo = url
    ? `<img class="carta-ilustrada" src="${esc(url)}" alt="${esc(personaje.nombre)}" loading="lazy" decoding="async">`
    : cartaDibujadaHtml(personaje, indice);

  return `
    <article class="carta ${url ? "carta-con-foto" : "carta-dibujada"} ${clases}"
             data-personaje="${esc(personaje.id)}" ${atributos}>
      ${cuerpo}
    </article>`;
}

/** Carta chica con forma de carta, para la lista de jugadores del DM.
 *
 * No reusa cartaHtml() a propósito: la carta dibujada mide su tipografía en
 * unidades de container (cqw) y a ~74px de ancho eso degrada a textos de 2px
 * ilegibles. Acá el fallback usa unidades fijas y muestra sólo lo que se
 * reconoce de un vistazo: monograma y nombre.
 */
function cartaMiniHtml(personaje, opciones = {}) {
  const { clases = "" } = opciones;
  const url = urlCarta(personaje.id);

  const cuerpo = url
    ? `<img class="carta-ilustrada" src="${esc(url)}" alt="${esc(personaje.nombre)}" loading="lazy" decoding="async">`
    : `<div class="carta-mini-fallback">
         <span class="carta-mini-monograma">${esc(monograma(personaje))}</span>
         <span class="carta-mini-nombre">${esc(personaje.nombre)}</span>
       </div>`;

  return `
    <div class="carta-mini ${clases}" data-personaje="${esc(personaje.id)}">
      ${cuerpo}
    </div>`;
}

/** Miniatura cuadrada, para chips y listas (panel del DM, barra del jugador). */
function cartaThumbHtml(personaje) {
  const url = urlCarta(personaje.id);

  if (url) {
    return `<img class="carta-thumb-img" src="${esc(url)}" alt="${esc(personaje.nombre)}" loading="lazy" decoding="async">`;
  }

  return `<span class="carta-thumb-monograma">${esc(monograma(personaje))}</span>`;
}
