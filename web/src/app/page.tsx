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

                <section className="max-w-4xl pb-7 pt-10 sm:pt-12">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                        NASA Space Apps · Planet X and SPHEREx
                    </p>

                    <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                        One sky.{" "}
                        <span className="bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent">
                            Two moments in time.
                        </span>
                    </h1>

                    <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                        Compare the same sky field at two dates using observations from the NASA/IPAC archive.
                    </p>
                    <dl aria-label="Official challenge coverage" className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/15 bg-white/15 sm:grid-cols-3">
                        <div className="col-span-2 bg-[#0c1b2e] px-4 py-3 sm:col-span-1">
                            <dt className="text-sm font-semibold text-white">{usablePositions + maskedPositions} official challenge fields</dt>
                            <dd className="mt-1 text-xs leading-5 text-slate-300">Two real SPHEREx exposures each</dd>
                        </div>
                        <div className="bg-[#0c1b2e] px-4 py-3">
                            <dt className="text-sm font-semibold text-cyan-200">{usablePositions} usable positions</dt>
                            <dd className="mt-1 text-xs leading-5 text-slate-300">Pixels at the predicted position pass screening</dd>
                        </div>
                        <div className="bg-[#0c1b2e] px-4 py-3">
                            <dt className="text-sm font-semibold text-amber-200">{maskedPositions} masked positions</dt>
                            <dd className="mt-1 text-xs leading-5 text-slate-300">Compare the surrounding sky</dd>
                        </div>
                    </dl>
                </section>

                <TargetSelector selected={selected} onSelect={selectTarget} />
                {dataset && dataset.kind !== "archive"
                    ? <ObservationViewer key={selected.id} dataset={dataset} target={selected} guideRequest={guideRequest} />
                    : <UnavailableObservations target={selected} reason={dataset?.detail} />}
            </div>
        </main>
    );
}
