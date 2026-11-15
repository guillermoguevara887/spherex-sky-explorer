
"""Find a preliminary wavelength-matched DR1 SPHEREx-D1 cutout.

Uses an existing 2026 QR3 cutout as its reference and searches up to 20
2025 DR1 observations using cached SIA2 metadata from query_irsa.py.

Run from the repository root:
    python pipeline/find_d1_match.py

This is a screening tool, NOT scientific validation of temporal variability.
WCS-WAVE gives approximate wavelengths. Further checks of WCS alignment,
channel calibration, image quality and photometry are required.
"""

import json
import ssl
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi
import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

# ---------- Configuration ----------
ROOT = Path(__file__).resolve().parent
CUTOUTS = ROOT / "output" / "cutouts"
METADATA = ROOT / "output" / "spherex_dr1_metadata.json"
BASELINE = CUTOUTS / "qr3_d1_02.fits"  # 2026, ~0.915242 um

RA_DEG = 304.693508808
DEC_DEG = 42.4436872991
TARGET = SkyCoord(ra=RA_DEG * u.deg, dec=DEC_DEG * u.deg, frame="icrs")

MAX_DOWNLOADS = 20
MAX_DELTA_NM = 10.0  # Exploratory threshold; NOT sufficient for scientific equivalence

# SOURCE (bit 21) is intentionally not in this list.
# This is a conservative preliminary mask, not a complete quality assessment.
BAD_BITS = (0, 1, 2, 6, 7, 9, 10, 11, 14, 15, 17, 19, 20,
            22, 25, 26, 27, 28, 29)
BAD_MASK = sum(1 << bit for bit in BAD_BITS)
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def inspect(path: Path):
    """Return approximate wavelength, bandwidth and target-pixel flag status."""
    with fits.open(path, memmap=False) as hdul:
        image_hdu = hdul["IMAGE"]
        data = np.asarray(image_hdu.data)
        flags_data = np.asarray(hdul["FLAGS"].data)
        if data.ndim != 2 or data.shape != flags_data.shape:
            raise ValueError("IMAGE and FLAGS must be matching 2D arrays")

        height, width = data.shape
        spatial_wcs = WCS(image_hdu.header)
        x, y = spatial_wcs.world_to_pixel(TARGET)
        # WCS can return a 0-dimensional numpy array instead of a Python float.
        x = float(np.asarray(x).item())
        y = float(np.asarray(y).item())

        if not (np.isfinite(x) and np.isfinite(y)
                and 0 <= x < width and 0 <= y < height):
            raise ValueError(f"Target outside cutout: x={x:.3f}, y={y:.3f}")

        ix = min(max(int(round(x)), 0), width - 1)
        iy = min(max(int(round(y)), 0), height - 1)
        pixel_value = float(data[iy, ix])
        flags = int(flags_data[iy, ix])

        # SPHEREx spectral coordinates are detector-dependent; do not apply SIP.
        spectral_wcs = WCS(image_hdu.header, fobj=hdul, key="W")
        spectral_wcs.sip = None
        wavelength, bandwidth = spectral_wcs.pixel_to_world(x, y)
        wavelength_um = float(np.asarray(wavelength.to_value(u.um)).item())
        bandwidth_um = float(np.asarray(bandwidth.to_value(u.um)).item())

        if not (np.isfinite(wavelength_um) and np.isfinite(bandwidth_um)
                and wavelength_um > 0 and bandwidth_um > 0):
            raise ValueError("Invalid WCS-WAVE spectral information")

        clean = bool(np.isfinite(pixel_value) and (flags & BAD_MASK) == 0)
        return wavelength_um, bandwidth_um, flags, clean


