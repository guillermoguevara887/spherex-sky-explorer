type Position = { ra: number; dec: number };

export type Target = Position & {
    id: string;
    name: string;
    description: string;
    reference: string;
    source?: string;
};

export const FIRST_LIGHT: Target = {
    id: "first-light",
    name: "First Light demo field",
    ra: 304.693508808,
    dec: 42.4436872991,
    description: "Field center for the archived 2025 DR1 and 2026 QR3 demonstration.",
    reference: "ICRS field center",
};

// Convert published positions to decimal degrees. Proper-motion estimates
// use mu_alpha* (including cos(dec)) and omit parallax and perspective.
function positionAt2026(
    ra: number,
    dec: number,
    epoch: number,
    pmRaCosDec: number,
    pmDec: number,
): Position {
    const years = 2026 - epoch;
    const projectedRa = ra + years * pmRaCosDec / (3_600_000 * Math.cos(dec * Math.PI / 180));
    const projectedDec = dec + years * pmDec / 3_600_000;
    return { ra: Number(projectedRa.toFixed(5)), dec: Number(projectedDec.toFixed(5)) };
}

const motionEstimate = "Approximate J2026.0 search position from proper motion. Verify the position at each observation date for analysis.";

export const TARGETS: readonly Target[] = [
    {
        id: "barnards-star",
        name: "Barnard’s Star",
        ...positionAt2026(269.4520769586, 4.6933649666, 2000, -801.551, 10362.394),
        description: "A nearby red dwarf with large cataloged proper motion.",
        reference: motionEstimate,
        source: "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=GJ699",
    },
    {
        id: "epsilon-indi-b",
        name: "Epsilon Indi B",
        ...positionAt2026(331.0438333333, -56.7826944444, 1999.855, 3976, -2500),
        description: "The nearby brown dwarf pair Epsilon Indi Ba and Bb.",
        reference: motionEstimate,
        source: "https://www.aanda.org/articles/aa/pdf/2004/03/aa0292.pdf",
    },
    {
        id: "wise-0855",
        name: "WISE 0855−0714",
        ...positionAt2026(133.7840125, -7.2442611111, 2015.276, -8160, 660),
        description: "A cold nearby substellar object with large cataloged proper motion.",
        reference: motionEstimate,
        source: "https://www.aanda.org/articles/aa/pdf/2016/08/aa28662-16.pdf",
    },
    {
        id: "rw-aurigae",
        name: "RW Aurigae",
        ra: 76.95654,
        dec: 30.40144,
        description: "A young variable star system in Taurus–Auriga.",
        reference: "Nominal J2000 catalog position (AAVSO VSX).",
        source: "https://vsx.aavso.org/index.php?revid=418953&view=detail.top",
    },
    {
        id: "r-draconis",
        name: "R Draconis",
        ra: 248.16761,
        dec: 66.75498,
        description: "A Mira-type pulsating variable star in Draco.",
        reference: "Nominal J2000 catalog position (AAVSO).",
        source: "https://archive.aavso.org/index.php/aavso-bulletin-coordinates",
    },
    FIRST_LIGHT,
];

export function irsaSearchUrl({ ra, dec }: Position) {
    const query = new URLSearchParams({
        api: "spectral-images",
        ra: String(ra === 360 ? 0 : ra),
        dec: String(dec),
        sr: "2m",
        spatialRegionOperation: "intersects",
        execute: "true",
    });
    return `https://irsa.ipac.caltech.edu/applications/spherex/?${query}`;
}
