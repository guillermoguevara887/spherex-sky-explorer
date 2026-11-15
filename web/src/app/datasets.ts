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
export type FieldDataset = { kind: "field"; path: string; detail: string; single: SingleDataset };
type ArchiveDataset = { kind: "archive"; detail: string };
export type ImageDataset = PairDataset | SingleDataset | FieldDataset;
export type Dataset = ImageDataset | ArchiveDataset;

export const DATASET_LABEL = {
    pair: "Predicted position usable",
    field: "Predicted position masked",
    single: "Single image",
    archive: "Browse IRSA",
} as const;

export const DATASETS: Readonly<Partial<Record<string, Dataset>>> = {
    "barnards-star": {
        kind: "field", path: "/data/barnards_star_field.json",
        detail: "Detector flags affected the star’s predicted position in the screened exposures. Compare the surrounding sky with that region masked in both frames.",
        single: { kind: "single", path: "/data/barnards_star.json",
            detail: "This exposure shows the surrounding sky with detector overflow and charge spillover masked." },
    },
    "wise-0855": { kind: "pair", path: "/data/wise_0855.json",
        detail: "D6 · DR1 · 2025-05-05 / 2026-05-11" },
    "rw-aurigae": { kind: "pair", path: "/data/rw_aurigae.json",
        detail: "D1 · DR1 · 2025-09-03 / 2026-03-04" },
    "r-draconis": {
        kind: "field", path: "/data/r_draconis_field.json",
        detail: "Detector flags affected the star’s predicted position in the screened wide and deep exposures. Compare the surrounding sky with that region masked in both frames.",
        single: { kind: "single", path: "/data/r_draconis.json",
            detail: "This exposure shows the surrounding sky with detector overflow and charge spillover masked." },
    },
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
