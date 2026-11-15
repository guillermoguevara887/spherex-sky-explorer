"use client";

import { useEffect, useRef, useState } from "react";
import { type Epoch, type Epochs, type ImageDataset, type PairDataset, type SingleDataset } from "./datasets";
import { irsaSearchUrl, type Target } from "./targets";

type ImageScale = {
    shape: [number, number];
    display_min: number;
    display_max: number;
};

type ImagePair = ImageScale & {
    position?: { ra: number; dec: number };
    epochs?: Epochs;
    overlap_pixels: number;
    usable_pixels?: number;
    image_a: Array<number | null>;
    image_b: Array<number | null>;
    method?: string;
    warnings?: string[];
    astrometry_source?: string;
};

type SingleImage = ImageScale & {
    position: { ra: number; dec: number };
    epoch: Epoch;
    image: Array<number | null>;
    usable_pixels: number;
    astrometry_source: string;
    target_pixel_masked: boolean;
};

type Observations =
    | { kind: "pair"; data: ImagePair; epochs: Epochs }
    | { kind: "single"; data: SingleImage };

const linkClass = "text-sm text-cyan-300 underline-offset-4 hover:underline";

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

function validate(payload: unknown, dataset: ImageDataset, target: Target): Observations {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid observation file.");
    }
    const data = payload as Partial<ImagePair & SingleImage>;
    const [height, width] = Array.isArray(data.shape) && data.shape.length === 2 ? data.shape : [0, 0];
    if (!Number.isInteger(height) || !Number.isInteger(width) || height <= 0 || width <= 0 ||
        typeof data.display_min !== "number" || typeof data.display_max !== "number" ||
        !Number.isFinite(data.display_min) || !Number.isFinite(data.display_max) ||
        data.display_max <= data.display_min) {
        throw new Error("Invalid image shape or display scale.");
    }

    const legacy = dataset.kind === "pair" ? dataset.legacyEpochs : undefined;
    if (!legacy && (data.position?.ra !== target.ra || data.position.dec !== target.dec)) {
        throw new Error("The observation coordinates do not match the selected position.");
    }

    const pixels = height * width;
    if (dataset.kind === "single" && data.epoch && Array.isArray(data.image) && data.image.length === pixels) {
        return { kind: "single", data: data as SingleImage };
    }
    const epochs = legacy ?? data.epochs;
    if (dataset.kind === "pair" && epochs?.a && epochs.b &&
        Array.isArray(data.image_a) && Array.isArray(data.image_b) &&
        data.image_a.length === pixels && data.image_b.length === pixels) {
        return { kind: "pair", data: data as ImagePair, epochs };
    }
    throw new Error("The file does not contain the expected observations.");
}

export function ObservationViewer({ dataset, target }: { dataset: ImageDataset; target: Target }) {
    const [result, setResult] = useState<Observations | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await fetch(dataset.path, { signal: controller.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload: unknown = await response.json();
                if (!controller.signal.aborted) setResult(validate(payload, dataset, target));
            } catch (reason) {
                if (!controller.signal.aborted) {
                    setError(reason instanceof Error ? reason.message : "Unable to load data.");
                }
            }
        }
        void load();
        return () => controller.abort();
    }, [dataset, target]);

    if (error) {
        return (
            <section role="alert" className="rounded-xl border border-rose-400/40 bg-rose-950/30 p-5 text-rose-200">
                <p>Unable to load observations for {target.name}. {error}</p>
                <a href={irsaSearchUrl(target)} className={linkClass} target="_blank" rel="noreferrer">Search IRSA ↗</a>
            </section>
        );
    }
    if (!result) {
        return (
            <div role="status" className="rounded-xl border border-white/10 bg-white/5 p-10 text-center text-slate-300">
                Loading observations for {target.name}…
            </div>
        );
    }

    if (result.kind === "single" && dataset.kind === "single") {
        return <SingleViewer data={result.data} dataset={dataset} target={target} />;
    }
    if (result.kind === "pair" && dataset.kind === "pair") {
        return <PairViewer data={result.data} epochs={result.epochs} dataset={dataset} target={target} />;
    }
    return null;
}

