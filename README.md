# SPHEREx Sky Explorer

Explore the five NASA Space Apps challenge targets and enter your own ICRS coordinates. [Open the explorer](https://spherex-sky-explorer.vercel.app/).

## Challenge coverage

| Target | DR1/QR3 public rows | Available view | FITS provenance and screening outcome |
| --- | --- | --- | --- |
| Barnard’s Star | 240/124 wide, 0/0 deep | [Field comparison](web/public/data/barnards_star_field.json) and [single image](web/public/data/barnards_star.json) | D1 · DR1 wide 2025-09-30 / 2026-03-11 · 478/529 WCS, 423 usable · 0.26 nm separation. Both predicted positions are masked. |
| Epsilon Indi B | Yes/Yes, previously verified | [Time comparison](web/public/data/epsilon_indi_b.json) | D2 · [DR1 2025-10-10](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W41_2B/l2b-v27-2026-242/2/level2_2025W41_2B_0173_2D2_spx_l2b-v27-2026-242.fits) / [QR3 2026-09-28](https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W40_1A/l2b-v27-2026-276/2/level2_2026W40_1A_0031_1D2_spx_l2b-v27-2026-276.fits) · 122/144 WCS, 116 usable · 1.13 nm separation |
| WISE 0855−0714 | 258/0, 31 cutouts screened | [Time comparison](web/public/data/wise_0855.json) | D6 · [DR1 2025-05-05](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-197/6/level2_2025W19_1B_0116_1D6_spx_l2b-v27-2026-197.fits) / [DR1 2026-05-11](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W20_1A/l2b-v27-2026-246/6/level2_2026W20_1A_0033_1D6_spx_l2b-v27-2026-246.fits) · 121/144 WCS, 117 usable · 0.11 nm separation |
| RW Aurigae | 226/110, 72 cutouts screened | [Time comparison](web/public/data/rw_aurigae.json) | D1 · [DR1 2025-09-03](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W36_1A/l2b-v27-2026-232/1/level2_2025W36_1A_0606_2D1_spx_l2b-v27-2026-232.fits) / [DR1 2026-03-04](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W10_1A/l2b-v27-2026-229/1/level2_2026W10_1A_0445_2D1_spx_l2b-v27-2026-229.fits) · 121/144 WCS, 119 usable · 0.20 nm separation |
| R Draconis | 422/126 wide, 1,232/731 deep | [Field comparison](web/public/data/r_draconis_field.json) and [single image](web/public/data/r_draconis.json) | D3 · DR1 deep 2025-04-24 / 2026-04-11 · 484/529 WCS, 283 usable · 0.009 nm separation. The predicted position is masked in both frames. |

First Light is a separate demonstration field, outside the five challenge objects. Its original D1 comparison uses DR1 on 2025-04-30 and QR3 on 2026-05-22, with 121/144 positions in common, 118 usable samples and an 8.68 nm wavelength separation (about 37% of the nominal bandwidth). The First Light and Epsilon Indi B datasets retain their original pixel arrays.

A time comparison presents two real exposures of the same sky field. The rings indicate approximate positions calculated from catalog astrometry. Source identification and claims of motion or variability require independent calibrated measurements. WISE 0855 is faint even in the long-wavelength D6 frames. Barnard’s Star and R Draconis have flagged cores. Their two-epoch views compare the surrounding sky and apply a shared mask to flagged pixels and to every sample within 18.6″ of either predicted position in either native grid. The individual observations remain available. The five official fields have views at two dates, with target-position quality checks passing for three of them.

## What was searched

The [screening report](pipeline/screening_report.json) records results by detector, observed flags, reasons for rejection and the source FITS used. SIA2 cone searches covered public DR1 and QR3 wide and deep collections. The plans included D1–D6 over multiple seasons and tested exposures one day or more apart. The follow-up for bright cores distributed the 1.2′ cutouts across collections, observing seasons and detector filter positions. It used 2.4′ cutouts for the final surrounding-field comparison. The FITS sample was bounded and some requests still returned HTTP errors after retries. The DR1 all-sky cube combines observations and is unsuitable as an individual epoch.

The follow-up screened 64 Barnard’s Star cutouts and 70 R Draconis cutouts, including earlier downloads from the same checkout. BLOOM flags affected the predicted position in all 134 exposures. OVERFLOW was also present in 62 of 64 Barnard’s Star exposures and all 70 R Draconis exposures. Eight Barnard’s Star and six R Draconis cutouts from the 60-per-target follow-up queues remained unavailable after retry.

DR1 covers Surveys 1 and 2 with the same improved pipeline and calibration as QR3. Distinct, compatible exposures within DR1 can therefore provide a time comparison. The WISE 0855 query returned no QR3 rows in the 30″ cone at the time of screening. [IRSA release guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-releases/)

For Barnard’s Star and WISE 0855, the pipeline propagates the reference sky position using published proper motion and approximate parallax as seen near Earth. Perspective acceleration and spacecraft-specific parallax are below the cutout pixel scale and are omitted. RW Aurigae and R Draconis use nominal catalog positions appropriate for locating the field.

## Reproduce the previews

Install the Python dependencies from [pipeline/requirements.txt](pipeline/requirements.txt). The scanner uses a cached SIA inventory and stores FITS cutouts under the ignored `pipeline/output/` directory. These are example commands from the repository root.

```sh
python pipeline/survey_targets.py --target rw-aurigae --limit 36 --follow-up 24
python pipeline/survey_targets.py --target wise-0855 --limit 36
python pipeline/survey_targets.py --target barnards-star --target r-draconis \
  --limit 60 --include-deep --sample-channels --compare-field
```

Use `--refresh-metadata` for new SIA results and `--evaluate-only` to evaluate already cached exposures. For an exact preview, take the full URLs from `epochs.a.source` and `epochs.b.source` in its JSON. For a single-image preview use `epoch.source` as the earlier URL and omit the later URL.

```sh
python pipeline/build_target_pair.py --target wise-0855 \
  --earlier-url '<epochs.a.source>' --later-url '<epochs.b.source>' \
  --output wise_0855_rebuilt.json
```

To reproduce a published surrounding-field preview, use its two source URLs, the corresponding `--target` and `--field-only`.

The generator checks observation IDs and releases, UTC timestamps, fine astrometry, celestial WCS footprints, detector, units, target flags and variance. It aligns on a fixed celestial grid by nearest neighbor and requires at least half the output pixels to pass the masks. For the new pairs, the target and shared samples must be within 25% of the narrower local effective bandwidth, with a bandwidth ratio at most 1.15. Published issue 2 comparisons use nominal or SOURCE-only flags. The screening code can assess isolated OVERFLOW with an explicit warning, while overflow combined with blooming or readout errors is rejected. All previews use a common stretch without PSF matching, background subtraction or calibrated photometry. [SPHEREx Explanatory Supplement, Tables 14 and 16](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf)

## Run and verify

```sh
cd web
npm ci
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
npm start
```

- Choose all six fields with keyboard and pointer, open the coverage table and verify the matching asset and archive links.
- Test each time comparison using Play/Pause, the two dates and the blend slider. Change fields during play, then check that the newly selected view opens at the earlier epoch. Toggle predicted positions where available.
- Verify the target-mask warning and original FITS links in each surrounding-field comparison. Switch to the single image and confirm that the blink controls are absent. Switch back and confirm that the earlier epoch is shown.
- Test empty and invalid coordinates, valid custom positions, RA 360° and Dec ±90°, and a mobile viewport. RA 360° is sent to IRSA as 0°.
