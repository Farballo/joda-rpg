"""Genera las versiones web de las cartas de personaje.

Las cartas originales (data/personajes_cartas/*.png) son masters de ~3 MB
pensados para imprimir. En la noche del evento se ven a ~350px de ancho en
seis celus a la vez, así que la app sirve estas copias livianas en su lugar.

Uso (solo hace falta correrlo cuando agregás o cambiás una carta):

    python optimizar_cartas.py            # genera las que faltan o cambiaron
    python optimizar_cartas.py --force    # regenera todas

Requiere Pillow, que NO está en requirements.txt a propósito: es una
herramienta de asset, no una dependencia de la app corriendo.

    pip install Pillow

El nombre del archivo se matchea contra el id del personaje ignorando
guiones, guiones bajos y mayúsculas — así "gym_bro.png" cae en "gymbro".
"""

import json
import sys
from pathlib import Path

from PIL import Image

# La consola de Windows arranca en cp1252 y se atraganta con los emojis de acá abajo.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CARTAS_DIR = Path(__file__).parent / "data" / "personajes_cartas"
WEB_DIR = CARTAS_DIR / "web"
PERSONAJES_JSON = Path(__file__).parent / "data" / "personajes.json"

ANCHO_MAX = 800  # se muestran a ~350px; 800 alcanza para pantallas retina
CALIDAD_WEBP = 82
EXTENSIONES = {".png", ".jpg", ".jpeg", ".webp"}


def normalizar(nombre: str) -> str:
    return nombre.lower().replace("_", "").replace("-", "").replace(" ", "")


def ids_de_personajes() -> list[str]:
    with open(PERSONAJES_JSON, encoding="utf-8") as f:
        return [p["id"] for p in json.load(f)]


def fuentes_por_id(ids: list[str]) -> dict[str, Path]:
    por_normalizado = {normalizar(pid): pid for pid in ids}
    encontradas: dict[str, Path] = {}

    for archivo in sorted(CARTAS_DIR.iterdir()):
        if not archivo.is_file() or archivo.suffix.lower() not in EXTENSIONES:
            continue

        personaje_id = por_normalizado.get(normalizar(archivo.stem))
        if personaje_id is None:
            print(f"  ⚠️  {archivo.name}: no coincide con ningún id de personajes.json, lo salteo")
            continue

        encontradas[personaje_id] = archivo

    return encontradas


def optimizar(origen: Path, destino: Path) -> tuple[int, int]:
    with Image.open(origen) as im:
        im = im.convert("RGB")
        if im.width > ANCHO_MAX:
            alto = round(im.height * ANCHO_MAX / im.width)
            im = im.resize((ANCHO_MAX, alto), Image.LANCZOS)
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, "WEBP", quality=CALIDAD_WEBP, method=6)

    return origen.stat().st_size, destino.stat().st_size


def main() -> int:
    force = "--force" in sys.argv

    if not CARTAS_DIR.is_dir():
        print(f"No existe {CARTAS_DIR}")
        return 1

    ids = ids_de_personajes()
    fuentes = fuentes_por_id(ids)

    if not fuentes:
        print("No encontré ninguna carta para optimizar.")
        return 0

    total_antes = total_despues = 0

    for personaje_id, origen in sorted(fuentes.items()):
        destino = WEB_DIR / f"{personaje_id}.webp"

        if not force and destino.exists() and destino.stat().st_mtime >= origen.stat().st_mtime:
            print(f"  ⏭️  {personaje_id}: ya está al día")
            continue

        antes, despues = optimizar(origen, destino)
        total_antes += antes
        total_despues += despues
        ahorro = 100 - (despues * 100 / antes)
        print(f"  ✅ {personaje_id}: {antes / 1024:.0f} KB → {despues / 1024:.0f} KB (−{ahorro:.0f}%)")

    sin_carta = [pid for pid in ids if pid not in fuentes]
    if sin_carta:
        print(f"\nSin carta todavía (la app les dibuja una): {', '.join(sin_carta)}")

    if total_antes:
        print(f"\nTotal: {total_antes / 1024 / 1024:.1f} MB → {total_despues / 1024 / 1024:.1f} MB")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
