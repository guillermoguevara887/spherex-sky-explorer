"use client";

import { useState, type FormEvent } from "react";
import { DATASETS, DATASET_LABEL } from "./datasets";
import { FIRST_LIGHT, irsaSearchUrl, TARGETS, type Target } from "./targets";

const fieldClass = "w-full min-w-0 rounded-lg border border-white/25 bg-[#06111f] px-3 py-2 font-mono text-sm text-white aria-invalid:border-rose-400";
const linkClass = "text-sm font-medium text-cyan-300 underline underline-offset-4 hover:text-cyan-100";

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
    onSelect: (target: Target) => void;
}) {
    const [ra, setRa] = useState(String(selected.ra));
    const [dec, setDec] = useState(String(selected.dec));
    const [invalid, setInvalid] = useState({ ra: false, dec: false });

    function choose(target: Target) {
        setRa(String(target.ra));
        setDec(String(target.dec));
        setInvalid({ ra: false, dec: false });
        onSelect(target);
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
        <section aria-labelledby="target-heading" className="mb-6 rounded-2xl border border-cyan-300/20 bg-[#0c1b2e]/95 p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
                <div>
                    <h2 id="target-heading" className="text-lg font-semibold">Example Targets</h2>
                    <div className="mt-3 grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
                        {TARGETS.map((target) => (
                            <button
                                type="button"
                                key={target.id}
                                aria-label={target.name}
                                aria-describedby={`status-${target.id}`}
                                aria-pressed={selected.id === target.id}
                                onClick={() => choose(target)}
                                className="rounded-lg border border-white/20 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10 aria-pressed:border-cyan-300 aria-pressed:bg-cyan-300/15 aria-pressed:font-semibold aria-pressed:text-cyan-100"
                            >
                                <span className="block">{target.name}</span>
                                <span id={`status-${target.id}`} className="mt-1 inline-block rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-slate-300">
                                    {DATASET_LABEL[DATASETS[target.id]?.kind ?? "archive"]}
                                </span>
                            </button>
                        ))}
                    </div>
                    <form onSubmit={explore} className="mt-5 border-t border-white/10 pt-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="min-w-[7rem] flex-1 space-y-1.5 text-sm text-slate-200">
                                <span>RA (degrees)</span>
                                <input name="ra" inputMode="decimal" autoComplete="off" spellCheck={false} value={ra} onChange={(event) => {
                                    setRa(event.target.value);
                                    setInvalid((current) => ({ ...current, ra: false }));
                                }} aria-invalid={invalid.ra} aria-describedby={invalid.ra ? "ra-error" : "coordinate-hint"} className={fieldClass} />
                            </label>
                            <label className="min-w-[7rem] flex-1 space-y-1.5 text-sm text-slate-200">
                                <span>Dec (degrees)</span>
                                <input name="dec" autoComplete="off" spellCheck={false} value={dec} onChange={(event) => {
                                    setDec(event.target.value);
                                    setInvalid((current) => ({ ...current, dec: false }));
                                }} aria-invalid={invalid.dec} aria-describedby={invalid.dec ? "dec-error" : "coordinate-hint"} className={fieldClass} />
                            </label>
                            <button type="submit" className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200">
                                Explore
                            </button>
                        </div>
                        <p id="coordinate-hint" className="mt-2 text-xs text-slate-400">Decimal degrees · RA 0° to 360° · Dec −90° to +90°</p>
                        {invalid.ra && <p id="ra-error" role="alert" className="mt-1 text-sm text-rose-300">Enter a decimal RA from 0° to 360°.</p>}
                        {invalid.dec && <p id="dec-error" role="alert" className="mt-1 text-sm text-rose-300">Enter a decimal Dec from −90° to +90°.</p>}
                    </form>
                </div>
                <figure className="min-w-0">
                    <figcaption className="text-sm font-medium text-slate-200">Schematic sky plot · coordinate positions only</figcaption>
                    <div className="relative mx-5 mt-3 h-36 rounded border border-slate-500 bg-[#06111f]"
                        style={{
                            backgroundImage: "linear-gradient(to right, #94a3b83d 1px, transparent 1px), linear-gradient(to bottom, #94a3b83d 1px, transparent 1px)",
                            backgroundSize: "25% 50%",
                        }}
                    >
                        <span aria-hidden="true" className="absolute -left-5 top-0 text-[10px] text-slate-400">+90°</span>
                        <span aria-hidden="true" className="absolute -left-5 bottom-0 text-[10px] text-slate-400">−90°</span>
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
                                <span className="size-2 rounded-full bg-slate-300 group-hover:bg-white group-aria-pressed:size-3 group-aria-pressed:bg-cyan-200 group-aria-pressed:ring-2 group-aria-pressed:ring-cyan-400 group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-[#06111f]" />
                            </button>
                        ))}
                        {selected.id === "custom" && (
                            <span aria-hidden="true" style={plotPosition(selected)}
                                className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#06111f]" />
                        )}
                    </div>
                    <div aria-hidden="true" className="mx-5 mt-1 flex justify-between text-[10px] text-slate-400">
                        <span>0°</span><span>RA</span><span>360°</span>
                    </div>
                    <div className="mt-3 border-t border-white/10 pt-3" aria-live="polite" aria-atomic="true">
                        <h3 className="font-semibold">{selected.name}</h3>
                        <p className="mt-1 break-words font-mono text-sm text-cyan-200">RA {selected.ra}° · Dec {selected.dec}°</p>
                        <p className="mt-1 text-sm text-slate-300">{selected.description}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{selected.reference}</p>
                    </div>
                    {selected.source && <a href={selected.source} className={linkClass} target="_blank" rel="noreferrer">Position reference ↗</a>}
                </figure>
            </div>
            <details className="mt-4 border-t border-white/10 pt-3 text-sm">
                <summary className="cursor-pointer font-medium text-cyan-200">Coverage by challenge target</summary>
                <table className="mt-3 w-full text-left text-xs sm:text-sm">
                    <thead className="text-slate-300">
                        <tr>
                            <th scope="col" className="px-2 py-1.5">Target</th>
                            <th scope="col" className="px-2 py-1.5">Available view</th>
                        </tr>
                    </thead>
                    <tbody>
                        {TARGETS.filter((target) => target.id !== FIRST_LIGHT.id).map((target) => {
                            const dataset = DATASETS[target.id];
                            return (
                                <tr key={target.id} className="border-t border-white/10 align-top">
                                    <th scope="row" className="px-2 py-1.5 font-medium text-slate-200">{target.name}</th>
                                    <td className="px-2 py-1.5">
                                        <p className="text-cyan-200">{DATASET_LABEL[dataset?.kind ?? "archive"]}</p>
                                        {dataset && <p className="text-slate-300">{dataset.detail}</p>}
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
        <section aria-labelledby="coverage-heading" className="rounded-2xl border border-white/15 bg-[#0c1b2e]/95 p-5 sm:p-6">
            <h2 id="coverage-heading" className="text-lg font-semibold">No verified time-series image pair available for this target yet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
                {reason ?? "This position has not been processed. A time comparison requires observations of the same sky region at different dates, with comparable spectral coverage and usable, aligned pixels."}
            </p>
            <a href={irsaSearchUrl(target)} className={`mt-4 inline-block ${linkClass}`} target="_blank" rel="noreferrer">
                Search IRSA around this position (2′ radius) ↗
            </a>
        </section>
    );
}
