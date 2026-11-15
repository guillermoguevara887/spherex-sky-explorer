export type Epoch = {
    release: string;
    id: string;
    detector: string;
    date_utc: string;
    source: string;
    wavelength_um: number;
    bandwidth_nm: number;
    target_position?: { ra: number; dec: number };
    target_pixel?: [number, number];
    target_flags?: number;
};

export type Epochs = { a: Epoch; b: Epoch };

export type PairDataset = { kind: "pair"; path: string; detail: string; legacyEpochs?: Epochs };
export type SingleDataset = { kind: "single"; path: string; detail: string };
type ArchiveDataset = { kind: "archive"; detail: string };
export type Dataset = PairDataset | SingleDataset | ArchiveDataset;
export type ImageDataset = PairDataset | SingleDataset;

export const DATASET_LABEL = {
    pair: "Time comparison",
    single: "Single image",
    archive: "Browse IRSA",
} as const;

export const DATASETS: Readonly<Partial<Record<string, Dataset>>> = {
    "barnards-star": { kind: "single", path: "/data/barnards_star.json",
        detail: "The target pixel failed quality checks in all 53 screened exposures. The single image shows the surrounding field with detector overflow and charge spillover masked." },
    "wise-0855": { kind: "pair", path: "/data/wise_0855.json",
        detail: "D6 · DR1 · 2025-05-05 / 2026-05-11" },
    "rw-aurigae": { kind: "pair", path: "/data/rw_aurigae.json",
        detail: "D1 · DR1 · 2025-09-03 / 2026-03-04" },
    "r-draconis": { kind: "single", path: "/data/r_draconis.json",
        detail: "All 59 screened exposures had detector overflow and charge spillover at the predicted position. The single image shows the surrounding field." },
    "epsilon-indi-b": { kind: "pair", path: "/data/epsilon_indi_b.json",
        detail: "D2 · DR1 and QR3 · 2025–2026" },
    "first-light": {
        kind: "pair",
        detail: "D1 · DR1 and QR3 · demo field",
        path: "/data/first_light.json",
        legacyEpochs: {
            a: {
                release: "DR1",
                id: "2025W18_1B_0366_3",
                detector: "D1",
                date_utc: "2025-04-30T22:07:12.574",
                source: "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_2025W18_1B_0366_3D1_spx_l2b-v27-2026-196.fits",
                wavelength_um: 0.923919,
                bandwidth_nm: 23.5,
            },
            b: {
                release: "QR3",
                id: "2026W21_2A_0222_2",
                detector: "D1",
                date_utc: "2026-05-22T20:58:45.065",
                source: "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W21_2A/l2b-v27-2026-268/1/level2_2026W21_2A_0222_2D1_spx_l2b-v27-2026-268.fits",
                wavelength_um: 0.915242,
                bandwidth_nm: 23.5,
            },
        },
    },
};
