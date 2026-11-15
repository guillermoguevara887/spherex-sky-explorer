"""Build an exploratory preview from public IRSA Level 2 spectral images."""

import argparse
from dataclasses import dataclass
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

from build_first_light import flattened
from find_d1_match import download_cutout
from target_astrometry import TARGETS

CACHE = Path(__file__).resolve().parent / "output" / "target-cutouts"
MAX_BANDWIDTH_FRACTION = 0.25
MAX_BANDWIDTH_RATIO = 1.15
MIN_USABLE_FRACTION = 0.5
SOURCE_FLAG = 1 << 21
OVERFLOW_FLAG = 1 << 1
FIELD_GUARD_ARCSEC = 18.6
FIELD_CUTOUT_SIZE = "2.4arcmin"


def source_release(url):
    parts = urlsplit(url)
    for release in ("dr1", "qr3"):
        if (parts.scheme == "https"
                and parts.netloc == "irsa.ipac.caltech.edu"
                and parts.path.startswith(f"/ibe/data/spherex/{release}/level2/")
                and parts.path.endswith(".fits")
                and not parts.query and not parts.fragment):
            return release
    raise ValueError("Expected a public IRSA DR1 or QR3 Level 2 FITS URL")


def position_json(coord):
    return {"ra": coord.ra.deg, "dec": coord.dec.deg}


def coords_on_grid(wcs, shape, coord):
    x, y = map(float, wcs.world_to_pixel(coord))
    height, width = shape
    if not (0 <= x <= width - 1 and 0 <= y <= height - 1):
        raise ValueError("Target outside celestial WCS footprint")
    return x, y


@dataclass
class Observation:
    image: np.ndarray
    flags: np.ndarray
    variance: np.ndarray
    spatial: WCS
    spectral: WCS
    target: SkyCoord
    pixel: tuple
    unit: str
    date: Time
    info: dict

    def usable(self, allow_overflow=False, *, check_variance=True):
        allowed = SOURCE_FLAG | (OVERFLOW_FLAG if allow_overflow else 0)
        quality = ((self.flags & ~allowed) == 0) & np.isfinite(self.image)
        if check_variance:
            quality &= np.isfinite(self.variance) & (self.variance > 0)
        return quality

    @property
    def target_flags(self):
        x, y = map(round, self.pixel)
        return int(self.flags[y, x])

    def usable_at_target(self, mask):
        x, y = map(round, self.pixel)
        return mask[y, x]


def read_observation(path, url, position_at):
    release = source_release(url)
    with fits.open(path, memmap=False) as hdus:
        hdu = hdus["IMAGE"]
        header = hdu.header
        detector = f"D{header['DETECTOR']}"
        obs_id = str(header["OBSID"])
        if f"_{obs_id}{detector}_" not in urlsplit(url).path:
            raise ValueError("FITS observation and source URL do not match")
        if header["TIMESYS"] != "UTC":
            raise ValueError("Expected UTC observation time")
        if header.get("FINAST") != 0:
            raise ValueError("FITS fine astrometry did not pass (FINAST)")
        date = Time(str(header["DATE-OBS"]), format="isot", scale="utc")
        image = np.asarray(hdu.data, dtype=float)
        flags = np.asarray(hdus["FLAGS"].data, dtype=np.int64)
        variance = np.asarray(hdus["VARIANCE"].data, dtype=float)
        if image.ndim != 2 or image.shape != flags.shape or image.shape != variance.shape:
            raise ValueError("IMAGE, FLAGS and VARIANCE must be matching 2D arrays")
        unit = str(header.get("BUNIT", "")).strip()
        if not unit:
            raise ValueError("Missing FITS brightness units")
        spatial = WCS(header).celestial
        # SIP distortion applies to celestial WCS, not the detector wavelength lookup.
        spectral_header = header.copy()
        for key in ("A_ORDER", "B_ORDER", "AP_ORDER", "BP_ORDER"):
            spectral_header.pop(key, None)
        spectral = WCS(spectral_header, fobj=hdus, key="W")
        spectral.sip = None

    target = position_at(date)
    x, y = coords_on_grid(spatial, image.shape, target)
    wavelength, bandwidth = spectral.pixel_to_world(x, y)
    wave = float(wavelength.to_value(u.um))
    width = float(bandwidth.to_value(u.nm))
    if not (np.isfinite(wave) and np.isfinite(width) and wave > 0 and width > 0):
        raise ValueError("No valid spectral calibration at target")
    info = {
        "release": release.upper(), "id": obs_id, "detector": detector,
        "date_utc": str(header["DATE-OBS"]), "source": url,
        "wavelength_um": wave, "bandwidth_nm": width,
    }
    return Observation(image, flags, variance, spatial, spectral, target, (x, y), unit, date, info)


def spectral_distance(a, b):
    delta_nm = 1000 * abs(a.info["wavelength_um"] - b.info["wavelength_um"])
    widths = (a.info["bandwidth_nm"], b.info["bandwidth_nm"])
    narrower = min(widths)
    return delta_nm, delta_nm / narrower, max(widths) / narrower


