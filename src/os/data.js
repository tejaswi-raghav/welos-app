// Owner data for the welOS demo. Built from the visitor's saved configuration through the
// same sizing, tariff and day-simulation engines as the rest of the site. Nothing here is
// measured: it is a deterministic demonstration of what the owner app would show.
import { sizeSystem } from "../site/sizing.js";
import { loadBuild } from "../site/presets.js";
import { regionById, DEFAULT_REGION, UTILITIES, MONTHS, DAYS } from "../site/regions.js";
import { recommend, buildingById } from "../site/recommend.js";
import { LOAD_SHAPE } from "../site/economics.js";
import { simulateDay } from "../twin/sim.js";

export const COMMISSIONED = new Date("2026-03-01T00:00:00+04:00"); // demo installation date
// UAE rain falls mostly November–March (ASSUMPTION used to spread annual capture by month)
const RAIN_SHAPE = [0.2, 0.18, 0.16, 0.06, 0.02, 0, 0.01, 0.01, 0.01, 0.02, 0.12, 0.21];

export function dubaiNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => +parts.find((p) => p.type === t).value;
  return { y: g("year"), mo: g("month") - 1, d: g("day"), h: g("hour"), mi: g("minute") };
}

export function ownerData() {
  let build = loadBuild();
  let region = regionById[build?.region] || null;
  let fromProduct = !!region;
  if (!region) {
    const rec = recommend("dubai", "villa");
    region = DEFAULT_REGION;
    build = { region: "dubai", building: "villa", tier: "S", package: rec.packageId, battery: rec.battery, customer: "expat", backup: false, inputs: {}, choices: { battery: rec.battery } };
  }
  const B = buildingById[build.building] || buildingById.villa;
  const utility = UTILITIES[region.utility];
  const result = sizeSystem(region.climate, build.tier || B.tier, build.inputs || {}, build.choices || { battery: build.battery }, build.package || "recommended", { utilityId: region.utility, customer: build.customer, backup: build.backup });
  const by = Object.fromEntries(result.components.map((c) => [c.id, c]));
  const now = dubaiNow();
  const mo = now.mo;
  const months = result.monthly;

  // today's curve: the simulator's clear-day shape, scaled so the day's energy matches this month's average day
  const day = simulateDay("clear");
  const frames = day.frames;
  const simPv = frames.slice(0, -1).reduce((a, f) => a + f.result.power.pvKw * 0.25, 0);
  const simLoad = frames.slice(0, -1).reduce((a, f) => a + f.result.power.demandKw * 0.25, 0);
  const todayPv = months[mo].pv / DAYS[mo];
  const todayLoad = months[mo].load / DAYS[mo];
  const kPv = todayPv / simPv, kLoad = todayLoad / simLoad;
  const curve = frames.map((f) => ({ h: f.hour, clock: f.clock, pv: f.result.power.pvKw * kPv, load: f.result.power.demandKw * kLoad, soc: f.soc, mode: f.mode }));
  const nowIdx = Math.min(96, Math.round((now.h + now.mi / 60) * 4));
  const sofar = curve.slice(0, nowIdx + 1);
  const today = {
    pvKwh: sofar.reduce((a, p) => a + p.pv * 0.25, 0),
    loadKwh: sofar.reduce((a, p) => a + p.load * 0.25, 0),
    pvKwhDay: todayPv, loadKwhDay: todayLoad,
    nowPv: curve[nowIdx].pv, nowLoad: curve[nowIdx].load, nowIdx,
    peak: curve.reduce((m, p) => (p.pv > m.pv ? p : m), curve[0]),
    mode: frames[nowIdx].mode,
    events: day.events.filter((e) => e.i <= nowIdx),
  };

  // month to date and lifetime since the demo commissioning date
  const dayFrac = (now.d - 1 + (now.h + now.mi / 60) / 24) / DAYS[mo];
  const monthToDate = { pv: months[mo].pv * dayFrac, saving: months[mo].saving * dayFrac, billBefore: months[mo].billBefore * dayFrac, billAfter: months[mo].billAfter * dayFrac };
  const startMo = COMMISSIONED.getMonth();
  const span = [];
  for (let m = startMo; m < mo; m++) span.push(months[m]);
  const lifetime = {
    pv: span.reduce((a, m) => a + m.pv, 0) + monthToDate.pv,
    saving: span.reduce((a, m) => a + m.saving, 0) + monthToDate.saving,
    months: span.length + dayFrac,
  };
  lifetime.co2 = (lifetime.pv * 0.41) / 1000;

  // water
  const t = result.totals;
  const rainY = by.water.metrics.rainLYear;
  const condY = by.condensate.included ? by.condensate.metrics.condensateLYear : 0;
  const water = MONTHS.map((_, m) => ({ rain: rainY * RAIN_SHAPE[m], condensate: (condY * LOAD_SHAPE[m]) / 12 }));

  // 25-year cumulative cash flow
  const cash = [];
  let acc = -t.totalAed;
  for (let y = 0; y <= 25; y++) {
    if (y > 0) acc += t.electricitySavingsAed * (1 - 0.005) ** (y - 1) + t.waterSavingsAed;
    cash.push({ y, v: acc });
  }

  return { build, region, utility, B, result, by, totals: t, months, now, mo, curve, today, monthToDate, lifetime, water, cash, fromProduct };
}

export { MONTHS };
