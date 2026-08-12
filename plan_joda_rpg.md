# JODA RPG — Plan de MVP y Spec Técnica para Claude Code

## 0. Contexto para quien lea esto (incluido Claude Code)

Este es un juego de rol de una noche para jugar en una previa real, entre 3 y 6
jugadores + 1 Dungeon Master (DM) humano. Los jugadores toman decisiones con
sus personajes (versiones exageradas de arquetipos de joda argentina) a lo
largo de tres fases: **Previa → Boliche → After**. El alcohol narrativo
(Nivel de Alcohol, NA) sube durante la noche y modifica las tiradas; cuando
sube mucho, se activa el "Modo Caos" del personaje. También existen
**Prendas** (castigos sociales reales, para los jugadores físicos, no para
los personajes).

Este documento es la fuente de verdad para construir el MVP. Reemplaza
cualquier ambigüedad de las notas originales — las decisiones de diseño acá
son las que valen.

---

## 1. Objetivo del MVP

Una app web que corre 100% local (notebook del DM en la misma wifi que el
grupo, o incluso hotspot del celu si la wifi falla) y cubre:

- Selección de personaje por jugador (6 personajes predefinidos)
- Tracking de Nivel de Alcohol (NA) en vivo para todos, visible para el DM
- Tirada de dados (1d6 + stat) contra una dificultad
- Sistema de Prendas (repartir, ver activas, resolver)
- Avance de fases (Previa → Boliche → After) controlado por el DM
- Mapa temático por fase con zonas fijas (living/cocina/balcón en la
  Previa, pista/barra/VIP/baños en el Boliche, etc.), donde el DM va
  revelando NPCs que aparecen como **cartas de personaje** para todos
  los jugadores a la vez
- Situaciones de fase con **opciones múltiples**: cuando una situación lo
  permite, el jugador elige *cómo* encara el problema (ej. chamuyar,
  coimear, apurar) y esa elección determina qué stat se tira — ver
  sección 5.8
- Sistema de **encuentros con NPC por turnos**: NPCs de tipo "levante"
  (intentar levantarse a alguien, con puntaje de atractivo y dificultad de
  chamuyo) y de tipo "confrontación" (pelear/convencer/sobornar a alguien,
  como un patovica o un grupo de rugbiers). El DM asigna el encuentro a un
  jugador específico — ver sección 2 y 5.5
- Narración asistida por IA local (Ollama) opcional, disparada por el DM

**Fuera de alcance del MVP** (se agrega después si el MVP funciona bien en
una previa real): sistema de Reputación, recompensas de coronación,
persistencia entre reinicios del server. *(El sistema de Encare/chamuyo
que este documento excluía originalmente ya no está fuera de alcance —
ver la fila "Encuentros de NPC (levante/confrontación)" en la sección 2:
se agregó explícitamente a pedido, en una versión acotada.)*

---

## 2. Decisiones de diseño (resuelven ambigüedades del material original)

| Tema | Decisión |
|---|---|
| Umbral de Modo Caos | **NA 6** (escala 0-10, ver fila de abajo) |
| Escala de NA | 0-10 (se dobló la resolución original de 0-5 para tener más lugar de ajuste). Sobrio 0-1 · Alegre 2-3 · Picante 4-5 · Modo Caos 6-7 · Irrecuperable 8-9 · Leyenda Urbana 10 — ver sección 5.4 |
| Motor de tiradas | **Siempre 2d6, sumados** (no 1d6, no "2d6 quedarse con el peor" condicionado a NA). El malus de NA alto vive solo en `modificador_na`, no en la cantidad de dados — ver sección 8. Papelón automático / éxito con bonus ahora requieren **dobles** (1-1 o 6-6), no cualquier dado individual en 1 o 6 |
| Stats de personajes | Todos los valores de `stats` en `personajes.json` están **duplicados** respecto al diseño original (ej. Carisma +1 → +2) para tener más rango numérico frente a una escala de NA más grande. Los modificadores de `modificador_na` (antes +1/+2/-1) también se duplicaron (+2/+4/-2) para mantener la proporción |
| Rol del DM | Solo orquesta, no tiene personaje propio |
| Persistencia | Ninguna — el estado vive en memoria del server mientras está prendido. Si se reinicia, se pierde (aceptable para una sesión de una noche) |
| Automatización de eventos de fase | Los eventos (tabla de Previa/Boliche/After) son **cartas de referencia para el DM**, no lógica ramificada automática. El DM lee el evento, decide qué stat se tira, el jugador tira desde su celu, y el DM aplica la consecuencia (NA, prenda) con un botón. Esto evita sobre-ingenierizar 30+ ramas de lógica que en la práctica el DM va a narrar a su criterio igual |
| IA narrativa | Ollama local, modelo chico, CPU-only. Es un extra decorativo — si Ollama falla, tarda o no está instalado, el DM narra normal y el juego sigue andando sin romperse |
| Autenticación | Ninguna. Sala con código de 4 dígitos, como Kahoot/Jackbox |
| Visibilidad del mapa | **Revelado global.** Cuando el DM revela un NPC, la carta aparece al mismo tiempo para todos los jugadores. No hay "fog of war" por jugador (cada celu viendo una versión distinta del mapa) — la propuesta original de los mockups lo sugiere, pero se descarta para el MVP porque multiplica la complejidad de estado y sincronización sin agregar tanto en una mesa de gente que juega en la misma sala físicamente |
| Posicionamiento en el mapa | **Zonas fijas por fase**, no drag & drop libre. Cada fase define sus zonas en `data/mapa.json` (living, cocina, barra, VIP, etc.) con posición y tamaño fijados en CSS. El DM asigna un jugador o un NPC a una zona con un click/dropdown, no arrastrando tokens a coordenadas libres |
| Revelado de NPCs | El DM elige un NPC del "mazo" de la fase actual (`data/npcs.json`, filtrado por su campo `fase`) y lo revela en una zona. La carta se dispara a todos los jugadores y queda como marcador fijo en el mapa. Los botones de la carta ("Hablar"/"Ignorar") sólo marcan que el jugador la vio — igual que con los eventos de fase, el DM sigue narrando y aplicando consecuencias (NA, prenda) a mano, sin lógica automática |
| Estilo visual | Estética "neon boliche" de `mockups/JODA_RPG_mockups_neon_boliche.html` y `mockups/JODA_RPG_mockups_mapas_vivos.html`: fondo oscuro, acentos cian/rosa/violeta, tipografía grande y en negrita, tarjetas con bordes suaves. Se implementa con HTML/CSS plano (divs con posición absoluta, como en los mockups), sin canvas ni librerías de mapas — ver sección 5.7 para los tokens de diseño |
| Alcance de los turnos | **Solo los encuentros de NPC** (levante/confrontación, ver fila de abajo) son por turnos. El resto del juego — tiradas libres de stat, NA, prendas, situaciones de fase — sigue funcionando como ya está: cualquier jugador actúa cuando quiere, sin esperar turno. No se reestructura lo ya construido en los milestones 1-9 |
| Orden de turno en encuentros | El DM asigna a mano qué jugador le toca en cada encuentro de NPC (levante o confrontación), sin rotación automática fija. Más trabajo para el DM que una cola automática, pero más flexible para narrar (ej. asignarle el encuentro al jugador que más sentido tenga en ese momento) |
| Encuentros de NPC (levante/confrontación) | Se agrega `tipo` a `data/npcs.json`: `"ambiente"` (los NPCs ya existentes, decorativos, revelado global — sin cambios), `"levante"` (intentar levantarse a alguien: `puntaje_lindura` 1-10 y `dificultad_chamuyo`) o `"confrontacion"` (pelear/convencer/sobornar a alguien: `opciones` con stat sugerido por enfoque, mismo esquema que la fila de abajo). A diferencia de los NPCs ambiente, estos se revelan **dirigidos a un jugador específico** (el del turno asignado), no a todos — ver sección 5.5 y 7 |
| Misterio de lindura en el levante | Si el jugador objetivo tiene NA alto (propuesta: **NA ≥ 8, "Irrecuperable"**, umbral ajustable), la carta del NPC de levante le llega **sin revelar**: sin nombre, sin imagen, sin `puntaje_lindura` — solo "❓ Alguien te llama la atención". El jugador igual puede intentar el chamuyo a ciegas. Después de resolver el intento (haya salido bien o mal), se revela la identidad real sin importar el NA — el misterio es previo a la tirada, no una tirada distinta ni un fallo automático. No hace falta lógica de "consuelo" (asignar otro NPC feo automáticamente): alcanza con no mostrar el dato, la sorpresa la da la carta ya revelada al final |
| Situaciones con opciones | Los eventos de `data/eventos.json` pueden tener un campo opcional `opciones` (mismo esquema que en NPCs de confrontación): 2-3 formas distintas de encarar la situación, cada una mapeada a un stat distinto (ej. "Lo chamuyás" → Carisma, "Lo coimeás" → Suerte, "Lo apurás" → Presencia). Si el evento tiene `opciones`, el jugador elige una en vez de tirar cualquiera de sus 5 stats libremente; si no las tiene, se comporta como hoy (tirada libre, el DM decide qué stat pedir en voz alta). No todos los eventos necesitan `opciones` — es un campo opcional, se completa evento por evento más adelante (ver sección 5.8) |
| Selección de próxima situación/NPC | El DM elige explícitamente la "situación actual" de la fase, de a una por vez: botón "🎲 Aleatoria" (elige una no usada todavía de `eventos.json`) o selecciona una puntual de la lista. Mismo patrón para NPCs (ya existía el modo "elegir" desde el mazo; se agrega el modo "🎲 Aleatorio"). Reemplaza la vista de milestone 6 que mostraba todas las tarjetas de la fase como referencia estática — ahora hay una sola "situación activa" visible para todos, más prolijo y más parecido al flujo de "⚡ Siguiente situación" de los mockups |

