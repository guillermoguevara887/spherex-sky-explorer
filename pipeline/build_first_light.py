
"""Build an offline SPHEREx D1 comparison preview from two real FITS cutouts.

Run in the repository root:
    python pipeline/build_first_light.py

Output: pipeline/output/preview/first_light.html and first_light.json
This is a visual demonstration, NOT a detection of astronomical variability.
"""

import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parent
CUTOUTS = ROOT / "output" / "cutouts"
OUTPUT = ROOT / "output" / "preview"
FILE_A = CUTOUTS / "dr1_d1_10.fits"
FILE_B = CUTOUTS / "qr3_d1_02.fits"

BAD_BITS = (
    0, 1, 2, 6, 7, 9, 10, 11,
    14, 15, 17, 19, 20, 22,
    25, 26, 27, 28, 29,
)
BAD_MASK = sum(1 << bit for bit in BAD_BITS)


def read_image(path):
    if not path.is_file():
        raise FileNotFoundError(f"Missing FITS: {path}")

    with fits.open(path, memmap=False) as hdus:
        hdu = hdus["IMAGE"]
        image = np.asarray(hdu.data, dtype=float).copy()
        flags = np.asarray(
            hdus["FLAGS"].data, dtype=np.int64
        ).copy()
        wcs = WCS(hdu.header)
        unit = str(hdu.header.get("BUNIT", "unspecified"))

    if image.ndim != 2 or image.shape != flags.shape:
        raise ValueError(f"IMAGE and FLAGS mismatch: {path}")

    return image, flags, wcs, unit


def flattened(values):
    return [
        float(v) if np.isfinite(v) else None
        for v in values.ravel()
    ]


def build():
    a, flags_a, wcs_a, unit_a = read_image(FILE_A)
    b, flags_b, wcs_b, unit_b = read_image(FILE_B)

    if unit_a != unit_b:
        raise ValueError(
            f"Units differ: {unit_a!r} / {unit_b!r}"
        )

    yy, xx = np.indices(b.shape, dtype=float)

    # Align the 2025 observations onto the 2026 sky grid.
    sky = wcs_b.pixel_to_world(xx, yy)
    xa, ya = wcs_a.world_to_pixel(sky)

    inside = (
        np.isfinite(xa)
        & np.isfinite(ya)
        & (xa >= 0)
        & (ya >= 0)
        & (xa <= a.shape[1] - 1)
        & (ya <= a.shape[0] - 1)
    )

    xa_safe = np.where(np.isfinite(xa), xa, -999.0)
    ya_safe = np.where(np.isfinite(ya), ya, -999.0)

    ix = np.clip(
        np.rint(xa_safe).astype(int),
        0, a.shape[1] - 1,
    )
    iy = np.clip(
        np.rint(ya_safe).astype(int),
        0, a.shape[0] - 1,
    )

    clean_a = (flags_a[iy, ix] & BAD_MASK) == 0
    clean_b = (flags_b & BAD_MASK) == 0

    valid = (
        inside
        & clean_a
        & clean_b
        & np.isfinite(a[iy, ix])
        & np.isfinite(b)
    )

    on_grid_a = np.where(valid, a[iy, ix], np.nan)
    on_grid_b = np.where(valid, b, np.nan)

    samples = np.r_[
        on_grid_a[valid],
        on_grid_b[valid],
    ]

    if samples.size == 0:
        raise ValueError("No common usable pixels found")

    lo, hi = map(float, np.percentile(samples, [2, 98]))

    if hi <= lo:
        lo, hi = float(np.min(samples)), float(np.max(samples))

    if hi <= lo:
        hi = lo + 1.0

    payload = {
        "title": "SPHEREx Sky Explorer — First Light",
        "observations": {
            "a": "DR1 · 2025 · 2025W18_1B_0366_3 · D1",
            "b": "QR3 · 2026 · 2026W21_2A_0222_2 · D1",
        },
        "wavelength_um_approx": {
            "a": 0.923919,
            "b": 0.915242,
        },
        "bandwidth_nm_approx": {
            "a": 23.50,
            "b": 23.50,
        },
        "shape": [int(b.shape[0]), int(b.shape[1])],
        "overlap_pixels": int(np.count_nonzero(inside)),
        "usable_pixels": int(np.count_nonzero(valid)),
        "unit": unit_a,
        "display_min": lo,
        "display_max": hi,
        "image_a": flattened(on_grid_a),
        "image_b": flattened(on_grid_b),
        "method": (
            "Common percentile display stretch. "
            "Nearest-neighbor WCS alignment. "
            "Visualization only; no photometric "
            "variability claim."
        ),
    }

    OUTPUT.mkdir(parents=True, exist_ok=True)

    json_path = OUTPUT / "first_light.json"
    html_path = OUTPUT / "first_light.html"

    json_path.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
        ),
        encoding="utf-8",
    )

    template = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SPHEREx Sky Explorer — First Light</title>
