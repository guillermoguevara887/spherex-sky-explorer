export type Epoch = {
    release: string;
    id: string;
    detector: string;
    date_utc: string;
    source: string;
    wavelength_um: number;
    bandwidth_nm: number;
};

export type Epochs = { a: Epoch; b: Epoch };

type Dataset = { path: string; legacyEpochs?: Epochs };

export const DATASETS: Readonly<Partial<Record<string, Dataset>>> = {
    "epsilon-indi-b": { path: "/data/epsilon_indi_b.json" },
    "first-light": {
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
export type { Dataset };
