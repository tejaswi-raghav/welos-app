import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import SiteConfigurator from "./site/SiteConfigurator.jsx";
import "./ai/mount.jsx";
import { sizeSystem, TIERS } from "./site/sizing.js";
import { DEFAULT_PRESET } from "./site/presets.js";

const aed = (x) => `AED ${Number(x).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const priceFrom = (tier, pkg = "essential") => sizeSystem(DEFAULT_PRESET.climate, tier, {}, {}, pkg).totals.totalAed;

const NAV = [
  ["Design yours", "#configure"],
  ["WELOS AI", "#ai"],
  ["WELOS OS", "#os"],
  ["Why WELOS", "#problem"],
  ["Explore", "#explore"],
];

const TIER_CARDS = [
  { id: "S", img: "/explore/ref-full.jpg", line: "One villa. Power, water and storage in a single canopy." },
  { id: "M", img: "/explore/ref-canopy.jpg", line: "Apartment blocks and villa clusters sharing one system." },
  { id: "L", img: "/explore/ref-power.jpg", line: "Offices, malls and campuses with commercial-scale storage." },
];

const TILES = [
  { href: "/model.html", img: "/tiles/model.jpg", alt: "The WELOS 3D model in the browser", badge: "Live 3D", title: "3D model", text: "Orbit the assembled unit, click any part and switch between hardware and software layers.", facts: ["27 components", "6 subsystems", "Hardware + OS stack"], cta: "Open model" },
  { href: "/explore.html", img: "/tiles/exploded.jpg", alt: "WELOS exploded view with every component separated", badge: "Scroll story", title: "Exploded view", text: "Watch the unit come apart and rebuild, with each part's capacity for your site and the rule that sized it.", facts: ["17 scenes", "174 meshes", "Sized to your site"], cta: "Take it apart" },
  { href: "/configure.html", img: "/tiles/configurator.jpg", alt: "WELOS 3D configurator with add-on switches", badge: "Interactive", title: "3D configurator", text: "Switch solar, wind, rain recovery and micro-hydro on and off and see the unit change live.", facts: ["4 add-ons", "NASA climate data", "Live 3D preview"], cta: "Open configurator" },
];

const EVIDENCE = [
  ["2,285", "kWh/m²/yr", "Solar irradiation in the UAE concept study"],
  ["1.1–4.5", "m/s", "Variable wind, measured onshore"],
  ["94.7–130", "mm/yr", "Scarce rain, arriving in short storms"],
  ["0.29–12.7", "%", "Solar output lost to dust"],
];

function Brand() {
  return <a className="nav-brand" href="#top" aria-label="WELOS home"><img src="/welos-brand-transparent.png" alt="" /><span>WELOS</span></a>;
}

function Header() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return <>
  <header className="nav">
    <Brand />
    <nav className="nav-links" aria-label="Main">{NAV.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
    <div className="nav-right">
      <a className="nav-btn" href="/model.html">3D model</a>
      <button type="button" className="nav-btn nav-menu" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(true)}>Menu</button>
    </div>
  </header>
    <div id="menu" className={`menu ${open ? "on" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="menu-panel">
        <button type="button" className="menu-close" aria-label="Close menu" onClick={() => setOpen(false)}>✕</button>
        {NAV.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
        <a href="/model.html">3D model</a><a href="/explore.html">Exploded view</a><a href="/control.html">Control OS</a>
      </div>
    </div>
  </>;
}

function Grad({ children }) {
  return <span className="grad">{children}</span>;
}

function chooseTier(id) {
  window.dispatchEvent(new CustomEvent("welos:tier", { detail: id }));
  document.getElementById("configure")?.scrollIntoView({ behavior: "smooth" });
}

function App() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) return items.forEach((el) => el.classList.add("in"));
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return <>
    <Header />
    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Power and water<br />from <Grad>one roof.</Grad></h1>
          <p>Solar, wind and rain, sized to your climate and run by WELOS OS.</p>
        </div>
        <img className="hero-img" src="/explore/ref-base.jpg" alt="The WELOS rooftop unit: solar canopy, wind turbine, water treatment and power cabinet on one chassis" />
        <div className="hero-foot">
          <div className="hero-ctas"><a className="btn btn-dark" href="#configure">Design yours</a><a className="btn btn-light" href="/explore.html">Explore the system</a></div>
          <p className="hero-note">From {aed(priceFrom("S"))} for a villa in Dubai · Essential package, installed</p>
        </div>
      </section>

      <section className="wrap tiers reveal" aria-labelledby="tiers-title">
        <h2 id="tiers-title" className="h2">One platform, <Grad>three scales.</Grad></h2>
        <div className="tier-grid">
          {TIER_CARDS.map((card) => {
            const tier = TIERS[card.id];
            return <article className="tier-card" key={card.id}>
              <div className="tier-media"><img src={card.img} alt="" loading="lazy" /></div>
              <div className="tier-body">
                <h3>WELOS {card.id} <small>{tier.name}</small></h3>
                <p>{card.line}</p>
                <p className="tier-price">From {aed(priceFrom(card.id))}</p>
                <div className="tier-ctas"><button type="button" className="btn btn-dark" onClick={() => chooseTier(card.id)}>Configure</button><a className="btn btn-light" href="/model.html">See it in 3D</a></div>
              </div>
            </article>;
          })}
        </div>
      </section>

      <SiteConfigurator />

      <section className="wrap os reveal" id="os" aria-labelledby="os-title">
        <div className="os-card">
          <div className="os-copy">
            <h2 id="os-title" className="h2">Runs itself. <Grad>Even offline.</Grad></h2>
            <p>WELOS OS decides every 250 ms when to charge, export, clean the panels, divert the first flush or hold a storm reserve. Safety interlocks stay hard-wired and independent.</p>
            <ul className="os-loop" aria-label="Control loop"><li>Sense</li><li>Compare</li><li>Decide</li><li>Act</li></ul>
            <div className="ctas"><a className="btn btn-dark" href="/control.html">Open the OS simulator</a><a className="btn btn-light" href="#ai">Ask WELOS AI</a></div>
          </div>
          <a className="os-media" href="/control.html" aria-label="Open the WELOS OS simulator"><img src="/tiles/os.jpg" alt="The WELOS OS simulator dashboard: operating state, live resource bus and battery protection" loading="lazy" /><em>Live simulation · 60× speed</em></a>
        </div>
      </section>

      <section className="wrap problem reveal" id="problem" aria-labelledby="problem-title">
        <div className="split">
          <h2 id="problem-title" className="h2">The resources exist.<br /><Grad>Coordination doesn't.</Grad></h2>
          <p className="lede">Sun, wind and rain don't arrive together or in equal amounts. Standalone systems compete for roof space and miss each other's opportunities. WELOS selects the right resources for each site and coordinates them as one.</p>
        </div>
        <div className="evidence">{EVIDENCE.map(([value, unit, label]) => <div className="glass-card stat" key={label}><strong>{value}<small>{unit}</small></strong><span>{label}</span></div>)}</div>
        <p className="fine">Reference ranges from the WELOS UAE concept study, not guaranteed performance at a particular address.</p>
      </section>

      <section className="wrap explore reveal" id="explore" aria-labelledby="explore-title">
        <h2 id="explore-title" className="h2">See how it's <Grad>built.</Grad></h2>
        <div className="tiles">
          {TILES.map((tile) => <a className="tile" href={tile.href} key={tile.href}>
            <span className="tile-shot"><img src={tile.img} alt={tile.alt} loading="lazy" /><em>{tile.badge}</em></span>
            <span className="tile-copy">
              <strong>{tile.title}</strong>
              <span>{tile.text}</span>
              <ul className="tile-facts">{tile.facts.map((f) => <li key={f}>{f}</li>)}</ul>
              <span className="btn btn-light">{tile.cta}</span>
            </span>
          </a>)}
        </div>
      </section>
    </main>
    <footer className="foot">
      <span>WELOS © 2026</span><a href="#configure">Design yours</a><a href="/model.html">3D model</a><a href="/explore.html">Exploded view</a><a href="/control.html">Control OS</a><span>Concept development. Prices are indicative.</span>
    </footer>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