def stretch(*images):
    values = np.concatenate([image[np.isfinite(image)] for image in images])
    low, high = map(float, np.percentile(values, [2, 98]))
    if low >= high:
        raise ValueError("No usable display contrast")
    return low, high


def mark_observation(observation, pixel):
    return {
        **observation.info,
        "target_position": position_json(observation.target),
        "target_pixel": [float(value) for value in pixel],
        "target_flags": observation.target_flags,
        "finast": 0,
    }


def compare_observations(a, b, center, *, astrometry=None, allow_overflow=False, field_only=False):
    if field_only and (astrometry is None or allow_overflow):
        raise ValueError("A field comparison requires astrometry and the strict quality mask")
    if a.info["id"] == b.info["id"] or (b.date - a.date).to_value(u.day) < 1:
        raise ValueError("The distinct exposures must be at least one day apart")
    if a.unit != b.unit or a.info["detector"] != b.info["detector"]:
        raise ValueError("The exposures must share units and detector")
    delta_nm, separation, bandwidth_ratio = spectral_distance(a, b)
    if separation > MAX_BANDWIDTH_FRACTION or (astrometry and bandwidth_ratio > MAX_BANDWIDTH_RATIO):
        raise ValueError(f"Spectral mismatch at the predicted position ({delta_nm:.2f} nm)")

    check_variance = astrometry is not None
    clean_a = a.usable(allow_overflow, check_variance=check_variance)
    clean_b = b.usable(allow_overflow, check_variance=check_variance)
    if not field_only and not (a.usable_at_target(clean_a) and b.usable_at_target(clean_b)):
        raise ValueError(f"Target pixel failed quality checks (flags {a.target_flags}, {b.target_flags})")

    yy, xx = np.indices(b.image.shape, dtype=float)
    sky_b = b.spatial.pixel_to_world(xx, yy)
    xa, ya = a.spatial.world_to_pixel(sky_b)
    inside = (
        np.isfinite(xa) & np.isfinite(ya)
        & (xa >= 0) & (xa <= a.image.shape[1] - 1)
        & (ya >= 0) & (ya <= a.image.shape[0] - 1)
    )
    ix = np.rint(np.where(inside, xa, 0)).astype(int)
    iy = np.rint(np.where(inside, ya, 0)).astype(int)
    wa, bwa = a.spectral.pixel_to_world(ix, iy)
    wb, bwb = b.spectral.pixel_to_world(xx, yy)
    with np.errstate(invalid="ignore", divide="ignore"):
        narrow = np.minimum(bwa, bwb)
        mismatch = abs(wa - wb) / narrow
        width_ratio = np.maximum(bwa, bwb) / narrow
    valid = (
        inside & clean_a[iy, ix] & clean_b
        & (narrow > 0 * u.um) & (mismatch <= MAX_BANDWIDTH_FRACTION)
    )
    if astrometry is not None:
        valid &= width_ratio <= MAX_BANDWIDTH_RATIO
    if field_only:
        # Screen the union of both target locations, in both native grids,
        # before a sample can appear in either frame.
        sky_a = a.spatial.pixel_to_world(ix, iy)
        for target in (a.target, b.target):
            valid &= (
                (sky_a.separation(target).arcsec > FIELD_GUARD_ARCSEC)
                & (sky_b.separation(target).arcsec > FIELD_GUARD_ARCSEC)
            )

    count = int(valid.sum())
    if count < MIN_USABLE_FRACTION * b.image.size:
        raise ValueError(f"Only {count}/{b.image.size} shared pixels passed quality and spectral checks")
    epochs = {"a": a.info, "b": b.info}
    if astrometry is not None:
        # Both predicted positions must be covered in both epochs. Markers use
        # the common output grid and never register one target on top of itself.
        coords_on_grid(a.spatial, a.image.shape, b.target)
        pixel_a = coords_on_grid(b.spatial, b.image.shape, a.target)
        if not field_only:
            for x, y in (pixel_a, b.pixel):
                if not valid[round(y), round(x)]:
                    raise ValueError("A predicted position is masked on the shared output grid")
        epochs = {"a": mark_observation(a, pixel_a), "b": mark_observation(b, b.pixel)}

    image_a = np.where(valid, a.image[iy, ix], np.nan)
    image_b = np.where(valid, b.image, np.nan)
    low, high = stretch(image_a, image_b)
    description = (
        "Nearest-neighbor celestial WCS alignment on the QR3 grid. "
        "Only zero/SOURCE flags and wavelength differences within 25% of the "
        "narrower local nominal bandwidth. Common percentile stretch. "
        "No PSF matching, background subtraction or photometric validation."
    )
    warnings = []
    if astrometry is not None:
        description = (
            "Nearest-neighbor celestial WCS alignment on the second exposure's sky grid. "
            "Pixels require finite signal, positive variance, comparable spectral widths "
            "and wavelength differences within 25% of the narrower local bandwidth. "
            "Common percentile stretch. No PSF matching or background subtraction."
        )
        flagged = int(np.count_nonzero(valid & (((a.flags[iy, ix] | b.flags) & OVERFLOW_FLAG) != 0)))
        if flagged:
            warnings.append(
                f"{flagged} shared pixels carry the detector OVERFLOW flag (near saturation). "
                "Only OVERFLOW and SOURCE flags were allowed. Exposures with readout errors, "
                "blooming or other quality flags were masked."
            )
    payload = {
        "position": position_json(center),
        "epochs": epochs,
        "overlap_pixels": int(inside.sum()),
        "usable_pixels": count,
        "max_spectral_bandwidth_fraction": MAX_BANDWIDTH_FRACTION,
        "shape": list(b.image.shape),
        "unit": b.unit,
        "display_min": low,
        "display_max": high,
        "image_a": flattened(image_a),
        "image_b": flattened(image_b),
        "method": description,
    }
    if astrometry is not None:
        payload.update({
            "astrometry_source": astrometry.source,
            "warnings": warnings,
            "overflow_pixels": flagged,
            "max_bandwidth_ratio": MAX_BANDWIDTH_RATIO,
        })
    if field_only:
        payload["field_mask_radius_arcsec"] = FIELD_GUARD_ARCSEC
    return payload


