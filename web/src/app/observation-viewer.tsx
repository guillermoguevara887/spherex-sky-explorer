"use client";

import { useEffect, useRef, useState } from "react";
import { type Epoch, type Epochs, type FieldDataset, type ImageDataset, type PairDataset, type SingleDataset } from "./datasets";
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
    field_mask_radius_arcsec?: number;
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

export type GuideRequest = { trigger: HTMLButtonElement };

const linkClass = "text-sm text-interactive underline-offset-4 hover:underline";
const fieldViews = [[false, "Compare surrounding field"], [true, "View single observation"]] as const;
const dateButtonClass = "observatory-option px-3 py-2 text-left text-sm";

function SkyCanvas({
    values,
    shape,
    low,
    high,
    name,
    hiddenFromAT,
}: {
    values: Array<number | null>;
    shape: [number, number];
    low: number;
    high: number;
    name: string;
    hiddenFromAT?: boolean;
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
            aria-hidden={hiddenFromAT}
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
    const maskRadius = data.field_mask_radius_arcsec;
    const hasFieldMask = typeof maskRadius === "number" && Number.isFinite(maskRadius) && maskRadius > 0;
    if (dataset.kind !== "single" && hasFieldMask === (dataset.kind === "field") && epochs?.a && epochs.b &&
        Array.isArray(data.image_a) && Array.isArray(data.image_b) &&
        data.image_a.length === pixels && data.image_b.length === pixels) {
        return { kind: "pair", data: data as ImagePair, epochs };
    }
    throw new Error("The file does not contain the expected observations.");
}

export function ObservationViewer({ dataset, target, guideRequest }: {
    dataset: ImageDataset;
    target: Target;
    guideRequest?: GuideRequest;
}) {
    const [showSingle, setShowSingle] = useState(false);
    if (dataset.kind !== "field") {
        return <ObservationFile dataset={dataset} target={target} guideRequest={guideRequest} />;
    }

    const active = showSingle ? dataset.single : dataset;
    return (
        <>
            <section className="mb-3 rounded-r-lg border-s-2 border-infrared bg-infrared/8 px-4 py-3.5 sm:px-5" aria-label="Available observations">
                <p className="font-semibold text-infrared">The target is masked in the two-epoch view.</p>
                <p className="mt-1 text-sm text-muted">{dataset.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {fieldViews.map(([single, label]) => (
                        <button key={label} type="button" aria-pressed={showSingle === single}
                            onClick={() => setShowSingle(single)}
                            className="observatory-option px-3 py-2 text-sm">
                            {label}
                        </button>
                    ))}
                </div>
            </section>
            <ObservationFile key={active.path} dataset={active} target={target} />
        </>
    );
}

function ObservationFile({ dataset, target, guideRequest }: {
    dataset: ImageDataset;
    target: Target;
    guideRequest?: GuideRequest;
}) {
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
            <div role="status" className="observatory-panel p-8 text-center text-muted">
                Loading observations for {target.name}…
            </div>
        );
    }

    if (result.kind === "single" && dataset.kind === "single") {
        return <SingleViewer data={result.data} dataset={dataset} target={target} />;
    }
    if (result.kind === "pair" && dataset.kind !== "single") {
        return <PairViewer data={result.data} epochs={result.epochs} dataset={dataset} target={target} guideRequest={guideRequest} />;
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
        <article className="observatory-panel p-4 sm:p-6">
            <h2 className="text-xl font-semibold tracking-tight">Single observation</h2>
            <p className="mt-2 text-sm text-muted">{dataset.detail}</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
                <figure>
                    <div className="observatory-frame relative rounded-lg">
                        <SkyCanvas values={data.image} shape={data.shape} low={data.display_min}
                            high={data.display_max} name={`SPHEREx Level 2 field for ${target.name}`} />
                        <PredictionMarker pixel={epoch.target_pixel} shape={data.shape} />
                    </div>
                    <figcaption className="mt-3 text-xs leading-5 text-muted">
                        Lighter pixels show stronger displayed infrared signal. Dark navy pixels are masked.
                        {epoch.target_pixel && " The ring marks the predicted position."}
                        {data.target_pixel_masked && " Quality screening masked the pixel at that position."}
                    </figcaption>
                </figure>
                <div className="space-y-3 text-sm text-muted">
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

function PairViewer({ data, epochs, dataset, target, guideRequest }: {
    data: ImagePair;
    epochs: Epochs;
    dataset: PairDataset | FieldDataset;
    target: Target;
    guideRequest?: GuideRequest;
}) {
    const [blend, setBlend] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [showPrediction, setShowPrediction] = useState(true);
    const viewer = useRef<HTMLElement>(null);
    const blinkButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const focused = document.activeElement;
        if (guideRequest && (focused === guideRequest.trigger || focused === document.body)) {
            viewer.current?.scrollIntoView({ block: "start" });
            blinkButton.current?.focus({ preventScroll: true });
        }
    }, [guideRequest]);

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
    const isField = dataset.kind === "field";
    const displayedEpoch = blend === 0 ? `Earlier · ${dateA} UTC · ${a.release}`
        : blend === 100 ? `Later · ${dateB} UTC · ${b.release}`
        : `Blend · ${100 - blend}% earlier / ${blend}% later`;

    function showBlend(value: number) {
        setPlaying(false);
        setBlend(value);
    }

    return (
        <>
            <section className="observatory-panel grid xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <article ref={viewer} className="min-w-0 scroll-mt-4 rounded-t-2xl border-t border-iris/75 xl:rounded-tr-none">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-6 sm:pt-5">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight">
                                {isField ? "Surrounding field over time" : "Time explorer"}
                            </h2>
                            <p className="mt-1 text-sm text-faint">
                                {target.name} · Same sky grid at two dates
                            </p>
                        </div>

                        <span className={`mt-1.5 text-[11px] font-medium tracking-wide uppercase ${isField ? "text-infrared" : "text-iris"}`}>
                            {isField ? "Target masked" : "Exploratory comparison"}
                        </span>
                    </div>

                    <div className="p-4 sm:px-6 sm:pb-6">
                        <div role="group" aria-label="Observation playback and dates" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                            <button ref={blinkButton} type="button" onClick={() => setPlaying((value) => !value)}
                                className="observatory-action col-span-2 px-4 py-2.5 text-sm">
                                {playing ? "Ⅱ Pause blink" : "▶ Play blink"}
                            </button>
                            <button type="button" aria-label={`Earlier image, ${dateA}`} aria-pressed={blend === 0}
                                onClick={() => showBlend(0)} className={dateButtonClass}>
                                <span className="block text-xs text-muted">Earlier</span>
                                <time dateTime={dateA} className="font-mono text-xs tabular-nums">{dateA}</time>
                            </button>
                            <button type="button" aria-label={`Later image, ${dateB}`} aria-pressed={blend === 100}
                                onClick={() => showBlend(100)} className={dateButtonClass}>
                                <span className="block text-xs text-muted">Later</span>
                                <time dateTime={dateB} className="font-mono text-xs tabular-nums">{dateB}</time>
                            </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted">Play blink alternates the exposures. Choose a date to pause.</p>

                        <figure className="observatory-image-width mx-auto mt-4">
                            <p className="mb-2 font-mono text-xs text-iris">{displayedEpoch}</p>
                            <div className="observatory-frame relative overflow-hidden rounded-xl border border-line bg-background p-2">
                                <SkyCanvas
                                    values={data.image_a}
                                    shape={data.shape}
                                    low={data.display_min}
                                    high={data.display_max}
                                    name={`SPHEREx infrared intensity, ${labelA}`}
                                    hiddenFromAT={blend === 100}
                                />

                                <div className="absolute inset-2" style={{ opacity: blend / 100 }} aria-hidden={blend === 0}>
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
                            </div>
                            <figcaption className="mt-3 text-xs leading-5 text-muted">
                                <p>In this false-color view, lighter pixels show stronger infrared signal on a shared display scale.
                                    Dark navy shows masked pixels or gaps in shared coverage.</p>
                                <p className="mt-1 text-infrared">Confirming a detection, motion, or a change in brightness requires calibrated measurements.</p>
                            </figcaption>
                        </figure>

                        {hasPrediction && (
                            <label className="observatory-image-width mx-auto mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
                                <input type="checkbox" className="mt-0.5 accent-interactive" checked={showPrediction}
                                    onChange={(event) => setShowPrediction(event.target.checked)} />
                                Show predicted positions from astrometry (amber earlier, cyan later).
                            </label>
                        )}
                        <div className="observatory-image-width mx-auto mt-4 border-t border-line/80 pt-3">
                            <div className="mb-1 flex justify-between gap-2 font-mono text-xs text-faint">
                                <span>{labelA}</span>
                                <span>{labelB}</span>
                            </div>

                            <input
                                aria-label="Blend the two observing epochs"
                                aria-valuetext={`${100 - blend}% earlier, ${blend}% later`}
                                type="range"
                                min="0"
                                max="100"
                                value={blend}
                                onChange={(event) => showBlend(Number(event.target.value))}
                                className="h-6 w-full accent-interactive"
                            />

                            <p className="mt-2 text-xs leading-5 text-faint">
                                Drag the slider or use the arrow keys to blend the two exposures.
                            </p>
                        </div>
                    </div>
                </article>

                <div className="min-w-0 divide-y divide-line/80 rounded-b-2xl border-t border-line/80 bg-recess/55 xl:rounded-bl-none xl:rounded-tr-2xl xl:border-s xl:border-t-0">
                    <section aria-label="Observation metrics" className="grid grid-cols-2 gap-x-3 gap-y-4 p-4 sm:p-5">
                        <Metric label="Common sky positions" value={`${data.overlap_pixels}/${totalPixels}`} note="WCS overlap" />
                        <Metric label="Usable samples" value={`${usablePixels}/${totalPixels}`}
                            note={dataset.kind === "pair" && dataset.legacyEpochs ? "Preliminary quality mask" : "Quality and spectral screening"} />
                        <Metric label="Wavelength difference" value={`${deltaNm.toFixed(2)} nm`} note="Approximate · from spectral calibration" />
                        <Metric label="Source instrument" value={`SPHEREx ${a.detector}`} note="Near-infrared detector" />
                    </section>
                    <div className="p-4 sm:p-5">
                        <h2 className="mb-3 text-base font-semibold tracking-tight">
                            Observation archive
                        </h2>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <ObservationCard label="Earlier" epoch={a} values={data.image_a} data={data} />
                            <ObservationCard label="Later" epoch={b} values={data.image_b} data={data} />
                        </div>

                        <div className="mt-4 border-t border-line/80 pt-3 text-xs text-muted">
                            <p>
                                Field center:{" "}
                                <span className="font-mono text-xs text-iris">
                                    RA {target.ra}°
                                </span>
                            </p>
                            <p className="mt-1">
                                Declination:{" "}
                                <span className="font-mono text-xs text-iris">
                                    {target.dec}°
                                </span>
                            </p>
                            <p className="mt-1">
                                Grid:{" "}
                                <span className="text-foreground">
                                    {data.shape[1]} × {data.shape[0]} pixels
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="bg-infrared/5 p-4 sm:p-5">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-infrared">
                            <span aria-hidden="true">⚠</span>
                            Scientific interpretation
                        </div>

                        <p className="text-sm leading-6 text-muted">
                            The effective wavelengths at the sampled positions are about
                            {" "}{deltaNm.toFixed(2)} nm apart ({bandwidthPercent}% of the
                            narrower {narrowerBandwidth.toFixed(2)} nm nominal bandwidth).
                            Alignment uses nearest-neighbor sampling. Detector response,
                            calibration, and background may contribute to visible differences.
                        </p>
                        {isField && (
                            <p className="mt-3 text-sm leading-6 text-infrared">
                                Both frames mask flagged pixels and all samples within {data.field_mask_radius_arcsec}″
                                of either predicted position. The rings mark the excluded target locations.
                            </p>
                        )}
                        {data.warnings?.map((warning) => (
                            <p key={warning} className="mt-3 text-sm leading-6 text-infrared">{warning}</p>
                        ))}
                        {target.id === "wise-0855" && (
                            <p className="mt-3 text-sm leading-6 text-infrared">
                                WISE 0855 is very faint. These cutouts show the field at its predicted positions.
                                Confirming the source would require separate photometry.
                            </p>
                        )}
                    </div>

                    <div className="p-4 sm:p-5">
                        <h2 className="mb-2 text-base font-semibold tracking-tight">
                            Data &amp; reproducibility
                        </h2>

                        <p className="mb-3 text-sm leading-6 text-muted">
                            The display uses real SPHEREx Level 2 FITS
                            image cutouts accessed through NASA/IPAC-IRSA
                            and processed locally with Astropy. This is
                            an independent prototype, not an official
                            NASA application.
                        </p>
                        {data.method && (
                            <p className="mb-3 text-sm leading-6 text-muted">{data.method}</p>
                        )}

                        <div className="flex flex-col gap-2 text-sm">
                            {[a, b].map((epoch) => (
                                <a key={epoch.id} href={epoch.source} target="_blank" rel="noreferrer"
                                    className={linkClass}>
                                    Original {epoch.date_utc.slice(0, 10)} {epoch.release} FITS ↗
                                </a>
                            ))}
                            <a
                                href={irsaSearchUrl(target)}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                Search IRSA around this position ↗
                            </a>
                            {data.astrometry_source && <a href={data.astrometry_source} target="_blank"
                                rel="noreferrer" className={linkClass}>Astrometry reference ↗</a>}
                            <a
                                href="https://github.com/guillermoguevara887/spherex-sky-explorer"
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                Scientific pipeline source code ↗
                            </a>
                            <a
                                href={dataset.path}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                View processed observation JSON ↗
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            <div className="mt-4 flex flex-col justify-between gap-2 border-t border-line/70 pt-3 text-xs text-faint sm:flex-row">
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
        <div className="min-w-0">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight text-iris tabular-nums sm:text-xl">
                {value}
            </p>
            <p className="text-xs text-faint">{note}</p>
        </div>
    );
}

