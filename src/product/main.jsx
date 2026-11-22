import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./product.css";
import { useStage, useAnnotations } from "../twin/useStage.js";
import { simulateDay } from "../twin/sim.js";
import { sizeSystem, PACKAGES, RATES, CURRENCY, packageKey, explainSavings, EXCLUSIONS } from "../site/sizing.js";
import { getAddOns } from "../site/addons.js";
import { REGIONS, regionById, UTILITIES, MONTHS, VAT } from "../site/regions.js";
import { BUILDING_TYPES, buildingById, recommend, SUGGESTION_CRITERIA } from "../site/recommend.js";
import { saveBuild, loadBuild } from "../site/presets.js";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const money = (x) => `${CURRENCY} ${fmt(x)}`;
const yrs = (x) => (x ? `${x.toFixed(1)} yrs` : "—");
const VIEW_FRAME = simulateDay("clear").frames[58];
const POSES = { S: { pos: [13.5, 7, 16], target: [0.4, 0.4, 0], fov: 32 }, M: { pos: [22, 15, 26], target: [1, -0.5, -1.5], fov: 32 }, L: { pos: [26, 19, 30], target: [1, -0.8, -1.5], fov: 32 } };
const INPUTS = [["loadKwhDay", "Electricity use", "kWh/day", 0, 500000, 1, "Annual kWh on your bills ÷ 365"], ["waterLDay", "Non-potable water use", "L/day", 0, 5000000, 10, "Irrigation, flushing, washing"], ["roofM2", "Usable roof", "m²", 5, 200000, 1, "Shade-free area for the canopy"]];
const SOLAR_FIRST_EXCLUDES = ["Rain harvesting (gutter, first flush)", "Stored and treated non-potable water (tank, filters, UV-C, pump)", "Water monitoring and routing by the controller", "AC condensate recovery", "Water-fed uses from the tank: irrigation, flushing and panel rinsing"];

