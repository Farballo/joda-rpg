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
- Sistema de **encuentros con NPC por turnos, resueltos con un árbol de
  diálogo de 1 a 3 rondas encadenadas**: NPCs de tipo "levante" (intentar
  levantarse a alguien, con puntaje de atractivo y dificultad de chamuyo
  por ronda) y de tipo "confrontación" (pelear/convencer/sobornar a
  alguien, como un patovica o un grupo de rugbiers, con dificultad
  automática por ronda). Cada ronda tira dados de verdad y suma a un
  acumulado; recién al llegar a una hoja del árbol (o cuando el DM corta
  con "Otro") se compara ese acumulado contra la dificultad total. Todos
  los NPCs se revelan igual (global); el encuentro es un paso aparte que
  el DM le asigna a un jugador específico sobre un NPC ya revelado — ver
  sección 2 y 5.5
- **Puntaje total de la noche por jugador**, con historial de qué resolvió
  y qué no: +1 por situación resuelta, +1 por confrontación ganada,
  +`puntaje_lindura` del NPC por levante exitoso, 0 en cualquier fracaso.
  Visible tanto para el DM (ranking con detalle por jugador) como para
  cada jugador (su propio historial) — ver sección 2 y 6
- Narración asistida por IA local (Ollama) opcional, disparada por el DM

**Fuera de alcance del MVP** (se agrega después si el MVP funciona bien en
una previa real): sistema de Reputación, recompensas de coronación,
persistencia entre reinicios del server. *(El sistema de Encare/chamuyo
que este documento excluía originalmente ya no está fuera de alcance —
ver la fila "Encare por rondas (árbol de decisiones)" en la sección 2:
se agregó explícitamente a pedido, en una versión acotada, y después se
extendió a un árbol de varias rondas con puntaje total — también a
pedido explícito.)*

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
| Posicionamiento en el mapa | **Zonas fijas por variante de mapa**, no drag & drop libre. Cada fase define una o más variantes de mapa en `data/mapa.json` (ej. distintos deptos/boliches), cada una con sus zonas (living, cocina, barra, VIP, etc.) y su posición/tamaño (`pos`, en % del contenedor). El DM asigna un jugador o un NPC a una zona con un click/dropdown, no arrastrando tokens a coordenadas libres |
| Mapas configurables con nombre + posición | *(Revierte la fila anterior de esta tabla en versiones previas del plan, que ponía la posición en CSS.)* Cada fase puede tener **varias variantes de mapa** con nombre visible en pantalla (ej. "Depto de Cruza" vs "Depto de Banana"), para que la previa/el boliche no sean siempre el mismo lugar. La posición de cada zona (`pos: {left, top, width, height}`) se movió de `static/style.css` a `data/mapa.json` porque cada variante puede tener zonas distintas — hardcodear la posición por `id` de zona en CSS no escala a mapas configurables. Al entrar a una fase se elige una variante al azar; el DM puede forzar una variante puntual con el mensaje `cambiar_mapa` sin cambiar de fase — ver sección 5.6 y 7 |
| Volver atrás de fase | El DM puede retroceder una fase (`retroceder_fase`, sección 7) además de avanzar. Comparte la misma lógica de "entrar a una fase" que avanzar (`avanzar_fase`): elige una nueva variante de mapa al azar, limpia la situación activa y los NPCs revelados, y resetea la zona de todos los jugadores a la primera de la variante nueva. No aplica el reset de NA de Leyenda Urbana (eso es específico de *entrar* al After, no de salir). No hace nada si ya está en la primera fase (`previa`) |
| Revelado de NPCs | **Un solo flujo de revelado para todos los tipos de NPC.** El DM elige un NPC del "mazo" de la fase actual (`data/npcs.json`, filtrado por su campo `fase`) y lo revela en una zona, sin importar si es `ambiente`, `levante` o `confrontacion`. La carta se dispara a todos los jugadores y queda como marcador fijo en el mapa. Los botones de la carta ("Hablar"/"Ignorar") sólo marcan que el jugador la vio — igual que con los eventos de fase, el DM sigue narrando y aplicando consecuencias (NA, prenda) a mano, sin lógica automática. *(Revierte el esquema anterior, donde los NPCs de levante/confrontación tenían su propio flujo de revelado dirigido a un jugador: revelar y disparar el encuentro eran la misma acción. Ahora son **dos pasos separados** — ver la fila de abajo.)* |
| Revelar ≠ iniciar encuentro | Revelar un NPC nunca dispara mecánica. Si el NPC es de tipo `levante` o `confrontacion`, el encuentro es un **segundo paso aparte**: sobre un NPC **ya revelado**, el DM elige un jugador y arranca el encuentro (`iniciar_encuentro`, sección 7). Narrativamente: primero el personaje aparece en escena y lo ve todo el mundo; después, en algún momento, se cruza con alguien puntual |
| Un encuentro por vez (bloqueo global) | **No puede haber más de un encuentro sin resolver en toda la partida a la vez**, ni siquiera con NPCs distintos o jugadores distintos. El bloqueo es global, no por jugador: en la mesa real el DM narra un encuentro por vez y tener dos escenas abiertas en paralelo es más confuso que útil. Mientras hay uno pendiente, el panel del DM deshabilita el botón de iniciar y el server rechaza el mensaje. Se destraba de dos formas: que el jugador tire (queda `resuelto`), o que el DM saque al NPC de escena con `ocultar_npc` (que también cancela su encuentro) |
| Estilo visual | Estética "neon boliche" de `mockups/JODA_RPG_mockups_neon_boliche.html` y `mockups/JODA_RPG_mockups_mapas_vivos.html`: fondo oscuro, acentos cian/rosa/violeta, tipografía grande y en negrita, tarjetas con bordes suaves. Se implementa con HTML/CSS plano (divs con posición absoluta, como en los mockups), sin canvas ni librerías de mapas — ver sección 5.7 para los tokens de diseño |
| Alcance de los turnos | **Solo los encuentros de NPC** (levante/confrontación, ver fila de abajo) son por turnos. El resto del juego — tiradas libres de stat, NA, prendas, situaciones de fase — sigue funcionando como ya está: cualquier jugador actúa cuando quiere, sin esperar turno. No se reestructura lo ya construido en los milestones 1-9 |
| Orden de turno en encuentros | El DM asigna a mano qué jugador le toca en cada encuentro de NPC (levante o confrontación), sin rotación automática fija. Más trabajo para el DM que una cola automática, pero más flexible para narrar (ej. asignarle el encuentro al jugador que más sentido tenga en ese momento) |
| Encuentros de NPC (levante/confrontación) | Se agrega `tipo` a `data/npcs.json`: `"ambiente"` (los NPCs ya existentes, decorativos, sin mecánica propia), `"levante"` (intentar levantarse a alguien: `puntaje_lindura` 1-10 y `dificultad_chamuyo` por ronda) o `"confrontacion"` (pelear/convencer/sobornar a alguien: `dificultad` automática por ronda, misma escala que el resto de la app). Los tres se **revelan igual** (revelado global, ver arriba); lo que distingue a levante/confrontación es que además admiten un **encuentro dirigido a un jugador específico** encima del reveal, resuelto con el árbol de diálogo de la fila de abajo — ver sección 5.5 y 7 |
| Encare por rondas (árbol de decisiones) | El encuentro de un NPC de levante/confrontación **no se resuelve en una sola tirada**: `data/npcs.json` le agrega un campo `arbol` con 1 a 3 rondas ramificadas (`nodos`, cada uno con 2 `opciones` que llevan a un nodo distinto o cierran el encuentro). Cada ronda elegida tira dados de verdad y suma su `total_ajustado` (ver fila de abajo) a un `acumulado` del encuentro; recién al llegar a una opción sin `siguiente` (una hoja del árbol) se resuelve todo junto: `exito = acumulado >= dificultad_por_ronda * rondas_jugadas`. Reemplaza el esquema anterior de una sola tirada (`opciones` planas en confrontación, tirada única en levante) — ver sección 5.5 y 7. El servidor camina el árbol con dos funciones, `elegir_opcion_encare` y `resolver_ronda_encare` (ver fila de abajo), para los dos tipos |
| Override del DM en cualquier ronda ("Otro") | El DM tiene, en cualquier ronda del árbol, la posibilidad de narrar algo propio en vez de usar las opciones predefinidas — mismo patrón que el "Otro (decide DM)" que ya existe en situaciones (sección 5.3/5.8). El jugador manda el `stat` que el DM le dijo en voz alta (`stat_otro`); esa ronda cierra el encuentro ahí mismo (como si fuera una hoja del árbol), calculando la dificultad total solo con las rondas efectivamente jugadas hasta ese punto. El servidor no necesita saber qué narró el DM, solo qué stat tirar |
| Ajuste de dificultad en vivo del DM | El jugador elige una opción del árbol (ej. "Decirle un comentario"), pero lo que **dice de verdad** lo improvisa en voz alta a la mesa — el server no tiene forma de evaluar eso solo. Por eso la ronda se resuelve en **dos pasos**: primero el jugador elige (`elegir_opcion_encare`, `WS /ws/player/{player_id}`), que deja la ronda en estado `pendiente` **sin tirar los dados todavía**; recién cuando el DM, después de escuchar la frase, juzga qué tan bien estuvo y manda `resolver_ronda_encare` (`WS /ws/dm`) con un `modificador_dm` (bonus si estuvo bueno, malus si estuvo flojo — botones preset en el panel del DM, sección 5.7), el server tira y suma `total_ajustado = total + modificador_dm` al acumulado. El `modificador_dm` no toca la escala de `dificultad_chamuyo`/`dificultad` del NPC, sube o baja el resultado de esa tirada puntual — mismo efecto narrativo ("dificultad más baja/alta para ese intento") con menos piezas nuevas en el modelo de datos |
| Reutilización de NPCs de encuentro | Un NPC de encuentro **no se agota al usarse**: una vez que su encuentro queda `resuelto`, se le puede iniciar otro al mismo jugador o a otro más adelante en la misma fase (un mismo personaje puede cruzarse con más de uno en la noche). El NPC sigue revelado en el mapa todo el tiempo; lo único que se resetea es el encuentro encima suyo (vuelve a arrancar del nodo `inicio` del árbol, con `acumulado` y `rondas_jugadas` en cero) |
| Puntaje total de la noche | Cada jugador acumula un `puntaje` numérico durante toda la partida: +1 por situación resuelta con éxito, +1 por confrontación ganada, +`puntaje_lindura` del NPC por levante exitoso, 0 en cualquier fracaso (de situación o de encuentro). Cada resultado también se agrega a un `historial` por jugador (tipo, nombre del NPC/situación, éxito, puntos). El puntaje y el historial se registran **una sola vez por encuentro resuelto** (al llegar a la hoja del árbol o al cortar con "Otro"), no una vez por ronda. Visible en el panel del DM (tab con ranking + detalle plegable por jugador) y del lado del jugador (chip con overlay de su propio historial) — ver sección 6 y 7 |
| Misterio de lindura en el levante | Si el jugador objetivo tiene NA alto (propuesta: **NA ≥ 8, "Irrecuperable"**, umbral ajustable), la **carta del encuentro** le llega **sin revelar**: sin nombre, sin imagen, sin `puntaje_lindura` — solo "❓ Alguien te llama la atención". El jugador igual puede intentar el chamuyo a ciegas. Después de resolver el intento (haya salido bien o mal), se revela la identidad real sin importar el NA — el misterio es previo a la tirada, no una tirada distinta ni un fallo automático. **El misterio vive solo en la carta del encuentro, no en el reveal:** como el reveal es global, el NPC ya se ve con nombre y todo en el mapa (para el borracho también). La relectura narrativa es que ese jugador puntual está demasiado en pedo para reconocer, en el momento de encararlo, a alguien que el resto sí reconoce. *(Cambió respecto del esquema anterior, donde reveal y encuentro eran la misma acción y el jugador con NA alto no veía al NPC en ningún lado.)* |
| Situaciones con opciones | *(Decisión histórica, superada por el rediseño de situaciones de la sección 5.3/5.8: `opciones` ya no trae un `stat` por opción, la situación entera tiene uno solo.)* Los eventos de `data/eventos.json` pueden tener un campo opcional `opciones`. Si el evento tiene `opciones`, el jugador elige una en vez de tirar cualquiera de sus 4 stats libremente; si no las tiene, se comporta como hoy (tirada libre, el DM decide qué stat pedir en voz alta). No todos los eventos necesitan `opciones` — es un campo opcional, se completa evento por evento más adelante (ver sección 5.8) |
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

