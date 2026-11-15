"use client";

import { useState, type FormEvent } from "react";
import { DATASETS, DATASET_LABEL } from "./datasets";
import { CHALLENGE_TARGETS, EPSILON_INDI_B, FIRST_LIGHT, irsaSearchUrl, TARGETS, type Target } from "./targets";

const fieldClass = "min-h-11 w-full min-w-0 rounded-md border border-control-line bg-recess px-2.5 py-2 font-mono text-base text-foreground aria-invalid:border-rose-400 sm:text-sm";
const linkClass = "text-sm font-medium text-interactive underline underline-offset-4 hover:text-white";
const guideNumber = "grid size-6 shrink-0 place-items-center rounded-full bg-iris/15 font-mono text-xs font-semibold text-iris";

function parseCoordinate(value: string, min: number, max: number) {
    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const number = Number(text);
    return number >= min && number <= max ? number : null;
}

function plotPosition({ ra, dec }: Target) {
    return { left: `${ra / 360 * 100}%`, top: `${(90 - dec) / 180 * 100}%` };
}

export function TargetSelector({ selected, onSelect }: {
    selected: Target;
    onSelect: (target: Target, guideTrigger?: HTMLButtonElement) => void;
}) {
    const [ra, setRa] = useState(String(selected.ra));
    const [dec, setDec] = useState(String(selected.dec));
    const [invalid, setInvalid] = useState({ ra: false, dec: false });

    function choose(target: Target, guideTrigger?: HTMLButtonElement) {
        setRa(String(target.ra));
        setDec(String(target.dec));
        setInvalid({ ra: false, dec: false });
        onSelect(target, guideTrigger);
    }

    function explore(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const rightAscension = parseCoordinate(ra, 0, 360);
        const declination = parseCoordinate(dec, -90, 90);
        setInvalid({ ra: rightAscension === null, dec: declination === null });
        if (rightAscension === null || declination === null) {
            const name = rightAscension === null ? "ra" : "dec";
            event.currentTarget.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus();
            return;
        }

        choose(TARGETS.find((target) => target.ra === rightAscension && target.dec === declination) ?? {
            id: "custom",
            name: "Custom sky position",
            ra: rightAscension,
            dec: declination,
            description: "Explore the archive around the coordinates you entered.",
            reference: rightAscension === 360 ? "ICRS · RA 360° is equivalent to 0°." : "ICRS · decimal degrees.",
        });
    }

    return (
        <section aria-labelledby="target-heading" className="observatory-panel min-w-0 p-4 sm:p-5">
            <section aria-labelledby="quick-start-heading" className="border-b border-line/80 pb-4">
                <h2 id="quick-start-heading" className="text-base font-semibold tracking-tight">Quick start</h2>
                <ol role="list" className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <li className="flex items-start gap-2.5">
                        <span aria-hidden="true" className={guideNumber}>1</span>
                        <div>
                            <p className="text-sm font-semibold">Choose a field</p>
                            <button type="button" onClick={(event) => choose(EPSILON_INDI_B, event.currentTarget)}
                                className="observatory-action mt-2 px-3 py-2 text-sm">
                                Open Epsilon Indi B
                            </button>
                        </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                        <span aria-hidden="true" className={guideNumber}>2</span>
                        <div>
                            <p className="text-sm font-semibold">Play blink</p>
                            <p className="mt-0.5 text-xs leading-5 text-muted">Press Play blink to alternate between the two exposures.</p>
                        </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                        <span aria-hidden="true" className={guideNumber}>3</span>
                        <div>
                            <p className="text-sm font-semibold">Explore the dates</p>
                            <p className="mt-0.5 text-xs leading-5 text-muted">Choose Earlier or Later to pause on that UTC date.</p>
                        </div>
                    </li>
                </ol>
            </section>
            <div className="mt-4 grid gap-5 md:grid-cols-[1fr_0.85fr] lg:grid-cols-1">
                <div>
                    <h2 id="target-heading" className="text-base font-semibold tracking-tight">Explore a field</h2>
                    <div className="mt-2 grid gap-x-1.5 gap-y-0.5 min-[360px]:grid-cols-2 lg:grid-cols-1">
                        {TARGETS.map((target) => (
                            <button
                                type="button"
                                key={target.id}
                                aria-label={target.name}
                                aria-describedby={`status-${target.id}`}
                                aria-pressed={selected.id === target.id}
                                onClick={() => choose(target)}
                                className="observatory-target min-h-11 px-2.5 py-1.5 text-left text-sm text-foreground aria-pressed:font-semibold"
                            >
                                <span className="block">{target.name}</span>
                                <span id={`status-${target.id}`} data-coverage={DATASETS[target.id]?.kind}
                                    className="mt-0.5 block text-[11px] leading-4 font-normal text-faint data-[coverage=field]:text-infrared">
                                    {target.id === FIRST_LIGHT.id ? "First Light demo" : DATASET_LABEL[DATASETS[target.id]?.kind ?? "archive"]}
                                </span>
                            </button>
                        ))}
                    </div>
                    <form onSubmit={explore} className="mt-4 border-t border-line/80 pt-3">
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="min-w-[6.5rem] flex-1 space-y-1 text-xs text-muted">
                                <span>RA (degrees)</span>
                                <input name="ra" inputMode="decimal" autoComplete="off" spellCheck={false} value={ra} onChange={(event) => {
                                    setRa(event.target.value);
                                    setInvalid((current) => ({ ...current, ra: false }));
                                }} aria-invalid={invalid.ra} aria-describedby={invalid.ra ? "ra-error" : "coordinate-hint"} className={fieldClass} />
                            </label>
                            <label className="min-w-[6.5rem] flex-1 space-y-1 text-xs text-muted">
                                <span>Dec (degrees)</span>
                                <input name="dec" autoComplete="off" spellCheck={false} value={dec} onChange={(event) => {
                                    setDec(event.target.value);
                                    setInvalid((current) => ({ ...current, dec: false }));
                                }} aria-invalid={invalid.dec} aria-describedby={invalid.dec ? "dec-error" : "coordinate-hint"} className={fieldClass} />
                            </label>
                            <button type="submit" className="observatory-option px-3 py-2 text-sm font-semibold text-interactive lg:w-full">
                                Explore
                            </button>
                        </div>
                        <p id="coordinate-hint" className="mt-2 text-xs text-faint">Decimal degrees · RA 0° to 360° · Dec −90° to +90°</p>
                        {invalid.ra && <p id="ra-error" role="alert" className="mt-1 text-sm text-rose-300">Enter a decimal RA from 0° to 360°.</p>}
                        {invalid.dec && <p id="dec-error" role="alert" className="mt-1 text-sm text-rose-300">Enter a decimal Dec from −90° to +90°.</p>}
                    </form>
                </div>
                <figure className="min-w-0">
                    <figcaption className="text-xs font-medium text-muted">Schematic sky plot · coordinate positions only</figcaption>
                    <div className="observatory-plot relative mx-5 mt-2 h-24 rounded-sm border border-line bg-recess">
                        <span aria-hidden="true" className="absolute -left-5 top-0 text-[10px] text-faint">+90°</span>
                        <span aria-hidden="true" className="absolute -left-5 bottom-0 text-[10px] text-faint">−90°</span>
                        {TARGETS.map((target) => (
                            <button
                                type="button"
                                key={target.id}
                                tabIndex={-1}
                                aria-label={`Select ${target.name} on the plot`}
                                aria-pressed={selected.id === target.id}
                                title={target.name}
                                onClick={() => choose(target)}
                                style={plotPosition(target)}
                                className="group absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full aria-pressed:z-10"
                            >
                                <span className="size-2 rounded-full bg-iris group-hover:bg-white group-aria-pressed:size-3 group-aria-pressed:bg-interactive group-aria-pressed:ring-2 group-aria-pressed:ring-interactive group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-recess" />
                            </button>
                        ))}
                        {selected.id === "custom" && (
                            <span aria-hidden="true" style={plotPosition(selected)}
                                className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-interactive ring-2 ring-interactive ring-offset-2 ring-offset-recess" />
                        )}
                    </div>
                    <div aria-hidden="true" className="mx-5 mt-1 flex justify-between font-mono text-[10px] text-faint">
                        <span>0°</span><span>RA</span><span>360°</span>
                    </div>
                    <div className="mt-3 border-t border-line/80 pt-3" aria-live="polite" aria-atomic="true">
                        <h3 className="text-sm font-semibold">{selected.name}</h3>
                        <p className="mt-1 break-words font-mono text-xs text-iris">RA {selected.ra}° · Dec {selected.dec}°</p>
                        <p className="mt-1 text-sm text-muted">{selected.description}</p>
                        <p className="mt-1 text-xs leading-5 text-faint">{selected.reference}</p>
                    </div>
                    {selected.source && <a href={selected.source} className={linkClass} target="_blank" rel="noreferrer">Position reference ↗</a>}
                </figure>
            </div>
            <details className="mt-4 border-t border-line/80 pt-3 text-sm">
                <summary className="cursor-pointer font-medium text-interactive">Coverage by challenge target</summary>
                <table className="mt-3 w-full text-left text-xs sm:text-sm">
                    <thead className="text-muted">
                        <tr>
                            <th scope="col" className="px-2 py-1.5">Target</th>
                            <th scope="col" className="px-2 py-1.5">Available view</th>
                        </tr>
                    </thead>
                    <tbody>
                        {CHALLENGE_TARGETS.map((target) => {
                            const dataset = DATASETS[target.id];
                            return (
                                <tr key={target.id} className="border-t border-line/80 align-top">
                                    <th scope="row" className="px-2 py-1.5 font-medium text-foreground">{target.name}</th>
                                    <td className="px-2 py-1.5 break-words">
                                        <p className={dataset?.kind === "field" ? "text-infrared" : "text-iris"}>{DATASET_LABEL[dataset?.kind ?? "archive"]}</p>
                                        {dataset && <p className="text-muted">{dataset.detail}</p>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </details>
        </section>
    );
}

export function UnavailableObservations({ target, reason }: { target: Target; reason?: string }) {
    return (
        <section aria-labelledby="coverage-heading" className="observatory-panel p-5 sm:p-6">
            <h2 id="coverage-heading" className="text-lg font-semibold">No verified time-series image pair available for this target yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
                {reason ?? "This position has not been processed. A time comparison requires observations of the same sky region at different dates, with comparable spectral coverage and usable, aligned pixels."}
            </p>
            <a href={irsaSearchUrl(target)} className={`mt-4 inline-block ${linkClass}`} target="_blank" rel="noreferrer">
                Search IRSA around this position (2′ radius) ↗
            </a>
        </section>
    );
}
