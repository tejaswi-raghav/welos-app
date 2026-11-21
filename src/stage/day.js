// A 24-hour simulation of a sized WELOS build, in 15-minute steps.
// Daily energy totals come from the sizing engine; this only shapes them over
// the day (sun bell, evening sea breeze, a UAE villa load with an afternoon
// cooling peak) and runs the battery with a 20% reserve.

const STEP = 0.25;
const SUNRISE = 6.05, SUNSET = 18.45;

const solarShape = (h) => (h <= SUNRISE || h >= SUNSET ? 0 : Math.pow(Math.sin(Math.PI * (h - SUNRISE) / (SUNSET - SUNRISE)), 1.25));
const windShape = (h) => 0.55 + 0.45 * Math.cos(((h - 21) / 24) * Math.PI * 2) + 0.18 * Math.cos(((h - 15) / 24) * Math.PI * 2);
const loadShape = (h) => 0.55
  + 0.35 * Math.exp(-((h - 7.5) ** 2) / 2)
  + 0.95 * Math.exp(-((h - 15) ** 2) / 9)
  + 0.75 * Math.exp(-((h - 20.5) ** 2) / 4);

function normalised(shape) {
  let sum = 0;
  for (let h = 0; h < 24; h += STEP) sum += shape(h) * STEP;
  return (h) => shape(h) / sum; // integrates to 1 over the day
}
const SOLAR = normalised(solarShape), WIND = normalised(windShape), LOAD = normalised(loadShape);

/**
 * @param {object} result output of sizeSystem()
 * @returns {{ steps: object[], peakKw: number, battKwh: number, totals: object }}
 */
export function simulateDay(result) {
  const by = Object.fromEntries(result.components.map((c) => [c.id, c]));
  const pvKwhDay = by.solar.metrics.pvKwp * (result.climate.solar ?? result.climate.solarDailyKwhM2) * (by.solar.metrics.performanceRatio || 0.8);
  const windKwhDay = by.wind.included ? (by.wind.metrics.windKwhYear || 0) / 365 : 0;
  const loadKwhDay = result.site.loadKwhDay;
  const battKwh = by.battery.metrics.batteryKwh;
  const reserve = 0.2;
  let soc = 0.55;
  const steps = [];
  let imported = 0, exported = 0;
  for (let h = 0; h < 24; h += STEP) {
    const pv = pvKwhDay * SOLAR(h), wind = windKwhDay * WIND(h), load = loadKwhDay * LOAD(h);
    let net = pv + wind - load; // kW over this step
    let charge = 0, discharge = 0, imp = 0, exp = 0;
    if (net > 0) {
      charge = Math.min(net, ((1 - soc) * battKwh) / STEP);
      exp = net - charge;
    } else {
      discharge = Math.min(-net, (Math.max(0, soc - reserve) * battKwh) / STEP);
      imp = -net - discharge;
    }
    soc += ((charge * 0.95 - discharge) * STEP) / Math.max(0.1, battKwh);
    soc = Math.min(1, Math.max(0, soc));
    imported += imp * STEP; exported += exp * STEP;
    steps.push({ h, pv, wind, load, charge, discharge, import: imp, export: exp, soc });
  }
  const peakKw = Math.max(...steps.map((s) => Math.max(s.pv + s.wind, s.load)));
  return { steps, peakKw, battKwh, totals: { pvKwhDay, windKwhDay, loadKwhDay, imported, exported } };
}

export function at(sim, hour) {
  const i = Math.max(0, Math.min(sim.steps.length - 1, Math.round(((hour % 24) + 24) % 24 / STEP)));
  return sim.steps[i];
}

/** Stage flow intensities (0..1) for a simulated moment. */
export function flowsFor(sim, hour, extra = {}) {
  const s = at(sim, hour);
  const n = (x) => Math.min(1, x / Math.max(0.2, sim.peakKw * 0.45));
  return {
    flows: {
      pv: n(s.pv), wind: n(s.wind), charge: n(s.charge), discharge: n(s.discharge),
      home: n(s.load), export: n(s.export), ...extra.flows,
    },
    soc: s.soc,
    wind: Math.min(1, s.wind / Math.max(0.05, sim.peakKw * 0.15)),
  };
}

/** SVG paths for a 24 h chart (supply area, load line, battery line). */
export function chartPaths(sim, w, h, pad = 4) {
  const max = sim.peakKw * 1.08 || 1;
  const x = (hr) => pad + (hr / 24) * (w - pad * 2);
  const y = (kw) => h - pad - (kw / max) * (h - pad * 2);
  const ys = (soc) => h - pad - soc * (h - pad * 2);
  const pts = sim.steps;
  const area = (f) => `M${x(0)},${y(0)} ` + pts.map((s) => `L${x(s.h).toFixed(1)},${y(f(s)).toFixed(1)}`).join(" ") + ` L${x(24)},${y(0)} Z`;
  const line = (f, yy = y) => pts.map((s, i) => `${i ? "L" : "M"}${x(s.h).toFixed(1)},${yy(f(s)).toFixed(1)}`).join(" ");
  return {
    solar: area((s) => s.pv),
    wind: area((s) => s.pv + s.wind),
    load: line((s) => s.load),
    soc: line((s) => s.soc, ys),
    x, y,
  };
}