function PredictionMarker({ pixel, shape, earlier = false }: {
    pixel?: [number, number];
    shape: ImageScale["shape"];
    earlier?: boolean;
}) {
    if (!pixel) return null;
    return (
        <span aria-hidden="true" data-position-marker={earlier ? "earlier" : "later"}
            className={`pointer-events-none absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ring-1 ring-black ${earlier ? "border-amber-300" : "border-cyan-200"}`}
            style={{ left: `${100 * (pixel[0] + 0.5) / shape[1]}%`, top: `${100 * (pixel[1] + 0.5) / shape[0]}%` }}
        />
    );
}

function SingleViewer({ data, dataset, target }: { data: SingleImage; dataset: SingleDataset; target: Target }) {
    const epoch = data.epoch;
    return (
        <article className="rounded-2xl border border-cyan-300/20 bg-[#0c1b2e]/95 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Single observation only</h2>
            <p className="mt-2 text-sm text-slate-300">{dataset.detail}</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,23rem)_1fr]">
                <figure>
                    <div className="relative">
                        <SkyCanvas values={data.image} shape={data.shape} low={data.display_min}
                            high={data.display_max} name={`SPHEREx Level 2 field for ${target.name}`} />
                        <PredictionMarker pixel={epoch.target_pixel} shape={data.shape} />
                    </div>
                    <figcaption className="mt-2 text-xs text-slate-300">
                        False-color infrared signal. The ring marks the predicted position.
                        {data.target_pixel_masked && " Quality screening masked the pixel at that position."}
                    </figcaption>
                </figure>
                <div className="space-y-3 text-sm text-slate-200">
                    <p>{epoch.release} · {epoch.detector} · {epoch.date_utc.slice(0, 10)} UTC</p>
                    <p className="break-all font-mono text-xs">{epoch.id}</p>
                    <p>λ ≈ {epoch.wavelength_um.toFixed(6)} µm · bandwidth {epoch.bandwidth_nm.toFixed(2)} nm</p>
                    <p>{data.usable_pixels}/{data.shape[0] * data.shape[1]} usable field pixels</p>
                    {epoch.target_position && (
                        <p className="font-mono text-xs">Predicted RA {epoch.target_position.ra.toFixed(6)}°, Dec {epoch.target_position.dec.toFixed(6)}°</p>
                    )}
                    <div className="flex flex-col items-start gap-2">
                        <a href={epoch.source} target="_blank" rel="noreferrer" className={linkClass}>Original IRSA FITS ↗</a>
                        <a href={data.astrometry_source} target="_blank" rel="noreferrer" className={linkClass}>Astrometry reference ↗</a>
                        <a href={dataset.path} target="_blank" rel="noreferrer" className={linkClass}>Processed observation JSON ↗</a>
                        <a href={irsaSearchUrl(target)} target="_blank" rel="noreferrer" className={linkClass}>Search IRSA around this position ↗</a>
                    </div>
                </div>
            </div>
        </article>
    );
}

