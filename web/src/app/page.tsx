"use client";

import { useState } from "react";
import { TargetSelector, UnavailableObservations } from "./target-selector";
import { ObservationViewer, type GuideRequest } from "./observation-viewer";
import { CHALLENGE_TARGETS, FIRST_LIGHT, type Target } from "./targets";
import { DATASETS } from "./datasets";

const SOURCE_ARCHIVE = "https://irsa.ipac.caltech.edu/Missions/spherex.html";
const challengeDatasets = CHALLENGE_TARGETS.map(({ id }) => DATASETS[id]);
const usablePositions = challengeDatasets.filter((dataset) => dataset?.kind === "pair").length;
const maskedPositions = challengeDatasets.filter((dataset) => dataset?.kind === "field").length;

export default function Home() {
    const [selected, setSelected] = useState(FIRST_LIGHT);
    const [guideRequest, setGuideRequest] = useState<GuideRequest>();
    const dataset = DATASETS[selected.id];

    function selectTarget(target: Target, guideTrigger?: HTMLButtonElement) {
        setSelected(target);
        setGuideRequest(guideTrigger ? { trigger: guideTrigger } : undefined);
    }

    return (
        <main className="observatory min-h-screen text-foreground">
            <div className="mx-auto max-w-[88rem] px-4 pb-12 sm:px-7 lg:px-9">
                <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-line/70 py-3.5">
                    <div className="flex items-center gap-3">
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 40 40" fill="none" className="size-9 shrink-0">
                            <circle cx="20" cy="20" r="10" stroke="var(--iris)" strokeOpacity=".65" />
                            <ellipse cx="20" cy="20" rx="17" ry="7" transform="rotate(-36 20 20)" stroke="var(--iris)" />
                            <circle cx="20" cy="20" r="3" fill="var(--infrared)" />
                            <circle cx="31" cy="10" r="2" fill="var(--infrared)" />
                        </svg>
                        <div>
                            <div className="text-base font-semibold tracking-tight">
                                SPHEREx{" "}
                                <span className="text-iris">Sky Explorer</span>
                            </div>
                            <div className="text-[11px] tracking-wide text-faint">
                                Independent Space Apps prototype
                            </div>
                        </div>
                    </div>

                    <a
                        href={SOURCE_ARCHIVE}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Explore the IRSA archive"
                        className="inline-flex min-h-11 items-center rounded-sm text-sm text-interactive underline-offset-4 hover:underline"
                    >
                        <span className="sm:hidden">IRSA archive ↗</span>
                        <span className="hidden sm:inline">Explore the IRSA archive ↗</span>
                    </a>
                </header>

                <section className="relative isolate grid items-end gap-5 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-9">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 610 220" preserveAspectRatio="xMaxYMid slice" fill="none" className="observatory-orbits">
                        <g stroke="var(--iris)" strokeWidth="0.8">
                            <path d="M356 22v174M269 109h174" strokeDasharray="3 6" strokeOpacity=".75" />
                            <circle cx="356" cy="109" r="32" />
                            <circle cx="356" cy="109" r="62" opacity=".65" />
                            <circle cx="356" cy="109" r="88" opacity=".4" />
                            <ellipse cx="356" cy="109" rx="172" ry="41" transform="rotate(-13 356 109)" />
                            <ellipse cx="356" cy="109" rx="141" ry="67" transform="rotate(-22 356 109)" strokeDasharray="2 5" />
                            <path d="M543 31v10m-5-5h10M482 173v8m-4-4h8M231 65v8m-4-4h8" />
                        </g>
                        <g fill="var(--infrared)">
                            <circle cx="356" cy="109" r="2.5" />
                            <circle cx="509" cy="61" r="2" />
                            <circle cx="297" cy="129" r="1.5" />
                        </g>
                    </svg>
                    <div className="min-w-0">
                        <p className="mb-2 text-[11px] font-semibold tracking-[0.15em] text-infrared uppercase">
                            NASA Space Apps · Planet X and SPHEREx
                        </p>
                        <h1 className="observatory-title font-semibold">
                            One sky. <span>Two moments in time.</span>
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                            Compare the same sky field at two dates using observations from the NASA/IPAC archive.
                        </p>
                    </div>
                    <dl aria-label="Official challenge coverage" className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line/80 pt-3 sm:grid-cols-3">
                        <div className="col-span-2 sm:col-span-1">
                            <dt className="text-sm font-semibold"><span className="font-mono text-iris tabular-nums">{usablePositions + maskedPositions}</span>{" "}official challenge fields</dt>
                            <dd className="mt-0.5 text-xs leading-5 text-faint">Two real SPHEREx exposures each</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-semibold"><span className="font-mono text-iris tabular-nums">{usablePositions}</span>{" "}usable positions</dt>
                            <dd className="mt-0.5 text-xs leading-5 text-faint">Pixels at the predicted position pass screening</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-semibold"><span className="font-mono text-infrared tabular-nums">{maskedPositions}</span>{" "}masked positions</dt>
                            <dd className="mt-0.5 text-xs leading-5 text-faint">Compare the surrounding sky</dd>
                        </div>
                    </dl>
                </section>

                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                    <TargetSelector selected={selected} onSelect={selectTarget} />
                    <div className="min-w-0">
                        {dataset && dataset.kind !== "archive"
                            ? <ObservationViewer key={selected.id} dataset={dataset} target={selected} guideRequest={guideRequest} />
                            : <UnavailableObservations target={selected} reason={dataset?.detail} />}
                    </div>
                </div>
            </div>
        </main>
    );
}
