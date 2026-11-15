"""Build an exploratory two-epoch preview from a public IRSA DR1/QR3 FITS pair."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from urllib.parse import urlsplit

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
import numpy as np

from build_first_light import flattened, read_image
from find_d1_match import download_cutout

CACHE = Path(__file__).resolve().parent / "output" / "target-cutouts"
# Visualization thresholds, not a claim of equivalent spectral response.
MAX_BANDWIDTH_FRACTION = 0.25
MIN_USABLE_FRACTION = 0.5
SOURCE_FLAG = 1 << 21


def load_observation(path, url, release, target):
    image, flags, spatial, unit = read_image(path)
    with fits.open(path, memmap=False) as hdus:
        header = hdus["IMAGE"].header
        detector = f"D{header['DETECTOR']}"
        obs_id = str(header["OBSID"])
        if f"_{obs_id}{detector}_" not in urlsplit(url).path:
            raise ValueError(f"FITS observation and source URL do not match: {path}")
        if header["TIMESYS"] != "UTC":
            raise ValueError(f"Expected UTC observation time: {path}")
        date = str(header["DATE-OBS"])
        # The alternate WCS maps detector coordinates to wavelength and width.
        spectral = WCS(header, fobj=hdus, key="W")
        spectral.sip = None

    x, y = map(float, spatial.world_to_pixel(target))
    height, width = image.shape
    if not (0 <= x <= width - 1 and 0 <= y <= height - 1):
        raise ValueError(f"Target outside celestial WCS footprint: {path}")
    ix, iy = round(x), round(y)
    clean = (flags == 0) | (flags == SOURCE_FLAG)
    if not (clean[iy, ix] and np.isfinite(image[iy, ix])):
        raise ValueError(f"Target pixel is not usable: {path}")

    wavelength, bandwidth = spectral.pixel_to_world(x, y)
    metadata = {
        "release": release.upper(), "id": obs_id, "detector": detector,
        "date_utc": date, "source": url,
        "wavelength_um": float(wavelength.to_value(u.um)),
        "bandwidth_nm": float(bandwidth.to_value(u.nm)),
    }
    return image, clean, spatial, spectral, unit, metadata


def build_pair(path_a, path_b, url_a, url_b, target):
    a, clean_a, spatial_a, spectral_a, unit_a, epoch_a = load_observation(
        path_a, url_a, "dr1", target
    )
    b, clean_b, spatial_b, spectral_b, unit_b, epoch_b = load_observation(
        path_b, url_b, "qr3", target
    )
    if unit_a != unit_b or unit_a == "unspecified" or epoch_a["detector"] != epoch_b["detector"]:
        raise ValueError("The exposures must share units and detector")
    if (Time(epoch_b["date_utc"]) - Time(epoch_a["date_utc"])).to_value(u.day) < 1:
        raise ValueError("The two epochs must be at least one day apart")

    delta_nm = 1000 * abs(epoch_a["wavelength_um"] - epoch_b["wavelength_um"])
    width_nm = min(epoch_a["bandwidth_nm"], epoch_b["bandwidth_nm"])
    if not (np.isfinite(width_nm) and width_nm > 0
            and delta_nm <= MAX_BANDWIDTH_FRACTION * width_nm):
        raise ValueError(f"Target wavelengths differ by {delta_nm:.2f} nm (width {width_nm:.2f} nm)")

    yy, xx = np.indices(b.shape, dtype=float)
    xa, ya = spatial_a.world_to_pixel(spatial_b.pixel_to_world(xx, yy))
    inside = (
        np.isfinite(xa) & np.isfinite(ya)
        & (xa >= 0) & (xa <= a.shape[1] - 1)
        & (ya >= 0) & (ya <= a.shape[0] - 1)
    )
    ix = np.rint(np.where(inside, xa, 0)).astype(int)
    iy = np.rint(np.where(inside, ya, 0)).astype(int)
    wa, bwa = spectral_a.pixel_to_world(ix, iy)
    wb, bwb = spectral_b.pixel_to_world(xx, yy)
    with np.errstate(invalid="ignore", divide="ignore"):
        mismatch = (abs(wa - wb) / np.minimum(bwa, bwb)).to_value(u.dimensionless_unscaled)
    valid = (
        inside & clean_a[iy, ix] & clean_b & np.isfinite(a[iy, ix]) & np.isfinite(b)
        & (bwa > 0 * u.um) & (bwb > 0 * u.um)
        & (mismatch <= MAX_BANDWIDTH_FRACTION)
    )
    count = int(valid.sum())
    if count < MIN_USABLE_FRACTION * b.size:
        raise ValueError(f"Only {count}/{b.size} shared pixels passed quality and spectral checks")

    image_a = np.where(valid, a[iy, ix], np.nan)
    image_b = np.where(valid, b, np.nan)
    low, high = map(float, np.percentile(np.r_[image_a[valid], image_b[valid]], [2, 98]))
    if low >= high:
        raise ValueError("No usable display contrast")
    return {
        "position": {"ra": target.ra.deg, "dec": target.dec.deg},
        "epochs": {"a": epoch_a, "b": epoch_b},
        "overlap_pixels": int(inside.sum()),
        "usable_pixels": count,
        "max_spectral_bandwidth_fraction": MAX_BANDWIDTH_FRACTION,
        "shape": list(b.shape),
        "unit": unit_b,
        "display_min": low,
        "display_max": high,
        "image_a": flattened(image_a),
        "image_b": flattened(image_b),
        "method": (
            "Nearest-neighbor celestial WCS alignment on the QR3 grid. "
            "Only zero/SOURCE flags and wavelength differences within 25% of the "
            "narrower local nominal bandwidth. Common percentile stretch. "
            "No PSF matching, background subtraction or photometric validation."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--position", nargs=2, type=float, required=True, metavar=("RA", "DEC"))
    parser.add_argument("--dr1-url", required=True)
    parser.add_argument("--qr3-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    ra, dec = args.position
    if not (0 <= ra <= 360 and -90 <= dec <= 90):
        parser.error("RA must be in [0, 360] and Dec in [-90, 90]")
    paths = []
    for release, url in (("dr1", args.dr1_url), ("qr3", args.qr3_url)):
        url_parts = urlsplit(url)
        if not (url_parts.scheme == "https"
                and url_parts.netloc == "irsa.ipac.caltech.edu"
                and url_parts.path.startswith(f"/ibe/data/spherex/{release}/level2/")
                and url_parts.path.endswith(".fits")
                and not url_parts.query and not url_parts.fragment):
            parser.error(f"Expected a public IRSA {release.upper()} Level 2 FITS URL")
        key = sha256(f"{url} {ra} {dec}".encode()).hexdigest()[:16]
        path = CACHE / f"{release}-{key}.fits"
        if not download_cutout(url, path, ra=ra, dec=dec):
            parser.exit(1, f"Could not download {release.upper()} cutout.\n")
        paths.append(path)
    try:
        payload = build_pair(*paths, args.dr1_url, args.qr3_url, SkyCoord(ra, dec, unit="deg"))
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    serialized = json.dumps(payload, indent=2, allow_nan=False)
    with args.output.open("x", encoding="utf-8") as output:
        output.write(serialized + "\n")
    print(f"{args.output}: {payload['usable_pixels']} usable shared pixels")


if __name__ == "__main__":
    main()
