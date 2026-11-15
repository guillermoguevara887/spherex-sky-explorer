# SPHEREx Sky Explorer

Explore NASA Space Apps challenge targets and compare public SPHEREx Level 2 images across two epochs. [Open the explorer](https://spherex-sky-explorer.vercel.app/).

## Available comparisons

| Field | Detector | DR1 observation (UTC) | QR3 observation (UTC) | WCS overlap | Usable samples |
| --- | --- | --- | --- | --- | --- |
| First Light | D1 | 2025-04-30 | 2026-05-22 | 121/144 | 118/144 |
| Epsilon Indi B | D2 | 2025-10-10 | 2026-09-28 | 122/144 | 116/144 |

First Light retains its original processed JSON and 8.68 nm separation (about 37% of its 23.5 nm nominal bandwidth). For Epsilon Indi B, the separation at the nominal search center is 1.13 nm (about 4% of the narrower 27.11 nm nominal bandwidth). Both proper-motion-propagated Epsilon Indi B positions fall within the corresponding cutouts. The plotted catalog positions are search coordinates. The previews do not identify a particular bright pixel as the named object or establish changes in position or brightness.

The 20 FITS cutouts in the original local cache cover First Light alone. The Epsilon Indi B inputs came from IRSA and are referenced in [the processed dataset](web/public/data/epsilon_indi_b.json). RW Aurigae had archive coverage, but the screened pairs did not pass the target-pixel quality requirements. Barnard’s Star, WISE 0855−0714, RW Aurigae, R Draconis and unprocessed custom coordinates link to an IRSA search for that position.

## Run and verify the web app

```sh
cd web
npm ci
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
npm start
```

- Select each of the five catalog targets and First Light with the keyboard or pointer. Verify the pressed state, selected marker, coordinates and IRSA search URL where no processed pair is offered.
- Enter an empty value, RA 361° or Dec −91°. Verify that the form marks the invalid field without changing the selection. Try RA 0° and 360°, and Dec −90° and +90°. RA 360° maps to RA 0° in IRSA.
- In each available viewer, try Play/Pause, the epoch buttons and the blend slider. Switch to a target without a pair during playback and confirm the images disappear. Return to the viewer and verify playback starts paused at the earlier epoch.

## Reproduce the Epsilon Indi B preview

Install the Python dependencies from [pipeline/requirements.txt](pipeline/requirements.txt), then run from the repository root. The two source URLs are the `epochs.a.source` and `epochs.b.source` fields in [epsilon_indi_b.json](web/public/data/epsilon_indi_b.json).

```sh
python pipeline/query_irsa.py --position 331.09654 -56.80085
python pipeline/build_target_pair.py --position 331.09654 -56.80085 \
  --dr1-url '<epochs.a.source>' --qr3-url '<epochs.b.source>' \
  --output epsilon_indi_b_rebuilt.json
```

The generator uses position-specific, cached 1.2 arcmin FITS cutouts and checks their observation IDs, timestamps, detector, units, WCS and flags. It aligns the DR1 frame onto the QR3 celestial grid by nearest neighbor. New previews retain shared pixels with nominal or SOURCE-only flags and an effective wavelength difference of at most 25% of the narrower local bandpass. The threshold is for exploratory display. The preview uses a shared stretch without PSF matching, background subtraction or calibrated photometry. Raw FITS stay in the ignored local cache.

[SPHEREx archive and data access at NASA/IPAC-IRSA](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/)