function ObservationCard({
    label,
    epoch,
    values,
    data,
}: {
    label: string;
    epoch: Epoch;
    values: Array<number | null>;
    data: ImagePair;
}) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-medium text-iris">
                {label} · <time dateTime={epoch.date_utc.slice(0, 10)}>{epoch.date_utc.slice(0, 10)}</time> UTC
            </p>
            <p className="mb-2 text-xs text-muted">
                {epoch.release} · {epoch.detector}
            </p>

            <SkyCanvas
                values={values}
                shape={data.shape}
                low={data.display_min}
                high={data.display_max}
                name={`SPHEREx observation ${epoch.date_utc.slice(0, 10)}`}
            />

            <p className="mt-2 break-all font-mono text-[10px] leading-5 text-faint">
                {epoch.id}
            </p>
            <p className="mt-1 text-xs text-foreground">
                λ ≈ {epoch.wavelength_um.toFixed(6)} µm<br />
                Width ≈ {epoch.bandwidth_nm.toFixed(2)} nm
            </p>
            {epoch.target_position && (
                <p className="mt-1 break-words font-mono text-[10px] leading-4 text-muted">
                    Predicted RA {epoch.target_position.ra.toFixed(6)}°<br />
                    Dec {epoch.target_position.dec.toFixed(6)}°
                </p>
            )}
        </div>
    );
}
