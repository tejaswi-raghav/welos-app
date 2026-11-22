import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./product.css";
import { useStage, useAnnotations } from "../twin/useStage.js";
import { simulateDay } from "../twin/sim.js";
import { sizeSystem, PACKAGES, RATES, CURRENCY } from "../site/sizing.js";
import { REGIONS, regionById, UTILITIES, MONTHS, VAT } from "../site/regions.js";
import { BUILDING_TYPES, buildingById, recommend } from "../site/recommend.js";
import { saveBuild, loadBuild } from "../site/presets.js";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const money = (x) => `${CURRENCY} ${fmt(x)}`;
const yrs = (x) => (x ? `${fmt(x, 1)} yrs` : "—");
const VIEW_FRAME = simulateDay("clear").frames[58];
const POSES = { S: { pos: [13.5, 7, 16], target: [0.4, 0.4, 0], fov: 32 }, M: { pos: [22, 15, 26], target: [1, -0.5, -1.5], fov: 32 }, L: { pos: [26, 19, 30], target: [1, -0.8, -1.5], fov: 32 } };
const INPUTS = [["roofM2", "Usable roof", "m²", 5, 200000, 1], ["loadKwhDay", "Average electricity use", "kWh/day", 0, 500000, 1], ["waterLDay", "Non-potable water use", "L/day", 0, 5000000, 10]];

function initial() {
  const q = new URLSearchParams(location.search);
  const saved = loadBuild();
  const base = { region: "dubai", building: "villa", customer: "expat", backup: false, battery: null, package: null, inputs: {}, wind: null, condensate: null };
  const s = saved?.region ? { ...base, ...saved } : base;
  if (buildingById[q.get("building")]) s.building = q.get("building");
  if (regionById[q.get("region")]) s.region = q.get("region");
  return s;
}