function initial() {
  const q = new URLSearchParams(location.search);
  const saved = loadBuild();
  const base = { region: "dubai", building: "villa", customer: "expat", backup: false, waterSavings: true, battery: null, package: null, inputs: {}, wind: null, condensate: null, cleaning: null, treatment: null };
  const s = saved?.region ? { ...base, ...saved } : base;
  // builds saved before 22 Nov 2026 used "recommended" for what is now Complete
  if (s.package) s.package = packageKey(s.package);
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
  const ctx = { utilityId: region.utility, customer: st.customer, backup: st.backup, waterSavings: st.waterSavings };
  const rec = useMemo(() => recommend(st.region, st.building, { customer: st.customer, backup: st.backup, inputs: st.inputs, waterSavings: st.waterSavings }), [st.region, st.building, st.customer, st.backup, st.inputs, st.waterSavings]);
  const battery = st.battery ?? rec.battery;
  const pkg = st.package ?? rec.packageId;
  const choices = { battery, ...Object.fromEntries(["wind", "condensate", "cleaning", "treatment"].filter((id) => typeof st[id] === "boolean").map((id) => [id, st[id]])) };
  const result = useMemo(() => sizeSystem(region.climate, B.tier, st.inputs, choices, pkg, ctx), [st, battery, pkg]);
  const by = Object.fromEntries(result.components.map((c) => [c.id, c]));
  const t = result.totals;
  const isRec = pkg === rec.packageId && result.components.every((c) => {
    const recommended = rec.result.components.find((p) => p.id === c.id);
    return c.included === recommended.included && c.metrics.autoClean === recommended.metrics.autoClean && c.metrics.fullTreatment === recommended.metrics.fullTreatment;
  });
  const ex = explainSavings(result);
  const typical = Object.fromEntries(INPUTS.map(([id]) => [id, !(st.inputs[id] > 0 || (id === "waterLDay" && st.inputs[id] === 0))]));
  const usingTypical = typical.loadKwhDay || typical.waterLDay;
  const addOns = useMemo(() => getAddOns(result), [result]);
  const storageOptions = [false, true].map((withBattery) => sizeSystem(region.climate, B.tier, st.inputs, { ...choices, battery: withBattery }, pkg, ctx));
  const resetAddOns = { wind: null, condensate: null, cleaning: null, treatment: null };

  // keep the owner OS and AI in step with this build
  useEffect(() => {
    saveBuild({ ...st, place: `${region.name}, UAE`, lat: region.lat, lon: region.lon, climate: region.climate, source: "nasa", tier: B.tier, package: pkg, battery, inputs: st.inputs, choices, waterSavings: st.waterSavings });
  }, [st, battery, pkg]);

  const bays = Math.max(1, Math.ceil(by.solar.metrics.modules / 6));
  useEffect(() => { if (stage) { stage.setFrame(VIEW_FRAME); stage.setFlows("off"); stage.setEnvironment(0, true); stage.setRim(0.8, true); } }, [stage]);
  useEffect(() => {
    if (!stage) return;
    const shown = stage.setBays(Math.max(0, bays - 1));
    stage.setModules({ wind: !!by.wind.included, rinse: /rinse/i.test(by.cleaning.name), battery: !!by.battery.included, water: result.hasWater });
    stage.setPose(POSES[B.tier === "S" && bays > 1 ? "M" : B.tier], 1400);
    stage.__shownBays = shown;
  }, [stage, bays, by.wind.included, by.cleaning.name, by.battery.included, result.hasWater, B.tier]);

  const annos = [
    { id: "a-pv", key: "pv-array", at: [2.9, 1.9, 1.75], title: `${fmt(by.solar.metrics.pvKwp, 1)} kWp`, sub: `${by.solar.metrics.modules} modules${bays > 1 ? ` · ${bays} canopy bays` : ""}` },
    by.battery.included
      ? { id: "a-batt", key: "lifepo4-battery", at: [1.2, -1.36, 1.97], title: `${fmt(by.battery.metrics.batteryKwh)} kWh`, sub: `≈ ${fmt(t.backupHours)} h backup` }
      : { id: "a-batt", key: "power-cabinet", at: [1.2, -1.36, 1.97], title: "No battery", sub: "grid stores the surplus", ghost: true },
    ...(result.hasWater ? [{ id: "a-tank", key: "water-tank", at: [-2.8, 0.4, 1.67], title: `${fmt(by.water.metrics.tankL)} L`, sub: "rain tank", water: true }] : []),
    ...(by.wind.included ? [{ id: "a-wind", key: "vawt-rotor", at: [3.25, 3.3, -0.9], title: by.wind.capacity.text, sub: by.wind.output }] : []),
  ];
  useAnnotations(stage, annoRef, annos);

  // every variation for this location: same package, add-ons, tariff and water setting as the selected
  // build. The current building type uses your inputs; the others use typical reference inputs.
  const matrix = useMemo(() => BUILDING_TYPES.map((b) => {
    const inputs = b.id === st.building ? st.inputs : {};
    const cells = [false, true].map((bat) => sizeSystem(region.climate, b.tier, inputs, { ...choices, battery: bat }, pkg, ctx));
    const suggestBattery = cells[0].components.find((c) => c.id === "battery").recommended;
    return { b, cells, suggestBattery, yours: b.id === st.building };
  }), [st, battery, pkg]);
  // every location for this configuration
  const places = useMemo(() => REGIONS.map((r) => {
    const res = sizeSystem(r.climate, B.tier, st.inputs, choices, pkg, { utilityId: r.utility, customer: st.customer, backup: st.backup, waterSavings: st.waterSavings });
    return { r, u: UTILITIES[r.utility], res };
  }), [st, battery, pkg]);

  function exportJson() {
    const payload = { generated: new Date().toISOString(), note: "Concept estimate from the WELOS sizing engine. Not a quotation or a guaranteed return; final design needs a site survey, structural review and utility approval.",
      location: region.name, utility: utility.name, customer: st.customer, tariffEvidence: utility.tariffEvidence, exportCredit: utility.exportEvidence,
      building: B.label, package: { id: pkg, name: PACKAGES[pkg].name, description: PACKAGES[pkg].blurb, ...(pkg === "solar-first" ? { excludes: SOLAR_FIRST_EXCLUDES } : {}) },
      battery, inputs: { ...result.site, typicalReferenceValues: Object.keys(typical).filter((k) => typical[k]) },
      suggestion: { packageId: rec.packageId, battery: rec.battery, criteria: SUGGESTION_CRITERIA, reasons: rec.reasons, youAreOnIt: isRec },
      components: result.components.filter((c) => c.included).map((c) => ({ name: c.name, capacity: c.capacity.text, spec: c.spec, costAed: c.costAed, required: !!c.required, why: c.why })),
      priceBreakdown: { hardwareAed: t.hardwareAed, installAed: t.installAed, installRate: RATES.installRate[B.tier], totalAed: t.totalAed },
      savings: { electricity: ex.electricity, water: ex.water, annualUsedForPayback: ex.annual, payback: ex.payback, lifetime: ex.lifetime, finance: ex.finance, exclusions: ex.exclusions },
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
          <p className="pd-sub">{B.sub}. {result.hasWater ? `Solar canopy, rain catchment and the WELOS controller, sized to ${region.name}'s sun and ${utility.name}'s tariff.` : `Solar canopy and the WELOS controller, without the water system, sized to ${region.name}'s sun and ${utility.name}'s tariff.`}</p>

          <fieldset className="pd-field"><legend className="t-label">Building</legend>
            <div className="pd-opts three">{BUILDING_TYPES.map((b) => <button key={b.id} type="button" className="opt" aria-pressed={st.building === b.id} onClick={() => set({ building: b.id, battery: null, package: null, inputs: {}, ...resetAddOns })}><b>{b.label}</b><small>{b.sub}</small></button>)}</div>
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Location</legend>
            <div className="pd-loc">
              <select value={st.region} onChange={(e) => set({ region: e.target.value, battery: null, package: null })} aria-label="Emirate">{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name} · {UTILITIES[r.utility].name}</option>)}</select>
              {utility.id === "taqa" && <div className="seg" aria-label="Account type">{[["expat", "Expat"], ["national", "UAE National"]].map(([id, l]) => <button key={id} type="button" aria-pressed={st.customer === id} onClick={() => set({ customer: id, package: null })}>{l}</button>)}</div>}
            </div>
            <p className={`pd-net ${utility.netMetering}`}><i />{utility.scheme}. {utility.schemeNote}</p>
            <p className="pd-evidence"><span>Tariff: {utility.tariffEvidence}</span><span className={utility.netMetering === "yes" ? "ok" : "warn"}>Export credit: {utility.exportEvidence}</span></p>
          </fieldset>

          <fieldset className="pd-field" id="usage"><legend className="t-label">Your usage</legend>
            <div className="st-inputs">{INPUTS.map(([id, label, unit, min, max, step, hint]) => <label key={id}><span>{label}<small>{typical[id] ? `Typical ${B.label.toLowerCase()} value · ${hint}` : hint}</small></span><span className={`st-in ${typical[id] ? "typ" : ""}`}><input type="number" min={min} max={max} step={step} value={st.inputs[id] ?? result.site[id]} onChange={(e) => set({ inputs: { ...st.inputs, [id]: e.target.value === "" ? undefined : Number(e.target.value) } })} /><em>{unit}</em></span></label>)}</div>
            {usingTypical && <p className="pd-warnline">These are reference values for a typical {B.label.toLowerCase()}, not your building. Enter your own from your {utility.name} bills for a meaningful estimate.</p>}
            {result.hasWater && <label className="pd-switch"><button type="button" className="toggle" role="switch" aria-checked={st.waterSavings} onClick={() => set({ waterSavings: !st.waterSavings })} /><span>Count water savings: captured water would replace metered {utility.name} water I pay for</span></label>}
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Package</legend>
            <div className="seg pd-pkg">{Object.values(PACKAGES).map((p) => <button key={p.id} type="button" aria-pressed={pkg === p.id} onClick={() => set({ package: p.id, ...resetAddOns })}>{p.name}{rec.packageId === p.id && <i className="sugdot" title="Suggested" aria-label="(suggested)" />}</button>)}</div>
            <p className="t-fine">{PACKAGES[pkg].blurb}</p>
            {pkg === "solar-first" && <div className="pd-excl"><p className="t-label">Not included in Solar-first</p><ul>{SOLAR_FIRST_EXCLUDES.map((x) => <li key={x}>{x}</li>)}</ul><p className="t-fine">Still included: inverter, grid connection and protection (required), WELOS controller for energy monitoring, battery and cleaning control. No water savings are counted.</p></div>}
            <a className="pd-addon-link" href="#h-add">Customize optional add-ons</a>
          </fieldset>

          <fieldset className="pd-field"><legend className="t-label">Storage</legend>
            <div className="pd-opts two">
              {[false, true].map((bat) => {
                const r = storageOptions[bat ? 1 : 0];
                return <button key={String(bat)} type="button" className="opt" aria-pressed={battery === bat} onClick={() => set({ battery: bat })}>
                  <b>{bat ? "With battery" : "Without battery"} {rec.battery === bat && <em className="rec">Suggested</em>}</b>
                  <span className="t-num">{money(r.totals.totalAed)}</span>
                  <small>{bat ? `${fmt(r.components.find((c) => c.id === "battery").metrics.batteryKwh)} kWh · ≈ ${fmt(r.totals.backupHours)} h backup · payback ${yrs(r.totals.paybackYears)}` : `Grid-tied · no outage backup · payback ${yrs(r.totals.paybackYears)}`}</small>
                </button>;
              })}
            </div>
            <label className="pd-switch"><button type="button" className="toggle" role="switch" aria-checked={st.backup} onClick={() => set({ backup: !st.backup, battery: null })} /><span>I need power during outages</span></label>
            <p className="t-fine">{SUGGESTION_CRITERIA.battery}</p>
          </fieldset>

          <section className="pd-price" aria-label="Price and savings">
            <div><span className="t-label">Estimated installed price</span><b className="t-num">{money(t.totalAed)}</b><small>{money(t.hardwareAed)} hardware + {money(t.installAed)} engineering and install ({Math.round(RATES.installRate[B.tier] * 100)}%). A concept estimate, not a quote: final price needs a site survey, structural review and utility approval.</small></div>
            <dl className="pd-money">
              <div><dt>Electricity <em>{utility.name} bill per year</em></dt><dd className="t-num">{money(t.billBeforeAed)} → {money(t.billAfterAed)}</dd><dd className="sum t-num">= {money(t.electricitySavingsAed)}/yr</dd></div>
              <div><dt>Water <em>{!result.hasWater ? "not in this package" : t.waterCounted ? `${fmt(t.waterUsedLYear)} L/yr × ${CURRENCY} ${(t.waterRatePerL * 1000).toFixed(2)}/m³` : "not counted"}</em></dt><dd className="t-num">&nbsp;</dd><dd className="sum t-num">{result.hasWater && t.waterCounted ? `+ ${money(t.waterSavingsAed)}/yr` : `${CURRENCY} 0`}</dd></div>
              <div className="tot"><dt>Annual savings used for payback</dt><dd className="t-num">&nbsp;</dd><dd className="sum t-num">{money(t.annualSavingsAed)}/yr</dd></div>
            </dl>
            <p className="pd-calc">{ex.water.counted ? <>Water: {ex.water.text}</> : <>{ex.water.text}</>}</p>
            <dl className="pd-kpis">
              <div><dt className="t-label">Simple payback</dt><dd className="t-num">{yrs(t.paybackYears)}</dd><small>{t.paybackYears ? `${money(t.totalAed)} ÷ ${money(t.annualSavingsAed)}` : "—"}{result.hasWater && t.waterCounted ? ` · electricity only ${yrs(t.electricityPaybackYears)}` : ""}</small></div>
              <div><dt className="t-label">25-year net savings</dt><dd className={`t-num ${t.lifetimeNetAed < 0 ? "c-warn" : ""}`}>{money(t.lifetimeNetAed)}</dd><small>{money(t.lifetimeElectricityAed)} electricity{t.lifetimeWaterAed ? ` + ${money(t.lifetimeWaterAed)} water` : ""} − {money(t.totalAed)}</small></div>
              <div><dt className="t-label">Illustrative finance</dt><dd className="t-num">{money(t.monthlyAed)}<small>/mo</small></dd><small>{RATES.financeYears} yrs at {(RATES.financeApr * 100).toFixed(2)}% APR · {money(t.financeTotalAed)} repaid · not a lender offer</small></div>
              <div><dt className="t-label">Saved per month</dt><dd className="t-num">{money(t.monthlySavingsAed)}<small>/mo</small></dd><small>{money(t.annualSavingsAed)} ÷ 12, year one</small></div>
            </dl>
            <p className="t-fine pd-caveat">Estimates, not guaranteed returns. Bills use {utility.name}'s {utility.basis === "daily" ? "daily-band" : "slab"} tariff with fuel surcharge and 5% VAT ({utility.tariffEvidence.toLowerCase()}); export credit: {utility.exportEvidence.toLowerCase()}. 25-year figure applies {RATES.degradation * 100}%/yr output ageing to the electricity saving. {EXCLUSIONS}</p>
          </section>

          <div className={`pd-rec ${isRec ? "on" : ""}`}>
            <p className="t-label">{isRec ? "You're on the suggested build" : `Suggested for this building: ${PACKAGES[rec.packageId].name}, ${rec.battery ? "with" : "without"} battery`}</p>
            <p className="t-fine">Package: {SUGGESTION_CRITERIA.package} Battery: {SUGGESTION_CRITERIA.battery}</p>
            <ul>{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {!isRec && <button type="button" className="btn btn--sm" onClick={() => set({ battery: null, package: null, ...resetAddOns })}>Use the suggested build</button>}
          </div>

          <div className="pd-cta">
            <a className="btn" href="/signin.html">See it in welOS <span className="arr" aria-hidden="true">→</span></a>
            <button type="button" className="btn btn--line" onClick={exportJson}>Download summary</button>
          </div>
        </aside>
      </section>

      <section className="pd-sec" aria-labelledby="h-var">
        <header><p className="t-label">01 · Variations</p><h2 id="h-var" className="t-h2">Every building type in {region.name}.</h2><p className="t-body">Same package ({PACKAGES[pkg].name}), add-ons, tariff and water setting as your build, with and without a battery. Your building type uses your usage figures; the other two use typical reference values. Select one to load it.</p></header>
        <div className="vtable" role="table" aria-label="Variations">
          <div className="vrow head" role="row"><span role="columnheader">Building</span><span role="columnheader">Without battery</span><span role="columnheader">With battery</span></div>
          {matrix.map(({ b, cells, suggestBattery, yours }) => <div className="vrow" role="row" key={b.id}>
            <span role="rowheader"><b>{b.label}</b><small>{fmt(cells[0].components[0].metrics.pvKwp, 1)} kWp · {fmt(cells[0].site.loadKwhDay)} kWh/day {yours ? (typical.loadKwhDay ? "(typical)" : "(yours)") : "(typical)"}</small></span>
            {cells.map((res, k) => {
              const bat = k === 1, cur = st.building === b.id && battery === bat;
              const tt = res.totals;
              return <button role="cell" type="button" key={k} className={`vcell ${cur ? "cur" : ""}`} onClick={() => set({ building: b.id, battery: bat, ...(yours ? {} : { inputs: {} }) })}>
                {suggestBattery === bat && <em className="rec">Suggested</em>}
                <span className="vlab t-label">{bat ? "With battery" : "Without battery"}</span>
                <b className="t-num">{money(tt.totalAed)}</b>
                <span>{money(tt.electricitySavingsAed)} electricity{res.hasWater && tt.waterCounted ? ` + ${money(tt.waterSavingsAed)} water` : ""} = {money(tt.annualSavingsAed)}/yr</span>
                <small>Payback {yrs(tt.paybackYears)} · {bat ? `≈ ${fmt(tt.backupHours)} h backup` : "no outage backup"}</small>
              </button>;
            })}
          </div>)}
        </div>
      </section>

      <section className="pd-sec" aria-labelledby="h-add">
        <header><p className="t-label">02 · Add-ons</p><h2 id="h-add" className="t-h2">Add only what earns its place.</h2><p className="t-body">Start with the package defaults, then choose each extra independently. {result.hasWater ? "Solar canopy, grid connection and protection, inverter, controller, soiling alerts, first flush, tank and basic water kit stay included." : "Solar canopy, grid connection and protection, inverter, controller and soiling alerts stay included. Water add-ons need an integrated package."}</p></header>
        <p className="pd-addon-total" aria-live="polite"><strong>{money(t.totalAed)}</strong> installed with your selected add-ons. Hardware differences below exclude installation; installed differences include it.</p>
        <div className="addons">
          {addOns.map(({ id, name, part: c, on, available, unavailableWhy, suggested, detail, hardwareAed, installedAed, energyKwhYear, waterLYear, waterDemandPct }) => <article key={id} className={`addon ${on ? "on" : ""} ${available ? "" : "na"}`}>
            <div className="ad-top"><h3>{name}</h3><button type="button" className="toggle" role="switch" aria-checked={on} aria-label={`Include ${name}`} disabled={!available} onClick={() => set({ [id]: !on })} /></div>
            {!available ? <p className="ad-state">Not available in {PACKAGES[pkg].name}</p> : <>
              <p className="ad-state">{on ? "Selected" : "Not selected"}</p>
              <p className="ad-cap t-num">{money(hardwareAed)} hardware difference</p>
              <p className="ad-out">{on ? "Remove to save" : "Add for"} {money(installedAed)} installed</p>
              {id === "condensate" ? <p className="ad-out">Est. {fmt(waterLYear)} L/yr recovered{waterDemandPct > 0 ? ` · ${fmt(waterDemandPct, 1)}% of your non-potable demand` : ""}</p>
                : id === "cleaning" ? <p className="ad-out">{c.name} · est. {fmt(energyKwhYear)} kWh/yr more than manual cleaning for this build</p>
                : id === "treatment" ? <p className="ad-out">Carbon filtration + UV-C upgrade</p>
                : <p className="ad-out">{c.capacity.text} · {c.output}</p>}
            </>}
            {available ? <span className={`comp-tag ${suggested ? "yes" : ""}`}>{suggested || "Optional here"}</span> : <p className="ad-detail">{unavailableWhy}</p>}
            <p className="ad-detail">{detail}</p>
            {available && <details><summary>Why</summary><p>{c.why}</p></details>}
          </article>)}
        </div>
      </section>

      <section className="pd-sec" aria-labelledby="h-loc">
        <header><p className="t-label">03 · Location</p><h2 id="h-loc" className="t-h2">Same build, seven emirates.</h2><p className="t-body">Your current build (package, add-ons, battery, usage and water setting) priced against each utility. Sun varies a little across the UAE; tariffs and export rules vary a lot.</p></header>
        <div className="ltable" role="table" aria-label="Location comparison">
          <div className="lrow head" role="row">{["Location", "Utility · tariff", "Export credit", "Sun", "Output", "Electricity saved", "Water value", "Payback"].map((h) => <span key={h} role="columnheader" className="t-label">{h}</span>)}</div>
          {places.map(({ r, u, res }) => <button key={r.id} type="button" role="row" className={`lrow ${r.id === st.region ? "cur" : ""}`} onClick={() => set({ region: r.id, battery: null, package: null })}>
            <span role="cell"><b>{r.name}</b></span>
            <span role="cell">{u.name}<small>top rate {fmt(((u.slabs?.at(-1)?.[1] ?? u.daily.expat.villa.at(-1)[1]) + u.fuelSurcharge) * (1 + VAT) * 100, 1)} fils · {u.tariffEvidence.startsWith("Published") ? "published" : "secondary source"}</small></span>
            <span role="cell"><i className={`net ${u.netMetering}`} />{u.netMetering === "yes" ? "Verified" : "Unverified · AED 0"}</span>
            <span role="cell" className="t-num">{fmt(r.climate.solarDailyKwhM2, 2)}<small>kWh/m²/day</small></span>
            <span role="cell" className="t-num">{fmt(res.totals.energyKwhYear)}<small>kWh/yr</small></span>
            <span role="cell" className="t-num">{money(res.totals.electricitySavingsAed)}<small>/yr</small></span>
            <span role="cell" className="t-num">{res.hasWater && res.totals.waterCounted ? money(res.totals.waterSavingsAed) : "—"}<small>{res.hasWater && res.totals.waterCounted ? (u.id === "dewa" ? "/yr" : "/yr · DEWA rate as proxy") : ""}</small></span>
            <span role="cell" className="t-num">{yrs(res.totals.paybackYears)}<small>on {money(res.totals.annualSavingsAed)}/yr</small></span>
          </button>)}
        </div>
        <p className="t-fine">Sun: NASA POWER 2001–2025 climatology (its solar grid is coarse, so Sharjah, Ajman and RAK share Dubai's value). Tariffs include fuel surcharge and 5% VAT. Abu Dhabi rates shown for {st.customer === "national" ? "UAE National" : "expat"} accounts. Where export credit is unverified, exported solar is valued at zero.</p>
      </section>

      <section className="pd-sec" aria-labelledby="h-mo">
        <header><p className="t-label">04 · Through the year</p><h2 id="h-mo" className="t-h2">Solar against your bill, month by month.</h2><p className="t-body">{utility.netMetering === "yes" ? "Summer surplus becomes a credit that pays winter bills." : "Without an export credit, only solar used on site lowers the bill."}</p></header>
        <MonthChart months={result.monthly} />
      </section>

      <section className="pd-sec pd-details" aria-labelledby="h-det">
        <header><p className="t-label">05 · Specification</p><h2 id="h-det" className="t-h2">What is in the box, and why.</h2></header>
        <div className="pd-cols">
          <div>
            <h3 className="t-label">Price breakdown</h3>
            <ul className="bk">{result.components.filter((c) => c.included).map((c) => <li key={c.id}><span>{c.name}{c.required ? <em className="req">Required</em> : null}</span><span className="t-num">{money(c.costAed)}</span></li>)}
              <li className="sub"><span>Hardware subtotal</span><span className="t-num">{money(t.hardwareAed)}</span></li>
              <li><span>Engineering, install, commissioning ({Math.round(RATES.installRate[B.tier] * 100)}% of hardware)</span><span className="t-num">{money(t.installAed)}</span></li>
              <li className="tot"><span>Indicative installed price</span><span className="t-num">{money(t.totalAed)}</span></li></ul>
          </div>
          <div>
            {result.components.map((p) => <article key={p.id} className={`comp ${p.included ? "" : "off"}`}>
              <div className="comp-row"><div><h3>{p.name}{p.required ? <em className="req">Required</em> : null}</h3><p className="t-num comp-cap">{p.available ? p.capacity.text : p.unavailableWhy}</p><p className="comp-spec">{p.spec}</p></div><span className="t-num">{p.included ? money(p.costAed) : p.available ? "Not included" : `Not in ${PACKAGES[pkg].name}`}</span></div>
              <button type="button" className="why-btn" aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>Why this size {open[p.id] ? "−" : "+"}</button>
              {open[p.id] && <div className="why"><p>{p.why}</p><ul>{p.rules.map((r) => <li key={r.test} className={r.pass ? "pass" : "fail"}><b>{r.pass ? "✓" : "✕"}</b><span>{r.test}<i>→ {r.effect}</i></span></li>)}</ul></div>}
            </article>)}
          </div>
        </div>
        <div className="pd-sources">
          <p className="t-label">Assumptions and sources</p>
          <p><b>Prices.</b> Calibrated to UAE installer guides (10 kW villa ≈ AED 40,000–55,000) plus WELOS's elevated canopy, water system and controller. Battery storage AED {RATES.batteryPerKwh}/kWh installed (retail modules ≈ AED 410–530/kWh). The rain gutter (AED {RATES.gutterPerW}/W) is counted in the water system, so Solar-first excludes it.</p>
          <p><b>Electricity.</b> Each utility's slab or daily tariff, fuel surcharge and 5% VAT, excluding meter and housing fees (they don't change with solar). Net metering is modelled as monthly netting with credit rollover. Your use follows an assumed UAE seasonal profile (summer ≈ 1.6× winter) unless you enter your own figures.</p>
          <p><b>Water.</b> Valued only where captured water replaces metered utility water you pay for, and only up to your stated use: DEWA residential green slab AED 7.70/m³ + AED 1.10/m³ fuel surcharge + 5% VAT = AED {(RATES.waterPerL * 1000).toFixed(2)}/m³. Sewerage fees are excluded. Outside Dubai the DEWA rate is used as a proxy.</p>
          <p><b>Payback and 25 years.</b> Simple payback = installed price ÷ first-year savings. The 25-year figure applies {RATES.degradation * 100}%/yr output ageing to the electricity saving and holds tariffs flat. {EXCLUSIONS}</p>
          <p>Not a quotation or a guaranteed return. Final designs need a site survey, structural review and utility approval.</p>
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
