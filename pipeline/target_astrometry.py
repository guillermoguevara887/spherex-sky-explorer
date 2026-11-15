"""Reference positions for the four challenge fields screened in issue 2."""

from dataclasses import dataclass

from astropy import units as u
from astropy.coordinates import SkyCoord, get_body_barycentric
from astropy.time import Time
import numpy as np


@dataclass(frozen=True)
class Target:
    center: tuple[float, float]
    reference: tuple[float, float]
    epoch: float
    source: str
    pm_ra_cosdec: float = 0
    pm_dec: float = 0
    parallax: float = 0
    observed_reference: bool = False

    def at(self, date):
        """Approximate ICRS direction at an exposure date, as seen near Earth."""
        coord = SkyCoord(*self.reference, unit="deg")
        if self.pm_ra_cosdec == self.pm_dec == self.parallax == 0:
            return coord
        ref = Time(self.epoch, format="jyear", scale="tt")
        years = date.tt.jyear - self.epoch
        ra, dec = coord.ra.rad, coord.dec.rad
        east = np.array([-np.sin(ra), np.cos(ra), 0])
        north = np.array([-np.cos(ra) * np.sin(dec), -np.sin(ra) * np.sin(dec), np.cos(dec)])
        observer = get_body_barycentric("earth", date).xyz.to_value(u.au)
        if self.observed_reference:
            observer -= get_body_barycentric("earth", ref).xyz.to_value(u.au)
        offsets = (
            years * self.pm_ra_cosdec - self.parallax * np.dot(observer, east),
            years * self.pm_dec - self.parallax * np.dot(observer, north),
        )
        return coord.spherical_offsets_by(offsets[0] * u.mas, offsets[1] * u.mas)


TARGETS = {
    "barnards-star": Target(
        (269.44627, 4.7682), (269.4520769586, 4.6933649666), 2000,
        "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=GJ699",
        -801.551, 10362.394, 546.9759,
    ),
    # HST position at MJD 57123.166 (Table 1), fitted motion and parallax
    # from the same paper. Use differential parallax from the HST epoch.
    "wise-0855": Target(
        (133.75951, -7.2423), (133.7840125, -7.2442611111),
        Time(57123.166, format="mjd", scale="utc").tt.jyear,
        "https://www.aanda.org/articles/aa/pdf/2016/08/aa28662-16.pdf",
        -8160, 660, 464, True,
    ),
    "rw-aurigae": Target(
        (76.95654, 30.40144), (76.95654, 30.40144), 2000,
        "https://vsx.aavso.org/index.php?revid=418953&view=detail.top",
    ),
    "r-draconis": Target(
        (248.16761, 66.75498), (248.16761, 66.75498), 2000,
        "https://archive.aavso.org/index.php/aavso-bulletin-coordinates",
    ),
}
