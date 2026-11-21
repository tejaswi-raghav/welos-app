// Adds "sized for your site" detail to the story's engineering-detail drawers.
// Reads the build saved by the sizing demo or the Studio; falls back to the
// reference Dubai villa. Same engine, so numbers match the rest of the page.
import { sizeSystem } from "../site/sizing.js";
import { loadBuild, DEFAULT_PRESET } from "../site/presets.js";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const saved = loadBuild();
const build = saved || { place: DEFAULT_PRESET.name, climate: DEFAULT_PRESET.climate, tier: "S", inputs: {}, choices: {} };
const place = String(build.place || DEFAULT_PRESET.name).split(",")[0];
const result = sizeSystem(build.climate, build.tier, build.inputs || {}, build.choices || {}, build.package);
const part = Object.fromEntries(result.components.map((p) => [p.id, p]));
const { tier, site } = result;
const water = part.water.metrics;

const entry = (p) => ({ title: p.name, capacity: p.included ? p.capacity.text : `Not fitted here · ${p.capacity.text}`, why: p.why, rules: p.rules });
const ENTRIES = {
  2: [entry(part.solar), entry(part.wind), entry(part.cleaning)],
  4: [entry(part.battery), entry(part.inverter)],
  6: [{ title: "Catchment", capacity: `${fmt(water.eventCaptureL)} L per ${fmt(water.designEventMm)} mm storm · ${fmt(water.rainLYear)} L/yr`, why: `The ${fmt(site.roofM2)} m² canopy is the catchment. 80% runoff and 90% kept after first flush are assumed.`, rules: part.water.rules.slice(0, 2) }],
  6.1: [entry(part.water), entry(part.condensate)],
  6.2: [{ title: "Treatment rate", capacity: `${tier.treatmentLpm} L/min · non-potable`, why: `Treats a full day's ${fmt(site.waterLDay)} L in about ${fmt(site.waterLDay / tier.treatmentLpm)} minutes.`, rules: [] }],
  6.3: [{ title: "Pump duty", capacity: part.cleaning.name === "Rain-fed rinse rail" ? "Supplies loads and the panel rinse" : "Supplies loads; panels cleaned by a dry robot here", why: part.cleaning.why, rules: part.cleaning.rules }],
};

function block(e) {
  const rules = e.rules?.length
    ? `<ul class="why-rules">${e.rules.map((r) => `<li class="${r.pass ? "y" : "n"}"><b aria-label="${r.pass ? "met" : "not met"}">${r.pass ? "✓" : "–"}</b><span>${esc(r.test)}<i>${esc(r.effect)}</i></span></li>`).join("")}</ul>`
    : "";
  return `<div class="why-item"><p class="why-t">${esc(e.title)}</p><p class="why-c">${esc(e.capacity)}</p>${e.why ? `<p>${esc(e.why)}</p>` : ""}${rules}</div>`;
}

const tag = `<p class="why-site"><span class="w-src engine">Engine output</span> Sized for ${esc(place)} · WELOS ${tier.id} ${esc(tier.name)}${saved ? "" : " (reference)"}</p>`;
const seen = new Set();
for (const [scene, entries] of Object.entries(ENTRIES)) {
  const more = document.querySelector(`.panel[data-s="${Math.floor(scene)}"] .more`);
  if (!more) continue;
  const box = document.createElement("div");
  box.className = "why-box";
  box.innerHTML = (seen.has(more) ? "" : tag) + entries.map(block).join("");
  seen.add(more);
  more.append(box);
}
