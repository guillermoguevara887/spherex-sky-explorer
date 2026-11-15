"use client";

import { useState } from "react";
import { TargetSelector, UnavailableObservations } from "./target-selector";
import { ObservationViewer } from "./observation-viewer";
import { FIRST_LIGHT } from "./targets";
import { DATASETS } from "./datasets";

const SOURCE_ARCHIVE = "https://irsa.ipac.caltech.edu/Missions/spherex.html";

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
                        Choose a challenge target or enter sky coordinates.
                        Compare archived SPHEREx exposures or explore a field in IRSA.
                    </p>
                </section>

                <TargetSelector selected={selected} onSelect={setSelected} />
                {dataset && dataset.kind !== "archive"
                    ? <ObservationViewer key={selected.id} dataset={dataset} target={selected} />
                    : <UnavailableObservations target={selected} reason={dataset?.detail} />}
            </div>
        </main>
    );
}