function Product() {
  const [canvasRef, stage] = useStage({ env: "rooftop", orbit: true });
  const [st, setSt] = useState(initial);
  const [open, setOpen] = useState({});
  const annoRef = useRef(null);
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));

  const B = buildingById[st.building];
  const region = regionById[st.region];
  const utility = UTILITIES[region.utility];
  const ctx = { utilityId: region.utility, customer: st.customer, backup: st.backup };
  const rec = useMemo(() => recommend(st.region, st.building, { customer: st.customer, backup: st.backup, inputs: st.inputs }), [st.region, st.building, st.customer, st.backup, st.inputs]);
  const battery = st.battery ?? rec.battery;
  const pkg = st.package ?? rec.packageId;
  const choices = { battery, ...(st.wind != null ? { wind: st.wind } : {}), ...(st.condensate != null ? { condensate: st.condensate } : {}) };
  const result = useMemo(() => sizeSystem(region.climate, B.tier, st.inputs, choices, pkg, ctx), [st, battery, pkg]);
  const by = Object.fromEntries(result.components.map((c) => [c.id, c]));
  const t = result.totals;
  const isRec = battery === rec.battery && pkg === rec.packageId;

  // keep the owner OS and AI in step with this build
  useEffect(() => {
    saveBuild({ ...st, place: `${region.name}, UAE`, lat: region.lat, lon: region.lon, climate: region.climate, source: "nasa", tier: B.tier, package: pkg, battery, inputs: st.inputs, choices });
  }, [st, battery, pkg]);

  const bays = Math.max(1, Math.ceil(by.solar.metrics.modules / 6));
  useEffect(() => { if (stage) { stage.setFrame(VIEW_FRAME); stage.setFlows("off"); stage.setEnvironment(0, true); stage.setRim(0.8, true); } }, [stage]);
  useEffect(() => {
    if (!stage) return;
    const shown = stage.setBays(Math.max(0, bays - 1));
    stage.setModules({ wind: !!by.wind.included, rinse: /rinse/i.test(by.cleaning.name), battery: !!by.battery.included });
    stage.setPose(POSES[B.tier === "S" && bays > 1 ? "M" : B.tier], 1400);
    stage.__shownBays = shown;
  }, [stage, bays, by.wind.included, by.cleaning.name, by.battery.included, B.tier]);

  const annos = [
    { id: "a-pv", key: "pv-array", at: [2.9, 1.9, 1.75], title: `${fmt(by.solar.metrics.pvKwp, 1)} kWp`, sub: `${by.solar.metrics.modules} modules${bays > 1 ? ` · ${bays} canopy bays` : ""}` },
    by.battery.included
      ? { id: "a-batt", key: "lifepo4-battery", at: [1.2, -1.36, 1.97], title: `${fmt(by.battery.metrics.batteryKwh)} kWh`, sub: `≈ ${fmt(t.backupHours)} h backup` }
      : { id: "a-batt", key: "power-cabinet", at: [1.2, -1.36, 1.97], title: "No battery", sub: "grid stores the surplus", ghost: true },
    { id: "a-tank", key: "water-tank", at: [-2.8, 0.4, 1.67], title: `${fmt(by.water.metrics.tankL)} L`, sub: "rain tank", water: true },
    ...(by.wind.included ? [{ id: "a-wind", key: "vawt-rotor", at: [3.25, 3.3, -0.9], title: by.wind.capacity.text, sub: by.wind.output }] : []),
  ];
  useAnnotations(stage, annoRef, annos);

  // every variation for this location
  const matrix = useMemo(() => BUILDING_TYPES.map((b) => {
    const r = recommend(st.region, b.id, { customer: st.customer, backup: st.backup });
    return { b, rec: r, cells: [false, true].map((bat) => (bat ? r.withBattery : r.without)) };
  }), [st.region, st.customer, st.backup]);
  // every location for this configuration
  const places = useMemo(() => REGIONS.map((r) => {
    const res = sizeSystem(r.climate, B.tier, st.inputs, choices, pkg, { utilityId: r.utility, customer: st.customer, backup: st.backup });
    return { r, u: UTILITIES[r.utility], res };
  }), [st, battery, pkg]);

  function exportJson() {
    const payload = { generated: new Date().toISOString(), note: "Indicative planning estimate from the WELOS sizing engine. Not a quotation.", location: region.name, utility: utility.name, netMetering: utility.netMetering, building: B.label, package: pkg, battery,
      components: result.components.filter((c) => c.included).map((c) => ({ name: c.name, capacity: c.capacity.text, spec: c.spec, costAed: c.costAed, why: c.why })),
      totals: t, monthly: result.monthly.map((m) => ({ month: MONTHS[m.m], solarKwh: Math.round(m.pv), useKwh: Math.round(m.load), billBeforeAed: Math.round(m.billBefore), billAfterAed: Math.round(m.billAfter) })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `welos-${B.id}-${region.id}-${battery ? "battery" : "no-battery"}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="product">
      <section className="pd-hero">
        <div className="pd-stage twin-stage">
          <i className="stage-sun" aria-hidden="true" />
          <canvas ref={canvasRef} aria-label={`3D preview of WELOS ${B.tier} for a ${B.label.toLowerCase()} in ${region.name}${by.battery.included ? " with battery storage" : " without a battery"}`} />
          <div className="annos" ref={annoRef} aria-hidden="true">
            {annos.map((a) => <div key={a.id} data-id={a.id} className={`dimtag ${a.water ? "water" : ""} ${a.ghost ? "ghost" : ""}`}><i /><div><b className="t-num">{a.title}</b><span>{a.sub}</span></div></div>)}
          </div>
          {stage === false && <div className="pd-nogl"><img src="/explore/ref-base.jpg" alt="" /></div>}
          <div className="pd-badges">
            <span className="mode-pill" data-mode="NORMAL"><i />{by.battery.included ? "Hybrid · with battery" : "Grid-tied · no battery"}</span>
            <span className="t-label">{region.name} · {utility.name}</span>
          </div>
          {bays > 1 && stage && stage.__shownBays < bays - 1 && <p className="pd-note t-fine">Showing {stage.__shownBays + 1} of {bays} canopy bays on this illustrative roof.</p>}
        </div>

        <aside className="pd-buy" aria-label="Choose your WELOS">
          <p className="t-label">WELOS {B.tier} · product</p>
          <h1 className="t-h1">{B.label}<span className="t-soft"> system.</span></h1>
          <p className="pd-sub">{B.sub}. Solar canopy, rain catchment and the WELOS controller, sized to {region.name}'s sun and {utility.name}'s tariff.</p>

          <fieldset className="pd-field"><legend className="t-label">Building</legend>
            <div className="pd-opts three">{BUILDING_TYPES.map((b) => <button key={b.id} type="button" className="opt" aria-pressed={st.building === b.id} onClick={() => set({ building: b.id, battery: null, package: null, inputs: {}, wind: null, condensate: null })}><b>{b.label}</b><small>{b.sub}</small></button>)}</div>
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Location</legend>
            <div className="pd-loc">
              <select value={st.region} onChange={(e) => set({ region: e.target.value, battery: null, package: null })} aria-label="Emirate">{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name} · {UTILITIES[r.utility].name}</option>)}</select>
              {utility.id === "taqa" && <div className="seg" aria-label="Account type">{[["expat", "Expat"], ["national", "UAE National"]].map(([id, l]) => <button key={id} type="button" aria-pressed={st.customer === id} onClick={() => set({ customer: id, package: null })}>{l}</button>)}</div>}
            </div>
            <p className={`pd-net ${utility.netMetering}`}><i />{utility.scheme}. {utility.schemeNote}</p>
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Storage</legend>
            <div className="pd-opts two">
              {[false, true].map((bat) => {
                const r = bat ? rec.withBattery : rec.without;
                return <button key={String(bat)} type="button" className="opt" aria-pressed={battery === bat} onClick={() => set({ battery: bat })}>
                  <b>{bat ? "With battery" : "Without battery"} {rec.battery === bat && <em className="rec">Recommended</em>}</b>
                  <span className="t-num">{money(r.totals.totalAed)}</span>
                  <small>{bat ? `${fmt(r.components.find((c) => c.id === "battery").metrics.batteryKwh)} kWh · ≈ ${fmt(r.totals.backupHours)} h backup · payback ${yrs(r.totals.paybackYears)}` : `Grid-tied · payback ${yrs(r.totals.paybackYears)}`}</small>
                </button>;
              })}
            </div>
            <label className="pd-switch"><button type="button" className="toggle" role="switch" aria-checked={st.backup} onClick={() => set({ backup: !st.backup, battery: null })} /><span>I need power during outages</span></label>
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Package</legend>
            <div className="seg pd-pkg">{Object.values(PACKAGES).map((p) => <button key={p.id} type="button" aria-pressed={pkg === p.id} onClick={() => set({ package: p.id })}>{p.name}{rec.packageId === p.id ? " ·" : ""}</button>)}</div>
            <p className="t-fine">{PACKAGES[pkg].blurb}</p>
          </fieldset>

          <div className="pd-price">
            <div><span className="t-label">Indicative installed price</span><b className="t-num">{money(t.totalAed)}</b><small>≈ {money(t.monthlyAed)}/mo over {RATES.financeYears} yrs (illustrative) · incl. {Math.round(RATES.installRate[B.tier] * 100)}% install</small></div>
            <dl>
              <div><dt className="t-label">Output</dt><dd className="t-num">{fmt(t.energyKwhYear)} <small>kWh/yr</small></dd></div>
              <div><dt className="t-label">Bill</dt><dd className="t-num">{money(t.billBeforeAed)} → {money(t.billAfterAed)} <small>/yr</small></dd></div>
              <div><dt className="t-label">Payback</dt><dd className="t-num">{yrs(t.paybackYears)}</dd></div>
              <div><dt className="t-label">25-yr net</dt><dd className={`t-num ${t.lifetimeNetAed < 0 ? "c-warn" : ""}`}>{money(t.lifetimeNetAed)}</dd></div>
            </dl>
          </div>

          <div className={`pd-rec ${isRec ? "on" : ""}`}>
            <p className="t-label">{isRec ? "You're on the recommended build" : "Recommended for this building"}</p>
            <ul>{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {!isRec && <button type="button" className="btn btn--sm" onClick={() => set({ battery: null, package: null })}>Use the recommended build</button>}
          </div>

          <div className="pd-cta">
            <a className="btn" href="/signin.html">See it in welOS <span className="arr" aria-hidden="true">→</span></a>
            <button type="button" className="btn btn--line" onClick={exportJson}>Download summary</button>
          </div>
        </aside>
      </section>

      <section className="pd-sec" aria-labelledby="h-var">
        <header><p className="t-label">01 · Variations</p><h2 id="h-var" className="t-h2">Every build for {region.name}.</h2><p className="t-body">Three building types, with and without a battery, each sized by the engine on {utility.name}'s tariff. Select one to load it.</p></header>
        <div className="vtable" role="table" aria-label="Variations">
          <div className="vrow head" role="row"><span role="columnheader">Building</span><span role="columnheader">Without battery</span><span role="columnheader">With battery</span></div>
          {matrix.map(({ b, rec: r, cells }) => <div className="vrow" role="row" key={b.id}>
            <span role="rowheader"><b>{b.label}</b><small>{fmt(cells[0].components[0].metrics.pvKwp, 1)} kWp · {fmt(cells[0].site.loadKwhDay)} kWh/day typical</small></span>
            {cells.map((res, k) => {
              const bat = k === 1, cur = st.building === b.id && battery === bat, isR = r.battery === bat;
              return <button role="cell" type="button" key={k} className={`vcell ${cur ? "cur" : ""}`} onClick={() => set({ building: b.id, battery: bat, package: null, inputs: {}, wind: null, condensate: null })}>
                {isR && <em className="rec">Recommended</em>}
                <span className="vlab t-label">{bat ? "With battery" : "Without battery"}</span>
                <b className="t-num">{money(res.totals.totalAed)}</b>
                <span>Saves {money(res.totals.annualSavingsAed)}/yr · payback {yrs(res.totals.paybackYears)}</span>
                <small>{bat ? `≈ ${fmt(res.totals.backupHours)} h backup` : "No backup during outages"}</small>
              </button>;
            })}
          </div>)}
        </div>
      </section>

      <section className="pd-sec" aria-labelledby="h-add">
        <header><p className="t-label">02 · Add-ons</p><h2 id="h-add" className="t-h2">Add only what earns its place.</h2><p className="t-body">Prices are for this build. Each add-on says whether the engine recommends it here, and why.</p></header>
        <div className="addons">
          {[
            { id: "battery", c: by.battery, on: by.battery.included, toggle: () => set({ battery: !by.battery.included }) },
            { id: "wind", c: by.wind, on: by.wind.included, toggle: () => set({ wind: !by.wind.included }) },
            { id: "condensate", c: by.condensate, on: by.condensate.included, toggle: () => set({ condensate: !by.condensate.included }) },
            { id: "cleaning", c: by.cleaning, on: true, fixed: pkg === "essential" ? "Upgrade to Recommended for automatic cleaning" : "Included with this package" },
            { id: "water", c: by.water, on: true, fixed: pkg === "essential" ? "Light kit (sediment filter). Recommended adds carbon + UV-C" : "Full treatment train included" },
          ].map(({ id, c, on, toggle, fixed }) => <article key={id} className={`addon ${on ? "on" : ""}`}>
            <div className="ad-top"><h3>{c.name}</h3>{toggle ? <button type="button" className="toggle" role="switch" aria-checked={on} aria-label={`Include ${c.name}`} onClick={toggle} /> : <span className="t-label">{on ? "Included" : ""}</span>}</div>
            <p className="ad-cap t-num">{c.capacity.text} · {money(c.costAed)}</p>
            <p className="ad-out">{c.output}</p>
            {c.core === false && <span className={`comp-tag ${c.recommended ? "yes" : ""}`}>{c.recommended ? "Recommended here" : "Not recommended here"}</span>}
            {fixed && <p className="t-fine">{fixed}</p>}
            <details><summary>Why</summary><p>{c.why}</p></details>
          </article>)}
        </div>
      </section>

      <section className="pd-sec" aria-labelledby="h-loc">
        <header><p className="t-label">03 · Location</p><h2 id="h-loc" className="t-h2">Same build, seven emirates.</h2><p className="t-body">Sun varies a little across the UAE; tariffs and export rules vary a lot. This is your current build priced against each utility.</p></header>
        <div className="ltable" role="table" aria-label="Location comparison">
          <div className="lrow head" role="row">{["Location", "Utility", "Export credit", "Sun", "Output", "Bill saved", "Payback"].map((h) => <span key={h} role="columnheader" className="t-label">{h}</span>)}</div>
          {places.map(({ r, u, res }) => <button key={r.id} type="button" role="row" className={`lrow ${r.id === st.region ? "cur" : ""}`} onClick={() => set({ region: r.id, battery: null, package: null })}>
            <span role="cell"><b>{r.name}</b></span>
            <span role="cell">{u.name}<small>top rate {fmt(((u.slabs?.at(-1)?.[1] ?? u.daily.expat.villa.at(-1)[1]) + u.fuelSurcharge) * (1 + VAT) * 100, 1)} fils</small></span>
            <span role="cell"><i className={`net ${u.netMetering}`} />{u.netMetering === "yes" ? "Net metering" : "Not verified"}</span>
            <span role="cell" className="t-num">{fmt(r.climate.solarDailyKwhM2, 2)}<small>kWh/m²/day</small></span>
            <span role="cell" className="t-num">{fmt(res.totals.energyKwhYear)}<small>kWh/yr</small></span>
            <span role="cell" className="t-num">{money(res.totals.electricitySavingsAed)}<small>/yr</small></span>
            <span role="cell" className="t-num">{yrs(res.totals.paybackYears)}</span>
          </button>)}
        </div>
        <p className="t-fine">Sun: NASA POWER 2001–2025 climatology (its solar grid is coarse, so Sharjah, Ajman and RAK share Dubai's value). Tariffs include fuel surcharge and 5% VAT. Abu Dhabi rates shown for {st.customer === "national" ? "UAE National" : "expat"} accounts.</p>
      </section>

      <section className="pd-sec" aria-labelledby="h-mo">
        <header><p className="t-label">04 · Through the year</p><h2 id="h-mo" className="t-h2">Solar against your bill, month by month.</h2><p className="t-body">{utility.netMetering === "yes" ? "Summer surplus becomes a credit that pays winter bills." : "Without an export credit, only solar used on site lowers the bill."}</p></header>
        <MonthChart months={result.monthly} />
      </section>

      <section className="pd-sec pd-details" aria-labelledby="h-det">
        <header><p className="t-label">05 · Specification</p><h2 id="h-det" className="t-h2">What is in the box, and why.</h2></header>
        <div className="pd-cols">
          <div>
            <h3 className="t-label">Your building</h3>
            <div className="st-inputs">{INPUTS.map(([id, label, unit, min, max, step]) => <label key={id}><span>{label}</span><span className="st-in"><input type="number" min={min} max={max} step={step} value={st.inputs[id] ?? result.site[id]} onChange={(e) => set({ inputs: { ...st.inputs, [id]: e.target.value === "" ? undefined : Number(e.target.value) } })} /><em>{unit}</em></span></label>)}</div>
            <h3 className="t-label" style={{ marginTop: 22 }}>Price breakdown</h3>
            <ul className="bk">{result.components.filter((c) => c.included).map((c) => <li key={c.id}><span>{c.name}</span><span className="t-num">{money(c.costAed)}</span></li>)}
              <li><span>Engineering, install, commissioning</span><span className="t-num">{money(t.installAed)}</span></li>
              <li className="tot"><span>Indicative installed price</span><span className="t-num">{money(t.totalAed)}</span></li></ul>
          </div>
          <div>
            {result.components.map((p) => <article key={p.id} className={`comp ${p.included ? "" : "off"}`}>
              <div className="comp-row"><div><h3>{p.name}</h3><p className="t-num comp-cap">{p.capacity.text}</p><p className="comp-spec">{p.spec}</p></div><span className="t-num">{p.included ? money(p.costAed) : "Not included"}</span></div>
              <button type="button" className="why-btn" aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>Why this size {open[p.id] ? "−" : "+"}</button>
              {open[p.id] && <div className="why"><p>{p.why}</p><ul>{p.rules.map((r) => <li key={r.test} className={r.pass ? "pass" : "fail"}><b>{r.pass ? "✓" : "✕"}</b><span>{r.test}<i>→ {r.effect}</i></span></li>)}</ul></div>}
            </article>)}
          </div>
        </div>
        <div className="pd-sources">
          <p className="t-label">Assumptions and sources</p>
          <p>Installed prices are calibrated to UAE installer guides (10 kW villa ≈ AED 40,000–55,000) plus WELOS's elevated canopy, water system and controller. Battery storage is priced at AED {RATES.batteryPerKwh}/kWh installed (retail modules ≈ AED 410–530/kWh). Bills use each utility's published slab or daily tariff, fuel surcharge and 5% VAT, excluding meter and housing fees. Household use follows an assumed UAE seasonal profile (summer ≈ 1.6× winter). Not a quotation; final designs need a site survey, structural review and utility approval.</p>
        </div>
      </section>
    </div>
  );
}

function MonthChart({ months }) {
  const [hi, setHi] = useState(null);
  const W = 960, H = 260, pad = 30;
  const maxE = Math.max(...months.flatMap((m) => [m.pv, m.load])) * 1.1;
  const maxB = Math.max(...months.map((m) => m.billBefore)) * 1.15;
  const bw = (W - pad * 2) / 12;
  const yE = (v) => H - pad - (v / maxE) * (H - pad * 2);
  const yB = (v) => H - pad - (v / maxB) * (H - pad * 2);
  const line = (k) => months.map((m, i) => `${i ? "L" : "M"}${pad + bw * i + bw / 2} ${yB(m[k])}`).join("");
  const h = hi != null ? months[hi] : null;
  return <figure className="mchart">
    <div className="mkeys"><span className="k pv">Solar output</span><span className="k use">Your use</span><span className="k bb">Bill without WELOS</span><span className="k ba">Bill with WELOS</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly solar output, consumption and bills" onPointerLeave={() => setHi(null)}>
      {months.map((m, i) => { const x = pad + bw * i; return <g key={i} onPointerEnter={() => setHi(i)} className={hi === i ? "hi" : ""}>
        <rect className="hit" x={x} y={pad} width={bw} height={H - pad * 2} />
        <rect className="b-use" x={x + bw * 0.16} width={bw * 0.32} y={yE(m.load)} height={H - pad - yE(m.load)} rx="3" style={{ animationDelay: `${i * 35}ms` }} />
        <rect className="b-pv" x={x + bw * 0.52} width={bw * 0.32} y={yE(m.pv)} height={H - pad - yE(m.pv)} rx="3" style={{ animationDelay: `${i * 35 + 120}ms` }} />
        <text x={x + bw / 2} y={H - 10} className="mx">{MONTHS[i]}</text>
      </g>; })}
      <path className="l-bb" d={line("billBefore")} pathLength="1" />
      <path className="l-ba" d={line("billAfter")} pathLength="1" />
    </svg>
    <figcaption className="mread">{h ? <><b>{MONTHS[h.m]}</b> · solar {fmt(h.pv)} kWh · use {fmt(h.load)} kWh · bill {money(h.billBefore)} → <b>{money(h.billAfter)}</b>{h.exported > 1 ? ` · ${fmt(h.exported)} kWh ${h.creditBank > 0 ? "banked as credit" : "exported"}` : ""}{h.creditUsed > 1 ? ` · ${fmt(h.creditUsed)} kWh of credit used` : ""}</> : "Hover a month to read it."}</figcaption>
  </figure>;
}

createRoot(document.getElementById("product-root")).render(<Product />);
