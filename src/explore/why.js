// Adds "for your site" capacity + reasoning to the exploded-view panels.
// Reads the build configured on the landing page; falls back to a reference
// Dubai villa. Uses the same sizing engine, so numbers match the landing page.
import { sizeSystem } from "../site/sizing.js";
import { loadBuild, DEFAULT_PRESET } from "../site/presets.js";
import "./why.css";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const saved = loadBuild();
const build = saved || { place: DEFAULT_PRESET.name, climate: DEFAULT_PRESET.climate, tier: "S", inputs: {}, choices: {} };
const place = String(build.place).split(",").slice(0, 2).join(",");
const result = sizeSystem(build.climate, build.tier, build.inputs || {}, build.choices || {});
const part = Object.fromEntries(result.components.map((p) => [p.id, p]));
const { tier, site } = result;
const water = part.water.metrics;

const entry = (p) => ({ title: p.name, capacity: p.included ? p.capacity.text : `Not fitted · ${p.capacity.text}`, why: p.why, rules: p.rules });

const ENTRIES = {
  2: [entry(part.wind)],
  3: [entry(part.solar), entry(part.cleaning)],
  5: [entry(part.battery), entry(part.inverter), { ...entry(part.controller), why: "" }],
  6: [{
    title: "Catchment and first flush",
    capacity: `${fmt(water.eventCaptureL)} L per ${fmt(water.designEventMm)} mm storm · ${fmt(water.rainLYear)} L/yr`,
    why: `Your ${fmt(site.roofM2)} m² canopy is the catchment. The first 1.2 mm of every storm carries the dust, so it is diverted before anything reaches the tank. 80% runoff and 90% kept after first flush are assumed.`,
    rules: part.water.rules.slice(0, 2),
  }],
  7: [entry(part.water), entry(part.condensate)],
  8: [{
    title: "Treatment train",
    capacity: `${tier.treatmentLpm} L/min · non-potable`,
    why: `Sized for WELOS ${tier.id}: it treats a full day's ${fmt(site.waterLDay)} L demand in about ${fmt(site.waterLDay / tier.treatmentLpm)} minutes, so the pump never waits on treatment.`,
    rules: [{ test: "Tier treatment rate (S 10 · M 40 · L 150 L/min)", pass: true, effect: `WELOS ${tier.id} → ${tier.treatmentLpm} L/min` }],
  }],
  9: [{
    title: "Pump duty",
    capacity: part.cleaning.name === "Rain-fed rinse rail" ? "Supplies loads + panel rinse" : "Supplies loads only · no rinse",
    why: part.cleaning.name === "Rain-fed rinse rail"
      ? "Rain is plentiful here, so the pump also feeds the rinse manifold whenever the soiling cell crosses 15%."
      : "Rain is too scarce to spend on rinsing here, so the rinse manifold stays off and a waterless robot cleans the panels.",
    rules: part.cleaning.rules,
  }],
};

function block(e) {
  const rules = e.rules?.length
    ? `<details><summary>Rules that sized it</summary><ul>${e.rules.map((r) => `<li class="${r.pass ? "y" : "n"}"><b>${r.pass ? "✓" : "✗"}</b><span>${esc(r.test)}<i>→ ${esc(r.effect)}</i></span></li>`).join("")}</ul></details>`
    : "";
  return `<div class="why-item"><span class="why-t">${esc(e.title)}</span><strong>${esc(e.capacity)}</strong>${e.why ? `<p>${esc(e.why)}</p>` : ""}${rules}</div>`;
}

const tag = `<a class="why-site" href="/#configure" title="Change site">For your site · WELOS ${tier.id} ${esc(tier.name)} · ${esc(place)}${saved ? "" : " (example)"} ↗</a>`;

for (const [scene, entries] of Object.entries(ENTRIES)) {
  const panel = document.querySelector(`.panel[data-s="${scene}"]`);
  if (!panel) continue;
  const box = document.createElement("section");
  box.className = "why-box";
  box.setAttribute("aria-label", "Sizing for your site");
  box.innerHTML = tag + (panel.querySelector(".specs") ? `<span class="why-note">Specs above are the System 01 prototype. These are sized to your site.</span>` : "") + entries.map(block).join("");
  panel.append(box);
}

const intro = document.querySelector('.panel[data-s="1"]');
if (intro) {
  const box = document.createElement("section");
  box.className = "why-box";
  box.innerHTML = `${tag}<div class="why-item"><span class="why-t">Configured build</span><strong>AED ${fmt(result.totals.totalAed)} · ${fmt(Math.min(result.totals.energyCoveragePct, 100))}% power · ${fmt(Math.min(result.totals.waterCoveragePct, 100))}% water</strong><p>Each subsystem panel shows its capacity for this site and the rule that sized it.${saved ? "" : " Configure your own site on the home page to replace this example."}</p></div>`;
  intro.append(box);
}
