"""Consulta metadatos SPHEREx SIA2 y propone pares temporales preliminares.

No descarga archivos FITS ni valida la equivalencia de canales espectrales.
Ejecutar: python pipeline/query_irsa.py
"""

import json
import math
import ssl
import time
from collections import defaultdict
from io import BytesIO
from itertools import combinations
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi
from astropy.io.votable import parse_single_table
from astropy.time import Time

# ===== CONFIGURACIÓN =====
RA_DEG = 304.693508808
DEC_DEG = 42.4436872991
RADIUS_ARCSEC = 1.0

COLLECTIONS = ("spherex_dr1", "spherex_qr3")
SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
CACHE_DIR = Path(__file__).resolve().parent / "output"
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

MIN_GAP_DAYS = 1.0
MIN_SPECTRAL_OVERLAP = 0.8  # Solo un filtro preliminar de intervalo amplio
MAX_PAIRS = 4


def get_value(row, column):
    """Extrae un valor no enmascarado de una fila de Astropy."""
    if column not in row.colnames:
        return None
    value = row[column]
    if getattr(value, "mask", False) is not False:
        # Los valores ausentes de columnas enmascaradas no son válidos.
        try:
            if bool(value.mask):
                return None
        except (TypeError, ValueError):
            return None
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def parse_record(row, collection):
    """Conserva los metadatos necesarios para comparar candidatos."""
    try:
        start = float(get_value(row, "t_min"))
        end = float(get_value(row, "t_max"))
        low = float(get_value(row, "em_min"))
        high = float(get_value(row, "em_max"))
        band = str(get_value(row, "energy_bandpassname") or "").strip()
        url = str(get_value(row, "access_url") or "").strip()
    except (TypeError, ValueError, OverflowError):
        return None

    if not (
        all(map(math.isfinite, (start, end, low, high)))
        and start <= end
        and 0 < low < high
        and band
        and url.startswith(("https://", "http://"))
    ):
        return None

    return {
        "collection": collection,
        "obs_id": str(get_value(row, "obs_id") or ""),
        "publisher_id": str(get_value(row, "obs_publisher_did") or ""),
        "band": band,
        "start_mjd": start,
        "end_mjd": end,
        "em_min_m": low,
        "em_max_m": high,
        "url": url,
    }


