import "../explore/exhibit.css";
import "./landing.css";
import "../ai/mount.jsx";

// reveal-on-scroll for the post-exhibit sections
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
document.querySelectorAll(".rv").forEach((el) => io.observe(el));

// "System" returns to the start of the exhibit
document.querySelector('[data-scene="0"]')?.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

// highlight the section in view
const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const secs = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
const mark = () => {
  const y = innerHeight * 0.4;
  let cur = links[0];
  secs.forEach((s) => { if (s.id !== "top" && s.getBoundingClientRect().top < y) cur = links.find((a) => a.getAttribute("href") === `#${s.id}`); });
  links.forEach((a) => a.classList.toggle("cur", a === cur));
};
addEventListener("scroll", mark, { passive: true }); mark();

// Products: three scales, priced by the same sizing engine as the Studio
import { sizeSystem, TIERS } from "../site/sizing.js";
import { DEFAULT_PRESET } from "../site/presets.js";
const fmtN = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const PRODUCTS = [
  { id: "S", img: "/explore/ref-full.jpg", line: "A complete unit for one home: canopy, storage and water in one footprint." },
  { id: "M", img: "/explore/ref-canopy.jpg", line: "Shared canopies for apartment blocks and villa clusters." },
  { id: "L", img: "/explore/ref-power.jpg", line: "Commercial-scale storage and wind for offices, malls and campuses." },
];
const grid = document.getElementById("pgrid");
if (grid) {
  grid.innerHTML = PRODUCTS.map((p) => {
    const rec = sizeSystem(DEFAULT_PRESET.climate, p.id, {}, {}, "recommended");
    const ess = sizeSystem(DEFAULT_PRESET.climate, p.id, {}, {}, "essential");
    const by = Object.fromEntries(rec.components.map((c) => [c.id, c]));
    return `<article class="pcard rv"><div class="pmedia"><img src="${p.img}" alt="" loading="lazy"><span>WELOS ${p.id}</span></div>
      <div class="pbody"><h3>${TIERS[p.id].name}<small>${TIERS[p.id].audience}</small></h3><p>${p.line}</p>
      <ul><li><b>${fmtN(by.solar.metrics.pvKwp, 1)} kWp</b>solar</li><li><b>${fmtN(by.battery.metrics.batteryKwh)} kWh</b>storage</li><li><b>${fmtN(by.water.metrics.tankL)} L</b>water</li></ul>
      <div class="pfoot"><span>From <b>AED ${fmtN(ess.totals.totalAed)}</b><small>Dubai · Essential · installed</small></span><a class="btn sun" href="/studio.html?tier=${p.id}#configure">Configure</a></div></div></article>`;
  }).join("");
  grid.querySelectorAll(".rv").forEach((el) => io.observe(el));
}
