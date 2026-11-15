
"""Inspect coverage, flags and WCS-WAVE in downloaded SPHEREx FITS cutouts.

Run from project root:
    python pipeline/inspect_cutouts.py
"""

import argparse
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

# Configuration
CUTOUT_DIR = (
    Path(__file__).resolve().parent
    / "output"
    / "cutouts"
)

FILES = ("d1_2025.fits", "d1_2026.fits")

FIRST_LIGHT = (304.693508808, 42.4436872991)


def inspect_file(path, target):
    """Inspect image, flags, spatial WCS and spectral WCS."""
    print(f"\n--- {path.name} ---")
    if not path.is_file():
        print(f"FALTA EL ARCHIVO: {path}")
        return None

    with fits.open(path, memmap=False) as hdul:

        image = hdul["IMAGE"]
        data = np.asarray(image.data, dtype=float)

        height, width = data.shape

        finite = np.isfinite(data)
        flags = np.asarray(hdul["FLAGS"].data)

        print(f"Tamaño: {width} x {height} píxeles")

        print(
            f"Píxeles con datos finitos: "
            f"{int(finite.sum())}/{data.size}"
        )

        print(
            f"Píxeles con FLAGS != 0: "
            f"{int(np.count_nonzero(flags))}/{flags.size}"
        )

        # Spatial WCS:
        # Convert sky coordinates to image pixel coordinates.
        spatial_wcs = WCS(image.header)

        x, y = spatial_wcs.world_to_pixel(target)

        inside = (
            np.isfinite(x)
            and np.isfinite(y)
            and 0 <= x <= width - 1
            and 0 <= y <= height - 1
        )

        print(
            f"Posición objetivo (origen 0): "
            f"x={x:.3f}, y={y:.3f}"
        )

        print(
            f"Objetivo dentro de los centros "
            f"de píxeles: {inside}"
        )

        if not inside:
            print("Objetivo fuera del área útil evaluada.")
            return None

        # Spectral WCS:
        # Read wavelength and bandwidth at target position.
        try:
            spectral_wcs = WCS(
                image.header,
                fobj=hdul,
                key="W",
            )

            # SIP distortion does not apply to spectral WCS.
            spectral_wcs.sip = None

            wavelength, bandwidth = (
                spectral_wcs.pixel_to_world(x, y)
            )

            lam_um = float(wavelength.to_value(u.um))
            bw_um = float(bandwidth.to_value(u.um))

            print(
                f"Longitud de onda central: "
                f"{lam_um:.6f} µm"
            )

            print(
                f"Ancho de banda: "
                f"{bw_um:.6f} µm"
            )

            return lam_um, bw_um

        except Exception as error:
            print(
                "No se pudo interpretar WCS-WAVE: "
                f"{error}"
            )
            return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--position", nargs=2, type=float, metavar=("RA", "DEC"),
                        default=FIRST_LIGHT, help="ICRS position in decimal degrees")
    parser.add_argument("fits", nargs="*", type=Path,
                        help="FITS paths. Defaults to the two original First Light cutouts.")
    args = parser.parse_args()
    ra, dec = args.position
    if not (0 <= ra <= 360 and -90 <= dec <= 90):
        parser.error("RA must be in [0, 360] and Dec in [-90, 90]")
    target = SkyCoord(ra=(ra % 360) * u.deg, dec=dec * u.deg, frame="icrs")
    paths = args.fits or [CUTOUT_DIR / filename for filename in FILES]

    print("SPHEREx Sky Explorer")
    print("FITS Scientific Inspection")
    measured = [inspect_file(path, target) for path in paths]
    if len(measured) != 2:
        return
    a, b = measured

    print("\n--- COMPARACIÓN ESPECTRAL ---")

    if a is not None and b is not None:

        delta_nm = abs(a[0] - b[0]) * 1000

        print(
            f"Diferencia entre longitudes "
            f"de onda centrales: {delta_nm:.2f} nm"
        )

        print(
            "Esta comparación es preliminar. "
            "Aún debemos validar alineación, "
            "calidad y equivalencia espectral."
        )

    else:
        print(
            "Falta comprobar al menos una "
            "de las dos mediciones."
        )


if __name__ == "__main__":
    main()
