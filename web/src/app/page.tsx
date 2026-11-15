
"use client";

import { useEffect, useRef, useState } from "react";
import { TargetSelector, UnavailableObservations } from "./target-selector";
import { FIRST_LIGHT, type Target } from "./targets";
import { DATASETS, type Dataset, type Epoch, type Epochs } from "./datasets";

type ImagePair = {
    position?: { ra: number; dec: number };
    epochs?: Epochs;
    max_spectral_bandwidth_fraction?: number;
    shape: [number, number];
    overlap_pixels: number;
    usable_pixels?: number;
    display_min: number;
    display_max: number;
    image_a: Array<number | null>;
    image_b: Array<number | null>;
    method?: string;
};

const SOURCE_ARCHIVE =
    "https://irsa.ipac.caltech.edu/Missions/spherex.html";

function SkyCanvas({
    values,
    shape,
    low,
    high,
    name,
}: {
    values: Array<number | null>;
    shape: [number, number];
    low: number;
    high: number;
    name: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const [height, width] = shape;
        canvas.width = width;
        canvas.height = height;
        ctx.imageSmoothingEnabled = false;

        for (let index = 0; index < values.length; index++) {
            const value = values[index];

            if (value === null || !Number.isFinite(value)) {
                ctx.fillStyle = "#0d2138";
            } else {
                const t = Math.min(
                    1,
                    Math.max(0, (value - low) / (high - low))
                );
                const r = Math.round(19 + 236 * Math.pow(t, 1.15));
                const g = Math.round(47 + 208 * Math.pow(t, 0.95));
                const b = Math.round(91 + 164 * Math.sqrt(t));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
            }

            ctx.fillRect(
                index % width,
                Math.floor(index / width),
                1,
                1
            );
        }
    }, [values, shape, low, high]);

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={name}
            className="block aspect-square w-full rounded-lg bg-[#0d2138]"
            style={{ imageRendering: "pixelated" }}
        />
    );
}

function isImagePair(value: unknown): value is ImagePair {
    if (!value || typeof value !== "object") return false;

    const v = value as Partial<ImagePair>;
    if (!Array.isArray(v.shape) || v.shape.length !== 2) {
        return false;
    }

    const [h, w] = v.shape;

    return (
        Number.isInteger(h) &&
        h > 0 &&
        Number.isInteger(w) &&
        w > 0 &&
        Array.isArray(v.image_a) &&
        v.image_a.length === h * w &&
        Array.isArray(v.image_b) &&
        v.image_b.length === h * w &&
        typeof v.display_min === "number" &&
        typeof v.display_max === "number" &&
        v.display_max > v.display_min
    );
}

export default function Home() {
    const [selected, setSelected] = useState(FIRST_LIGHT);
    const dataset = DATASETS[selected.id];

    return (
        <main className="min-h-screen bg-[#06111f] text-slate-100">
            <div
                className="pointer-events-none fixed inset-0 opacity-60"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 14% 12%, #21436885 0, transparent 24%), radial-gradient(circle at 88% 22%, #13536355 0, transparent 28%), radial-gradient(#ffffff25 0.5px, transparent 0.5px)",
                    backgroundSize: "auto, auto, 48px 48px",
                }}
            />

            <div className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-2xl">
                            ✦
                        </span>
                        <div>
                            <div className="text-base font-semibold tracking-wide">
                                SPHEREx{" "}
                                <span className="text-cyan-300">Sky Explorer</span>
                            </div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                Independent Space Apps prototype
                            </div>
                        </div>
                    </div>

                    <a
                        href={SOURCE_ARCHIVE}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
                    >
                        Explore the IRSA archive ↗
                    </a>
                </header>

                <section className="max-w-4xl pb-9 pt-12 sm:pt-16">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                        NASA Space Apps · Planet X and SPHEREx
                    </p>

                    <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                        One sky.{" "}
                        <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">
                            Two moments in time.
                        </span>
                    </h1>

                    <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
Choose a challenge target or enter sky coordinates. Blink between
                        archived SPHEREx observations for Epsilon Indi B or the First Light field.
                        For other positions, explore coverage in the IRSA archive.
                    </p>
                </section>

                <TargetSelector selected={selected} onSelect={setSelected} />
                {dataset
                    ? <ObservationViewer key={selected.id} dataset={dataset} target={selected} />
                    : <UnavailableObservations target={selected} />}
            </div>
        </main>
    );
}

