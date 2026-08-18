"""Genera las versiones web de las cartas de NPC de encare.

Mismo mecanismo que optimizar_cartas.py, pero para data/npc_cartas/ — ver ese
script para el detalle. Se corre solo cuando agregás o cambiás una carta de NPC.

Uso:

    python optimizar_npc_cartas.py            # genera las que faltan o cambiaron
    python optimizar_npc_cartas.py --force    # regenera todas

Requiere Pillow (pip install Pillow) — no está en requirements.txt a propósito,
es una herramienta de asset, no una dependencia de la app corriendo.
"""

import json
import sys
from pathlib import Path

from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CARTAS_DIR = Path(__file__).parent / "data" / "npc_cartas"
WEB_DIR = CARTAS_DIR / "web"
NPCS_JSON = Path(__file__).parent / "data" / "npcs.json"

ANCHO_MAX = 800
CALIDAD_WEBP = 82
EXTENSIONES = {".png", ".jpg", ".jpeg", ".webp"}


def normalizar(nombre: str) -> str:
    return nombre.lower().replace("_", "").replace("-", "").replace(" ", "")


def ids_de_npcs() -> list[str]:
    with open(NPCS_JSON, encoding="utf-8") as f:
        return [n["id"] for n in json.load(f) if n.get("tipo") in ("levante", "confrontacion")]


def fuentes_por_id(ids: list[str]) -> dict[str, Path]:
    por_normalizado = {normalizar(nid): nid for nid in ids}
    encontradas: dict[str, Path] = {}

    for archivo in sorted(CARTAS_DIR.iterdir()):
        if not archivo.is_file() or archivo.suffix.lower() not in EXTENSIONES:
            continue

        npc_id = por_normalizado.get(normalizar(archivo.stem))
        if npc_id is None:
            print(f"  ⚠️  {archivo.name}: no coincide con ningún id de NPC de encare, lo salteo")
            continue

        encontradas[npc_id] = archivo

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

    ids = ids_de_npcs()
    fuentes = fuentes_por_id(ids)

    if not fuentes:
        print("No encontré ninguna carta para optimizar.")
        return 0

    total_antes = total_despues = 0

    for npc_id, origen in sorted(fuentes.items()):
        destino = WEB_DIR / f"{npc_id}.webp"

        if not force and destino.exists() and destino.stat().st_mtime >= origen.stat().st_mtime:
            print(f"  ⏭️  {npc_id}: ya está al día")
            continue

        antes, despues = optimizar(origen, destino)
        total_antes += antes
        total_despues += despues
        ahorro = 100 - (despues * 100 / antes)
        print(f"  ✅ {npc_id}: {antes / 1024:.0f} KB → {despues / 1024:.0f} KB (−{ahorro:.0f}%)")

    sin_carta = [nid for nid in ids if nid not in fuentes]
    if sin_carta:
        print(f"\nSin carta todavía (la app les dibuja una): {', '.join(sin_carta)}")

    if total_antes:
        print(f"\nTotal: {total_antes / 1024 / 1024:.1f} MB → {total_despues / 1024 / 1024:.1f} MB")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
