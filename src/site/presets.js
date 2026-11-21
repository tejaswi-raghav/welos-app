// Built-in reference climates so the demo works instantly and offline.
// Approximate long-term annual means in NASA POWER units (solar kWh/m²/day,
// 10 m wind m/s, rain mm/yr, relative humidity %, 2 m air temperature °C).
// When the live NASA POWER lookup succeeds, its values replace these.
export const PRESETS = [
  { id: "dubai", name: "Dubai, UAE", lat: 25.2048, lon: 55.2708, climate: { solarDailyKwhM2: 5.6, windMs: 4.2, rainMmYear: 90, humidityPct: 55, tempC: 28.3 } },
  { id: "abu-dhabi", name: "Abu Dhabi, UAE", lat: 24.4539, lon: 54.3773, climate: { solarDailyKwhM2: 5.7, windMs: 4.1, rainMmYear: 75, humidityPct: 52, tempC: 28.4 } },
  { id: "riyadh", name: "Riyadh, Saudi Arabia", lat: 24.7136, lon: 46.6753, climate: { solarDailyKwhM2: 6.0, windMs: 3.7, rainMmYear: 95, humidityPct: 28, tempC: 26.6 } },
  { id: "mumbai", name: "Mumbai, India", lat: 19.076, lon: 72.8777, climate: { solarDailyKwhM2: 5.1, windMs: 3.6, rainMmYear: 2300, humidityPct: 74, tempC: 27.3 } },
  { id: "singapore", name: "Singapore", lat: 1.3521, lon: 103.8198, climate: { solarDailyKwhM2: 4.5, windMs: 2.6, rainMmYear: 2400, humidityPct: 82, tempC: 27.3 } },
  { id: "vevey", name: "Vevey, Switzerland", lat: 46.4628, lon: 6.8419, climate: { solarDailyKwhM2: 3.4, windMs: 2.5, rainMmYear: 1200, humidityPct: 75, tempC: 10.5 } },
];

export const DEFAULT_PRESET = PRESETS[0];

export const STORAGE_KEY = "welos.build.v1";

/** Persist the visitor's build so other pages (exploded view) can show their numbers. */
export function saveBuild(build) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); } catch { /* storage unavailable */ }
}

export function loadBuild() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const build = raw ? JSON.parse(raw) : null;
    return build && build.climate && build.tier ? build : null;
  } catch {
    return null;
  }
}