function ObservationViewer({ dataset, target }: { dataset: Dataset; target: Target }) {
    const [data, setData] = useState<ImagePair | null>(null);
    const [error, setError] = useState("");
    const [blend, setBlend] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        fetch(dataset.path, {
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const payload: unknown = await response.json();

                if (!isImagePair(payload)) {
                    throw new Error(
                        "The sample data has an unexpected format."
                    );
                }

                if (!dataset.legacyEpochs && (
                    !payload.epochs?.a || !payload.epochs.b ||
                    payload.position?.ra !== target.ra || payload.position.dec !== target.dec
                )) {
                    throw new Error("The observation metadata does not match the selected position.");
                }
                setData(payload);
            })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) {
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : "Unable to load data."
                    );
                }
            });

        return () => controller.abort();
    }, [dataset, target.ra, target.dec]);

    useEffect(() => {
        if (!playing) return;

        const timer = window.setInterval(() => {
            setBlend((current) => (current < 50 ? 100 : 0));
        }, 850);

        return () => window.clearInterval(timer);
    }, [playing]);

    if (error) {
        return (
            <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-950/30 p-5 text-rose-200">
                Unable to load observations for {target.name}. {error}
            </div>
        );
    }
    const epochs = dataset.legacyEpochs ?? data?.epochs;
    if (!data || !epochs) {
        return (
            <div role="status" className="rounded-xl border border-white/10 bg-white/5 p-10 text-center text-slate-300">
                Loading observations for {target.name}…
            </div>
        );
    }

    const usablePixels = data.usable_pixels ?? data.image_a.filter(
        (value, index) => value !== null && data.image_b[index] !== null
    ).length;
    const totalPixels = data.shape[0] * data.shape[1];
    const { a, b } = epochs;
    const yearA = a.date_utc.slice(0, 4);
    const yearB = b.date_utc.slice(0, 4);
    const labelA = `${yearA} · ${a.release}`;
    const labelB = `${yearB} · ${b.release}`;
    const deltaNm = Math.abs(a.wavelength_um - b.wavelength_um) * 1000;
    const narrowerBandwidth = Math.min(a.bandwidth_nm, b.bandwidth_nm);
    const bandwidthPercent = Math.round(100 * deltaNm / narrowerBandwidth);

    return (
        <>
            <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                    label="Common sky positions"
                    value={`${data.overlap_pixels}/${totalPixels}`}
                    note="WCS overlap"
                />
                <Metric
                    label="Usable samples"
                    value={`${usablePixels}/${totalPixels}`}
                    note={dataset.legacyEpochs ? "Preliminary quality mask" : "Quality and spectral screening"}
                />
                <Metric
                    label="Spectral separation"
                    value={`${deltaNm.toFixed(2)} nm`}
                    note="Approximate WCS-WAVE"
                />
                <Metric
                    label="Source instrument"
                    value={`SPHEREx ${a.detector}`}
                    note="Near-infrared detector"
                />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <article className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#0c1b2e]/95 shadow-2xl shadow-black/30">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
                        <div>
                            <h2 className="text-lg font-semibold">
                                Time explorer
                            </h2>
                            <p className="text-xs text-slate-400">
                                Same sky grid · Two observation epochs
                            </p>
                        </div>

                        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                            Exploratory comparison
                        </span>
                    </div>

                    <div className="p-5 sm:p-7">
                        <div className="relative mx-auto max-w-[490px] overflow-hidden rounded-xl border border-white/10 bg-[#0a1728] p-2">
                            <SkyCanvas
                                values={data.image_a}
                                shape={data.shape}
                                low={data.display_min}
                                high={data.display_max}
                                name={`SPHEREx infrared intensity, ${labelA}`}
                            />

                            <div
                                className="absolute inset-2"
                                style={{ opacity: blend / 100 }}
                            >
                                <SkyCanvas
                                    values={data.image_b}
                                    shape={data.shape}
                                    low={data.display_min}
                                    high={data.display_max}
                                    name={`SPHEREx infrared intensity, ${labelB}`}
                                />
                            </div>

                            <div className="absolute left-5 top-5 rounded-md bg-[#06111f]/85 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                                {blend === 0
                                    ? labelA
                                    : blend === 100
                                        ? labelB
                                        : `${yearA} / ${yearB} · ${blend}% blend`}
                            </div>

                            <div className="absolute bottom-5 right-5 rounded bg-[#06111f]/80 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300">
                                False color · infrared signal
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            <button
                                type="button"
                                onClick={() =>
                                    setPlaying((value) => !value)
                                }
                                className="rounded-lg bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                            >
                                {playing ? "Ⅱ Pause blink" : "▶ Play blink"}
                            </button>

                            <button
                                type="button"
                                aria-pressed={blend === 0}
                                onClick={() => {
                                    setPlaying(false);
                                    setBlend(0);
                                }}
                                className="rounded-lg border border-white/20 px-3 py-2.5 text-sm transition hover:bg-white/10"
                            >
                                {yearA}
                            </button>

                            <button
                                type="button"
                                aria-pressed={blend === 100}
                                onClick={() => {
                                    setPlaying(false);
                                    setBlend(100);
                                }}
                                className="rounded-lg border border-white/20 px-3 py-2.5 text-sm transition hover:bg-white/10"
                            >
                                {yearB}
                            </button>
                        </div>

                        <div className="mt-6">
                            <div className="mb-2 flex justify-between text-xs text-slate-400">
                                <span>{labelA}</span>
                                <span>{labelB}</span>
                            </div>

                            <input
                                aria-label="Blend the two observing epochs"
                                type="range"
                                min="0"
                                max="100"
                                value={blend}
                                onChange={(event) => {
                                    setPlaying(false);
                                    setBlend(Number(event.target.value));
                                }}
                                className="w-full accent-cyan-300"
                            />

                            <p className="mt-3 text-xs leading-5 text-slate-400">
                                Drag to blend or press Play blink to alternate
                                epochs. Both images use a shared display scale.
                            </p>
                        </div>
                    </div>
                </article>

                <div className="space-y-5">
                    <div className="rounded-2xl border border-white/10 bg-[#0c1b2e]/95 p-5 sm:p-6">
                        <h2 className="mb-5 text-lg font-semibold">
                            Observation archive
                        </h2>

                        <div className="grid grid-cols-2 gap-4">
                            <ObservationCard epoch={a} values={data.image_a} data={data} />
                            <ObservationCard epoch={b} values={data.image_b} data={data} />
                        </div>

                        <div className="mt-5 border-t border-white/10 pt-4 text-sm text-slate-300">
                            <p>
                                Field center:{" "}
                                <span className="font-mono text-xs text-cyan-200">
                                    RA {target.ra}°
                                </span>
                            </p>
                            <p className="mt-1">
                                Declination:{" "}
                                <span className="font-mono text-xs text-cyan-200">
                                    {target.dec}°
                                </span>
                            </p>
                            <p className="mt-1">
                                Grid:{" "}
                                <span className="text-slate-100">
                                    {data.shape[1]} × {data.shape[0]} pixels
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-amber-400/25 bg-amber-300/[0.06] p-5 sm:p-6">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
                            <span aria-hidden="true">⚠</span>
                            Scientific interpretation
                        </div>

                        <p className="text-sm leading-6 text-slate-300">
                            These frames support visual exploration only. Confirming
                            motion or variability requires calibrated measurements.
                            At the selected position the effective wavelengths are about
                            {" "}{deltaNm.toFixed(2)} nm apart ({bandwidthPercent}% of the
                            narrower {narrowerBandwidth.toFixed(2)} nm nominal bandwidth).
                            Alignment uses nearest-neighbor sampling. Detector response,
                            calibration, and background may contribute to visible differences.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0c1b2e]/95 p-5 sm:p-6">
                        <h2 className="mb-3 text-lg font-semibold">
                            Data &amp; reproducibility
                        </h2>

                        <p className="mb-4 text-sm leading-6 text-slate-300">
                            The display uses real SPHEREx Level 2 FITS
                            image cutouts accessed through NASA/IPAC-IRSA
                            and processed locally with Astropy. This is
                            an independent prototype, not an official
                            NASA application.
                        </p>
                        {data.max_spectral_bandwidth_fraction && (
                            <p className="mb-4 text-sm leading-6 text-slate-300">{data.method}</p>
                        )}

                        <div className="flex flex-col gap-2 text-sm">
                            {[a, b].map((epoch) => (
                                <a key={epoch.id} href={epoch.source} target="_blank" rel="noreferrer"
                                    className="text-cyan-300 underline-offset-4 hover:underline">
                                    Original {epoch.date_utc.slice(0, 4)} {epoch.release} FITS ↗
                                </a>
                            ))}
                            <a
                                href={SOURCE_ARCHIVE}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline-offset-4 hover:underline"
                            >
                                SPHEREx archive at IRSA ↗
                            </a>
                            <a
                                href="https://github.com/guillermoguevara887/spherex-sky-explorer"
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline-offset-4 hover:underline"
                            >
                                Scientific pipeline source code ↗
                            </a>
                            <a
                                href={dataset.path}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline-offset-4 hover:underline"
                            >
                                View processed observation JSON ↗
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            <div className="mt-7 flex flex-col justify-between gap-2 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row">
                <span>
                    SPHEREx Sky Explorer · NASA Space Apps Challenge 2026
                </span>
                <span>
                    Exploratory view of near-infrared signal.
                </span>
            </div>
        </>
    );
}

function Metric({
    label,
    value,
    note,
}: {
    label: string;
    value: string;
    note: string;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-[#0c1b2e]/90 p-4 sm:p-5">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
    );
}

function ObservationCard({
    epoch,
    values,
    data,
}: {
    epoch: Epoch;
    values: Array<number | null>;
    data: ImagePair;
}) {
    return (
        <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
                {epoch.release} · {epoch.detector}
            </p>

            <SkyCanvas
                values={values}
                shape={data.shape}
                low={data.display_min}
                high={data.display_max}
                name={`SPHEREx observation ${epoch.date_utc.slice(0, 10)}`}
            />

            <p className="mt-2 break-all font-mono text-[10px] leading-5 text-slate-400">
                {epoch.id}
            </p>
            <p className="mt-1 text-xs text-slate-200">
                {epoch.date_utc.slice(0, 10)} UTC<br />λ ≈ {epoch.wavelength_um.toFixed(6)} µm
            </p>
        </div>
    );
}
