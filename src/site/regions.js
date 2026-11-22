// UAE locations and their utilities. Climate values are NASA POWER climatology
// (Jan 2001 – Dec 2025, fetched through /api/climate on 22 Nov 2026). NASA's solar
// grid is coarse, so Sharjah, Ajman and Ras Al Khaimah share Dubai's sun values.
//
// Tariffs were checked against the utilities' published schedules on 22 Nov 2026:
//   DEWA slab tariff (dewa.gov.ae), fuel surcharge 6 fils/kWh, VAT 5%
//   SEWA energy calculator (sewa.gov.ae): same slabs, fuel surcharge 6 fils/kWh
//   EtihadWE: same residential slabs, fuel surcharge 5 fils/kWh (secondary source)
//   TAQA Distribution (formerly ADDC) residential tariffs (addc.ae): daily bands
// Net metering: Shams Dubai credits exports at the customer's own slab rate and credits
// roll over; Abu Dhabi offsets exported kWh. For SEWA and EtihadWE we have not verified
// an export-credit scheme, so the model gives exports no value there (conservative).

const DUBAI_SUN = [3.9235, 4.7306, 5.6206, 6.4231, 7.2451, 7.3495, 6.8486, 6.5227, 6.1046, 5.2829, 4.2929, 3.7147];
const MONTHLY_STANDARD = [[2000, 0.23], [4000, 0.28], [6000, 0.32], [Infinity, 0.38]];

export const UTILITIES = Object.freeze({
  dewa: {
    id: "dewa", name: "DEWA", region: "Dubai",
    basis: "monthly", slabs: MONTHLY_STANDARD, fuelSurcharge: 0.06,
    netMetering: "yes", scheme: "Shams Dubai net metering",
    schemeNote: "Exported units are credited at your own slab rate and the credit rolls over. DEWA pays no cash for surplus.",
  },
  taqa: {
    id: "taqa", name: "TAQA Distribution", region: "Abu Dhabi",
    basis: "daily", fuelSurcharge: 0,
    // daily green allowance (kWh/day) then red rate, by customer and dwelling
    daily: {
      expat: { villa: [[200, 0.268], [Infinity, 0.305]], flat: [[20, 0.268], [Infinity, 0.305]] },
      national: { villa: [[400, 0.067], [Infinity, 0.075]], flat: [[30, 0.067], [Infinity, 0.075]] },
    },
    netMetering: "yes", scheme: "Abu Dhabi small-scale solar netting",
    schemeNote: "Exported kWh offset imported kWh. No cash payment. Commercial accounts are priced here at the expat villa rate as an assumption.",
  },
  sewa: {
    id: "sewa", name: "SEWA", region: "Sharjah",
    basis: "monthly", slabs: MONTHLY_STANDARD, fuelSurcharge: 0.06,
    netMetering: "unverified", scheme: "Export credit not verified",
    schemeNote: "We have not verified an export-credit scheme for SEWA, so exported energy is valued at zero. Confirm with SEWA before you rely on exports.",
  },
  etihadwe: {
    id: "etihadwe", name: "EtihadWE", region: "Northern Emirates",
    basis: "monthly", slabs: MONTHLY_STANDARD, fuelSurcharge: 0.05,
    netMetering: "unverified", scheme: "Export credit not verified",
    schemeNote: "We have not verified an export-credit scheme for EtihadWE, so exported energy is valued at zero. Confirm with EtihadWE before you rely on exports.",
  },
});

export const VAT = 0.05;

export const REGIONS = Object.freeze([
  { id: "dubai", name: "Dubai", lat: 25.2048, lon: 55.2708, utility: "dewa",
    climate: { solarDailyKwhM2: 5.6748, windMs: 3.73, rainMmYear: 84, humidityPct: 58.19, tempC: 28.23, monthly: DUBAI_SUN } },
  { id: "abu-dhabi", name: "Abu Dhabi", lat: 24.4539, lon: 54.3773, utility: "taqa",
    climate: { solarDailyKwhM2: 5.8846, windMs: 3.87, rainMmYear: 62, humidityPct: 60.25, tempC: 28.17, monthly: [4.1995, 4.9855, 5.8553, 6.6024, 7.3075, 7.4263, 6.9137, 6.7776, 6.401, 5.6105, 4.5437, 3.9562] } },
  { id: "al-ain", name: "Al Ain", lat: 24.2075, lon: 55.7447, utility: "taqa",
    climate: { solarDailyKwhM2: 6.0214, windMs: 3.59, rainMmYear: 62, humidityPct: 36.58, tempC: 28.85, monthly: [4.3075, 5.0986, 6.0329, 6.8064, 7.5122, 7.5842, 7.0114, 6.8726, 6.4958, 5.7295, 4.6577, 4.1122] } },
  { id: "sharjah", name: "Sharjah", lat: 25.3463, lon: 55.4209, utility: "sewa",
    climate: { solarDailyKwhM2: 5.6748, windMs: 3.58, rainMmYear: 88, humidityPct: 54.07, tempC: 28.6, monthly: DUBAI_SUN } },
  { id: "ajman", name: "Ajman", lat: 25.4052, lon: 55.5136, utility: "etihadwe",
    climate: { solarDailyKwhM2: 5.6748, windMs: 3.58, rainMmYear: 88, humidityPct: 54.07, tempC: 28.6, monthly: DUBAI_SUN } },
  { id: "rak", name: "Ras Al Khaimah", lat: 25.8007, lon: 55.9762, utility: "etihadwe",
    climate: { solarDailyKwhM2: 5.6748, windMs: 3.28, rainMmYear: 110, humidityPct: 56.97, tempC: 27.89, monthly: DUBAI_SUN } },
  { id: "fujairah", name: "Fujairah", lat: 25.1288, lon: 56.3265, utility: "etihadwe",
    climate: { solarDailyKwhM2: 5.6059, windMs: 3.57, rainMmYear: 117, humidityPct: 49.85, tempC: 28.33, monthly: [3.8983, 4.6601, 5.6244, 6.4344, 7.2257, 7.2643, 6.5558, 6.359, 6.0065, 5.2615, 4.2595, 3.6859] } },
]);

export const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const DEFAULT_REGION = REGIONS[0];

/** Nearest UAE region to a coordinate, used to pick a utility for searched places. */
export function nearestRegion(lat, lon) {
  let best = DEFAULT_REGION, d = Infinity;
  for (const r of REGIONS) {
    const dd = (r.lat - lat) ** 2 + (r.lon - lon) ** 2;
    if (dd < d) { d = dd; best = r; }
  }
  return { region: best, distanceDeg: Math.sqrt(d) };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export { DUBAI_SUN };
