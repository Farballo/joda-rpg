# Ejecutar Joda RPG en la notebook de otra persona

Guía rápida para la noche del evento si el server no lo levanta el mismo
que tiene el repo clonado.

## ¿Docker?

No para esta app. Es un solo proceso Python sin dependencias raras,
pensado para correr desde el código fuente (ver `CLAUDE.md`). Meter Docker
de por medio suma instalar Docker Desktop (pesado, a veces pide reiniciar
o activar virtualización en la BIOS) para terminar corriendo exactamente
lo mismo que corre `uvicorn` directo. La vía nativa de abajo es más simple
y más rápida de armar en el momento.

## 1. Pasar el código

- Si la otra persona tiene GitHub, agregala como colaboradora del repo
  privado (`Farballo/joda-rpg`) y que haga `git clone`.
- Si no, pasale la carpeta entera por USB / AirDrop / lo que sea más
  rápido a mano.

## 2. Requisitos en esa PC

- Python 3.11+ instalado.
- (Opcional, para narración IA) [Ollama](https://ollama.com/download)
  instalado y el modelo bajado — ver sección 9 de `plan_joda_rpg.md`.

## 3. Setup e inicio

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## 4. Firewall de Windows

Con altas probabilidades la red va a estar categorizada como "Pública" y
Windows va a bloquear conexiones entrantes. Regla mínima necesaria
(PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "Joda RPG (puerto 8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

## 5. Encontrar la IP para que los jugadores se conecten

Es la IP local de esa notebook en esa wifi — cambia en cada red, hay que
sacarla de nuevo cada vez que cambia de lugar:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match "Wi-Fi" } | Select-Object IPAddress
```

o `ipconfig` y buscar "Dirección IPv4" debajo del adaptador Wi-Fi activo
(suele empezar con `192.168.` o `10.`).

Los jugadores entran a `http://<esa-ip>:8000/jugador` — **todos los
dispositivos tienen que estar en la misma wifi** (notebook del DM y los
celus).

## 6. Si nada de esto funciona

Algunas redes de invitados (bares, salones de eventos) tienen "aislamiento
de clientes" (AP/client isolation) activado: los dispositivos no se ven
entre sí aunque estén en la misma red, y ninguna regla de firewall lo
arregla porque el bloqueo está en el router. Plan B: hotspot del celu del
DM en vez de la wifi del lugar (ver checklist de la sección 12 de
`plan_joda_rpg.md`).