<style>
body {
    font-family: system-ui, sans-serif;
    background: #0b1421;
    color: #eaf1fa;
    max-width: 1100px;
    padding: 24px;
    margin: auto;
}
h1 { font-size: 32px; }
p { line-height: 1.6; color: #b6c9dd; }
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
}
.panel {
    background: #132234;
    border: 1px solid #324457;
    border-radius: 14px;
    padding: 16px;
}
canvas {
    width: 100%;
    display: block;
    image-rendering: pixelated;
    background: #0b1421;
    border-radius: 8px;
}
button {
    background: #2671c9;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
}
.controls {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 15px 0;
}
input { flex: 1; }
.warning {
    border-left: 3px solid #e8b24f;
    background: #252519;
    padding: 14px;
}
small { color: #b6c9dd; }
</style>
</head>
<body>

<p>NASA / IPAC-IRSA · SPHEREx</p>
<h1>SPHEREx Sky Explorer</h1>
<p>
First Light: comparación exploratoria de dos observaciones
del mismo campo celeste realizadas en 2025 y 2026.
</p>

<div class="grid">
  <div class="panel">
    <h2 id="overlap"></h2>
    <small>Posiciones espaciales compartidas</small>
  </div>
  <div class="panel">
    <h2 id="good"></h2>
    <small>Píxeles utilizables en ambas épocas</small>
  </div>
  <div class="panel">
    <h2>8.68 nm</h2>
    <small>Diferencia espectral aproximada</small>
  </div>
</div>

<h2>Observaciones</h2>
<div class="grid">
  <div class="panel">
    <h3>DR1 · 2025 · D1</h3>
    <p>Longitud de onda ≈ 0.923919 µm</p>
    <canvas id="viewA"></canvas>
    <small>2025W18_1B_0366_3</small>
  </div>

  <div class="panel">
    <h3>QR3 · 2026 · D1</h3>
    <p>Longitud de onda ≈ 0.915242 µm</p>
    <canvas id="viewB"></canvas>
    <small>2026W21_2A_0222_2</small>
  </div>
</div>

<h2>Comparador temporal</h2>
<div class="panel">
  <div class="controls">
    <button id="play">▶ Animar</button>
    <strong id="phase">2025</strong>
    <input id="epoch" type="range"
           min="0" max="100" value="0"
           aria-label="Seleccionar época">
    <span>2026</span>
  </div>
  <canvas id="blink"></canvas>
  <p>
    Ambas imágenes utilizan la misma escala de visualización.
    Las regiones oscuras indican muestras no comparables.
  </p>
</div>

<p class="warning">
<strong>Advertencia científica:</strong>
esta visualización no demuestra variabilidad astronómica.
Las longitudes de onda efectivas son diferentes y
la alineación utiliza el vecino más cercano.
Las diferencias visibles podrían tener causas espectrales,
instrumentales o de calibración.
</p>

<p>
Datos SPHEREx Level 2 de NASA/IPAC-IRSA.
Flujo en unidades científicas originales.
Sin sustracción de fondo ni igualación de PSF.
</p>

<script>
const data = __PAYLOAD__;

const [h, w] = data.shape;
const pixels = 32;

for (const id of ["viewA", "viewB", "blink"]) {
    const canvas = document.getElementById(id);
    canvas.width = w * pixels;
    canvas.height = h * pixels;
}

function draw(id, values) {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    values.forEach((value, i) => {
        const row = Math.floor(i / w);
        const col = i % w;

        if (value === null) {
            ctx.fillStyle = "#162c42";
        } else {
            const t = Math.max(
                0,
                Math.min(
                    1,
                    (value - data.display_min) /
                    (data.display_max - data.display_min)
                )
            );

            const lum = Math.round(15 + 235 * t);
            ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
        }

        ctx.fillRect(
            col * pixels,
            row * pixels,
            pixels,
            pixels
        );
    });
}

document.getElementById("overlap").textContent =
    `${data.overlap_pixels}/${h * w}`;

document.getElementById("good").textContent =
    `${data.usable_pixels}/${h * w}`;

draw("viewA", data.image_a);
draw("viewB", data.image_b);

const slider = document.getElementById("epoch");
const label = document.getElementById("phase");
const button = document.getElementById("play");

let timer = null;

function refresh() {
    const showB = Number(slider.value) >= 50;

    draw(
        "blink",
        showB ? data.image_b : data.image_a
    );

    label.textContent = showB ? "2026" : "2025";
}

slider.addEventListener("input", refresh);

button.addEventListener("click", () => {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
        button.textContent = "▶ Animar";
    } else {
        timer = setInterval(() => {
            slider.value =
                Number(slider.value) >= 50 ? 0 : 100;
            refresh();
        }, 850);

        button.textContent = "Ⅱ Pausar";
    }
});

refresh();
</script>
</body>
</html>"""

    embedded_json = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
    ).replace("</", "<\\/")

    html_text = template.replace(
        "__PAYLOAD__",
        embedded_json,
    )

    html_path.write_text(
        html_text,
        encoding="utf-8",
    )

    print(
        f"Spatial overlap: "
        f"{payload['overlap_pixels']}/{b.size}"
    )
    print(
        f"Usable pixels: "
        f"{payload['usable_pixels']}/{b.size}"
    )
    print(f"HTML: {html_path}")
    print(f"JSON: {json_path}")
    print(
        "PRELIMINARY VISUALIZATION ONLY "
        "- no astronomical variability claim."
    )


if __name__ == "__main__":
    build()
