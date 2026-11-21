import React, { useEffect, useMemo, useRef, useState } from "react";
import { SkyLayer, FrontLayer } from "./Landscape.jsx";
import SiteConfigurator from "../site/SiteConfigurator.jsx";
import { sizeSystem, TIERS } from "../site/sizing.js";
import { DEFAULT_PRESET } from "../site/presets.js";
import "../style.css";
import "./glass.css";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const aed = (x) => `AED ${fmt(x)}`;
const build = (tier, pkg = "recommended") => sizeSystem(DEFAULT_PRESET.climate, tier, {}, {}, pkg);

const NAV = [["Home", "#top"], ["About", "#about"], ["Products", "#products"], ["Design yours", "#configure"], ["WELOS AI", "#ai"], ["Explore", "#explore"]];

function Mark({ size = 26 }) {
  // WELOS globe-grid mark: a sphere with meridians and a sun-coloured core
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
    <circle cx="16" cy="16" r="15" fill="#191B18" />
    <g fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.3">
      <ellipse cx="16" cy="16" rx="6.2" ry="15" />
      <path d="M1 16h30M3.2 9h25.6M3.2 23h25.6M16 1v30" />
    </g>
    <circle cx="16" cy="16" r="3.4" fill="#F4C542" />
  </svg>;
}

function Bolt() {
  return <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M8.6 0 0 9.2h5.3L4.4 16 14 6.2H8.5L8.6 0Z" fill="currentColor" /></svg>;
}

function Counter({ to, decimals = 0, prefix = "", suffix = "" }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    let raf; const t0 = performance.now(); const dur = 1400;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{prefix}{fmt(v, decimals)}{suffix}</>;
}

