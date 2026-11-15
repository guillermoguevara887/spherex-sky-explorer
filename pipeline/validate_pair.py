
"""Check spatial and approximate spectral overlap of two SPHEREx cutouts."""

from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

FOLDER = Path("pipeline/output/cutouts")
FILES = (
    FOLDER / "dr1_d1_10.fits",
    FOLDER / "qr3_d1_02.fits",
)

TARGET = SkyCoord(
    304.693508808 * u.deg,
    42.4436872991 * u.deg,
)

BAD_BITS = (
    0, 1, 2, 6, 7, 9, 10, 11,
    14, 15, 17, 19, 20, 22,
    25, 26, 27, 28, 29,
)
BAD_MASK = sum(1 << bit for bit in BAD_BITS)


def load(path):
    with fits.open(path, memmap=False) as h:
        hdr = h["IMAGE"].header
        img = np.asarray(h["IMAGE"].data, dtype=float)
        flags = np.asarray(h["FLAGS"].data, dtype=np.int64)
        spatial = WCS(hdr)
        spectral = WCS(hdr, fobj=h, key="W")
        spectral.sip = None

    if img.ndim != 2 or img.shape != flags.shape:
        raise ValueError(f"Invalid IMAGE/FLAGS geometry: {path}")

    x, y = spatial.world_to_pixel(TARGET)
    x = float(np.asarray(x).item())
    y = float(np.asarray(y).item())

    print(f"\n{path.name}")
    print(f"Image shape: {img.shape}")
    print(f"Target pixel: x={x:.2f}, y={y:.2f}")
    print(
        "Target inside: "
        f"{0 <= x < img.shape[1] and 0 <= y < img.shape[0]}"
    )

    return img, flags, spatial, spectral


def wavelength(wcs, x, y):
    lam, _ = wcs.pixel_to_world(x, y)
    return np.asarray(lam.to_value(u.um), dtype=float)


def main():
    a = load(FILES[0])
    b = load(FILES[1])

    image_a, flags_a, spatial_a, spectral_a = a
    image_b, flags_b, spatial_b, spectral_b = b

    yy, xx = np.indices(image_a.shape, dtype=float)

    # Map pixel centers from the 2025 sky image into the 2026 image.
    sky = spatial_a.pixel_to_world(xx, yy)
    xb, yb = spatial_b.world_to_pixel(sky)

    overlap = (
        np.isfinite(xb)
        & np.isfinite(yb)
        & (xb >= 0)
        & (yb >= 0)
        & (xb <= image_b.shape[1] - 1)
        & (yb <= image_b.shape[0] - 1)
    )

    count = int(overlap.sum())

    print("\n--- SPATIAL COMPARISON ---")
    print(
        f"Shared WCS sample positions: "
        f"{count}/{image_a.size}"
    )

    if count == 0:
        print("No shared pixel centers found.")
        return

    ya, xa = np.where(overlap)

    ib = np.rint(xb[overlap]).astype(int)
    jb = np.rint(yb[overlap]).astype(int)

    clean = (
        ((flags_a[ya, xa] & BAD_MASK) == 0)
        & ((flags_b[jb, ib] & BAD_MASK) == 0)
    )

    finite = (
        np.isfinite(image_a[ya, xa])
        & np.isfinite(image_b[jb, ib])
    )

    # Approximate wavelength comparison at shared sky positions.
    lam_a = wavelength(
        spectral_a,
        xa.astype(float),
        ya.astype(float),
    )
    lam_b = wavelength(
        spectral_b,
        xb[overlap],
        yb[overlap],
    )

    delta_nm = np.abs(lam_a - lam_b) * 1000

    usable = clean & finite & np.isfinite(delta_nm)

    print(
        f"Finite, preliminarily unflagged pairs: "
        f"{int(usable.sum())}/{count}"
    )

    if usable.any():
        diff = delta_nm[usable]

        print("\n--- SPECTRAL COMPARISON ---")
        print(f"Median delta: {np.median(diff):.2f} nm")
        print(f"Minimum delta: {diff.min():.2f} nm")
        print(f"Maximum delta: {diff.max():.2f} nm")
        print(
            f"Samples with delta <= 10 nm: "
            f"{int(np.count_nonzero(diff <= 10))}/{diff.size}"
        )

    print(
        "\nPreliminary screening only. "
        "Reprojection and calibrated scientific validation remain."
    )


if __name__ == "__main__":
    main()