def download_cutout(url: str, destination: Path):
    """Download a small FITS cutout, keeping existing successful downloads."""
    if destination.is_file() and destination.stat().st_size > 0:
        return True

    destination.parent.mkdir(parents=True, exist_ok=True)
    separator = "&" if "?" in url else "?"
    query = urlencode({
        "center": f"{RA_DEG:.9f},{DEC_DEG:.10f}",
        "size": "1.2arcmin",
    })
    cutout_url = url + separator + query
    partial = destination.with_name(destination.name + ".part")

    for attempt in (1, 2):
        try:
            request = Request(
                cutout_url,
                headers={"User-Agent": "SPHEREx-Sky-Explorer/0.1"},
            )
            with urlopen(request, timeout=90, context=SSL_CONTEXT) as response:
                with partial.open("wb") as f:
                    while chunk := response.read(1024 * 1024):
                        f.write(chunk)
            if partial.stat().st_size == 0:
                raise OSError("Empty download")
            partial.replace(destination)
            return True
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            print(f"  Download failed ({attempt}/2): {error}")
            partial.unlink(missing_ok=True)
            if attempt == 1:
                time.sleep(3)
    return False


def main():
    print("SPHEREx Sky Explorer — search DR1 D1 using QR3 reference")
    if not BASELINE.is_file():
        print(f"Missing reference FITS: {BASELINE}")
        print("Use the QR3 D1 #2 cutout from the previous run.")
        return
    if not METADATA.is_file():
        print(f"Missing DR1 metadata cache: {METADATA}")
        print("Run python pipeline/query_irsa.py to rebuild it.")
        return

    try:
        reference_wave, reference_bw, reference_flags, reference_clean = inspect(BASELINE)
    except Exception as error:
        print(f"Cannot inspect reference FITS: {error}")
        return

    print(f"2026 reference: {reference_wave:.6f} um")
    print(f"Bandwidth: {reference_bw * 1000:.2f} nm")
    print(f"Reference flags: {reference_flags} | acceptable center: {reference_clean}")
    if not reference_clean:
        print("Reference center pixel has excluded flags; choose another reference.")
        return

    try:
        saved = json.loads(METADATA.read_text(encoding="utf-8"))
        records = saved["records"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Cannot read DR1 metadata cache: {error}")
        return

    records = [
        rec for rec in records
        if rec.get("collection") == "spherex_dr1"
        and rec.get("band") == "SPHEREx-D1"
        and isinstance(rec.get("url"), str)
        and rec["url"].startswith("https://irsa.ipac.caltech.edu/")
    ]
    records.sort(key=lambda r: float(r["start_mjd"]))
    print(f"DR1 D1 records available: {len(records)}")
    print(f"Inspecting up to {MAX_DOWNLOADS} observations")

    results = []
    for index, record in enumerate(records[:MAX_DOWNLOADS], start=1):
        path = CUTOUTS / f"dr1_d1_{index:02d}.fits"
        print(f"\n[{index}] {record.get('obs_id', '(no id)')}")
        if not download_cutout(record["url"], path):
            continue
        try:
            wave, bw, flags, clean = inspect(path)
        except Exception as error:
            print(f"  Invalid FITS or WCS: {error}")
            # Prevent reusing a corrupted or incomplete file in the next run.
            path.unlink(missing_ok=True)
            continue

        delta_nm = abs(wave - reference_wave) * 1000
        print(f"  Wavelength: {wave:.6f} um | BW: {bw * 1000:.2f} nm")
        print(f"  Delta: {delta_nm:.2f} nm | Flags: {flags} | Acceptable center: {clean}")
        results.append((delta_nm, clean, record, path))

        if delta_nm <= MAX_DELTA_NM and clean:
            print("  *** PROMISING SPECTRAL CANDIDATE (preliminary) ***")
            break

    print("\n--- BEST CANDIDATE ---")
    if not results:
        print("No DR1 cutouts could be inspected.")
        return

    # Prefer a clean pixel even if its wavelength match is slightly worse.
    valid = [item for item in results if item[1]]
    if not valid:
        print("None of the examined target pixels passed the preliminary flag mask.")
        return

    delta, clean, record, path = min(valid, key=lambda item: item[0])
    print(f"Difference: {delta:.2f} nm")
    print(f"Acceptable center: {clean}")
    print(f"Observation: {record.get('obs_id', '(no id)')}")
    print(f"Local FITS: {path}")
    print(f"Original: {record['url']}")
    if delta > MAX_DELTA_NM:
        print("No match within the exploratory 10 nm threshold among inspected files.")
    print("Scientific validation still required: field overlap, spatial WCS,")
    print("effective spectral calibration, flags and image alignment.")


if __name__ == "__main__":
    main()