def fetch_collection(collection):
    """Consulta IRSA; si falla, reutiliza una caché de la misma posición."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{collection}_metadata.json"
    signature = {"ra": RA_DEG, "dec": DEC_DEG, "radius_arcsec": RADIUS_ARCSEC}

    # SIA2 utiliza grados; conservar los decimales evita el redondeo no deseado.
    radius_deg = RADIUS_ARCSEC / 3600.0
    pos = f"CIRCLE {RA_DEG:.9f} {DEC_DEG:.10f} {radius_deg:.15f}"
    query_url = SIA_URL + "?" + urlencode({"POS": pos, "COLLECTION": collection})

    for attempt in range(1, 3):
        try:
            request = Request(
                query_url, headers={"User-Agent": "SPHEREx-Sky-Explorer/0.1"}
            )
            with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
                raw = response.read()

            table = parse_single_table(BytesIO(raw)).to_table(use_names_over_ids=True)
            required = {"t_min", "t_max", "em_min", "em_max", "energy_bandpassname", "access_url"}
            missing = required - set(table.colnames)
            if missing:
                raise ValueError(f"Columnas SIA2 faltantes: {sorted(missing)}; recibidas: {table.colnames}")

            records = []
            seen_urls = set()
            for row in table:
                record = parse_record(row, collection)
                if record is not None and record["url"] not in seen_urls:
                    seen_urls.add(record["url"])
                    records.append(record)

            print(f"  IRSA: {len(table)} filas, {len(records)} archivos utilizables")
            if len(table) > 0 and not records:
                sample = table[0]
                print("  Diagnóstico de primera fila:")
                for column in sorted(required):
                    print(f"    {column}: {sample[column]!r}")
                raise ValueError("No se pudo validar ninguna fila; no se sobrescribe la caché.")

            if records:
                cache_path.write_text(
                    json.dumps({"query": signature, "records": records}, indent=2),
                    encoding="utf-8",
                )
            return records

        except (HTTPError, URLError, TimeoutError, OSError) as error:
            print(f"  Error de conexión (intento {attempt}/2): {error}")
            retryable = not isinstance(error, HTTPError) or error.code in (502, 503, 504)
            if attempt == 1 and retryable:
                time.sleep(2)
                continue
            break
        except Exception as error:
            print(f"  La respuesta no se pudo interpretar: {error}")
            break

    if cache_path.exists():
        try:
            saved = json.loads(cache_path.read_text(encoding="utf-8"))
            if (saved.get("query") == signature and
                    isinstance(saved.get("records"), list) and
                    saved["records"]):
                print(f"  Caché local: {len(saved['records'])} archivos")
                return saved["records"]
        except (OSError, ValueError, TypeError) as error:
            print(f"  Error de caché: {error}")

    print("  Colección no disponible en esta ejecución")
    return []


def utc_date(mjd):
    return Time(mjd, format="mjd", scale="utc").isot


def summarize(records):
    grouped = defaultdict(list)
    for record in records:
        grouped[record["band"]].append(record)

    for band, items in sorted(grouped.items()):
        first = min(item["start_mjd"] for item in items)
        last = max(item["end_mjd"] for item in items)
        print(f"  {band}: {len(items)} registros | {utc_date(first)[:10]} a {utc_date(last)[:10]}")


def broad_overlap(a, b):
    """Solapamiento de intervalos amplios; NO verifica un canal espectral."""
    overlap = max(
        0.0,
        min(a["em_max_m"], b["em_max_m"]) - max(a["em_min_m"], b["em_min_m"]),
    )
    width = min(
        a["em_max_m"] - a["em_min_m"],
        b["em_max_m"] - b["em_min_m"],
    )
    return overlap / width if width > 0 else 0.0


def show_pairs(records):
    by_detector = defaultdict(list)
    for record in records:
        by_detector[record["band"]].append(record)

    candidates = []
    for detector, items in by_detector.items():
        best = None
        for first, second in combinations(items, 2):
            if first["url"] == second["url"]:
                continue
            a, b = sorted((first, second), key=lambda r: r["start_mjd"])
            separation = b["start_mjd"] - a["end_mjd"]
            if separation < MIN_GAP_DAYS:
                continue
            if broad_overlap(a, b) < MIN_SPECTRAL_OVERLAP:
                continue
            if best is None or separation > best[0]:
                best = (separation, detector, a, b)
        if best is not None:
            candidates.append(best)

    print("\n--- PARES CANDIDATOS (NO VALIDADOS) ---")
    if not candidates:
        print("No se encontraron pares con estos filtros preliminares.")
        return

    for gap, detector, a, b in sorted(candidates, reverse=True, key=lambda x: x[0])[:MAX_PAIRS]:
        print(f"\n{detector} | separación entre épocas: {gap:.1f} días")
        for name, rec in (("A", a), ("B", b)):
            print(f"  {name}: {rec['collection']} | {rec['obs_id']}")
            print(f"     UTC: {utc_date(rec['start_mjd'])}")
            print(f"     Cobertura espectral amplia: {rec['em_min_m']*1e6:.3f}–{rec['em_max_m']*1e6:.3f} µm")
            print(f"     Archivo FITS: {rec['url']}")

    print("\nATENCIÓN: estos son solo candidatos.")
    print("A6 requiere verificar cobertura espacial, WCS y canal espectral efectivo.")
    print("No se han descargado FITS ni confirmado cambios astronómicos.")


def main():
    print("SPHEREx Sky Explorer — consulta de metadatos SIA2")
    print(f"RA={RA_DEG:.9f}°, Dec={DEC_DEG:.10f}°, radio={RADIUS_ARCSEC} arcsec")

    all_records = []
    for collection in COLLECTIONS:
        print(f"\nConsultando {collection}...")
        records = fetch_collection(collection)
        if records:
            summarize(records)
            all_records.extend(records)

    if not all_records:
        print("\nNo hay registros disponibles. Verifica la conexión o inténtalo después.")
        return

    print(f"\nTotal de archivos recuperados: {len(all_records)}")
    show_pairs(all_records)


if __name__ == "__main__":
    main()