**`habilidad_unica` se sacó del todo** (y con ella `habilidad_usada_fase`/
`habilidad_usada_noche` del estado del jugador, sección 6, y el mensaje
`usar_habilidad` que nunca se llegó a implementar) — a pedido explícito,
por ser demasiada mecánica extra para gestionar en una previa real. En su
lugar, `debilidad` pasó de ser solo texto de sabor a un mecanismo activo:
tiene un `stat` y un `modificador` concretos, y el DM la puede **activar y
desactivar a mano** para un jugador puntual (mensajes `activar_debilidad` /
`desactivar_debilidad`, sección 7) — el jugador no la puede desactivar él
mismo. Mientras está activa se ve en la pantalla del jugador (igual que
Modo Caos) y el modificador se aplica de verdad a cualquier tirada de ese
stat (`stat_efectivo` en `game_state.py`), no es solo texto para el DM.

**El stat Presencia se sacó del todo** (a pedido explícito, para tener
menos cosas que gestionar en una previa real) — quedan **4 stats**:
Carisma, Aguante, Astucia, Suerte. `dice.SOCIALES` pasó a ser solo
`{"carisma"}` (sección 5.4/8). Esto obligó a reasignar todo lo que
dependía de Presencia:
- **Debilidad** de Payaso y Tímido, que antes pegaban sobre Presencia,
  ahora pegan sobre Astucia y Carisma respectivamente (ver más abajo).
- **Stat de situaciones** ("Estado del depto", "Alguien los graba",
  "Baile horrible", "Conversación profunda", "Discusión heavy" —
  sección 5.3) y una opción de NPC de confrontación (`hermano_mayor` —
  sección 5.5), reasignados a otro stat que tuviera sentido narrativo.
- **El Intenso** tenía Presencia +4 como su stat más alto — al sacarla se
  quedaba sin ningún stat destacado (el resto queda en 0/-2), a
  diferencia de los otros 5 personajes que sí conservan un +4 en algún
  lado. Para no dejarlo en desventaja frente al resto, ese +4 se movió a
  Carisma (quedó en +4, antes +2) — es un ajuste de balance, no un pedido
  explícito, así que se puede revisar si no cierra con el resto.

