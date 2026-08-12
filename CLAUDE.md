# CLAUDE.md

Este archivo guía a Claude Code al trabajar en este repo.

## Qué es este proyecto

Una app web para jugar un juego de rol de una noche ("joda-rpg") entre
amigos, en una previa/joda real. Corre 100% local en la notebook del DM,
en la misma wifi que los jugadores — sin auth, sin base de datos, sin
deploy externo. Ver **`PLAN_JODA_RPG.md`** en la raíz del repo: es la
fuente de verdad de arquitectura, modelo de datos, contrato de WebSockets
y orden de milestones. Leerlo siempre antes de tocar código si no está
ya en contexto.

## Stack

- Python 3.11+, FastAPI, WebSockets nativos de FastAPI
- Frontend: HTML + JS vanilla, sin build step, sin framework, sin npm
- Ollama local (`localhost:11434`) para narración IA — opcional, debe
  fallar en silencio si no está disponible
- Sin base de datos: estado del juego en memoria (dict de Python), se
  pierde si el server se reinicia (aceptable, es una sesión de una noche)
- Plataforma de desarrollo: Windows nativo (no WSL) o Linux, indistinto —
  no hay dependencias específicas de SO

## Comandos

```bash
# setup inicial
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt

# correr el server (accesible desde otros dispositivos en la LAN)
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# tests
pytest

# Ollama (una vez, antes de la noche del evento)
ollama pull llama3.2:3b
ollama serve
```

## Estructura

```
app.py              # FastAPI app, rutas HTTP, endpoints WebSocket
game_state.py        # estado en memoria + funciones de mutación
dice.py               # motor de tiradas — función pura, sin dependencias de FastAPI
ai_narrator.py        # integración con Ollama, debe manejar timeout/error sin romper nada
data/*.json            # personajes, prendas, eventos — datos de contenido, no lógica
static/dm.html          # panel de control del DM
static/jugador.html      # vista del jugador (mobile-first)
```

## Reglas de trabajo

1. **Seguir el orden de milestones de la sección 11 de `PLAN_JODA_RPG.md`.**
   No adelantar milestones ni mezclar trabajo de varios a la vez. Cada
   milestone tiene que quedar corriendo y probable antes de pasar al
   siguiente.

2. **`dice.py` es la pieza crítica.** Función pura, sin estado global, sin
   import de FastAPI. Siempre tira **2d6 y los suma** (no varía la cantidad
   de dados por NA — el malus de NA alto vive en `modificador_na`, no en
   los dados). Papelón automático / éxito con bonus solo con **dobles**
   (1-1 / 6-6), no con un solo dado individual. Con tests de `pytest` que
   cubran: tirada normal, dobles 1-1 y 6-6, un solo 1 o 6 que NO dispara
   nada especial, y la tabla de `modificador_na` en sus distintos tramos
   de NA (ver sección 5.4 del plan, escala 0-10).

3. **No implementar nada fuera de scope del MVP** (sección 1 del plan):
   nada de Reputación ni recompensas de coronación. Si algo "sumaría", no
   agregarlo sin que se pida explícitamente. *(El sistema de Encare —
   encuentros de NPC "levante"/"confrontación" por turnos, sección 2 y
   milestone 11 del plan — dejó de estar excluido: se agregó a pedido
   explícito, acotado a lo que describe el plan. No lo confundas con
   "agregar algo porque sumaría": ya está pedido, hay que construirlo.)*

3.1. **Los encuentros de NPC (levante/confrontación) son por turnos, el
   resto del juego no.** Tiradas libres, NA, prendas y situaciones de fase
   siguen sin turno, cualquier jugador actúa cuando quiere. El turno solo
   aplica cuando el DM asigna un encuentro de NPC a un jugador específico
   (sección 2 del plan, "Alcance de los turnos").

4. **Los datos de `data/*.json` ya están definidos en la sección 5 del
   plan** — copiarlos tal cual, no resumirlos ni reinventarlos.

5. **Ollama nunca puede tirar abajo el resto de la app.** Si no responde
   en ~15 segundos o tira error, `ai_narrator.py` devuelve `None` y el
   flujo normal del juego sigue sin narración IA.

6. **`static/jugador.html` prioriza legibilidad sobre estética.** Va a
   estar en celus, con poca luz, con gente con unos tragos encima:
   tipografía grande, botones grandes, alto contraste.

7. **Sin auth, sin persistencia, sin multi-sala.** Un solo proceso, un
   solo estado de partida en memoria. No agregar estas features aunque
   parezcan "buenas prácticas" — son over-engineering para este caso de uso.

8. **Al terminar cada milestone**, resumir en el chat qué se agregó, cómo
   probarlo, y cualquier decisión técnica tomada que no estaba explícita
   en el plan.

## Qué NO hacer

- No agregar un frontend framework (React, Vue, etc.) — el plan
  explícitamente elige HTML/JS vanilla para evitar build tooling
- No agregar Redis, Celery, ni ninguna infra de background jobs — un
  proceso FastAPI alcanza
- No agregar autenticación ni cuentas de usuario
- No persistir el estado en disco/DB salvo que se pida explícitamente
- No implementar la tabla de eventos como lógica ramificada automática —
  son tarjetas de referencia para que el DM decida a criterio (ver
  sección 2 del plan, fila "Automatización de eventos de fase")