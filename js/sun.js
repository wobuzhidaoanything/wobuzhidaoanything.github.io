// Sun position for a place and time (the standard astronomical formulas used by SunCalc and
// NOAA, accurate to a fraction of a degree), and helpers to turn it into a light direction
// on the plan given which way north is.
const rad = Math.PI / 180;
const dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const e = rad * 23.4397; // obliquity of the Earth

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

/**
 * Where the sun is: `altitude` above the horizon and `bearing` clockwise from north (radians).
 */
export function sunPosition(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date);
  const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  const dec = declination(L, 0), ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); // from south, west positive
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { altitude, bearing: (azimuth + Math.PI) % (2 * Math.PI) };
}

/** Sunrise and sunset (Date, or null for polar day/night) on the day of `date`, found by scanning. */
export function sunTimes(date, lat, lon) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  let rise = null, set = null, prev = sunPosition(start, lat, lon).altitude;
  const horizon = -0.833 * rad; // refraction + the sun's radius
  for (let m = 5; m <= 1440; m += 5) {
    const t = new Date(start.valueOf() + m * 60000);
    const a = sunPosition(t, lat, lon).altitude;
    if (prev < horizon && a >= horizon && !rise) rise = t;
    if (prev >= horizon && a < horizon) set = t;
    prev = a;
  }
  return { rise, set };
}

/**
 * Unit vector towards the sun in plan/world space (x right, y up, z down the plan), when
 * north points `northDeg` degrees clockwise from the top of the plan.
 */
export function sunVector({ altitude, bearing }, northDeg = 0) {
  const phi = bearing + northDeg * rad;
  const c = Math.cos(altitude);
  return [c * Math.sin(phi), Math.sin(altitude), -c * Math.cos(phi)];
}