---

## 3. Stack técnico

- **Backend:** Python 3.11+, FastAPI, WebSockets nativos de FastAPI (sin Redis, sin Celery — todo en memoria, un solo proceso)
- **Frontend:** HTML + JS vanilla (sin build step, sin npm, sin framework — dos páginas: `/dm` y `/jugador`). Justificación: es una app de una noche, cero necesidad de complejidad de build tooling.
- **IA local:** [Ollama](https://ollama.com) corriendo en `localhost:11434`, modelo `llama3.2:3b` o `phi3:mini` (ambos corren razonable en CPU; probar los dos y quedarse con el que responda más rápido en tu notebook — con CPU-only, esperar 3-8 segundos por narración de 2-3 líneas)
- **Persistencia:** ninguna (estado en un dict de Python en memoria)
- **Networking:** server escucha en `0.0.0.0:8000`, todos los dispositivos en la misma red local entran por `http://<ip-local-del-DM>:8000/jugador`

---

## 4. Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                  Notebook del DM (CPU)                  │
│                                                           │
│  ┌────────────┐      ┌──────────────────────────────┐  │
│  │   Ollama    │◄─────┤   FastAPI app (uvicorn)       │  │
│  │ llama3.2:3b │      │                                │  │
│  └────────────┘      │  - game_state.py (en memoria)  │  │
│                       │  - /ws/dm        (WebSocket)   │  │
│                       │  - /ws/player/{id} (WebSocket) │  │
│                       │  - GET /dm       (HTML)        │  │
│                       │  - GET /jugador  (HTML)        │  │
│                       │  - data/*.json (personajes,    │  │
│                       │    prendas, eventos)            │  │
│                       └──────────────┬─────────────────┘  │
└──────────────────────────────────────┼─────────────────────┘
                                        │ wifi local
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐      ┌──────▼─────┐      ┌──────▼─────┐
              │ Celu J1   │      │ Celu J2    │ ...  │ Celu J6    │
              │ /jugador  │      │ /jugador   │      │ /jugador   │
              └───────────┘      └────────────┘      └────────────┘
```

Un solo proceso, un solo "room" (no hace falta soportar múltiples partidas
simultáneas para el MVP).

---

## 5. Modelo de datos

### 5.1 `data/personajes.json`

Los valores de `stats` están duplicados respecto al diseño original de la
mesa (ver fila "Stats de personajes" en la sección 2) — más rango numérico
para una escala de NA 0-10 y una tirada de 2d6.

```json
[
  {
    "id": "intenso",
    "nombre": "El Intenso",
    "frase": "Si no pasa algo ahora, no pasa nunca.",
    "stats": { "carisma": 2, "aguante": 0, "astucia": -2, "presencia": 4, "suerte": -2 },
    "habilidad_unica": {
      "nombre": "Vamos todos",
      "usos": "1 vez por fase",
      "efecto": "Antes de una tirada grupal, obliga a que todos tiren. Si al menos uno saca 6, éxito total grupal. Si nadie saca 6, la consecuencia negativa es colectiva y aumentada."
    },
    "modo_caos": {
      "nombre": "AHORA O NUNCA",
      "efecto": "Una vez por escena, puede forzar una acción extrema sin tirar dados (encarar, gritar, subirse a algo, confrontar a alguien).",
      "consecuencia": "El DM elige una consecuencia grave: expulsión, pelea, ruptura social o cambio forzado de fase."
    },
    "debilidad": "No puede ignorar provocaciones. Si alguien lo desafía públicamente, debe reaccionar aunque pierda."
  },
  {
    "id": "suertudo",
    "nombre": "El Suertudo",
    "frase": "No sé cómo pasó, pero salió.",
    "stats": { "carisma": 0, "aguante": -2, "astucia": 0, "presencia": -2, "suerte": 4 },
    "habilidad_unica": {
      "nombre": "Justo zafó",
      "usos": "1 vez por fase",
      "efecto": "Cuando fallás una tirada, tirá 1D6. Con 4-6, el fallo se transforma en éxito raro, fallo sin consecuencias, o problema para otro jugador."
    },
    "modo_caos": {
      "nombre": "Modo Dios",
      "efecto": "Todas las tiradas cuentan con +2 de suerte adicional. Podés convertir 1 fallo por fase en éxito total.",
      "consecuencia": "Al final de la fase, tirá 1D6. Con 1-2, el karma se guarda: penalizador narrativo acumulado para la próxima fase."
    },
    "debilidad": "Si algo depende de planificación tiene -1 a la tirada. Subestima el peligro porque 'siempre zafa'."
  },
  {
    "id": "payaso",
    "nombre": "El Payaso",
    "frase": "Pará, pará... mirá esto.",
    "stats": { "carisma": 2, "aguante": 0, "astucia": 2, "presencia": -2, "suerte": 0 },
    "habilidad_unica": {
      "nombre": "Hago un show",
      "usos": "1 vez por fase",
      "efecto": "Podés reemplazar cualquier stat por Carisma en una tirada si describís cómo convertís la situación en un espectáculo. Riesgo: si fallás, el papelón es doble."
    },
    "modo_caos": {
      "nombre": "Caos Puro",
      "efecto": "Cada vez que fallás una tirada, podés repetirla. Si tiene éxito, arrastra a otro jugador a la escena.",
      "consecuencia": "Cada repetición: Alcohol +1. Nunca es solo: siempre involucra a alguien más."
    },
    "debilidad": "Si hay silencio incómodo, tiene que intervenir. Le cuesta no exagerar incluso cuando no conviene."
  },
  {
    "id": "gymbro",
    "nombre": "El Gym Bro",
    "frase": "Tranqui, yo me la banco.",
    "stats": { "carisma": -2, "aguante": 4, "astucia": -2, "presencia": 2, "suerte": 0 },
    "habilidad_unica": {
      "nombre": "Banco todo",
      "usos": "1 vez por noche",
      "efecto": "Ignorás la primera consecuencia física que sufras en la noche (empujón, caída, cansancio extremo, penalización de aguante)."
    },
    "modo_caos": {
      "nombre": "Animal",
      "efecto": "Aguante pasa a +3. Ignora dolor, empujones y cansancio.",
      "consecuencia": "Todas las tiradas de Astucia fallan automáticamente. Tiende a resolver todo con el cuerpo."
    },
    "debilidad": "Si alguien lo desafía físicamente tiene que aceptar o escalar. Le cuesta leer indirectas y límites sociales."
  },
  {
    "id": "timido",
    "nombre": "El Tímido",
    "frase": "Yo estoy bien acá... creo.",
    "stats": { "carisma": -2, "aguante": 2, "astucia": 4, "presencia": -2, "suerte": 0 },
    "habilidad_unica": {
      "nombre": "Observador Silencioso",
      "usos": "1 vez por noche",
      "efecto": "Antes de una tirada social (Carisma o Presencia), elegís: +2 a la tirada, o repetir el dado."
    },
    "modo_caos": {
      "nombre": "Me solté",
      "efecto": "Carisma pasa de -1 a +1. Puede iniciar interacciones sociales sin penalización.",
      "consecuencia": "Después de cada interacción social, tirá 1D6. Con 1-3, se arrepiente (pierde Presencia hasta la próxima escena). Con 4-6, se entusiasma (Alcohol +1)."
    },
    "debilidad": "Si hay mucha gente o atención encima, tiene -1 de Presencia. Evita liderar situaciones, incluso cuando tiene razón."
  },
  {
    "id": "fachero",
    "nombre": "El Fachero",
    "frase": "No hace nada extraordinario... pero todo le queda bien.",
    "stats": { "carisma": 4, "aguante": 0, "astucia": 0, "presencia": 2, "suerte": -2 },
    "habilidad_unica": {
      "nombre": "Cara de Boliche",
      "usos": "1 vez por noche",
      "efecto": "Cuando fallás una tirada de Carisma, podés convertirla en éxito parcial. El DM elige la consecuencia: sale pero cuesta algo, sale pero genera celos, o sale pero quedás expuesto."
    },
    "modo_caos": {
      "nombre": "Invencible",
      "efecto": "Todos los fallos de Carisma se repiten automáticamente.",
      "consecuencia": "Si vuelve a fallar: se genera una rivalidad inmediata, o aparece un quilombo por ego."
    },
    "debilidad": "Si alguien lo supera en público, tiene -1 a la siguiente tirada social. Le cuesta aceptar el rechazo o la indiferencia."
  }
]
```

### 5.2 `data/prendas.json`

```json
[
  { "id": 1,  "nombre": "Eco Insoportable", "efecto": "Todo lo que digas tenés que decirlo dos veces seguidas, sin excepción. Si te olvidás: +1 NA inmediato." },
  { "id": 2,  "nombre": "Acento Italiano Dramático", "efecto": "Tenés que hablar con acento italiano exagerado y gesticular cada frase. Frases sin gesto no cuentan." },
  { "id": 3,  "nombre": "Modo Alemán", "efecto": "Hablás en tono serio, cortante y estructurado. Máximo una frase por intervención." },
  { "id": 4,  "nombre": "Boca Abierta", "efecto": "Tenés que hablar con la boca abierta de forma incómoda. Si alguien se ríe, seguís igual." },
  { "id": 5,  "nombre": "Susurrador Sospechoso", "efecto": "Solo podés hablar en voz baja. Si no te escuchan, es tu problema." },
  { "id": 6,  "nombre": "Mirada Cruzada", "efecto": "Cada vez que le hablás a una persona, tenés que mirar fijamente a otra distinta." },
  { "id": 7,  "nombre": "Movimiento Constante", "efecto": "No podés quedarte quieto mientras hablás: tenés que moverte o gesticular exageradamente." },
  { "id": 8,  "nombre": "Responder Cantando", "efecto": "Al menos una frase de cada respuesta tiene que ser cantada." },
  { "id": 9,  "nombre": "Modo Noticiero", "efecto": "Todo lo que digas tiene que ser en tono serio de noticiero." },
  { "id": 10, "nombre": "Palabra Prohibida", "efecto": "El grupo elige una palabra común que no podés decir. Si la decís: +1 NA inmediato." },
  { "id": 11, "nombre": "Pie en la Mesa", "efecto": "Tenés que tener un pie apoyado en la mesa cada vez que hablás. Si lo bajás: +1 NA." },
  { "id": 12, "nombre": "Manos Ocupadas", "efecto": "Tenés que mantener ambas manos ocupadas todo el tiempo, no podés soltarlas al hablar." },
  { "id": 13, "nombre": "Señalar Siempre", "efecto": "Cada vez que hablás, tenés que señalar algo o a alguien con el dedo." },
  { "id": 14, "nombre": "Pase de Prendas", "efecto": "En cualquier momento podés intercambiar tu prenda activa con la de otro jugador. Al hacerlo, robás una nueva prenda y la cumplís también." },
  { "id": 15, "nombre": "Sí a Todo", "efecto": "No podés decir 'no' ni negarte verbalmente. El DM o el grupo corta si se va al carajo." },
  { "id": 16, "nombre": "Frase Obligatoria", "efecto": "Antes de cada intervención tenés que decir una frase fija elegida por el grupo." },
  { "id": 17, "nombre": "Responder en Tercera Persona", "efecto": "Tenés que hablar de vos mismo en tercera persona." },
  { "id": 18, "nombre": "Aplauso Obligatorio", "efecto": "Después de cada intervención tuya, aplaudís una vez, sin explicación." }
]
```

### 5.3 `data/eventos.json`

Texto de referencia para el DM — no dispara lógica automática de
consecuencias (eso lo sigue decidiendo el DM a mano, como siempre). Cada
evento puede tener opcionalmente un campo `opciones` (ver esquema
compartido en 5.8): si lo tiene, el jugador elige entre 2-3 formas
distintas de encarar la situación y esa elección define qué stat se tira;
si no lo tiene, sigue funcionando como hasta ahora (tirada libre, el DM
pide el stat en voz alta). No hace falta agregarle `opciones` a los 26
eventos ya definidos de una — se va completando evento por evento más
adelante. Como referencia de la forma, así quedaría el evento "DNI dudoso"
con el ejemplo que diste (patovica que no te deja entrar):

```json
{ "titulo": "DNI dudoso", "texto": "El patovica no te quiere dejar entrar sin DNI.", "opciones": [
  { "texto": "Lo tratás de chamuyar", "stat": "carisma" },
  { "texto": "Lo coimeás", "stat": "suerte" },
  { "texto": "Lo apurás", "stat": "presencia" }
] }
```

```json
{
  "previa": [
    { "titulo": "¿Quién trae alcohol?", "texto": "Un jugador se ofrece (tira Astucia o Suerte) o hay tirada grupal de Suerte. Éxito: hay alcohol suficiente. Fallo: falta alcohol, alguien arranca con +1 NA de bronca o prenda." },
    { "titulo": "Estado del depto", "texto": "Tirada de Astucia o Presencia. Éxito: +1 a la primera tirada social del boliche. Fallo: quilombo (falta hielo, baño inutilizable), prenda física temprana." },
    { "titulo": "Las minas, ¿llegan?", "texto": "Tirada de Carisma o Suerte. Éxito: llegan, sube el clima, +1 NA para todos. Fallo: no llegan, alguien toma de más." },
    { "titulo": "Primer papelón", "texto": "El jugador más pasado tira Carisma. Éxito: anécdota graciosa. Fallo: prenda inmediata. 1 natural: papelón legendario." },
    { "titulo": "Decidir cuándo salir", "texto": "Tirada grupal de Astucia. Éxito: salen en el momento justo. Fallo: salen tarde, temprano, o alguien se queda atrás." }
  ],
  "boliche": [
    { "titulo": "Patova con ganas de romper las bolas", "texto": "Un jugador tira Carisma. Éxito: pasa. Fallo: -1 Carisma toda la noche." },
    { "titulo": "DNI dudoso", "texto": "Tirada de Suerte. Éxito: zafa. Fallo: prenda inmediata o espera afuera." },
    { "titulo": "Tragos carísimos", "texto": "El grupo elige: pagar (nada) o ratonear (-1 Carisma colectivo)." },
    { "titulo": "Shot de regalo sospechoso", "texto": "Quien lo toma: +1 NA, tira 1d6. 1-2: penalización. 5-6: buff inesperado." },
    { "titulo": "Empujón fuerte", "texto": "Dos jugadores tiran Carisma o Aguante. El que pierde: +1 NA o prenda." },
    { "titulo": "Música de mierda", "texto": "Todos -1 Carisma. El Payaso puede anularlo automáticamente." },
    { "titulo": "Alguien los graba", "texto": "Elegir: actuar normal (difícil), exagerar (riesgo alto) o esconderse (-1 Carisma)." },
    { "titulo": "Baile horrible", "texto": "Si se rolea con confianza: +1 Carisma. Si no: -1 Carisma y +1 NA." },
    { "titulo": "Se pierde un jugador", "texto": "Ese jugador juega solo 1 ronda. Si falla una tirada: +1 NA automático." },
    { "titulo": "Alguien vomita", "texto": "Ese jugador entra en Modo Caos inmediato. Los cercanos tiran Suerte o reciben penalización social." },
    { "titulo": "Momento épico", "texto": "Algo sale increíblemente bien. El grupo elige: buff colectivo, cancelar una prenda, o bajar NA a uno." },
    { "titulo": "Caos total de boliche", "texto": "Todos +1 NA. Se activa una prenda random. El DM describe algo que va a traer consecuencias en el after." }
  ],
  "after": [
    { "titulo": "Casa que no es de nadie", "texto": "Nadie sabe qué se puede tocar. -1 Astucia colectivo." },
    { "titulo": "El dueño se despierta", "texto": "Elegir: chamuyar (Carisma) o huir (Suerte)." },
    { "titulo": "Conversación profunda", "texto": "Dos jugadores pueden resolver rivalidades o quedar peor." },
    { "titulo": "Confesión innecesaria", "texto": "Tirada de Astucia. Éxito: alivio. Fallo: cringe eterno." },
    { "titulo": "Uno se duerme", "texto": "Queda fuera 1 ronda. Puede perder cosas." },
    { "titulo": "Se rompe algo importante", "texto": "Consecuencia para el futuro (el DM anota)." },
    { "titulo": "Discusión heavy", "texto": "Una relación se define para siempre." },
    { "titulo": "Aparición inesperada", "texto": "Ex, vecino, policía o madre aparece de golpe." },
    { "titulo": "Resaca anticipada", "texto": "-1 a todas las tiradas finales." }
  ]
}
```

### 5.4 Escala de NA (constante en el código, no en JSON)

Escala 0-10 — el doble de resolución que el diseño original de 0-5, para
tener más lugar de ajuste. La tirada en sí **siempre** es 2d6 sumados (ver
sección 8); el efecto de NA vive en `modificador_na(na, stat)`, no en la
cantidad de dados.

| NA | Nombre | Efecto |
|---|---|---|
| 0-1 | Sobrio | Sin modificador |
| 2-3 | Alegre | +2 en stats sociales (Carisma, Presencia) |
| 4-5 | Picante | +4 en stats sociales / -2 en stats lógicas (Astucia) |
| 6-7 | **Modo Caos** | Se activa el modo caos del personaje (ver `personajes.json`). Sin modificador numérico propio |
| 8-9 | Irrecuperable | -2 parejo a cualquier stat (reemplaza a la vieja mecánica de "2d6, quedarse con el peor", que dejó de existir porque ahora la tirada siempre es 2d6 fijo) |
| 10 | Leyenda Urbana | El jugador pierde control temporal; el DM narra por él. Vuelve a NA 6 al empezar el After |

### 5.5 `data/npcs.json`

"Mazo" de personajes que el DM puede revelar durante la noche. Todo NPC
tiene un `tipo` que determina cómo se comporta:

- **`"ambiente"`**: decorativo, sin mecánica propia (los 5 que ya
  estaban). Se revela **a todos los jugadores a la vez** (revelado
  global, sin turno) y queda como marcador fijo en el mapa. `importancia`
  (`npc` blanco / `importante` magenta) solo cambia el color de la carta.
- **`"levante"`**: intentar levantarse a alguien. Tiene `puntaje_lindura`
  (1-10) y `dificultad_chamuyo` (número a superar con la tirada de
  Carisma). Se revela **dirigido a un único jugador** (el del turno que
  asignó el DM), no a todos — ver sección 2, fila "Misterio de lindura".
- **`"confrontacion"`**: alguien a quien hay que convencer, pelear o
  sobornar para pasar una situación (patovica, rugbiers borrachos,
  etc.). Tiene `opciones` (mismo esquema que en `eventos.json`, ver
  sección 5.8): 2-3 enfoques posibles, cada uno con su stat. También se
  revela **dirigido a un único jugador**.

`fase` sigue filtrando qué NPCs le aparecen al DM para elegir según la
fase activa, para los tres tipos.

Los 5 NPCs `"ambiente"` ya definidos no cambian de contenido, solo suman
el campo `tipo`:

```json
[
  {
    "id": "martina",
    "nombre": "Martina",
    "apodo": "La DJ",
    "avatar": "👩🏻",
    "frase_reveal": "¿Ustedes son los de la mesa 4?",
    "importancia": "importante",
    "tipo": "ambiente",
    "fase": "boliche"
  },
  {
    "id": "bartender",
    "nombre": "El Bartender",
    "apodo": "El de la barra",
    "avatar": "🍸",
    "frase_reveal": "¿Lo de siempre o quieren sorprenderse?",
    "importancia": "npc",
    "tipo": "ambiente",
    "fase": "boliche"
  },
  {
    "id": "vecina",
    "nombre": "La Vecina",
    "apodo": "La del piso de arriba",
    "avatar": "🕶️",
    "frase_reveal": "Chicos, bajen un poco la música, ¿no?",
    "importancia": "importante",
    "tipo": "ambiente",
    "fase": "previa"
  },
  {
    "id": "desconocido_barra",
    "nombre": "El Desconocido",
    "apodo": "???",
    "avatar": "🕶️",
    "frase_reveal": "Te mira desde la barra y levanta el vaso.",
    "importancia": "importante",
    "tipo": "ambiente",
    "fase": "boliche"
  },
  {
    "id": "flaco_bano",
    "nombre": "El Flaco",
    "apodo": "El del baño",
    "avatar": "🧑",
    "frase_reveal": "Sale del baño gritando algo que nadie entiende.",
    "importancia": "npc",
    "tipo": "ambiente",
    "fase": "boliche"
  }
]
```

Este set de NPCs ambiente es un punto de partida — se puede ampliar con
más personajes por fase antes de la noche del evento, siempre respetando
el mismo esquema de campos.

**No se definen acá los NPCs de tipo `levante` ni `confrontacion`** — se
arman aparte, en particular. La forma que van a tener (sin inventar
personajes concretos todavía):

```json
{
  "id": "<id_unico>",
  "nombre": "<nombre>",
  "apodo": "<apodo>",
  "avatar": "<emoji o, más adelante, imagen/dibujo>",
  "frase_reveal": "<frase de presentación>",
  "importancia": "npc",
  "tipo": "levante",
  "fase": "boliche",
  "puntaje_lindura": 7,
  "dificultad_chamuyo": 12
}
```

```json
{
  "id": "<id_unico>",
  "nombre": "<nombre>",
  "apodo": "<apodo>",
  "avatar": "<emoji o, más adelante, imagen/dibujo>",
  "frase_reveal": "<frase de presentación>",
  "importancia": "importante",
  "tipo": "confrontacion",
  "fase": "boliche",
  "opciones": [
    { "texto": "Lo tratás de convencer", "stat": "carisma" },
    { "texto": "Te la jugás y te vas al humo", "stat": "aguante" },
    { "texto": "Le ofrecés algo", "stat": "suerte" }
  ]
}
```

`dificultad_chamuyo` usa la misma escala que las dificultades de
referencia recalibradas en la sección 8 (10 fácil, 13 normal, 16 difícil,
19+ muy difícil) — un `puntaje_lindura` más alto debería, en general, ir
con una `dificultad_chamuyo` más alta, pero eso lo termina de calibrar
quien defina el contenido.

### 5.6 `data/mapa.json`

Zonas fijas por fase. Solo define **contenido** (id, nombre, emoji) — la
**posición visual** de cada zona (izquierda/arriba/ancho/alto) vive en
`static/style.css` como reglas CSS por `id` de zona, igual que en los
mockups (`.dept-living`, `.club-bar`, etc.), para no mezclar datos con
presentación.

```json
{
  "previa": [
    { "id": "living", "nombre": "Living", "emoji": "🛋️" },
    { "id": "cocina", "nombre": "Cocina", "emoji": "🍕" },
    { "id": "bano", "nombre": "Baño", "emoji": "🚪" },
    { "id": "balcon", "nombre": "Balcón", "emoji": "🌙" }
  ],
  "boliche": [
    { "id": "pista", "nombre": "Pista", "emoji": "🪩" },
    { "id": "barra", "nombre": "Barra", "emoji": "🍸" },
    { "id": "vip", "nombre": "VIP", "emoji": "⭐" },
    { "id": "banos", "nombre": "Baños", "emoji": "🚻" },
    { "id": "entrada", "nombre": "Entrada", "emoji": "🚪" }
  ],
  "after": [
    { "id": "living", "nombre": "Living", "emoji": "🛋️" },
    { "id": "cocina", "nombre": "Cocina", "emoji": "🍕" },
    { "id": "terraza", "nombre": "Terraza", "emoji": "🌆" },
    { "id": "cuarto", "nombre": "Cuarto", "emoji": "🛏️" }
  ]
}
```

Cada jugador tiene una `zona_actual` (ver sección 6) dentro de las zonas de
la fase activa; por defecto arranca en la primera zona de la lista de esa
fase (ej. `entrada` en el Boliche) y el DM la puede cambiar en cualquier
momento.

### 5.7 Sistema visual (design tokens)

Tomado directamente de `mockups/JODA_RPG_mockups_neon_boliche.html` — se
usa como referencia visual para `/dm` y `/jugador` de acá en adelante,
respetando igual la regla de "sin build step": son variables CSS planas en
`static/style.css`, sin librería de diseño.

```css
:root {
  --bg: #07070b;
  --panel: #101019;
  --panel2: #151522;
  --line: #2b2b3b;
  --text: #f8f7f5;
  --muted: #a7a5af;
  --pink: #ff3e9d;
  --cyan: #27e2d2;
  --violet: #9d42ff;
  --danger: #ff466f;
  --yellow: #ffd84a;
}
```

Reglas generales: fondo oscuro (`--bg`), tarjetas (`--panel`) con borde
sutil (`--line`) y esquinas redondeadas, texto en negrita y tamaños grandes
(el público sigue siendo gente en un celu con poca luz — la regla 6 de
`CLAUDE.md` sobre legibilidad no cambia, un tema oscuro con alto contraste
la cumple igual). Colores con significado fijo:

- **Cian** (`--cyan`): jugadores, estado normal, fase activa
- **Rosa** (`--pink`): acción principal, prendas, alertas
- **Violeta** (`--violet`): Modo Caos
- **Blanco/gris**: NPCs comunes
- **Rosa/magenta**: NPCs importantes y cartas nuevas
- **Amarillo** (`--yellow`): eventos activos

### 5.8 Esquema compartido: `opciones`

Usado en dos lugares — un evento de `data/eventos.json` (sección 5.3) y un
NPC `tipo: "confrontacion"` de `data/npcs.json` (sección 5.5). Es la misma
forma en los dos casos, así que se define una sola vez acá:

```json
"opciones": [
  { "texto": "Lo tratás de chamuyar", "stat": "carisma" },
  { "texto": "Lo coimeás", "stat": "suerte" },
  { "texto": "Lo apurás", "stat": "presencia" }
]
```

Cada opción es texto + un `stat` de los 5 existentes (`carisma`,
`aguante`, `astucia`, `presencia`, `suerte`). El jugador elige una opción
en su celu; el server tira `2d6 + stat_elegido + modificador_na` igual que
cualquier otra tirada (sección 8) — no es un mecanismo nuevo, es
`tirar_dado` con el stat ya decidido de antemano por la elección en vez de
que el jugador lo elija directo. No lleva dificultad propia por opción:
la dificultad de referencia general (sección 8) sigue siendo la que el DM
dice en voz alta, y sigue siendo el DM quien decide la consecuencia
narrativa del resultado — elegir una opción solo fija qué stat se tira, no
automatiza qué pasa después.

---

## 6. Estado del juego (en memoria, `game_state.py`)

```python
game_state = {
    "fase": "previa",  # "previa" | "boliche" | "after" | "terminado"
    "jugadores": {
        "<player_id>": {
            "nombre": "Facu",
            "personaje_id": "intenso",
            "na": 0,
            "modo_caos_activo": False,
            "prendas_activas": [],       # lista de ids de prendas.json
            "habilidad_usada_fase": False,
            "habilidad_usada_noche": False,
            "zona_actual": "entrada",    # id de zona de data/mapa.json para la fase activa
        }
    },
    "npcs_revelados": {
        # "<npc_id>": {
        #     "zona": "barra",
        #     "jugador_objetivo": None,   # player_id, solo para tipo "levante"/"confrontacion"
        #     "resuelto": False,          # True una vez que el jugador_objetivo tiró el intento
        # }
    },
    "situacion_actual": None,  # el evento activo de eventos.json (dict completo) o None
    "eventos_usados": {
        "previa": [], "boliche": [], "after": []  # títulos ya mostrados, por fase — para no repetir en modo aleatorio
    },
    "log_eventos": []  # historial simple para mostrar en pantalla del DM
}
```

`npcs_revelados`, `situacion_actual` y `eventos_usados[fase_nueva]` se
reinician (vacíos) cada vez que el DM avanza de fase — son propios de la
escena en la que aparecieron, no persisten a la fase siguiente. `zona` en
`npcs_revelados` solo aplica a NPCs "ambiente" (los de tipo "levante"/
"confrontacion" no necesitan posición en el mapa, son un encuentro directo
con un jugador, no un marcador ambiental).

## 7. WebSocket / API — contrato

### `GET /dm` y `GET /jugador`
Sirven las páginas HTML estáticas.

### `POST /join`
Body: `{ "nombre": str, "personaje_id": str }` → devuelve `player_id` y arma la entrada en `game_state["jugadores"]`.

### `WS /ws/player/{player_id}`
Mensajes que el jugador puede enviar:
- `{"type": "tirar_dado", "stat": "carisma", "contexto": "Lo coimeás"}` → server tira 2d6, los suma, aplica modificador de NA (ver sección 5.4/8), devuelve resultado a ese jugador y lo loguea para el DM. `contexto` es **opcional**: si el jugador eligió una `opción` de la situación activa (sección 5.8), se manda el texto de esa opción solo para que el log del DM sea legible ("Facu intentó coimear (Suerte)" en vez de "Facu tiró Suerte"); no cambia la mecánica de la tirada en nada.
- `{"type": "usar_habilidad"}` → marca habilidad usada, devuelve texto de la habilidad.
- `{"type": "resolver_prenda", "prenda_id": 7}` → saca esa prenda de sus `prendas_activas`. Nota: originalmente esta sección solo listaba `resolver_prenda` como mensaje del DM (ver `WS /ws/dm` más abajo), pero el milestone 5 pide explícitamente un botón de "resolver" en la pantalla del jugador — se agrega acá para que el jugador pueda resolverla él mismo, sin depender de que el DM lo haga por él. Las dos vías (DM o jugador) llaman a la misma mutación en `game_state.py` y quedan habilitadas
- `{"type": "intentar_levante", "npc_id": "..."}` → solo válido si `npcs_revelados[npc_id]["jugador_objetivo"]` es este jugador. Tira Carisma vs `dificultad_chamuyo` del NPC (2d6 + Carisma + modificador_na vs el número), marca el NPC como `resuelto` y devuelve `resultado_levante` con el `puntaje_lindura` real, sin importar el NA que tenga en ese momento (el misterio ya cumplió su función al revelarse la carta, no en el resultado)
- `{"type": "intentar_confrontacion", "npc_id": "...", "stat": "aguante"}` → solo válido si es el `jugador_objetivo` y `stat` es uno de los listados en `opciones` del NPC. Tira ese stat contra la dificultad de referencia que el DM diga en voz alta (sección 8) — la consecuencia la sigue aplicando el DM a mano (NA, prenda), como con cualquier otra tirada

Mensajes que el jugador recibe (push del server):
- `{"type": "estado", "na": 2, "prendas": [...], "fase": "boliche", "zona_actual": "barra", "npcs_revelados": {...}, "situacion_actual": {...} | null}` (cada vez que cambia algo suyo, el mapa o la situación activa de la fase; las zonas fijas de la fase se resuelven client-side contra `data/mapa.json`; `situacion_actual` trae el evento completo, con `opciones` si las tiene)
- `{"type": "npc_revelado", "npc": {...}, "zona": "barra" | null}` — NPCs `"ambiente"` llegan por broadcast a **todos** los jugadores, como antes. NPCs `"levante"`/`"confrontacion"` llegan **solo al `jugador_objetivo`** (mensaje dirigido, no broadcast); para `"levante"`, si el NA de ese jugador en el momento del reveal es alto (ver sección 2, "Misterio de lindura"), el objeto `npc` llega sin `nombre`/`avatar`/`puntaje_lindura` reales — reemplazados por placeholders de misterio (`"❓"`, `"Alguien"`) que el frontend muestra tal cual
- `{"type": "resultado_levante", "npc_id": "...", "exito": true, "puntaje_lindura": 7, "dado_total": 14}` → push al `jugador_objetivo` al resolver el intento, siempre con el dato real ya revelado
- `{"type": "narracion", "texto": "..."}` (cuando el DM dispara narración IA)

### `WS /ws/dm`
Mensajes que el DM puede enviar:
- `{"type": "avanzar_fase"}` → previa → boliche → after → terminado. Al avanzar, `npcs_revelados`, `situacion_actual` y `eventos_usados` de la fase nueva se vacían, y los `zona_actual` de los jugadores vuelven a la primera zona de la fase nueva
- `{"type": "ajustar_na", "player_id": "...", "delta": 1}`
- `{"type": "repartir_prenda", "player_id": "...", "prenda_id": 7}` (o `null` para random del mazo)
- `{"type": "resolver_prenda", "player_id": "...", "prenda_id": 7}`
- `{"type": "mover_jugador", "player_id": "...", "zona": "barra"}` → cambia `zona_actual` de ese jugador (debe ser una zona válida de `data/mapa.json` para la fase activa)
- `{"type": "revelar_npc", "npc_id": "martina", "zona": "barra"}` (NPC ambiente, sin cambios) o `{"type": "revelar_npc", "modo": "random"}` (elige uno no revelado todavía de la fase activa) → agrega el NPC a `npcs_revelados`, dispara `npc_revelado` a todos los jugadores
- `{"type": "revelar_npc_encuentro", "npc_id": "...", "jugador_objetivo": "...", "modo": "random"|"elegir"}` → para NPCs `"levante"`/`"confrontacion"`: agrega el NPC a `npcs_revelados` con ese `jugador_objetivo`, dispara `npc_revelado` **solo a ese jugador** (no broadcast). Con `"modo": "random"` el server elige el NPC entre los no usados de tipo levante/confrontación de la fase activa; con `"elegir"` se manda también `npc_id`
- `{"type": "ocultar_npc", "npc_id": "martina"}` → saca al NPC de `npcs_revelados` (para corregir un error del DM, no una mecánica de juego)
- `{"type": "siguiente_situacion", "modo": "random"}` o `{"type": "siguiente_situacion", "modo": "elegir", "titulo": "DNI dudoso"}` → fija `situacion_actual` a ese evento de `eventos.json` (filtrado por fase activa), lo agrega a `eventos_usados[fase]`, y lo empuja a todos los jugadores dentro de su próximo `estado`
- `{"type": "narrar_ia", "prompt_extra": "el Intenso acaba de fallar una tirada de Carisma feo"}` → server arma el prompt con contexto (fase actual, jugador, evento) y llama a Ollama

Mensajes que el DM recibe (push del server):
- `{"type": "estado_completo", "jugadores": {...}, "fase": "...", "npcs_revelados": {...}, "situacion_actual": {...} | null, "log_eventos": [...]}` (broadcast completo cada vez que algo cambia — para un MVP de 6 jugadores esto es más simple y confiable que mandar diffs). El DM siempre ve el `npc` completo en `npcs_revelados` (sin el misterio — el misterio es solo del lado del jugador que no debe saber)

---

## 8. Motor de tiradas (lógica pura, testeable sin web)

Siempre se tiran **2 dados** (no hay variación por NA en la cantidad de
dados) y se suman. El malus de NA alto vive enteramente en
`modificador_na` (sección 5.4), no en la mecánica de dados.

```
tirar(na, stat, stat_valor):
    dado1, dado2 = d6(), d6()
    suma_dados = dado1 + dado2
    modificador = modificador_na(na, stat)  # ver escala de NA, sección 5.4
    total = suma_dados + stat_valor + modificador

    if dado1 == 1 and dado2 == 1:
        tipo = "papelon_automatico"
    elif dado1 == 6 and dado2 == 6:
        tipo = "exito_bonus"
    else:
        tipo = "normal"

    return {tipo, dados_tirados: [dado1, dado2], suma_dados, total}
```

Solo los **dobles** (1-1 o 6-6) cuentan como papelón automático / éxito con
bonus — un solo dado individual en 1 o en 6 no alcanza (con 2 dados
sumados, "cualquiera de los dos" sería demasiado frecuente, ~31% de las
tiradas en vez del ~17% original).

Dificultades de referencia para el DM (no automatizadas — el DM las dice en
voz alta antes de la tirada, contra el `total` de la tirada). **Recalibradas
acá** respecto a la versión original del documento (esas cifras — 4/5/6/7+
— estaban pensadas para 1d6 + stat, quedaron obsoletas desde que la tirada
pasó a ser 2d6 + stat, sección 2): **10 fácil · 13 normal · 16 difícil ·
19+ muy difícil**. Mismo número que usa `dificultad_chamuyo` en NPCs de
levante (sección 5.5).

---

## 9. Integración con Ollama

```python
import httpx

async def narrar(contexto: str) -> str:
    prompt = f"""Sos el narrador de un juego de rol tipo D&D ambientado en
una noche de joda argentina (previa, boliche, after). Escribí 2-3 líneas
de narración en tono irónico y picante, sin exagerar, en español rioplatense.
No repitas literalmente el contexto, narralo con humor.

Contexto: {contexto}"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post("http://localhost:11434/api/generate", json={
                "model": "llama3.2:3b",
                "prompt": prompt,
                "stream": False
            })
            return r.json()["response"].strip()
    except Exception:
        return None  # el DM narra manualmente, el juego no se rompe
```

**Setup previo (una sola vez, antes de la noche del juego):**
```bash
# instalar ollama: https://ollama.com/download
ollama pull llama3.2:3b
ollama serve   # dejar corriendo en background
```

Probar `phi3:mini` también y quedarse con el que ande más rápido en esa
notebook específica — en CPU puro puede variar bastante según el hardware.

---

## 10. Estructura de carpetas

```
joda-rpg/
├── app.py                  # FastAPI app, rutas, websockets
├── game_state.py           # estado en memoria + lógica de mutación
├── dice.py                 # motor de tiradas (función pura, testeable)
├── ai_narrator.py          # integración con Ollama
├── data/
│   ├── personajes.json
│   ├── prendas.json
│   ├── eventos.json
│   ├── npcs.json            # mazo de NPCs revelables, por fase
│   └── mapa.json            # zonas fijas por fase (contenido, no posición)
├── static/
│   ├── dm.html              # panel del DM
│   ├── jugador.html         # vista del jugador
│   ├── style.css            # incluye los design tokens de la sección 5.7
│   ├── dm.js
│   ├── jugador.js
│   └── mapa.js              # lógica compartida de render del mapa (zonas, tokens, cartas de NPC)
└── requirements.txt         # fastapi, uvicorn, httpx, websockets
```

---

## 11. Plan de implementación (milestones para Claude Code)

Ir en este orden — cada milestone es jugable/testeable antes de pasar al siguiente:

1. **Esqueleto:** FastAPI corriendo, sirve `/dm` y `/jugador` como HTML estático, `data/*.json` cargando sin errores.
2. **Join + estado básico:** `/join` funciona, el jugador aparece en `game_state`, el panel del DM lo muestra en una lista simple.
3. **Tiradas:** botón de tirar dado en `/jugador`, elige stat, ve resultado. Lógica en `dice.py` con tests simples (`pytest`) antes de conectarlo a la web.
4. **NA en vivo:** el DM puede subir/bajar NA de cualquier jugador, se refleja al instante en el celu de ese jugador (WebSocket push). UI del NA como "termómetro" visual (0 a 5).
5. **Prendas:** el DM reparte prenda (random o elegida), el jugador la ve en su pantalla, botón de "resolver" que la saca de activas.
6. **Fases:** botón de avanzar fase en el DM, todos los jugadores ven la fase actual, el DM ve la tabla de eventos correspondiente a la fase activa (de `eventos.json`) como tarjetas de referencia.
7. **Modo Caos:** cuando `na >= 3`, el jugador ve destacado en su pantalla su Modo Caos (nombre, efecto, consecuencia) para que sepa que está activo.
8. **Mapa por fase:** `/dm` muestra las zonas de la fase activa (`data/mapa.json`) con los jugadores ubicados en su `zona_actual`. El DM puede mover un jugador de zona con un click/dropdown. En `/jugador`, un botón "🗺️ ¿Qué está pasando?" abre el mapa simplificado (mismas zonas, mismos jugadores) — todavía sin NPCs.
9. **Cartas de NPC:** el DM elige un NPC del mazo de la fase (`data/npcs.json`) y lo revela en una zona. Aparece como marcador en el mapa del DM y como carta (nombre, apodo, avatar, frase) en el celu de todos los jugadores a la vez, con botones "Hablar"/"Ignorar" que solo cierran la carta. Aplicar acá la estética neon boliche de la sección 5.7 a las pantallas de mapa y carta.
10. **Situación actual con opciones:** en `/dm`, reemplazar la lista estática de eventos del milestone 6 por un picker de "situación actual" — botón "🎲 Aleatoria" (no repetida en la fase) o elegir una puntual de la lista, con `eventos_usados` llevando la cuenta. La situación activa se empuja a todos los jugadores. Si el evento tiene `opciones` (sección 5.8), el jugador ve esas opciones en vez de sus 5 stats libres y al elegir una dispara `tirar_dado` con el stat correspondiente; si no tiene `opciones`, se comporta como hoy.
11. **Encuentros de NPC por turnos (levante/confrontación):** `data/npcs.json` gana los tipos `"levante"` y `"confrontacion"` (sección 5.5). El DM asigna el encuentro a un jugador específico (random o elegido) — llega dirigido solo a ese jugador, no a todos. Levante: tirada de Carisma vs `dificultad_chamuyo`, con el `puntaje_lindura` oculto si el jugador tiene NA alto (misterio, sección 2) y revelado siempre al resolver. Confrontación: el jugador elige una opción de enfoque (pelear/convencer/sobornar) igual que en el milestone 10. El contenido real de estos NPCs (quiénes son, sus dificultades) se define aparte — este milestone es la mecánica, no el contenido.
12. **Ollama:** botón "Narrar con IA" en el panel del DM, con un campo de texto libre para dar contexto extra, muestra el resultado y lo puede broadcastear a todos o solo leerlo él.
13. **Pulido:** aplicar los design tokens de la sección 5.7 (fondo oscuro, acentos cian/rosa/violeta) al resto de `/dm` y `/jugador` que quedó con el estilo básico de los primeros milestones, manteniendo mobile-first en `/jugador` (esto lo van a mirar todos en el celu con poca luz y varios tragos encima — tipografía grande, botones grandes, alto contraste).

No paralelizar estos pasos — cada uno depende del anterior y es mejor
tener algo jugable temprano por si hay que cortar el desarrollo antes de
tiempo.

---

## 12. Checklist de la noche del evento

- [ ] `ollama serve` corriendo, modelo bajado
- [ ] `uvicorn app:app --host 0.0.0.0 --port 8000` corriendo
- [ ] Anotar la IP local de la notebook (`ipconfig getifaddr en0` en Mac / `hostname -I` en Linux)
- [ ] Mandar al grupo: `http://<esa-ip>:8000/jugador`
- [ ] Tener el hotspot del celu como plan B si la wifi del lugar falla
- [ ] Está bien si Ollama no responde a tiempo — el DM narra y sigue