def build_pair(path_a, path_b, url_a, url_b, center, *, astrometry=None, allow_overflow=False, field_only=False):
    def position_at(date):
        return center if astrometry is None else astrometry.at(date)

    a = read_observation(path_a, url_a, position_at)
    b = read_observation(path_b, url_b, position_at)
    return compare_observations(a, b, center, astrometry=astrometry,
                                allow_overflow=allow_overflow, field_only=field_only)


def build_single(observation, center, astrometry):
    mask = observation.usable()
    count = int(mask.sum())
    if count < MIN_USABLE_FRACTION * observation.image.size:
        raise ValueError("Insufficient quality-screened single-image coverage")
    image = np.where(mask, observation.image, np.nan)
    low, high = stretch(image)
    return {
        "position": position_json(center),
        "epoch": mark_observation(observation, observation.pixel),
        "usable_pixels": count,
        "shape": list(image.shape),
        "unit": observation.unit,
        "display_min": low,
        "display_max": high,
        "image": flattened(image),
        "astrometry_source": astrometry.source,
        "target_pixel_masked": not bool(observation.usable_at_target(mask)),
    }


def cached_cutout(url, ra, dec, *, size="1.2arcmin"):
    release = source_release(url)
    address = f"{url} {ra} {dec}"
    if size != "1.2arcmin":
        address += f" {size}"
    key = sha256(address.encode()).hexdigest()[:16]
    return CACHE / f"{release}-{key}.fits"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    location = parser.add_mutually_exclusive_group(required=True)
    location.add_argument("--position", nargs=2, type=float, metavar=("RA", "DEC"))
    location.add_argument("--target", choices=TARGETS)
    parser.add_argument("--dr1-url", "--earlier-url", dest="earlier_url", required=True)
    parser.add_argument("--qr3-url", "--later-url", dest="later_url")
    parser.add_argument("--allow-overflow", action="store_true")
    parser.add_argument("--field-only", action="store_true", help="Mask both predicted positions and compare the surrounding field")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    astrometry = TARGETS[args.target] if args.target else None
    ra, dec = astrometry.center if astrometry else args.position
    if not (0 <= ra <= 360 and -90 <= dec <= 90):
        parser.error("RA must be in [0, 360] and Dec in [-90, 90]")
    if not args.later_url and not astrometry:
        parser.error("A single observation requires --target")
    if args.allow_overflow and (not astrometry or not args.later_url):
        parser.error("Overflow screening requires --target and two observations")
    if args.field_only and (not astrometry or not args.later_url or args.allow_overflow):
        parser.error("A field comparison requires --target, two observations and the strict quality mask")

    center = SkyCoord(ra, dec, unit="deg")
    try:
        urls = [args.earlier_url] + ([args.later_url] if args.later_url else [])
        size = FIELD_CUTOUT_SIZE if args.field_only else "1.2arcmin"
        paths = [cached_cutout(url, ra, dec, size=size) for url in urls]
        for url, path in zip(urls, paths):
            if not download_cutout(url, path, ra=ra, dec=dec, size=size):
                raise ValueError(f"Could not download {path.name}")
        if args.later_url:
            payload = build_pair(*paths, *urls, center, astrometry=astrometry,
                                 allow_overflow=args.allow_overflow, field_only=args.field_only)
        else:
            observation = read_observation(paths[0], urls[0], astrometry.at)
            payload = build_single(observation, center, astrometry)
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    serialized = json.dumps(payload, indent=2, allow_nan=False)
    with args.output.open("x", encoding="utf-8") as output:
        output.write(serialized + "\n")
    print(f"{args.output}: {payload['usable_pixels']} usable pixels")


if __name__ == "__main__":
    main()