function Hero() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const villa = useMemo(() => build("S"), []);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0, mx = 0, my = 0, sy = 0;
    const apply = () => { raf = 0; el.style.setProperty("--mx", mx.toFixed(3)); el.style.setProperty("--my", my.toFixed(3)); el.style.setProperty("--sy", sy.toFixed(1)); };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e) => { const r = el.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; queue(); };
    const onScroll = () => { sy = Math.min(window.scrollY, 900); queue(); };
    el.addEventListener("pointermove", onMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("pointermove", onMove); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <section className="hero-g" ref={ref} id="top" aria-labelledby="hero-title">
    <div className="layer d1"><SkyLayer /></div>
    <div className="layer d2 watermark" aria-hidden="true"><span>WELOS</span></div>
    <div className="layer d3"><FrontLayer /></div>
    <div className="layer d4 prism" aria-hidden="true">
      <i className="pf top" /><i className="pf left" /><i className="pf right" />
      <svg className="prism-edges d" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="22,63 52,50 88,59 58,74 22,63" /><line x1="58" y1="74" x2="58" y2="104" /><line className="soft" x1="22" y1="63" x2="22" y2="100" /><line className="soft" x1="88" y1="59" x2="88" y2="96" /></svg>
      <svg className="prism-edges m" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="4,60 50,50 96,58 52,70 4,60" /><line x1="52" y1="70" x2="52" y2="104" /><line className="soft" x1="4" y1="60" x2="4" y2="100" /><line className="soft" x1="96" y1="58" x2="96" y2="96" /></svg>
    </div>
    <div className="scrim" aria-hidden="true" />

    <div className="frame">
      <header className="gnav">
        <a className="gbrand" href="#top" aria-label="WELOS home"><Mark /><span>WELOS</span></a>
        <nav aria-label="Main">{NAV.map(([l, h]) => <a key={h} href={h}>{l}</a>)}</nav>
        <a className="pill-dark" href="#configure">Get started</a>
        <button type="button" className="burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><i /><i /><i /></button>
      </header>

      <div className="hero-bottom">
        <div className="hero-copy-g">
          <h1 id="hero-title">Power and water<br />from one roof</h1>
          <p>Solar, wind and rain, sized to your climate and coordinated by WELOS OS. Clean, cost-effective and built for homes, buildings and campuses.</p>
          <a className="pill-sun" href="#configure">Design yours <Bolt /></a>
        </div>
        <div className="bento" aria-label="Example: WELOS S villa in Dubai">
          <div className="gcard stat"><strong><Counter to={villa.totals.co2TonnesYear} decimals={1} suffix=" t" /></strong><span>CO₂ avoided every year</span></div>
          <div className="gcard stat"><strong><Counter to={villa.totals.monthlySavingsAed} prefix="AED " /></strong><span>Saved every month</span></div>
          <div className="gcard wide">
            <span className="chips" aria-hidden="true">
              <i title="Sun"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg></i>
              <i title="Wind"><svg viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8" /></svg></i>
              <i title="Rain"><svg viewBox="0 0 24 24"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" /></svg></i>
              <i title="WELOS OS"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6v6H9zM9 1.5V4M15 1.5V4M9 20v2.5M15 20v2.5M1.5 9H4M1.5 15H4M20 9h2.5M20 15h2.5" /></svg></i>
            </span>
            <span className="wide-copy"><em>Sun · Wind · Rain · AI</em><b>{fmt(Math.min(villa.totals.energyCoveragePct, 100))}% of a Dubai villa's power</b></span>
          </div>
        </div>
      </div>
    </div>

    <div className={`drawer ${open ? "on" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="drawer-panel">
        <button type="button" className="drawer-x" aria-label="Close menu" onClick={() => setOpen(false)}>✕</button>
        {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>)}
        <a href="/model.html">3D model</a><a href="/explore.html">Exploded view</a><a href="/control.html">WELOS OS simulator</a>
        <a className="pill-dark" href="#configure" onClick={() => setOpen(false)}>Get started</a>
      </div>
    </div>
  </section>;
}

const PRODUCTS = [
  { id: "S", kind: "Villa", img: "/explore/ref-full.jpg", line: "A complete unit for one home: canopy, storage and water in one footprint." },
  { id: "M", kind: "Residential", img: "/explore/ref-canopy.jpg", line: "Shared canopies for apartment blocks and villa clusters." },
  { id: "L", kind: "Commercial", img: "/explore/ref-power.jpg", line: "Commercial-scale storage and wind for offices, malls and campuses." },
];

function Products() {
  const [filter, setFilter] = useState("All");
  const items = PRODUCTS.map((p) => ({ ...p, rec: build(p.id), ess: build(p.id, "essential") }));
  const shown = filter === "All" ? items : items.filter((p) => p.kind === filter);
  const choose = (id) => { window.dispatchEvent(new CustomEvent("welos:tier", { detail: id })); document.getElementById("configure")?.scrollIntoView({ behavior: "smooth" }); };
  return <section className="gsec" id="products" aria-labelledby="products-title">
    <div className="gsec-head">
      <span className="kicker">Products</span>
      <h2 id="products-title">One platform, three scales.</h2>
      <div className="filters" role="group" aria-label="Filter products">{["All", "Villa", "Residential", "Commercial"].map((f) => <button type="button" key={f} className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
    </div>
    <div className="pgrid">
      {shown.map((p) => {
        const by = Object.fromEntries(p.rec.components.map((c) => [c.id, c]));
        return <article className="pcard" key={p.id}>
          <div className="pmedia"><img src={p.img} alt="" loading="lazy" /><span className="badge">WELOS {p.id}</span></div>
          <div className="pbody">
            <h3>{TIERS[p.id].name}<small>{TIERS[p.id].audience}</small></h3>
            <p>{p.line}</p>
            <ul className="specs-g">
              <li><b>{fmt(by.solar.metrics.pvKwp, 1)} kWp</b>solar</li>
              <li><b>{fmt(by.battery.metrics.batteryKwh)} kWh</b>storage</li>
              <li><b>{fmt(by.water.metrics.tankL)} L</b>water</li>
            </ul>
            <div className="pfoot"><span>From <b>{aed(p.ess.totals.totalAed)}</b><small>Dubai, Essential, installed</small></span><button type="button" className="pill-dark" onClick={() => choose(p.id)}>Configure</button></div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function App() {
  const villa = useMemo(() => build("S"), []);
  return <div className="glass-page">
    <Hero />
    <main>
      <section className="gsec about" id="about" aria-labelledby="about-title">
        <div className="about-copy">
          <span className="kicker">About WELOS</span>
          <h2 id="about-title">One roof. Three resources.<br /><span className="grad-g">One operating system.</span></h2>
          <p>Sun, wind and rain don't arrive together or in equal amounts. WELOS combines a solar canopy that doubles as a rain catchment, an optional vertical-axis turbine, LiFePO4 storage and water treatment on one chassis, then lets WELOS OS decide every 250 ms when to charge, export, clean or store.</p>
        </div>
        <div className="about-bento">
          <div className="acard dark"><strong>2,285</strong><span>kWh/m²/yr of UAE sun in the concept study</span></div>
          <div className="acard"><strong>94.7–130</strong><span>mm of rain a year, arriving in short storms</span></div>
          <div className="acard"><strong>12.7%</strong><span>of solar output lost to dust, worst case</span></div>
          <div className="acard sun"><strong>{fmt(villa.totals.paybackYears, 1)} yrs</strong><span>indicative payback, Dubai villa</span></div>
        </div>
      </section>

      <Products />

      <SiteConfigurator />

      <section className="gsec" id="services" aria-labelledby="services-title">
        <div className="gsec-head"><span className="kicker">How it works</span><h2 id="services-title">From your address to a running system.</h2></div>
        <div className="steps-g">
          <article className="scard"><span className="snum">01</span><h3>Climate & roof mapping</h3><p>20 years of NASA climate data for your exact point, sized by the WELOS engine and explained by WELOS AI before anyone climbs a ladder.</p><a href="#configure">Try it now →</a></article>
          <article className="scard"><span className="snum">02</span><h3>Modular installation</h3><p>One chassis carries the canopy, storage, water train and controller. Add wind or condensate recovery only where your site supports it.</p><a href="/explore.html">See every part →</a></article>
          <article className="scard dark"><span className="snum">03</span><h3>WELOS OS, 24/7</h3><p>Offline-first control with hard-wired safety interlocks. It charges, exports, cleans and holds storm reserves on its own.</p><a href="/control.html">Open the simulator →</a><img src="/tiles/os.jpg" alt="WELOS OS simulator dashboard" loading="lazy" /></article>
        </div>
      </section>

      <section className="gsec" id="explore" aria-labelledby="explore-title">
        <div className="gsec-head"><span className="kicker">Explore</span><h2 id="explore-title">See how it's built.</h2></div>
        <div className="tools">
          {[["/model.html", "/tiles/model.jpg", "3D model", "Orbit the unit, click any part, switch hardware and software layers."], ["/explore.html", "/tiles/exploded.jpg", "Exploded view", "Every part, its capacity for your site, and the rule that sized it."], ["/configure.html", "/tiles/configurator.jpg", "3D configurator", "Switch modules on and off and watch the unit change."]].map(([href, img, t, d]) =>
            <a className="tool" href={href} key={href}><span className="tool-img"><img src={img} alt="" loading="lazy" /></span><span className="tool-copy"><strong>{t}</strong><span>{d}</span><em>Open →</em></span></a>)}
        </div>
      </section>
    </main>

    <footer className="gfoot">
      <div className="gfoot-top">
        <div><a className="gbrand light" href="#top"><Mark /><span>WELOS</span></a><p>Power and water from one roof. Concept development, 2026.</p></div>
        <nav aria-label="Footer"><a href="#products">Products</a><a href="#configure">Design yours</a><a href="#ai">WELOS AI</a><a href="/model.html">3D model</a><a href="/explore.html">Exploded view</a><a href="/control.html">OS simulator</a><a href="/classic.html">Classic site</a></nav>
        <a className="pill-sun" href="#configure">Design yours <Bolt /></a>
      </div>
      <p className="gfoot-fine">Prices are indicative UAE estimates for planning, not a quotation. Final design needs a site survey, structural review and local approvals.</p>
      <div className="gfoot-mark" aria-hidden="true">WELOS</div>
    </footer>
  </div>;
}

export default App;
