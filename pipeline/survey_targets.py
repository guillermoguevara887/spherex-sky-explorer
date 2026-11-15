"""Plan and download a bounded, detector-diverse sample of SPHEREx cutouts."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations, zip_longest
import json
from pathlib import Path

from astropy.coordinates import SkyCoord
from astropy.time import Time
import numpy as np

from build_target_pair import (
    FIELD_CUTOUT_SIZE, MAX_BANDWIDTH_FRACTION, MAX_BANDWIDTH_RATIO, OVERFLOW_FLAG, SOURCE_FLAG,
    build_single, cached_cutout, compare_observations, read_observation, spectral_distance,
)
from find_d1_match import download_cutout
from query_irsa import COLLECTIONS, fetch_collection
from target_astrometry import TARGETS

ROOT = Path(__file__).resolve().parent
MIN_GAP_DAYS = 1
QUERY_RADIUS_ARCSEC = 30.0
DEEP_COLLECTIONS = tuple(f"{collection}_deep" for collection in COLLECTIONS)
MAX_FIELD_CUTOUTS = 12


@dataclass(frozen=True)
class Candidate:
    url: str
    release: str
    survey: str
    detector: str
    date_mjd: float
    x: float
    y: float


def footprint_position(region, coord):
    """Approximate normalized detector x, y using the ordered SIA footprint.

    The full FITS celestial and spectral WCS must still be evaluated. The
    interpolation is used only to rank acquisition candidates.
    """
    words = region.split()
    if words[:2] != ["POLYGON", "ICRS"] or len(words) not in (10, 12):
        return None
    corners = np.array(words[2:10], dtype=float).reshape(4, 2)
    corners[:, 0] = (corners[:, 0] - coord.ra.deg + 180) % 360 - 180
    corners[:, 0] *= np.cos(coord.dec.rad)
    corners[:, 1] -= coord.dec.deg
    p, q, r, s = corners
    east = q - p
    north = s - p
    skew = p - q + r - s
    x, y = np.linalg.solve(np.column_stack((east, north)), -p)
    for _ in range(2):
        correction = np.linalg.solve(
            np.column_stack((east + y * skew, north + x * skew)),
            p + x * east + y * north + x * y * skew,
        )
        x, y = np.array([x, y]) - correction
    return float(x), float(y)


def collect(target, *, refresh=False, include_deep=False):
    candidates = []
    totals = {}
    seen = set()

    @lru_cache(maxsize=1024)
    def position(mjd):
        return target.at(Time(mjd, format="mjd", scale="utc"))

    collections = COLLECTIONS + DEEP_COLLECTIONS if include_deep else COLLECTIONS
    for collection in collections:
        survey = collection.removeprefix("spherex_")
        release = survey.removesuffix("_deep")
        records = fetch_collection(collection, *target.center, QUERY_RADIUS_ARCSEC, prefer_cache=not refresh)
        if records is None:
            totals[survey] = None
            continue
        totals[survey] = len(records)
        for record in records:
            url = record["url"]
            detector = record["band"].removeprefix("SPHEREx-")
            if detector not in {"D1", "D2", "D3", "D4", "D5", "D6"}:
                continue
            # Deduplicate the same exposure even if it occurs in two releases.
            identity = (record["obs_id"], detector)
            if identity in seen:
                continue
            date_mjd = record["start_mjd"]
            if not record.get("region"):
                raise ValueError(f"Missing SIA footprint for {record['obs_id']}")
            try:
                xy = footprint_position(record["region"], position(date_mjd))
            except (ValueError, np.linalg.LinAlgError):
                continue
            if xy is None:
                continue
            x, y = xy
            if 0 <= x <= 1 and 0 <= y <= 1:
                seen.add(identity)
                candidates.append(Candidate(url, release, survey, detector, date_mjd, x, y))
    return candidates, totals


def plan(candidates, slug):
    by_detector = [[c for c in candidates if c.detector == f"D{d}"] for d in range(1, 7)]
    rankings = []
    for items in by_detector:
        pairs = [
            (a, b) for a, b in combinations(sorted(items, key=lambda c: c.date_mjd), 2)
            if b.date_mjd - a.date_mjd >= MIN_GAP_DAYS
        ]
        ranked = []
        # Rank separately by release combination and time separation so the
        # sample spans more than one scan season and can try shorter gaps.
        for cross, gap in ((True, 60), (False, 60), (True, 1), (False, 1)):
            subset = [(a, b) for a, b in pairs
                      if (a.release != b.release) == cross and b.date_mjd - a.date_mjd >= gap]
            subset.sort(key=lambda pair: approximate_mismatch(pair, slug))
            ranked.append(subset)
        rankings.append(ranked)

    seen = set()
    result = []
    for rank in range(max((len(pool) for band in rankings for pool in band), default=0)):
        for band in rankings:
            for pool in band:
                if rank >= len(pool):
                    continue
                for candidate in pool[rank]:
                    if candidate.url not in seen:
                        result.append(candidate)
                        seen.add(candidate.url)
    # Include individually available exposures if there were no pairs.
    return result + [c for c in candidates if c.url not in seen]


def approximate_mismatch(pair, slug):
    a, b = pair
    inside = min(a.x, a.y, b.x, b.y, 1-a.x, 1-a.y, 1-b.x, 1-b.y)
    value = abs(a.y - b.y) + 0.035 * abs(a.x - b.x)
    value += 0.025 if inside < 0.03 else 0
    if slug == "wise-0855" and a.detector in {"D5", "D6"}:
        # Wavelength increases toward the near edge of the detector's y axis.
        value += 0.02 * max(a.y, b.y)
    return value


def channel_sample(candidates):
    """Interleave detector, survey, season and filter positions for bright cores."""
    groups = {}
    for candidate in sorted(candidates, key=lambda c: (c.survey, c.detector, c.date_mjd)):
        date = Time(candidate.date_mjd, format="mjd", scale="utc").isot
        season = (int(date[5:7]) - 1) // 3
        channel = min(3, int(candidate.y * 4))
        key = (candidate.survey, candidate.detector, date[:4], season, channel)
        groups.setdefault(key, []).append(candidate)
    for items in groups.values():
        items.sort(key=lambda c: -min(c.x, 1 - c.x, c.y, 1 - c.y))
    # Give each detector in each collection a turn before taking another
    # exposure from any of them.
    lanes = {}
    for key, items in groups.items():
        lanes.setdefault(key[:2], []).append(items)
    queues = [
        [c for row in zip_longest(*groups_in_lane) for c in row if c is not None]
        for groups_in_lane in lanes.values()
    ]
    return [c for row in zip_longest(*queues) for c in row if c is not None]


def refinement(candidates, initial, slug, limit):
    """Use cached, usable examples to predict close matches in unsampled frames."""
    if not limit:
        return []
    astrometry = TARGETS[slug]
    size = 2040  # Native SPHEREx Level 2 detector pixels along either axis.
    excluded = {c.url for c in initial}
    available = [c for c in candidates if c.url not in excluded and not cutout_path(slug, c).exists()]
    matches = {}
    for anchor in candidates:
        path = cutout_path(slug, anchor)
        if not path.is_file():
            continue
        try:
            observation = read_observation(path, anchor.url, astrometry.at)
        except (KeyError, OSError, ValueError):
            continue
        if not observation.usable_at_target(observation.usable(allow_overflow=True)):
            continue
        near_overflow = not observation.usable_at_target(observation.usable())
        subsets = [c for c in available if c.detector == anchor.detector
                   and abs(c.date_mjd - anchor.date_mjd) >= MIN_GAP_DAYS]
        if not subsets:
            continue
        x, y = observation.pixel
        xx = np.array([x + size * (c.x - anchor.x) for c in subsets])
        yy = np.array([y + size * (c.y - anchor.y) for c in subsets])
        wavelength, _ = observation.spectral.pixel_to_world(xx, yy)
        difference = abs(wavelength.to_value("um") - observation.info["wavelength_um"]) * 1000
        for candidate, delta in zip(subsets, difference):
            if not np.isfinite(delta):
                continue
            gap = abs(candidate.date_mjd - anchor.date_mjd)
            key = (near_overflow, gap < 60, delta / observation.info["bandwidth_nm"], -gap)
            if candidate.url not in matches or key < matches[candidate.url][0]:
                matches[candidate.url] = key, candidate
    ranked = [item[1] for item in sorted(matches.values(), key=lambda item: item[0])]
    if not ranked and slug in {"barnards-star", "r-draconis"}:
        # Look for an unsaturated low-wavelength core across different seasons.
        # The initial sample already covers all six detectors.
        short_bands = [c for c in available if c.detector in {"D1", "D2"} and 0.03 <= c.x <= 0.97
                       and 0.65 <= c.y <= 0.97]
        monthly = {}
        for candidate in sorted(short_bands, key=lambda c: (c.detector, -c.y)):
            month = Time(candidate.date_mjd, format="mjd").isot[:7]
            monthly.setdefault((candidate.detector, month), []).append(candidate)
        ranked = [c for bunch in zip_longest(*monthly.values()) for c in bunch if c is not None]
    already_ranked = excluded | {c.url for c in ranked}
    return (ranked + [c for c in plan(available, slug) if c.url not in already_ranked])[:limit]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", action="append", choices=TARGETS)
    parser.add_argument("--evaluate-only", action="store_true", help="Use existing FITS only")
    parser.add_argument("--refresh-metadata", action="store_true")
    parser.add_argument("--include-deep", action="store_true", help="Also query the DR1 and QR3 deep fields")
    parser.add_argument("--sample-channels", action="store_true",
                        help="Spread the budget over deep/wide surveys, seasons and detector filter positions")
    parser.add_argument("--compare-field", action="store_true",
                        help="Try a surrounding-field comparison when the target core fails screening")
    parser.add_argument("--follow-up", type=int, default=0, help="Additional candidates guided by measured WCS-WAVE")
    parser.add_argument("--limit", type=int, default=36, help="Maximum cutouts per target")
    args = parser.parse_args()
    if args.limit < 1 or args.follow_up < 0 or args.limit + args.follow_up > 192:
        parser.error("The combined limit must be between 1 and 192 cutouts per target")
    slugs = list(dict.fromkeys(args.target or TARGETS))
    inventories = {}
    queues = []
    for slug in slugs:
        candidates, totals = collect(TARGETS[slug], refresh=args.refresh_metadata, include_deep=args.include_deep)
        if args.sample_channels:
            # Keep a seed of likely pairs while exploring the broader sample.
            seed = plan(candidates, slug)[:min(36, args.limit // 3)]
            seen = {c.url for c in seed}
            ranked = seed + [c for c in channel_sample(candidates) if c.url not in seen]
        else:
            ranked = plan(candidates, slug)
        queue = ranked[:args.limit]
        print(f"{slug}: SIA rows {totals}, {len(candidates)} predicted footprints, {len(queue)} cutouts", flush=True)
        inventories[slug] = candidates, totals
        queues.append([(slug, c) for c in queue])
    if not args.evaluate_only:
        jobs = [job for bunch in zip_longest(*queues) for job in bunch if job is not None]
        with ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(download, jobs))
            follow_ups = [
                (slug, candidate)
                for slug, queue in zip(slugs, queues)
                for candidate in refinement(inventories[slug][0], [c for _, c in queue], slug, args.follow_up)
            ]
            list(executor.map(download, follow_ups))
        for slug, queue in zip(slugs, queues):
            queue.extend(task for task in follow_ups if task[0] == slug)

    directory = ROOT / "output" / "issue2-results"
    directory.mkdir(parents=True, exist_ok=True)
    for slug, queue in zip(slugs, queues):
        candidates, totals = inventories[slug]
        payload, field, report = evaluate(slug, candidates, compare_field=args.compare_field,
                                          allow_download=not args.evaluate_only)
        report["sia_rows"] = totals
        report["inventory_complete"] = all(count is not None for count in totals.values())
        if all(count is None for count in totals.values()):
            report["result"] = "inventory-unavailable"
        report["planned_limit"] = args.limit + args.follow_up
        report["planned_cutouts_missing"] = sum(not cutout_path(*job).exists() for job in queue)
        (directory / f"{slug}-screening.json").write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8",
        )
        for name, preview in ((slug, payload), (f"{slug}-field", field)):
            path = directory / f"{name}.json"
            if preview is None:
                path.unlink(missing_ok=True)
            else:
                path.write_text(json.dumps(preview, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(slug, report["result"], report["fits_read"], report["rejections"], flush=True)


def cutout_path(slug, candidate):
    return ROOT / "output" / slug / (candidate.release + "-" + Path(candidate.url).name)


def download(task):
    slug, candidate = task
    ra, dec = TARGETS[slug].center
    path = cutout_path(slug, candidate)
    success = download_cutout(candidate.url, path, ra=ra, dec=dec)
    if not success:
        print(slug, path.name, "unavailable", flush=True)
    return success


def evaluate(slug, candidates, *, compare_field=False, allow_download=False):
    astrometry = TARGETS[slug]
    center = SkyCoord(*astrometry.center, unit="deg")
    detector_counts = {
        f"D{d}": {"footprints": 0, "downloaded": 0, "nominal_target": 0,
                  "overflow_only_target": 0, "rejected_target": 0} for d in range(1, 7)
    }
    rejected = Counter()
    target_flags = Counter()
    flags_by_release = {}
    fits_by_collection = Counter()
    spectral_samples = {}
    observations = []
    for candidate in candidates:
        counts = detector_counts[candidate.detector]
        counts["footprints"] += 1
        path = cutout_path(slug, candidate)
        if not path.is_file():
            continue
        counts["downloaded"] += 1
        try:
            observation = read_observation(path, candidate.url, astrometry.at)
            if abs(observation.date.mjd - candidate.date_mjd) * 86400 > 2:
                raise ValueError("FITS UTC timestamp differs from the SIA exposure timestamp")
        except (KeyError, OSError, ValueError) as error:
            rejected[str(error).splitlines()[0]] += 1
            continue
        observations.append(observation)
        target_flags[observation.target_flags] += 1
        flags_by_release.setdefault(candidate.release, Counter())[observation.target_flags] += 1
        fits_by_collection[candidate.survey] += 1
        spectral_samples.setdefault(candidate.detector, []).append(observation.info["wavelength_um"])
        if observation.usable_at_target(observation.usable()):
            counts["nominal_target"] += 1
        elif observation.usable_at_target(observation.usable(allow_overflow=True)):
            counts["overflow_only_target"] += 1
        else:
            counts["rejected_target"] += 1
            flags = observation.target_flags & ~SOURCE_FLAG
            reason = "Target pixel: other quality flags" if flags else "Target pixel: invalid IMAGE or VARIANCE"
            if flags & OVERFLOW_FLAG:
                reason = "Target pixel: overflow with additional flags"
            rejected[reason] += 1

    report = {
        "target": slug, "query_position": list(astrometry.center),
        "radius_arcsec": QUERY_RADIUS_ARCSEC, "astrometry_source": astrometry.source,
        "predicted_footprints": len(candidates), "fits_read": len(observations),
        "detectors": detector_counts, "rejections": rejected,
        "target_flags": dict(sorted(target_flags.items())), "result": "browse-irsa",
        "target_flags_by_release": flags_by_release,
        "fits_by_collection": fits_by_collection,
        "observed_wavelength_um_by_detector": {
            detector: [min(values), max(values)] for detector, values in sorted(spectral_samples.items())
        },
    }
    pairs = ranked_compatible_pairs(slug, observations, rejected)
    for overflow, a, b in pairs:
        try:
            payload = compare_observations(a, b, center, astrometry=astrometry, allow_overflow=overflow)
        except ValueError as error:
            reason = str(error)
            if reason.startswith("Only "):
                reason = "Insufficient unmasked spatial/spectral overlap"
            rejected[reason] += 1
            continue
        report.update({
            "result": "time-comparison",
            "epochs": payload["epochs"],
            "overlap_pixels": payload["overlap_pixels"],
            "usable_pixels": payload["usable_pixels"],
            "overflow_pixels": payload["overflow_pixels"],
        })
        return payload, None, report

    field = None
    if compare_field:
        field, field_report = compare_surroundings(slug, observations, center, allow_download=allow_download)
        report.update(field_report)

    def single_score(observation):
        good = observation.usable()
        priority = -int(observation.info["detector"][1:]) if slug == "wise-0855" else 0
        return not observation.usable_at_target(good), priority, -int(good.sum())

    for observation in sorted(observations, key=single_score):
        try:
            payload = build_single(observation, center, astrometry)
        except ValueError:
            continue
        report.update({
            "result": "single-image", "epoch": payload["epoch"],
            "usable_pixels": payload["usable_pixels"],
            "target_pixel_masked": payload["target_pixel_masked"],
        })
        return payload, field, report
    return None, field, report


def compare_surroundings(slug, observations, center, *, allow_download):
    """Use small cutouts to select pairs and show a wider area around masked cores."""
    astrometry = TARGETS[slug]
    ra, dec = astrometry.center
    rejected = Counter()
    attempted = set()

    @lru_cache(maxsize=None)
    def wider_observation(url):
        path = cached_cutout(url, ra, dec, size=FIELD_CUTOUT_SIZE)
        if not path.is_file():
            if not allow_download or len(attempted) >= MAX_FIELD_CUTOUTS:
                return None
            attempted.add(url)
            if not download_cutout(url, path, ra=ra, dec=dec, size=FIELD_CUTOUT_SIZE):
                rejected["Wider FITS cutout unavailable"] += 1
                return None
        try:
            return read_observation(path, url, astrometry.at)
        except (KeyError, OSError, ValueError) as error:
            rejected[str(error).splitlines()[0]] += 1
            return None

    field = None
    report = {"field_comparison_rejections": rejected}
    for _, a, b in ranked_compatible_pairs(slug, observations, rejected, field_only=True):
        wide_a = wider_observation(a.info["source"])
        wide_b = wider_observation(b.info["source"])
        if wide_a is None or wide_b is None:
            continue
        try:
            field = compare_observations(wide_a, wide_b, center, astrometry=astrometry, field_only=True)
        except ValueError as error:
            reason = str(error)
            if reason.startswith("Only "):
                reason = "Insufficient unmasked spatial/spectral overlap outside the target mask"
            rejected[reason] += 1
            continue
        report["field_comparison"] = {key: field[key] for key in (
            "epochs", "shape", "overlap_pixels", "usable_pixels", "field_mask_radius_arcsec",
        )}
        break
    report["field_cutouts_requested"] = len(attempted)
    return field, report


def ranked_compatible_pairs(slug, observations, rejected, *, field_only=False):
    pairs = []
    quality = {o.info["source"]: (
        o.usable_at_target(o.usable()), o.usable_at_target(o.usable(allow_overflow=True)),
    ) for o in observations}
    for a, b in combinations(sorted(observations, key=lambda o: o.date.mjd), 2):
        if a.info["detector"] != b.info["detector"] or a.info["id"] == b.info["id"]:
            continue
        time_gap = float(b.date.mjd - a.date.mjd)
        if time_gap < MIN_GAP_DAYS:
            continue
        a_nominal, a_overflow = quality[a.info["source"]]
        b_nominal, b_overflow = quality[b.info["source"]]
        if field_only and a_nominal and b_nominal:
            continue
        if not field_only and not (a_overflow and b_overflow):
            rejected["Pair includes an unusable target pixel"] += 1
            continue
        _, fraction, width_ratio = spectral_distance(a, b)
        if fraction > MAX_BANDWIDTH_FRACTION or width_ratio > MAX_BANDWIDTH_RATIO:
            rejected["Pair exceeds target wavelength/bandwidth tolerance"] += 1
            continue
        overflow = not field_only and not (a_nominal and b_nominal)
        priority = -int(a.info["detector"][1:]) if slug == "wise-0855" else 0
        key = (overflow, priority, time_gap < 60, fraction, -time_gap)
        pairs.append((key, overflow, a, b))
    return [(overflow, a, b) for _, overflow, a, b in sorted(pairs, key=lambda pair: pair[0])]


if __name__ == "__main__":
    main()
