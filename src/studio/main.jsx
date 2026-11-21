import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box, Columns2, SlidersHorizontal } from "lucide-react";
import { ModelView } from "../model/main.jsx";
import SiteConfigurator from "../site/SiteConfigurator.jsx";
import { sizeSystem, TIERS } from "../site/sizing.js";
import { loadBuild, DEFAULT_PRESET } from "../site/presets.js";
import "../ai/mount.jsx";
import "../design/tokens.css";
import "./studio.css";
import "./config-light.css";

const VIEWS = [
  { id: "both", label: "Side by side", short: "Both", Icon: Columns2 },
  { id: "model", label: "3D model", short: "3D", Icon: Box },
  { id: "configure", label: "Configure", short: "Configure", Icon: SlidersHorizontal },
];
const fromHash = () => {
  const h = location.hash.replace("#", "");
  return VIEWS.some((v) => v.id === h) ? h : "both";
};
const buildNow = () => loadBuild() || { climate: DEFAULT_PRESET.climate, tier: "S", package: "recommended", inputs: {}, choices: {} };
const modulesFor = (build) => {
  const r = sizeSystem(build.climate, build.tier, build.inputs || {}, build.choices || {}, build.package);
  const by = Object.fromEntries(r.components.map((c) => [c.id, c]));
  return { solar: true, wind: !!by.wind?.included, water: !!by.water?.included, hydro: false };
};

function Studio() {
  const [view, setView] = useState(fromHash);
  const [build, setBuild] = useState(buildNow);
  const modules = useMemo(() => modulesFor(build), [build]);

  useEffect(() => {
    const onHash = () => setView(fromHash());
    const onBuild = (e) => setBuild(e.detail?.climate ? e.detail : buildNow());
    addEventListener("hashchange", onHash);
    addEventListener("welos:build", onBuild);
    // /studio.html?tier=M opens the configurator on that scale
    const tier = new URLSearchParams(location.search).get("tier");
    if (TIERS[tier]) setTimeout(() => dispatchEvent(new CustomEvent("welos:tier", { detail: tier })), 0);
    return () => { removeEventListener("hashchange", onHash); removeEventListener("welos:build", onBuild); };
  }, []);
  useEffect(() => {
    document.title = `WELOS Studio — ${VIEWS.find((v) => v.id === view).label}`;
    document.documentElement.dataset.studio = view;
  }, [view]);
  const choose = (id) => { setView(id); history.replaceState(null, "", `${location.pathname}${location.search}#${id}`); };

  return (
    <div className={`studio mode-${view}`}>
      <header className="studio-head">
        <a className="page-brand" href="/" aria-label="WELOS home"><img src="/brand/welos-header-ink.png" alt="welos" width="111" height="24" /></a>
        <div className="seg" role="tablist" aria-label="Studio view">
          {VIEWS.map(({ id, label, short, Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={`${view === id ? "on" : ""} v-${id}`} onClick={() => choose(id)}>
              <Icon size={15} aria-hidden="true" /><span className="l">{label}</span><span className="s">{short}</span>
            </button>
          ))}
        </div>
        <nav className="studio-links" aria-label="Site">
          <a href="/">Overview</a>
          <a href="/control.html">Control OS</a>
          <button type="button" className="ai-btn" data-ai-open>Ask WELOS</button>
        </nav>
      </header>
      <div className="studio-body">
        <section className="pane pane-model" aria-label="3D model">
          <ModelView modules={modules} />
          <p className="pane-note">Showing your configured modules · WELOS {build.tier}</p>
        </section>
        <section className="pane pane-config studio-cfg" aria-label="Configurator">
          <SiteConfigurator />
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("studio-root")).render(<Studio />);