```json
[
  {
    "id": "intenso",
    "nombre": "El Intenso",
    "frase": "Si no pasa algo ahora, no pasa nunca.",
    "stats": { "carisma": 4, "aguante": 0, "astucia": -2, "suerte": -2 },
    "modo_caos": {
      "nombre": "AHORA O NUNCA",
      "efecto": "Una vez por escena, puede forzar una acción extrema sin tirar dados (encarar, gritar, subirse a algo, confrontar a alguien).",
      "consecuencia": "El DM elige una consecuencia grave: expulsión, pelea, ruptura social o cambio forzado de fase."
    },
    "debilidad": {
      "nombre": "No puede quedarse quieto",
      "descripcion": "No puede ignorar provocaciones. Si alguien lo desafía públicamente, debe reaccionar aunque pierda.",
      "stat": "astucia",
      "modificador": -2
    }
  },
  {
    "id": "suertudo",
    "nombre": "El Suertudo",
    "frase": "No sé cómo pasó, pero salió.",
    "stats": { "carisma": 0, "aguante": -2, "astucia": 0, "suerte": 4 },
    "modo_caos": {
      "nombre": "Modo Dios",
      "efecto": "Todas las tiradas cuentan con +2 de suerte adicional. Podés convertir 1 fallo por fase en éxito total.",
      "consecuencia": "Al final de la fase, tirá 1D6. Con 1-2, el karma se guarda: penalizador narrativo acumulado para la próxima fase."
    },
    "debilidad": {
      "nombre": "Subestima el peligro",
      "descripcion": "Si algo depende de planificación, se le complica. Confía tanto en que \"siempre zafa\" que no ve venir el problema.",
      "stat": "astucia",
      "modificador": -2
    }
  },
  {
    "id": "payaso",
    "nombre": "El Payaso",
    "frase": "Pará, pará... mirá esto.",
    "stats": { "carisma": 2, "aguante": 0, "astucia": 2, "suerte": 0 },
    "modo_caos": {
      "nombre": "Caos Puro",
      "efecto": "Cada vez que fallás una tirada, podés repetirla. Si tiene éxito, arrastra a otro jugador a la escena.",
      "consecuencia": "Cada repetición: Alcohol +1. Nunca es solo: siempre involucra a alguien más."
    },
    "debilidad": {
      "nombre": "No banca el silencio",
      "descripcion": "Si hay un silencio incómodo, tiene que intervenir. Le cuesta no exagerar incluso cuando no conviene.",
      "stat": "astucia",
      "modificador": -2
    }
  },
  {
    "id": "gymbro",
    "nombre": "El Gym Bro",
    "frase": "Tranqui, yo me la banco.",
    "stats": { "carisma": -2, "aguante": 4, "astucia": -2, "suerte": 0 },
    "modo_caos": {
      "nombre": "Animal",
      "efecto": "Aguante pasa a +6. Ignora dolor, empujones y cansancio.",
      "consecuencia": "Todas las tiradas de Astucia fallan automáticamente. Tiende a resolver todo con el cuerpo."
    },
    "debilidad": {
      "nombre": "No lee la sala",
      "descripcion": "Si alguien lo desafía físicamente, tiene que aceptar o escalar. Le cuesta leer indirectas y límites sociales.",
      "stat": "astucia",
      "modificador": -2
    }
  },
  {
    "id": "timido",
    "nombre": "El Tímido",
    "frase": "Yo estoy bien acá... creo.",
    "stats": { "carisma": -2, "aguante": 2, "astucia": 4, "suerte": 0 },
    "modo_caos": {
      "nombre": "Me solté",
      "efecto": "Carisma pasa de -1 a +1. Puede iniciar interacciones sociales sin penalización.",
      "consecuencia": "Después de cada interacción social, tirá 1D6. Con 1-3, se arrepiente (pierde Carisma hasta la próxima escena). Con 4-6, se entusiasma (Alcohol +1)."
    },
    "debilidad": {
      "nombre": "Se achica con la atención encima",
      "descripcion": "Evita liderar situaciones incluso cuando tiene razón. Si hay mucha gente o atención encima, se le nota en la cara.",
      "stat": "carisma",
      "modificador": -2
    }
  },
  {
    "id": "fachero",
    "nombre": "El Fachero",
    "frase": "No hace nada extraordinario... pero todo le queda bien.",
    "stats": { "carisma": 4, "aguante": 0, "astucia": 0, "suerte": -2 },
    "modo_caos": {
      "nombre": "Invencible",
      "efecto": "Todos los fallos de Carisma se repiten automáticamente.",
      "consecuencia": "Si vuelve a fallar: se genera una rivalidad inmediata, o aparece un quilombo por ego."
    },
    "debilidad": {
      "nombre": "No banca el rechazo",
      "descripcion": "Le cuesta aceptar el rechazo o la indiferencia. Si alguien lo supera en público, se le nota enseguida.",
      "stat": "carisma",
      "modificador": -2
    }
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

Cada situación tiene título, una descripción narrativa (`texto`, en
segunda persona, lo que el jugador ve/vive), un umbral numérico
(`dificultad`, misma escala que la sección 8: 10 fácil · 13 normal · 16
difícil · 19+ muy difícil) que el servidor usa para calcular
éxito/fracaso automáticamente, y `opciones`: 2-3 formas de encarar la
situación, cada una con su propio `stat` — **el stat varía según la
opción elegida** (a pedido explícito; antes era un solo `stat` fijo para
toda la situación). Esto vuelve a ser el mismo esquema que `opciones` en
NPCs de confrontación (sección 5.5/5.8) — dejaron de ser esquemas
distintos.

Además de las `opciones` del dato, el jugador **siempre** tiene una
opción extra que no está en `eventos.json`: **"Otro (decide DM)"**. La
arma el cliente (`OTRO_OPCION` en `game_state.py` y en `jugador.js`),
deja elegir cualquiera de los 4 stats jugables, y sirve para cuando el
DM quiere pedir un stat puntual en voz alta que no está entre las
opciones predefinidas — es la única vía que queda para una tirada
"libre" ligada a una situación (a diferencia de `tirar_dado`, que sigue
existiendo aparte para tiradas totalmente sueltas sin situación de por
medio).

Esto sigue sin ser lógica ramificada automática de *consecuencias*: el
servidor solo calcula si la tirada superó la `dificultad` (igual que ya
hace con `dificultad_chamuyo` en NPCs de levante); el DM sigue siendo
quien decide y aplica a mano qué pasa después (NA, prenda), como
siempre. La situación se resuelve con la **primera** tirada de cualquier
jugador y queda cerrada para el resto (igual que un encuentro de NPC con
`resuelto`) — no tiene sentido que cinco jugadores tiren la misma
situación grupal cinco veces.

```json
{
  "previa": [
    { "titulo": "¿Quién trae alcohol?", "texto": "Entrás al departamento, mirás la mesa y no hay ni una botella de agua. En ese momento dudás que alguien se haya hecho cargo de comprar para tomar.", "dificultad": 13, "opciones": [
      { "texto": "Preguntar si alguien compró", "stat": "astucia" },
      { "texto": "Abrir la heladera para revisar", "stat": "suerte" }
    ] },
    { "titulo": "Estado del depto", "texto": "Faltan minutos para que empiecen a llegar y todavía no está claro si el lugar aguanta la previa: hielo, vasos, y un baño que funcione.", "dificultad": 13, "opciones": [
      { "texto": "Organizar rápido antes de que lleguen todos", "stat": "astucia" },
      { "texto": "Repartir tareas entre los que están", "stat": "carisma" }
    ] },
    { "titulo": "Las minas, ¿llegan?", "texto": "El grupo de la otra previa todavía no confirmó y el clima empieza a bajar un poco. Alguien tiene que hacer algo para que se sumen.", "dificultad": 13, "opciones": [
      { "texto": "Mandarles un mensaje con onda", "stat": "carisma" },
      { "texto": "Llamarlas para insistir un poco", "stat": "suerte" }
    ] },
    { "titulo": "Primer papelón", "texto": "El que ya está más pasado de la cuenta se resbala con algo — un comentario, un paso en falso, un vaso volcado — y todas las miradas van para ahí.", "dificultad": 13, "opciones": [
      { "texto": "Reírte de vos mismo antes que los demás", "stat": "carisma" },
      { "texto": "Disimular como si no hubiera pasado nada", "stat": "astucia" }
    ] },
    { "titulo": "Decidir cuándo salir", "texto": "Ya es tarde, todos están con ganas, pero nadie se decide a cortar la previa y arrancar para el boliche.", "dificultad": 13, "opciones": [
      { "texto": "Proponer salir ya", "stat": "carisma" },
      { "texto": "Calcular los tiempos antes de decidir", "stat": "astucia" }
    ] }
  ],
  "boliche": [
    { "titulo": "Patova con ganas de romper las bolas", "texto": "En la puerta, el patovica te mira de arriba a abajo con cara de pocos amigos. Parece que hoy decidió complicarle la entrada a todo el mundo.", "dificultad": 16, "opciones": [
      { "texto": "Hacerte el piola y charlar", "stat": "carisma" },
      { "texto": "Mostrar que sos conocido del lugar", "stat": "suerte" }
    ] },
    { "titulo": "DNI dudoso", "texto": "Se lo das al de seguridad y lo mira más tiempo del necesario, comparando la foto con tu cara como si algo no le cerrara.", "dificultad": 13, "opciones": [
      { "texto": "Entregarlo con total normalidad", "stat": "suerte" },
      { "texto": "Distraerlo con un comentario", "stat": "carisma" }
    ] },
    { "titulo": "Tragos carísimos", "texto": "Llegás a la barra y ves los precios: una fortuna por trago. El barman espera tu pedido con cara de que no va a regalar nada.", "dificultad": 13, "opciones": [
      { "texto": "Pedir un descuento por grupo", "stat": "carisma" },
      { "texto": "Buscar alguna promo o 2x1", "stat": "astucia" }
    ] },
    { "titulo": "Shot de regalo sospechoso", "texto": "Alguien te acerca un shot de un color que no existe en la naturaleza. \"Invita la casa\", dice, sin dar más detalles.", "dificultad": 13, "opciones": [
      { "texto": "Tomarlo de un trago sin preguntar", "stat": "aguante" },
      { "texto": "Olerlo primero antes de decidir", "stat": "astucia" }
    ] },
    { "titulo": "Empujón fuerte", "texto": "En medio de la pista alguien te choca fuerte sin querer y por un segundo perdés el equilibrio en pleno movimiento.", "dificultad": 13, "opciones": [
      { "texto": "Recuperar el equilibrio al toque", "stat": "aguante" },
      { "texto": "Devolver el empujón como si nada", "stat": "suerte" }
    ] },
    { "titulo": "Música de mierda", "texto": "El DJ pone un tema que nadie banca y en un segundo el clima de la pista se cae en picada.", "dificultad": 13, "opciones": [
      { "texto": "Pedirle al DJ que cambie el tema", "stat": "carisma" },
      { "texto": "Arrancar a bailar igual para arrastrar al resto", "stat": "aguante" }
    ] },
    { "titulo": "Alguien los graba", "texto": "Un desconocido te apunta con el celular grabando justo en medio de la pista, sin ningún disimulo.", "dificultad": 13, "opciones": [
      { "texto": "Actuar como si no pasara nada", "stat": "astucia" },
      { "texto": "Exagerar todo para la cámara", "stat": "carisma" },
      { "texto": "Taparte la cara y salir del cuadro", "stat": "aguante" }
    ] },
    { "titulo": "Baile horrible", "texto": "Te agarra un ataque de baile que no tiene absolutamente nada que ver con el ritmo de la canción, y ya te vieron.", "dificultad": 13, "opciones": [
      { "texto": "Bailarlo con toda la confianza del mundo", "stat": "carisma" },
      { "texto": "Intentar disimular el paso", "stat": "astucia" }
    ] },
    { "titulo": "Se pierde un jugador", "texto": "En medio del quilombo del boliche te separaste del grupo y ya no ves a nadie conocido por ningún lado.", "dificultad": 13, "opciones": [
      { "texto": "Guiarte por dónde suena más fuerte la música", "stat": "astucia" },
      { "texto": "Mandar mensajes para ubicarlos", "stat": "suerte" }
    ] },
    { "titulo": "Alguien vomita", "texto": "Al lado tuyo, alguien no la banca más y vomita justo en medio de todos, sin ningún tipo de aviso previo.", "dificultad": 13, "opciones": [
      { "texto": "Hacerte a un lado justo a tiempo", "stat": "aguante" },
      { "texto": "Ayudarlo disimulando la situación", "stat": "carisma" }
    ] },
    { "titulo": "Momento épico", "texto": "De la nada, todo se alinea: la canción, el grupo, el clima. Es de esos momentos que quedan para la anécdota.", "dificultad": 10, "opciones": [
      { "texto": "Subirte a la ola así como viene", "stat": "suerte" },
      { "texto": "Empujar el momento para que dure más", "stat": "carisma" }
    ] },
    { "titulo": "Caos total de boliche", "texto": "El boliche entero se prende fuego en el mejor sentido posible — o en el peor, todavía no está claro cuál de los dos.", "dificultad": 16, "opciones": [
      { "texto": "Meterte de lleno en el quilombo", "stat": "aguante" },
      { "texto": "Tratar de controlar la situación sin arruinar la joda", "stat": "astucia" }
    ] }
  ],
  "after": [
    { "titulo": "Casa que no es de nadie", "texto": "Llegan a un depto que no es de ninguno de ustedes y nadie tiene muy claro qué se puede tocar y qué no.", "dificultad": 13, "opciones": [
      { "texto": "Preguntar antes de tocar cualquier cosa", "stat": "carisma" },
      { "texto": "Fijarte con cuidado antes de actuar", "stat": "astucia" }
    ] },
    { "titulo": "El dueño se despierta", "texto": "En medio de la noche, el dueño del lugar se despierta de golpe y los encuentra ahí, sin ninguna explicación a mano.", "dificultad": 16, "opciones": [
      { "texto": "Inventar una excusa creíble", "stat": "astucia" },
      { "texto": "Hacerte el invitado de toda la vida", "stat": "carisma" }
    ] },
    { "titulo": "Conversación profunda", "texto": "Se arma una de esas charlas hondas que solo pasan de madrugada, y de repente quedás en el centro de la conversación.", "dificultad": 13, "opciones": [
      { "texto": "Ser sincero aunque incomode", "stat": "carisma" },
      { "texto": "Alivianar el tema con humor", "stat": "astucia" }
    ] },
    { "titulo": "Confesión innecesaria", "texto": "Sentís las ganas irrefrenables de confesar algo que, pensándolo bien, probablemente era mejor guardarse.", "dificultad": 13, "opciones": [
      { "texto": "Soltarlo todo de una", "stat": "suerte" },
      { "texto": "Medir bien las palabras antes de largarlo", "stat": "astucia" }
    ] },
    { "titulo": "Uno se duerme", "texto": "El cansancio te empieza a ganar la pulseada y se te cierran los ojos ahí mismo, en medio de todos.", "dificultad": 13, "opciones": [
      { "texto": "Luchar contra el sueño como se pueda", "stat": "aguante" },
      { "texto": "Pedirle a alguien que te cuide las cosas", "stat": "carisma" }
    ] },
    { "titulo": "Se rompe algo importante", "texto": "En medio del descontrol algo se rompe con un ruido bastante inconfundible, y no hay forma de disimularlo.", "dificultad": 16, "opciones": [
      { "texto": "Intentar arreglarlo antes de que alguien note", "stat": "astucia" },
      { "texto": "Buscar a quién echarle la culpa", "stat": "carisma" }
    ] },
    { "titulo": "Discusión heavy", "texto": "Se arma una discusión pesada que venía hace rato bajo la alfombra, y ya no da para seguir evitándola.", "dificultad": 13, "opciones": [
      { "texto": "Plantarte y decir lo que pensás", "stat": "aguante" },
      { "texto": "Bajar un cambio para que no escale más", "stat": "astucia" }
    ] },
    { "titulo": "Aparición inesperada", "texto": "Alguien totalmente inesperado —ex, vecino, policía, madre— aparece de golpe justo en el peor momento posible.", "dificultad": 16, "opciones": [
      { "texto": "Salir a explicar la situación", "stat": "carisma" },
      { "texto": "Hacer como si todo estuviera bajo control", "stat": "aguante" }
    ] },
    { "titulo": "Resaca anticipada", "texto": "El cuerpo te empieza a pasar factura antes de que termine la noche, y todavía queda un rato largo por delante.", "dificultad": 13, "opciones": [
      { "texto": "Aguantar el estado como sea", "stat": "aguante" },
      { "texto": "Buscar algo para bajar un poco el malestar", "stat": "astucia" }
    ] }
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
| 2-3 | Alegre | +2 en stats sociales (Carisma) |
| 4-5 | Picante | +4 en stats sociales / -2 en stats lógicas (Astucia) |
| 6-7 | **Modo Caos** | Se activa el modo caos del personaje (ver `personajes.json`). Sin modificador numérico propio |
| 8-9 | Irrecuperable | -2 parejo a cualquier stat (reemplaza a la vieja mecánica de "2d6, quedarse con el peor", que dejó de existir porque ahora la tirada siempre es 2d6 fijo) |
| 10 | Leyenda Urbana | El jugador pierde control temporal; el DM narra por él. Vuelve a NA 6 al empezar el After |

### 5.5 `data/npcs.json`

"Mazo" de personajes que el DM puede revelar durante la noche. **Todos los
NPCs se revelan igual**, con la misma acción y con revelado global: la carta
llega a todos los jugadores a la vez y el NPC queda como marcador fijo en la
zona del mapa donde el DM lo puso. `importancia` (`npc` blanco / `importante`
magenta) solo cambia el color de la carta.

Lo que cambia según el `tipo` es qué se puede hacer **después** del reveal:

- **`"ambiente"`**: decorativo, sin mecánica propia (los 5 que ya
  estaban). Se revela y listo — no admite encuentro.
- **`"levante"`**: intentar levantarse a alguien. Tiene `puntaje_lindura`
  (1-10) y `dificultad_chamuyo` (número a superar por ronda, ver más
  abajo). Una vez revelado, el DM le puede iniciar un encuentro a un
  jugador puntual (`iniciar_encuentro`, sección 7) — ver sección 2, fila
  "Misterio de lindura".
- **`"confrontacion"`**: alguien a quien hay que convencer, pelear o
  sobornar para pasar una situación (patovica, rugbiers borrachos,
  etc.). Tiene `dificultad` (número a superar por ronda, gana dificultad
  automática con la misma escala que el resto de la app — sección 8).
  Igual que el levante, el encuentro se inicia aparte sobre el NPC ya
  revelado.

Los dos tipos de encuentro (levante y confrontación) se resuelven con el
**mismo mecanismo de árbol de diálogo** (sección 2, fila "Encare por
rondas"): en vez de una tirada única, `data/npcs.json` les agrega un campo
`arbol`:

```json
"arbol": {
  "inicio": "ronda_1",
  "nodos": {
    "ronda_1": {
      "texto": "Te mira de reojo, atenta a lo que decís.",
      "opciones": [
        { "texto": "Le tirás una frase con toda la soltura", "stat": "carisma",
          "respuesta": "Se ríe y te sigue el juego.", "siguiente": "ronda_2_soltura" },
        { "texto": "La hacés reír con algo random", "stat": "carisma",
          "respuesta": "Levanta una ceja, pero sonríe.", "siguiente": "ronda_2_random" }
      ]
    },
    "ronda_2_soltura": {
      "texto": "Se acerca un paso, con onda.",
      "opciones": [
        { "texto": "Le seguís el clima, tranquilo", "stat": "carisma",
          "respuesta": "Asiente, cómoda.", "siguiente": null },
        { "texto": "Subís la apuesta con algo más directo", "stat": "carisma",
          "respuesta": "Se sorprende, pero no se va.", "siguiente": null }
      ]
    },
    "ronda_2_random": {
      "texto": "Te sigue la joda, medio incrédula.",
      "opciones": [
        { "texto": "Redoblás la apuesta con otro chiste", "stat": "carisma",
          "respuesta": "Se ríe de nuevo, ya más suelta.", "siguiente": null },
        { "texto": "Cambiás el tono, más en serio", "stat": "carisma",
          "respuesta": "Te mira distinto, con más atención.", "siguiente": null }
      ]
    }
  }
}
```

(este ejemplo completo es el de `sofia`, 2 rondas, 12 de `dificultad_chamuyo`
por ronda). `nodos` es un dict `id_nodo → {texto, opciones}`. Cada opción
tiene `texto` (lo que ve el jugador antes de elegir), `stat` (qué se tira si
la elige — en levante siempre `"carisma"`, en confrontación varía por
opción), `respuesta` (lo que el jugador ve después de tirar, antes de pasar
a la siguiente ronda) y `siguiente` (id del próximo nodo, o `null` si esa
opción cierra el encuentro ahí — es una hoja del árbol). La profundidad es
variable por NPC (1 a 3 rondas): con 2 opciones por nodo, profundidad 3 son
7 nodos, manejable a mano. El jugador solo ve, en cada momento, el nodo
`actual` (sin `respuesta` ni `siguiente` de las opciones — sería spoiler de
las ramas futuras); el árbol completo con las respuestas vive únicamente en
el server.

El **encuentro** es la única parte del juego con turno: es dirigido a un
único `jugador_objetivo`, solo él ve la carta con las acciones y solo él
puede tirar. Y solo puede haber **uno sin resolver a la vez en toda la
partida** (sección 2, "Un encuentro por vez").

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

Los 6 NPCs de tipo `levante`/`confrontacion` que se terminaron definiendo
para el MVP (con su árbol completo a mano) son `sofia`, `el_rulo` y
`morocho_after` (levante) y `hermano_mayor`, `vecino_6am` y `patovica`
(confrontación), con profundidades de 1 a 3 rondas repartidas entre los
seis para que no todos los encuentros se sientan iguales:

| NPC | Fase | Tipo | Rondas | dificultad por ronda |
|---|---|---|---|---|
| `morocho_after` | after | levante | 1 | 13 |
| `sofia` | previa | levante | 2 | 12 |
| `el_rulo` | boliche | levante | 3 | 14 |
| `hermano_mayor` | previa | confrontación | 1 | 11 |
| `vecino_6am` | after | confrontación | 2 | 13 |
| `patovica` | boliche | confrontación | 3 | 14 |

`dificultad_chamuyo`/`dificultad` usan la misma escala que las
dificultades de referencia recalibradas en la sección 8 (10 fácil, 13
normal, 16 difícil, 19+ muy difícil), pero como umbral **por ronda**: la
dificultad final de un encuentro es `dificultad_por_ronda * rondas_jugadas`
(sección 2, fila "Encare por rondas"), así que un NPC de 3 rondas ya es
proporcionalmente más difícil sin recalibrar los números de la tabla de
arriba.

### 5.6 `data/mapa.json`

Cada fase tiene una **lista de variantes de mapa** (ej. distintos deptos de
previa, distintos boliches), cada una con `id`, `nombre` (se muestra en
pantalla, tanto en `/dm` como en `/jugador`) y sus `zonas`. Esto permite que
haya varios lugares posibles por fase y que el DM elija cuál usar (o lo deje
en random). La **posición visual** de cada zona (`left`/`top`/`width`/
`height`, en porcentaje) vive *dentro* del JSON, en el campo `pos` de cada
zona — no en CSS — porque cada variante puede tener una cantidad y forma de
zonas distinta, y hardcodear esa posición por `id` de zona en
`static/style.css` no escala a mapas configurables (ver sección 2, tabla de
decisiones).

```json
{
  "previa": [
    {
      "id": "depto_cruza",
      "nombre": "Depto de Cruza",
      "zonas": [
        { "id": "living", "nombre": "Living", "emoji": "🛋️", "pos": { "left": 3, "top": 3, "width": 62, "height": 40 } },
        { "id": "cocina", "nombre": "Cocina", "emoji": "🍕", "pos": { "left": 3, "top": 46, "width": 29, "height": 51 } },
        { "id": "bano", "nombre": "Baño", "emoji": "🚪", "pos": { "left": 35, "top": 46, "width": 30, "height": 51 } },
        { "id": "balcon", "nombre": "Balcón", "emoji": "🌙", "pos": { "left": 68, "top": 3, "width": 29, "height": 94 } }
      ]
    },
    { "id": "depto_banana", "nombre": "Depto de Banana", "zonas": [ "..." ] }
  ],
  "boliche": [
    { "id": "boliche_a", "nombre": "Boliche A", "zonas": [ "..." ] },
    { "id": "boliche_b", "nombre": "Boliche B", "zonas": [ "..." ] }
  ],
  "after": [
    { "id": "after_cruza", "nombre": "Depto de Cruza (After)", "zonas": [ "..." ] },
    { "id": "after_banana", "nombre": "Depto de Banana (After)", "zonas": [ "..." ] }
  ]
}
```

Al entrar a una fase (avanzar o **volver atrás**, ver sección 7) se elige
una variante al azar entre las de esa fase y queda guardada en
`game_state["mapa_actual"]` (ver sección 6). El DM puede además elegir una
variante específica a mano en cualquier momento (mensaje `cambiar_mapa`,
sección 7), sin necesidad de cambiar de fase.

Cada jugador tiene una `zona_actual` (ver sección 6) dentro de las zonas del
`mapa_actual`; por defecto arranca en la primera zona de la variante activa,
y el DM la puede cambiar en cualquier momento. Cambiar de mapa (por fase o
a mano) resetea la `zona_actual` de todos los jugadores a esa primera zona
y limpia los NPCs revelados, porque las zonas de la variante nueva pueden
no tener nada que ver con las de la anterior.

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

### 5.8 `opciones`: esquema compartido (de nuevo)

*(Hubo una versión intermedia de este plan donde `opciones` de
`data/eventos.json` no llevaba `stat` propio —todas las opciones de una
situación tiraban el mismo stat fijo de la situación—. Se volvió atrás a
pedido explícito: ahora vuelve a ser el mismo esquema en los dos lugares
donde se usa.)*

Usado en `data/eventos.json` (situaciones, sección 5.3) y en NPCs
`tipo: "confrontacion"` (`data/npcs.json`, sección 5.5). Cada opción trae
su propio `stat`, porque cada enfoque es mecánicamente distinto:

```json
"opciones": [
  { "texto": "Lo tratás de chamuyar", "stat": "carisma" },
  { "texto": "Lo coimeás", "stat": "suerte" },
  { "texto": "Lo apurás", "stat": "aguante" }
]
```

El jugador elige una opción en su celu; el server tira `2d6 +
stat_efectivo(stat_elegido) + modificador_na` igual que cualquier otra
tirada (sección 8) — es la mecánica de siempre con el stat ya decidido de
antemano por la elección en vez de que el jugador lo elija directo. La
`dificultad` no vive en la opción: para NPCs de confrontación sigue
siendo la que el DM dice en voz alta; para situaciones es el campo
`dificultad` de la situación entera (sección 5.3), la misma sin importar
qué opción se haya elegido.

**Solo las situaciones** (no los NPCs de confrontación) tienen además la
opción implícita **"Otro (decide DM)"**, que no está en el JSON — la
agrega el cliente siempre, con los 4 stats jugables para elegir. Ver el
detalle en 5.3 y el mensaje `intentar_situacion` en la sección 7.

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
            "debilidad_activa": False,   # la activa/desactiva el DM a mano, el jugador no puede
            "zona_actual": "entrada",    # id de zona de la variante de mapa activa (mapa_actual)
            "puntaje": 0,                # +1 situación, +1 confrontación, +puntaje_lindura levante, 0 en fracaso
            "historial": [],             # [{"tipo": "levante"|"confrontacion"|"situacion", "nombre": "...", "exito": bool, "puntos": int}, ...]
        }
    },
    "mapa_actual": { "id": "boliche_a", "nombre": "Boliche A", "zonas": [...] },  # variante de data/mapa.json en uso, ver sección 5.6
    "npcs_revelados": {
        # "<npc_id>": {
        #     "zona": "barra",     # siempre: el reveal es global y todo NPC va al mapa
        #     "encuentro": None,   # o el encuentro dirigido que tiene encima, solo para
        #                          # tipo "levante"/"confrontacion":
        #                          # {
        #                          #     "jugador_objetivo": "<player_id>",
        #                          #     "resuelto": False,
        #                          #     "nodo_actual": "ronda_1",  # id de nodo en npc["arbol"]["nodos"]
        #                          #     "acumulado": 0,            # suma de "total_ajustado" de cada ronda tirada
        #                          #     "rondas_jugadas": 0,
        #                          #     "tiradas": [],             # dice.tirar() + modificador_dm/total_ajustado, por ronda
        #                          #     "pendiente": None,         # opción ya elegida por el jugador, esperando
        #                          #                                # que el DM la resuelva con un modificador — o
        #                          #                                # None si nadie eligió nada todavía en esta ronda:
        #                          #                                # {"stat": "carisma", "respuesta": "...", "siguiente": "ronda_2" | None}
        #                          # }
        # }
    },
    "situacion_actual": None,  # copia del evento activo + estado de resolución (dict) o None:
    # {**evento, "resuelta": False, "resuelta_por": None, "exito": None, "opcion_elegida": None}
    "eventos_usados": {
        "previa": [], "boliche": [], "after": []  # títulos ya mostrados, por fase — para no repetir en modo aleatorio
    },
    "log_eventos": []  # historial simple para mostrar en pantalla del DM
}
```

`npcs_revelados` y `situacion_actual` se reinician (vacíos) cada vez que el
DM avanza o **retrocede** de fase, o cambia de variante de mapa a mano — son
propios de la escena/mapa en el que aparecieron, no persisten a la fase o
variante siguiente. `eventos_usados` **no** se reinicia al avanzar/retroceder
de fase — se arma una sola vez en `estado_inicial()` y se va acumulando
durante toda la partida, para que "🎲 Aleatoria" nunca repita un evento ya
mostrado en esa fase, ni yendo y viniendo entre fases. `zona` en
`npcs_revelados` aplica a **todos** los tipos de NPC, porque todos se revelan
igual y todos quedan como marcador en el mapa; `encuentro` es lo único que
distingue a levante/confrontación, y arranca en `None` hasta que el DM lo
inicia. *(Antes `zona` era exclusiva de los NPCs "ambiente" y los de encuentro
no tenían posición en el mapa: eso cambió con el reveal unificado.)* Sacar un
NPC de escena (`ocultar_npc`) se lleva puesto su encuentro; expulsar a un
jugador limpia el encuentro que tenga encima pero deja al NPC revelado.
Cambiar de mapa (por fase o con `cambiar_mapa`) también resetea
la `zona_actual` de todos los jugadores a la primera zona de la variante
nueva, ya que las zonas de una variante distinta pueden no tener nada en
común con las de la anterior.

## 7. WebSocket / API — contrato

### `GET /dm` y `GET /jugador`
Sirven las páginas HTML estáticas.

### `POST /join`
Body: `{ "nombre": str, "personaje_id": str }` → devuelve `player_id` y arma la entrada en `game_state["jugadores"]`.

### `WS /ws/player/{player_id}`
Mensajes que el jugador puede enviar:
- `{"type": "tirar_dado", "stat": "carisma", "contexto": "Lo coimeás"}` → tirada libre, sin relación con la situación activa: server tira 2d6, los suma, aplica modificador de NA y de `debilidad_activa` si corresponde (`stat_efectivo`, ver más abajo), devuelve resultado a ese jugador y lo loguea para el DM. `contexto` es opcional, solo para que el log del DM sea legible. Sigue siendo el mecanismo para cualquier tirada que el DM pida "en voz alta" sin que haya una situación de por medio.
- `{"type": "intentar_situacion", "opcion": "Abrir la heladera para revisar", "stat": "astucia"}` → solo válido si hay una `situacion_actual` sin `resuelta`, y si `stat` es el que corresponde a esa `opcion` según `situacion.opciones` (o cualquiera de los 4 stats jugables cuando `opcion` es `"Otro (decide DM)"`, sección 5.3/5.8). Tira `stat` contra la `dificultad` de la situación (2d6 + `stat_efectivo` + modificador_na vs el número), marca la situación como `resuelta` (con `resuelta_por`, `exito` y `opcion_elegida`) y devuelve `resultado_situacion` a **ese** jugador con el detalle de la tirada. Como la situación queda cerrada, el server también hace un broadcast de `estado` a **todos** los jugadores para que vean que ya se resolvió (y quién la resolvió), y registra la tirada en `log_eventos` (`registrar_tirada`, con el título de la situación + la opción como `contexto`) para que aparezca en el historial del DM igual que cualquier otra tirada
- `{"type": "elegir_opcion_encare", "npc_id": "...", "opcion_idx": 0, "stat_otro": null}` → primer paso de una ronda (sección 2, fila "Ajuste de dificultad en vivo del DM"), reemplaza a `intentar_levante`/`intentar_confrontacion`/al viejo `intentar_encare` de una sola tirada. Solo válido si `npcs_revelados[npc_id]["encuentro"]["jugador_objetivo"]` es este jugador, el encuentro no está `resuelto` y no hay ya una ronda `pendiente`. Con `opcion_idx`: busca esa opción en `npc["arbol"]["nodos"][encuentro["nodo_actual"]]["opciones"]` (error si está fuera de rango) y usa su `stat`/`respuesta`/`siguiente`. Con `stat_otro` en vez de `opcion_idx` (rama "Otro (el DM decide)", sección 2): usa ese stat directo, sin `respuesta` (la narra el DM en voz alta) y sin `siguiente` (cierra el encuentro apenas se resuelva, cualquiera sea la ronda). **No tira los dados todavía** — solo guarda la elección en `encuentro["pendiente"]` y empuja el `estado` actualizado (con `pendiente: true`) al jugador y al DM. A la mesa, este es el momento en el que el jugador dice su frase/movida en voz alta. El segundo paso, `resolver_ronda_encare`, lo manda el DM — ver `WS /ws/dm` más abajo
- `{"type": "hablar_con_npc", "npc_id": "..."}` → segunda vía para arrancar un encuentro, además de que lo asigne el DM (`iniciar_encuentro`, ver `WS /ws/dm`): cuando un jugador toca "Hablar" en la carta de reveal de un NPC `"levante"`/`"confrontacion"`, el propio cliente llama a `iniciar_encuentro(npc_id, jugador_objetivo=<quien tocó>)` — mismas validaciones y mismo bloqueo global que la vía del DM (error si el NPC no está revelado, es de ambiente, o ya hay otro encuentro sin resolver). Para NPCs `"ambiente"` "Hablar" sigue sin mandar este mensaje — la carta se cierra local nomás, sin mecánica, como siempre

`stat_efectivo(jugador, personaje, stat)` (en `game_state.py`) es el punto único donde se suma el `modificador` de la `debilidad` del personaje al `stat_valor` que recibe `dice.tirar`, cuando `jugador["debilidad_activa"]` es `True` y el `stat` tirado coincide con el de la debilidad — lo usan las tres rutas de tirada de arriba, así el efecto es real (no solo un texto de referencia para el DM) sin que `dice.py` deje de ser una función pura sin conocimiento de personajes (regla 2 de `CLAUDE.md`).

**`resolver_prenda` ya no es un mensaje que el jugador pueda enviar** — se sacó a pedido explícito: ahora solo el DM puede marcar una prenda como resuelta (ver `WS /ws/dm` más abajo). El jugador sigue viendo sus prendas activas en pantalla, pero sin botón para resolverlas él mismo.

Mensajes que el jugador recibe (push del server):
- `{"type": "estado", "na": 2, "prendas": [...], "debilidad_activa": false, "fase": "boliche", "zona_actual": "barra", "npcs_revelados": {...}, "situacion_actual": {...} | null, "mapa_actual": {"id": "boliche_a", "nombre": "Boliche A", "zonas": [...]}, "jugadores_en_mapa": [...], "puntaje": 4, "historial": [...]}` (cada vez que cambia algo suyo, el mapa o la situación activa de la fase; `mapa_actual` trae la variante de mapa completa —con nombre y zonas ya resueltas— para no depender de que el cliente tenga cacheado `data/mapa.json`; `situacion_actual` trae la situación completa —título, texto, stat, dificultad, opciones— más su estado de resolución: `resuelta`, `resuelta_por`, `exito`; `debilidad_activa` es el booleano que dispara la tarjeta de debilidad en pantalla, con el contenido —`nombre`, `descripcion`, `stat`, `modificador`— sacado de `data/personajes.json`, que el cliente ya tiene cacheado; `puntaje`/`historial` son los del propio jugador, sección 2 fila "Puntaje total de la noche"). `npcs_revelados` llega como `{"<npc_id>": {"zona": "...", "encuentro": null | {...}}}`: la **existencia** del NPC y su `zona` son iguales para todos (revelado global), y lo único filtrado por jugador es `encuentro` — solo el `jugador_objetivo` lo recibe distinto de `null`, así el resto ni se entera de con quién está el encuentro en curso. Cuando llega, el `encuentro` trae además `npc` (el objeto del NPC sin su `arbol` completo —eso sería spoiler—, ya filtrado por el misterio de lindura si corresponde), `pendiente` (booleano: `true` mientras el jugador ya eligió una opción y está esperando que el DM la resuelva con `resolver_ronda_encare` — el detalle crudo de qué eligió, con `respuesta`/`siguiente`, no se filtra al jugador, solo lo usa el server internamente) y, únicamente cuando no está `resuelto` **ni** `pendiente`, `nodo` (el nodo actual del árbol, con `texto` y `opciones` recortadas a `texto`/`stat` únicamente, sin `respuesta` ni `siguiente` de ninguna opción). Al reconectarse, el jugador recupera su encuentro pendiente por esta vía sin necesidad de un mensaje aparte
- `{"type": "npc_revelado", "npc": {...}, "zona": "barra"}` — broadcast a **todos** los jugadores, para cualquier `tipo` de NPC. Es puramente cosmético: la carta trae nombre, apodo, avatar y `frase_reveal`; para `"ambiente"` sus botones ("Hablar"/"Ignorar") solo la cierran, para `"levante"`/`"confrontacion"` "Hablar" además dispara `hablar_con_npc` (ver `WS /ws/player/{player_id}` más arriba)
- `{"type": "ocultar_carta_npc", "npc_id": "..."}` — broadcast a **todos** los jugadores en cuanto un encuentro arranca sobre ese NPC (sea porque alguien tocó "Hablar" o porque lo asignó el DM): la carta de reveal de ese NPC ya no tiene sentido en pantalla — quien la esté viendo la cierra sola, así no queda gente tratando de arrancar un encuentro que ya empezó con otro jugador
- `{"type": "resultado_encare", "resuelto": false, "npc_id": "...", "stat": "carisma", "respuesta": "...", "siguiente_nodo": {"texto": "...", "opciones": [...]}, "dados_tirados": [4, 5], "total": 13, "modificador_dm": 2, "total_ajustado": 15, ...}` → lo empuja `resolver_ronda_encare` (no `elegir_opcion_encare`) directo al `jugador_objetivo`, después de cada ronda que **no** cierra el encuentro: trae la `respuesta` de la opción elegida y el `siguiente_nodo` para que el cliente re-renderice el overlay sin cerrarlo. `total` es la tirada cruda (2d6 + `stat_efectivo` + modificador_na) y `total_ajustado` ya tiene sumado el `modificador_dm` que puso el DM al resolver — es `total_ajustado` el que cuenta para el `acumulado`. Cuando la ronda **sí** cierra el encuentro (hoja del árbol u "Otro"), en cambio llega `{"type": "resultado_encare", "resuelto": true, "npc_id": "...", "stat": "...", "exito": true, "acumulado": 25, "dificultad_total": 24, "respuesta": "..." | null, "modificador_dm": 2, "total_ajustado": 15, "puntaje_lindura": 7, ...}` (con `puntaje_lindura` solo si es un NPC de levante), con el dato real del NPC ya revelado sin importar el NA que tuviera al arrancar el encuentro
- `{"type": "resultado_situacion", "stat": "astucia", "dificultad": 13, "exito": true, "dados_tirados": [4, 5], "total": 15, ...}` → push solo al jugador que intentó la situación, con el detalle completo de la tirada (mismo formato que `resultado_tirada`, más `exito` y `dificultad`)
- `{"type": "narracion", "texto": "..."}` (cuando el DM dispara narración IA)

### `WS /ws/dm`
Mensajes que el DM puede enviar:
- `{"type": "avanzar_fase"}` → previa → boliche → after → terminado (no hace nada si ya está en "terminado"). Al avanzar, se elige una variante de mapa al azar para la fase nueva (`mapa_actual`), `npcs_revelados` y `situacion_actual` se vacían, y los `zona_actual` de los jugadores vuelven a la primera zona de esa variante. Si la fase nueva es "after", además los jugadores en Leyenda Urbana (NA 10) bajan a Modo Caos (NA 6) — regla de sección 5.4
- `{"type": "retroceder_fase"}` → la inversa de `avanzar_fase` (after → boliche → previa), no hace nada si ya está en "previa". Comparte la misma lógica de "entrar a una fase" que `avanzar_fase` (mapa al azar, reset de `npcs_revelados`/`situacion_actual`/zonas), salvo que nunca aplica el reset de NA de Leyenda Urbana — eso es específico de *entrar* al After
- `{"type": "cambiar_mapa", "mapa_id": "depto_banana"}` (o `"mapa_id": null` / campo ausente para elegir una variante al azar de la fase activa) → cambia `mapa_actual` sin tocar la fase; resetea `npcs_revelados` y las `zona_actual` de los jugadores igual que un cambio de fase. Responde `{"type": "error", "detail": "..."}` si `mapa_id` no es una variante válida para la fase activa
- `{"type": "ajustar_na", "player_id": "...", "delta": 1}`
- `{"type": "activar_debilidad", "player_id": "..."}` / `{"type": "desactivar_debilidad", "player_id": "..."}` → prende/apaga `debilidad_activa` de ese jugador. Es el **único** mecanismo para activarla o desactivarla — el jugador no tiene mensaje propio para esto
- `{"type": "repartir_prenda", "player_id": "...", "prenda_id": 7}` (o `null` para random del mazo)
- `{"type": "resolver_prenda", "player_id": "...", "prenda_id": 7}` → ahora es **la única vía** para resolver una prenda (antes también existía del lado del jugador, sección `WS /ws/player/{player_id}`; se sacó a pedido explícito)
- `{"type": "mover_jugador", "player_id": "...", "zona": "barra"}` → cambia `zona_actual` de ese jugador (debe ser una zona válida del `mapa_actual`)
- `{"type": "revelar_npc", "npc_id": "martina", "zona": "barra"}` → **único mensaje de revelado, para cualquier `tipo` de NPC**: lo agrega a `npcs_revelados` con esa `zona` y `encuentro: None`, y dispara `npc_revelado` a **todos** los jugadores. Revelar de nuevo un NPC ya revelado lo mueve de zona sin perder el encuentro que tenga encima. *(Reemplaza al par `revelar_npc` + `revelar_npc_encuentro` del esquema anterior, donde revelar un NPC de levante/confrontación disparaba el encuentro en la misma acción.)*
- `{"type": "iniciar_encuentro", "npc_id": "...", "jugador_objetivo": "..."}` → segundo paso, sobre un NPC **ya revelado** de tipo `"levante"`/`"confrontacion"`: le pone el `encuentro` encima, arrancando del nodo `inicio` de su `arbol` (`{"jugador_objetivo", "resuelto": False, "nodo_actual": npc["arbol"]["inicio"], "acumulado": 0, "rondas_jugadas": 0, "tiradas": [], "pendiente": None}`, sección 6). Con `"npc_id": null` el server elige al azar entre los NPCs revelados que admitan encuentro. Devuelve `{"type": "error", "detail": "..."}` si el NPC no está revelado todavía, si es de ambiente, o si **ya hay otro encuentro sin resolver** en la partida (bloqueo global, sección 2). Un NPC de encuentro **no se agota**: una vez `resuelto`, se le puede iniciar otro al mismo jugador o a otro, arrancando de nuevo desde el nodo `inicio`. El encuentro no manda un mensaje propio al jugador — viaja dentro de su `estado` (ver más abajo)
- `{"type": "resolver_ronda_encare", "npc_id": "...", "modificador_dm": 0}` → segundo paso de una ronda de encare (sección 2, fila "Ajuste de dificultad en vivo del DM"), después de que el jugador ya eligió opción con `elegir_opcion_encare` (`WS /ws/player/{player_id}`) y dijo su frase en voz alta a la mesa. Requiere que ese NPC tenga un encuentro sin resolver con una ronda `pendiente` (error si no). Tira el `stat` de la opción elegida (2d6 + `stat_efectivo` + modificador_na) y calcula `total_ajustado = total + modificador_dm` — el DM sube ese número si la frase estuvo buena o lo baja si estuvo floja (botones preset en el panel, sección 5.7), sin tener que recalibrar la `dificultad_chamuyo`/`dificultad` del NPC. `total_ajustado` es lo que se suma al `acumulado` del encuentro y lo que cuenta para `rondas_jugadas`. Si la opción elegida tenía `siguiente` nulo, ahí se resuelve todo el encuentro (`dificultad_total = dificultad_por_ronda * rondas_jugadas`, `exito`, `puntaje`/`historial`, sección 2 "Puntaje total de la noche"); si tenía `siguiente`, el encuentro sigue abierto en el nodo próximo. El resultado (`resultado_encare`) se le empuja directo al `jugador_objetivo`, no al DM — el DM se entera por el siguiente `estado_completo`
- `{"type": "ocultar_npc", "npc_id": "martina"}` → saca al NPC de `npcs_revelados` y, con él, cualquier encuentro suyo (para corregir un error del DM, o para destrabar un encuentro que quedó colgado — no es una mecánica de juego)
- `{"type": "siguiente_situacion", "modo": "random"}` o `{"type": "siguiente_situacion", "modo": "elegir", "titulo": "DNI dudoso"}` → fija `situacion_actual` a una copia de ese evento de `eventos.json` (filtrado por fase activa) con estado de resolución en `False`/`None`, lo agrega a `eventos_usados[fase]`, y lo empuja a todos los jugadores dentro de su próximo `estado`. Reemplaza cualquier situación anterior, esté resuelta o no
- `{"type": "narrar_ia", "prompt_extra": "el Intenso acaba de fallar una tirada de Carisma feo"}` → server arma el prompt con contexto (fase actual, jugador, evento) y llama a Ollama

Mensajes que el DM recibe (push del server):
- `{"type": "estado_completo", "jugadores": {...}, "fase": "...", "npcs_revelados": {...}, "situacion_actual": {...} | null, "log_eventos": [...], "mapa_actual": {"id": "...", "nombre": "...", "zonas": [...]}}` (broadcast completo cada vez que algo cambia — para un MVP de 6 jugadores esto es más simple y confiable que mandar diffs). El DM siempre ve el `npc` completo en `npcs_revelados` (sin el misterio — el misterio es solo del lado del jugador que no debe saber), incluido el `arbol` entero. `jugadores` ya trae `puntaje`/`historial` de cada uno (sección 6), con lo que arma el ranking de la tab "🏆 Puntaje". `encuentro` trae `rondas_jugadas` (para el "ronda X" del banner) y, sin filtrar, `pendiente`: cuando no es `None`, el panel del DM lo usa para mostrar el banner de "ajuste de dificultad en vivo" (sección 2) con el `stat` que se va a tirar y los botones preset de `modificador_dm`. `log_eventos` recibe **una sola entrada por encuentro resuelto** (`registrar_tirada`, disparado desde el handler de `resolver_ronda_encare` solo cuando `resuelto` da `true`), no una por ronda

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
11. **Encuentros de NPC por turnos (levante/confrontación):** `data/npcs.json` gana los tipos `"levante"` y `"confrontacion"` (sección 5.5). El NPC se revela como cualquier otro (global, todos lo ven en el mapa) y **después**, en un paso aparte, el DM le asigna el encuentro a un jugador específico — la carta con las acciones llega dirigida solo a ese jugador, no a todos, y no puede haber más de un encuentro sin resolver a la vez en toda la partida (sección 2). El `puntaje_lindura` del levante llega oculto si el jugador tiene NA alto (misterio, sección 2) y revelado siempre al resolver.
12. **Ollama:** botón "Narrar con IA" en el panel del DM, con un campo de texto libre para dar contexto extra, muestra el resultado y lo puede broadcastear a todos o solo leerlo él.
13. **Encare por rondas (árbol de decisiones) y puntaje total:** reemplaza la tirada única de levante/confrontación del milestone 11 por el árbol de diálogo de 1 a 3 rondas de la sección 2 ("Encare por rondas") y 5.5 — cada ronda tira y acumula, recién se resuelve en una hoja del árbol o cuando el DM corta con "Otro (el DM decide)" (mismo patrón que el "Otro" de situaciones). Se agrega también el sistema de puntaje total por jugador (sección 2, "Puntaje total de la noche"), con su ranking en el panel del DM y su historial del lado del jugador. `intentar_levante`/`intentar_confrontacion` (una tirada, un resultado) quedan reemplazados por `elegir_opcion_encare` + `resolver_ronda_encare` (sección 7), que caminan el árbol para los dos tipos. Cada ronda además pasa por un **ajuste de dificultad en vivo del DM** (sección 2, "Ajuste de dificultad en vivo del DM"): el jugador elige la opción del árbol pero improvisa la frase real en voz alta a la mesa, así que la ronda queda `pendiente` sin tirar los dados hasta que el DM, después de escucharla, la resuelve con un `modificador_dm` (bonus si estuvo buena, malus si estuvo floja).
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