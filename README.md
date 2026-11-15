# SPHEREx Sky Explorer

Explore the five NASA Space Apps challenge targets and enter your own ICRS coordinates. [Open the explorer](https://spherex-sky-explorer.vercel.app/).

## Challenge coverage

| Target | DR1/QR3 public rows | Available view | FITS provenance and screening outcome |
| --- | --- | --- | --- |
| Barnard’s Star | 240/124, 53 cutouts screened | [Single image](web/public/data/barnards_star.json) | D6 · [DR1 2026-03-22](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W12_2A/l2b-v27-2026-235/6/level2_2026W12_2A_0520_3D6_spx_l2b-v27-2026-235.fits) · 136/144 usable field pixels. OVERFLOW + BLOOM at the predicted position in the screened sample. |
| Epsilon Indi B | Yes/Yes, previously verified | [Time comparison](web/public/data/epsilon_indi_b.json) | D2 · [DR1 2025-10-10](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W41_2B/l2b-v27-2026-242/2/level2_2025W41_2B_0173_2D2_spx_l2b-v27-2026-242.fits) / [QR3 2026-09-28](https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W40_1A/l2b-v27-2026-276/2/level2_2026W40_1A_0031_1D2_spx_l2b-v27-2026-276.fits) · 122/144 WCS, 116 usable · 1.13 nm separation |
| WISE 0855−0714 | 258/0, 31 cutouts screened | [Time comparison](web/public/data/wise_0855.json) | D6 · [DR1 2025-05-05](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-197/6/level2_2025W19_1B_0116_1D6_spx_l2b-v27-2026-197.fits) / [DR1 2026-05-11](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W20_1A/l2b-v27-2026-246/6/level2_2026W20_1A_0033_1D6_spx_l2b-v27-2026-246.fits) · 121/144 WCS, 117 usable · 0.11 nm separation |
| RW Aurigae | 226/110, 72 cutouts screened | [Time comparison](web/public/data/rw_aurigae.json) | D1 · [DR1 2025-09-03](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W36_1A/l2b-v27-2026-232/1/level2_2025W36_1A_0606_2D1_spx_l2b-v27-2026-232.fits) / [DR1 2026-03-04](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W10_1A/l2b-v27-2026-229/1/level2_2026W10_1A_0445_2D1_spx_l2b-v27-2026-229.fits) · 121/144 WCS, 119 usable · 0.20 nm separation |
| R Draconis | 422/126, 59 cutouts screened | [Single image](web/public/data/r_draconis.json) | D1 · [DR1 2025-10-17](https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W42_2A/l2b-v27-2026-243/1/level2_2025W42_2A_0244_1D1_spx_l2b-v27-2026-243.fits) · 120/144 usable field pixels. OVERFLOW + BLOOM at the predicted position in the screened sample. |

First Light is a separate demonstration field, outside the five challenge objects. Its original D1 comparison uses DR1 on 2025-04-30 and QR3 on 2026-05-22, with 121/144 positions in common, 118 usable samples and an 8.68 nm wavelength separation (about 37% of the nominal bandwidth). The First Light and Epsilon Indi B datasets retain their original pixel arrays.

A time comparison presents two real exposures of the same sky field. The rings indicate approximate positions calculated from catalog astrometry. They do not identify a source in the images or establish movement or variability. WISE 0855 is faint even in the long-wavelength D6 frames. Its presence would require independent photometry. For single-image fallbacks, the masked core marks a region affected by detector flags. The remaining image depicts the observed surrounding field.

## What was searched

The [screening report](pipeline/screening_report.json) records results by detector, observed flags, reasons for rejection and the source FITS used. SIA2 cone searches covered both public DR1 and QR3. The initial candidate plan covered D1–D6, inspected exposures from multiple seasons, and tested pairs one day or more apart. A targeted follow-up used measured wavelength solutions to prioritize closer matches and included shorter wavelengths across different seasons for targets with severe brightness flags. The public footprints were ranked before requesting 1.2 arcmin cutouts. The scan was bounded and some requests still returned HTTP 503 after retries.

DR1 covers Surveys 1 and 2 with the same improved pipeline and calibration as QR3. Distinct, compatible exposures within DR1 can therefore provide a time comparison. The WISE 0855 query returned no QR3 rows in the 30″ cone at the time of screening. [IRSA release guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-releases/)

For Barnard’s Star and WISE 0855, the pipeline propagates the reference sky position using published proper motion and approximate parallax as seen near Earth. Perspective acceleration and spacecraft-specific parallax are below the cutout pixel scale and are omitted. RW Aurigae and R Draconis use nominal catalog positions appropriate for locating the field.

## Reproduce the previews

Install the Python dependencies from [pipeline/requirements.txt](pipeline/requirements.txt). The scanner uses a cached SIA inventory and stores FITS cutouts under the ignored `pipeline/output/` directory. These are example commands from the repository root.

```sh
python pipeline/survey_targets.py --target rw-aurigae --limit 36 --follow-up 24
python pipeline/survey_targets.py --target wise-0855 --limit 36
```

Use `--refresh-metadata` for new SIA results and `--evaluate-only` to evaluate already cached exposures. For an exact preview, take the full URLs from `epochs.a.source` and `epochs.b.source` in its JSON. For a single-image preview use `epoch.source` as the earlier URL and omit the later URL.

```sh
python pipeline/build_target_pair.py --target wise-0855 \
  --earlier-url '<epochs.a.source>' --later-url '<epochs.b.source>' \
  --output wise_0855_rebuilt.json
```

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
- Confirm the single observations have no blink controls and explain their masked regions.
- Test empty and invalid coordinates, valid custom positions, RA 360° and Dec ±90°, and a mobile viewport. RA 360° is sent to IRSA as 0°.