function PairViewer({ data, epochs, dataset, target }: {
    data: ImagePair;
    epochs: Epochs;
    dataset: PairDataset;
    target: Target;
}) {
    const [blend, setBlend] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [showPrediction, setShowPrediction] = useState(true);

    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            setBlend((current) => (current < 50 ? 100 : 0));
        }, 850);
        return () => window.clearInterval(timer);
    }, [playing]);

    const usablePixels = data.usable_pixels ?? data.image_a.filter(
        (value, index) => value !== null && data.image_b[index] !== null
    ).length;
    const totalPixels = data.shape[0] * data.shape[1];
    const { a, b } = epochs;
    const dateA = a.date_utc.slice(0, 10);
    const dateB = b.date_utc.slice(0, 10);
    const labelA = `${dateA} · ${a.release}`;
    const labelB = `${dateB} · ${b.release}`;
    const hasPrediction = Boolean(a.target_pixel && b.target_pixel);
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

                            {hasPrediction && showPrediction && (
                                <div className="pointer-events-none absolute inset-2">
                                    {blend < 100 && <PredictionMarker pixel={a.target_pixel} shape={data.shape} earlier />}
                                    {blend > 0 && <PredictionMarker pixel={b.target_pixel} shape={data.shape} />}
                                </div>
                            )}
                            <div className="absolute left-5 top-5 rounded-md bg-[#06111f]/85 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                                {blend === 0
                                    ? labelA
                                    : blend === 100
                                        ? labelB
                                        : `${blend}% blend`}
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
                                aria-label={`Earlier image, ${dateA}`}
                                aria-pressed={blend === 0}
                                onClick={() => {
                                    setPlaying(false);
                                    setBlend(0);
                                }}
                                className="rounded-lg border border-white/20 px-3 py-2.5 text-sm transition hover:bg-white/10"
                            >
                                {dateA}
                            </button>

                            <button
                                type="button"
                                aria-label={`Later image, ${dateB}`}
                                aria-pressed={blend === 100}
                                onClick={() => {
                                    setPlaying(false);
                                    setBlend(100);
                                }}
                                className="rounded-lg border border-white/20 px-3 py-2.5 text-sm transition hover:bg-white/10"
                            >
                                {dateB}
                            </button>
                        </div>

                        {hasPrediction && (
                            <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-300">
                                <input type="checkbox" className="mt-0.5 accent-cyan-300" checked={showPrediction}
                                    onChange={(event) => setShowPrediction(event.target.checked)} />
                                Show predicted positions (amber earlier, cyan later). Positions come from astrometry.
                            </label>
                        )}
                        <div className="mt-6">
                            <div className="mb-2 flex justify-between gap-2 text-xs text-slate-400">
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
                            The effective wavelengths at the sampled positions are about
                            {" "}{deltaNm.toFixed(2)} nm apart ({bandwidthPercent}% of the
                            narrower {narrowerBandwidth.toFixed(2)} nm nominal bandwidth).
                            Alignment uses nearest-neighbor sampling. Detector response,
                            calibration, and background may contribute to visible differences.
                        </p>
                        {data.warnings?.map((warning) => (
                            <p key={warning} className="mt-3 text-sm leading-6 text-amber-200">{warning}</p>
                        ))}
                        {target.id === "wise-0855" && (
                            <p className="mt-3 text-sm leading-6 text-amber-200">
                                WISE 0855 is very faint. These cutouts show the field at its predicted positions.
                                Confirming the source would require separate photometry.
                            </p>
                        )}
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
                        {data.method && (
                            <p className="mb-4 text-sm leading-6 text-slate-300">{data.method}</p>
                        )}

                        <div className="flex flex-col gap-2 text-sm">
                            {[a, b].map((epoch) => (
                                <a key={epoch.id} href={epoch.source} target="_blank" rel="noreferrer"
                                    className="text-cyan-300 underline-offset-4 hover:underline">
                                    Original {epoch.date_utc.slice(0, 10)} {epoch.release} FITS ↗
                                </a>
                            ))}
                            <a
                                href={irsaSearchUrl(target)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-300 underline-offset-4 hover:underline"
                            >
                                Search IRSA around this position ↗
                            </a>
                            {data.astrometry_source && <a href={data.astrometry_source} target="_blank"
                                rel="noreferrer" className={linkClass}>Astrometry reference ↗</a>}
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
                {epoch.date_utc.slice(0, 10)} UTC<br />λ ≈ {epoch.wavelength_um.toFixed(6)} µm<br />
                Width ≈ {epoch.bandwidth_nm.toFixed(2)} nm
            </p>
            {epoch.target_position && (
                <p className="mt-1 break-words font-mono text-[10px] leading-4 text-slate-300">
                    Predicted RA {epoch.target_position.ra.toFixed(6)}°<br />
                    Dec {epoch.target_position.dec.toFixed(6)}°
                </p>
            )}
        </div>
    );
}
