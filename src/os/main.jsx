import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/base.css";
import "./os.css";
import { session, signOut } from "../account/session.js";
import { ownerData, dubaiNow, MONTHS, COMMISSIONED } from "./data.js";
import { Count, DayChart, MonthBars, CashLine, Donut, Ring, fmt } from "./charts.jsx";
import { modeLabel } from "../twin/sim.js";
import { RATES } from "../site/sizing.js";

const who = session();
if (!who) location.replace("/signin.html");

const money = (x, d = 0) => `AED ${fmt(x, d)}`;
// chart colours = Solar Ember semantic tokens (power amber, warn ember, water blue, use obsidian, ok green)
const C = { amber: "#f0a010", ember: "#ef6a2a", sky: "#2a9fe0", ink: "#e8d5c2", stone: "#7d6456", green: "#5cc28a" };

const I = {
  overview: <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" />,
  energy: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  savings: <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10 12 10.5s4.5 1.3 4.5 3.2-2 3-4.5 3-4.5-1.3-4.5-3" />,
  water: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" />,
  storage: <path d="M7 7h10v12H7zM10 4h4v3h-4zM9.5 12h5M12 9.5v5" />,
  system: <path d="M5 5h14v10H5zM9 19h6M12 15v4M8 9h3M8 11.5h6" />,
  activity: <path d="M4 12h4l2-6 4 12 2-6h4" />,
  help: <path d="M9.2 9a2.8 2.8 0 1 1 3.8 2.6c-.6.3-1 .8-1 1.5v.6M12 17.2v.3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />,
};
const Glyph = ({ name, size = 18 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>;

const SECTIONS = [
  { id: "overview", label: "Overview" }, { id: "energy", label: "Energy" }, { id: "savings", label: "Savings" },
  { id: "water", label: "Water" }, { id: "storage", label: "Storage" }, { id: "system", label: "System" }, { id: "activity", label: "Activity" },
];

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 15000); return () => clearInterval(i); }, []);
  return t;
}

function App() {
  const D = useMemo(() => ownerData(), []);
  const [sec, setSec] = useState(() => (SECTIONS.some((s) => s.id === location.hash.slice(1)) ? location.hash.slice(1) : "overview"));
  const [period, setPeriod] = useState("month");
  const [sidebar, setSidebar] = useState(true);
  const [mini, setMini] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [menu, setMenu] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [query, setQuery] = useState("");
  const clock = useClock();
  const go = (id) => { setSec(id); setMini(false); history.replaceState(null, "", `#${id}`); };
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") { setMenu(null); setSheet(null); }
      if ((e.metaKey || e.ctrlKey) && /^[1-7]$/.test(e.key)) { e.preventDefault(); go(SECTIONS[+e.key - 1].id); }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const battery = D.totals.withBattery;
  const storageLabel = battery ? "Battery" : "Grid credit";
  const secs = SECTIONS.map((s) => (s.id === "storage" ? { ...s, label: storageLabel } : s));
  const shown = secs.filter((s) => !query || s.label.toLowerCase().includes(query.toLowerCase()));
  const title = secs.find((s) => s.id === sec).label;
  const logout = () => { signOut(); location.assign("/signin.html"); };
  const dateStr = clock.toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short" });
  const timeStr = clock.toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });
  const MENUS = {
    welOS: [["About welOS", () => setSheet("about")], ["How to read your numbers", () => setSheet("help")], null, ["Back to welos.ae", () => location.assign("/")], ["Sign out", logout]],
    View: [...secs.map((s, i) => [`${s.label}`, () => go(s.id), `⌘${i + 1}`]), null, [sidebar ? "Hide sidebar" : "Show sidebar", () => setSidebar(!sidebar)]],
    Period: [["Today", () => setPeriod("today")], ["This month", () => setPeriod("month")], ["This year", () => setPeriod("year")], ["Since installation", () => setPeriod("life")]],
    Window: [["Minimise", () => setMini(true)], [zoom ? "Exit full size" : "Full size", () => setZoom(!zoom)]],
    Help: [["How to read your numbers", () => setSheet("help")], ["Change my system…", () => location.assign("/product.html")], ["Open engineering Control OS", () => location.assign("/control.html")]],
  };

  return (
    <div className="mac" onClick={() => setMenu(null)}>
      <header className="menubar" role="menubar" aria-label="welOS menu bar">
        <div className="mb-left">
          <img src="/brand/welos-icon.svg" alt="" className="mb-logo" />
          {Object.keys(MENUS).map((m) => <div key={m} className="mb-item">
            <button type="button" role="menuitem" aria-haspopup="true" aria-expanded={menu === m} className={m === "welOS" ? "app" : ""} onClick={(e) => { e.stopPropagation(); setMenu(menu === m ? null : m); }} onMouseEnter={() => menu && setMenu(m)}>{m}</button>
            {menu === m && <ul className="dropdown" role="menu" onClick={(e) => e.stopPropagation()}>{MENUS[m].map((it, i) => (it ? <li key={i}><button type="button" role="menuitem" onClick={() => { setMenu(null); it[1](); }}><span>{it[0]}</span>{it[2] && <kbd>{it[2]}</kbd>}</button></li> : <li key={i} className="sep" role="separator" />))}</ul>}
          </div>)}
        </div>
        <div className="mb-right">
          <span className="mb-stat" title={battery ? "Battery state of charge (simulated)" : "Net-metering credit bank (simulated)"}>{battery ? <><svg viewBox="0 0 26 12" width="22" height="11" aria-hidden="true"><rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width={19 * (D.curve[D.today.nowIdx].soc / 100)} height="8" rx="1.5" fill="currentColor" /><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5" /></svg>{fmt(D.curve[D.today.nowIdx].soc)}%</> : <><Glyph name="storage" size={14} />{fmt(D.months[D.mo].creditBank)} kWh</>}</span>
          <span className="mb-stat"><Glyph name="energy" size={14} />{fmt(D.today.nowPv, 1)} kW</span>
          <span className="mb-time">{dateStr}&nbsp;&nbsp;{timeStr}</span>
          <span className="mb-user" title={who?.email}>{who?.name || "Owner"}</span>
        </div>
      </header>

      <div className={`window ${mini ? "mini" : ""} ${zoom ? "zoom" : ""} ${sidebar ? "" : "no-side"}`} role="application" aria-label="welOS owner app">
        <aside className="side" aria-label="Sections">
          <div className="lights">
            <button type="button" className="l red" aria-label="Close and return to the website" onClick={() => location.assign("/")}><svg viewBox="0 0 10 10"><path d="M3 3l4 4M7 3l-4 4" /></svg></button>
            <button type="button" className="l yellow" aria-label="Minimise" onClick={() => setMini(true)}><svg viewBox="0 0 10 10"><path d="M2.5 5h5" /></svg></button>
            <button type="button" className="l green" aria-label={zoom ? "Exit full size" : "Full size"} onClick={() => setZoom(!zoom)}><svg viewBox="0 0 10 10"><path d="M3 7V3.5L6.5 7zM7 3v3.5L3.5 3z" /></svg></button>
          </div>
          <label className="search"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search sections" /></label>
          <p className="side-h">My rooftop</p>
          <nav>{shown.map((s, i) => <button key={s.id} type="button" className={sec === s.id ? "on" : ""} aria-current={sec === s.id ? "page" : undefined} onClick={() => go(s.id)}><Glyph name={s.id} /><span>{s.label}</span><kbd>⌘{SECTIONS.findIndex((x) => x.id === s.id) + 1}</kbd></button>)}</nav>
          <p className="side-h">System</p>
          <div className="side-card">
            <b>WELOS {D.B.tier} · {D.B.label}</b>
            <span>{D.region.name} · {D.utility.name}</span>
            <span>{fmt(D.by.solar.metrics.pvKwp, 1)} kWp{battery ? ` · ${fmt(D.by.battery.metrics.batteryKwh)} kWh` : " · no battery"}</span>
            <a href="/product.html">Change system</a>
          </div>
          <button type="button" className="side-help" onClick={() => setSheet("help")}><Glyph name="help" size={16} />How to read your numbers</button>
        </aside>

        <section className="main">
          <div className="toolbar">
            <button type="button" className="tb-btn" aria-label={sidebar ? "Hide sidebar" : "Show sidebar"} onClick={() => setSidebar(!sidebar)}><svg viewBox="0 0 20 16" width="18" height="15" aria-hidden="true"><rect x="1" y="1" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7 1v14" stroke="currentColor" strokeWidth="1.4" /></svg></button>
            <div className="tb-title"><h1>{title}</h1><span>{D.fromProduct ? "Your configured system" : "Demo system · recommended Dubai villa"} · simulated data</span></div>
            {(sec === "overview" || sec === "energy") && <div className="tb-seg" role="tablist" aria-label="Period">{[["today", "Today"], ["month", "Month"], ["year", "Year"], ["life", "Lifetime"]].map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={period === id} onClick={() => setPeriod(id)}>{l}</button>)}</div>}
            <button type="button" className="tb-btn wide" onClick={() => setSheet("help")}>Explain</button>
          </div>
          <div className="content" key={sec}>
            {sec === "overview" && <Overview D={D} period={period} go={go} />}
            {sec === "energy" && <Energy D={D} period={period} />}
            {sec === "savings" && <Savings D={D} />}
            {sec === "water" && <Water D={D} />}
            {sec === "storage" && <Storage D={D} />}
            {sec === "system" && <System D={D} />}
            {sec === "activity" && <Activity D={D} />}
          </div>
        </section>
      </div>

      <nav className="dock" aria-label="Dock">
        {secs.map((s) => <button key={s.id} type="button" className={`dk ${s.id}`} onClick={() => go(s.id)} aria-label={s.label}><span className="tile"><Glyph name={s.id} size={26} /></span><em>{s.label}</em>{sec === s.id && !mini && <i className="run" />}</button>)}
        <span className="dk-sep" aria-hidden="true" />
        <a className="dk product" href="/product.html" aria-label="Product page"><span className="tile img"><img src="/brand/welos-icon.svg" alt="" /></span><em>Product</em></a>
        <a className="dk ctrl" href="/control.html" aria-label="Engineering Control OS"><span className="tile"><Glyph name="activity" size={26} /></span><em>Control OS</em></a>
      </nav>

      {sheet && <div className="sheet-wrap" onClick={() => setSheet(null)}><div className="sheet" role="dialog" aria-modal="true" aria-label={sheet === "about" ? "About welOS" : "How to read your numbers"} onClick={(e) => e.stopPropagation()}>
        {sheet === "about" ? <About D={D} /> : <Help D={D} />}
        <div className="sheet-foot"><button type="button" className="mac-btn primary" onClick={() => setSheet(null)} autoFocus>Done</button></div>
      </div></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ sections */
function periodNumbers(D, period) {
  const m = D.months[D.mo];
  if (period === "today") {
    const self = D.curve.slice(0, D.today.nowIdx + 1).reduce((a, p) => a + Math.min(p.pv, p.load) * 0.25, 0);
    const save = (m.saving / D.months[D.mo].days) * (D.today.nowIdx / 96);
    return { label: "today so far", pv: D.today.pvKwh, saving: save, self: D.today.loadKwh ? (self / D.today.loadKwh) * 100 : 0, co2: D.today.pvKwh * 0.41 };
  }
  if (period === "year") {
    const pv = D.months.reduce((a, x) => a + x.pv, 0), load = D.months.reduce((a, x) => a + x.load, 0), imp = D.months.reduce((a, x) => a + x.imported, 0);
    return { label: "per year (expected)", pv, saving: D.totals.annualSavingsAed, self: (1 - imp / load) * 100, co2: pv * 0.41 };
  }
  if (period === "life") return { label: `since ${COMMISSIONED.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`, pv: D.lifetime.pv, saving: D.lifetime.saving, self: (1 - D.months.slice(2, D.mo + 1).reduce((a, x) => a + x.imported, 0) / D.months.slice(2, D.mo + 1).reduce((a, x) => a + x.load, 0)) * 100, co2: D.lifetime.pv * 0.41 };
  return { label: `${MONTHS[D.mo]} so far`, pv: D.monthToDate.pv, saving: D.monthToDate.saving, self: (1 - m.imported / m.load) * 100, co2: D.monthToDate.pv * 0.41 };
}

function Card({ title, info, children, className = "", aside }) {
  return <article className={`card ${className}`}>
    <header><h2>{title}</h2>{aside}</header>
    {children}
    {info && <p className="info"><Glyph name="help" size={13} />{info}</p>}
  </article>;
}

function Overview({ D, period, go }) {
  const n = periodNumbers(D, period);
  const m = D.months[D.mo];
  const now = D.curve[D.today.nowIdx];
  const solarToHome = Math.min(now.pv, now.load);
  const toGrid = Math.max(0, now.pv - now.load);
  const fromGrid = Math.max(0, now.load - now.pv);
  const direct = Math.min(m.pv, m.load);
  const credit = m.creditUsed;
  const grid = m.imported;
  return <>
    <div className="kpis">
      <div className="kpi" style={{ "--d": "0ms" }}><span>Generated</span><b><Count value={n.pv} digits={n.pv < 100 ? 1 : 0} /><small>kWh</small></b><em>{n.label}</em></div>
      <div className="kpi" style={{ "--d": "60ms" }}><span>Saved</span><b><Count value={n.saving} prefix="AED " /></b><em>on your {D.utility.name} bill</em></div>
      <div className="kpi" style={{ "--d": "120ms" }}><span>Self-powered</span><b><Count value={Math.max(0, n.self)} /><small>%</small></b><em>of your use covered by your roof</em></div>
      <div className="kpi" style={{ "--d": "180ms" }}><span>CO₂ avoided</span><b><Count value={n.co2 >= 1000 ? n.co2 / 1000 : n.co2} digits={n.co2 >= 1000 ? 2 : 0} /><small>{n.co2 >= 1000 ? "t" : "kg"}</small></b><em>at 0.41 kg per grid kWh</em></div>
    </div>

    <div className="grid two">
      <Card title="Today" className="span2" aside={<span className="pill live"><i />{modeLabel(D.today.mode)}</span>}
        info={`Your roof will make about ${fmt(D.today.pvKwhDay, 1)} kWh today and your home will use about ${fmt(D.today.loadKwhDay, 1)} kWh. The amber area is solar; the dark line is your use. Where the line rises above the amber, the rest comes from ${D.utility.netMetering === "yes" ? "your credit or the grid" : "the grid"}.`}>
        <DayChart curve={D.curve} nowIdx={D.today.nowIdx} battery={D.totals.withBattery} />
      </Card>
      <Card title="Right now" info={toGrid > 0.01 ? `You're making more than you use. The extra ${fmt(toGrid, 2)} kW ${D.utility.netMetering === "yes" ? "becomes credit on your bill" : D.totals.withBattery ? "charges the battery" : "goes to the grid unpaid"}.` : now.pv > 0.01 ? `Solar covers ${fmt((solarToHome / Math.max(0.01, now.load)) * 100)}% of what you're using; the grid tops up the rest.` : `The sun is down, so your home runs on ${D.totals.withBattery ? "the battery, then" : ""} the grid${D.utility.netMetering === "yes" ? ", paid for with this year's solar credit" : ""}.`}>
        <Flow pv={now.pv} load={now.load} home={solarToHome} toGrid={toGrid} fromGrid={fromGrid} battery={D.totals.withBattery} soc={now.soc} />
      </Card>
      <Card title={`${MONTHS[D.mo]} bill`} info={`Without WELOS this month's electricity would cost about ${money(m.billBefore)} on ${D.utility.name}'s tariff. With it you pay about ${money(m.billAfter)}: a saving of ${money(m.saving)}.`}>
        <div className="bill">
          <div className="bb"><span>Without WELOS</span><i style={{ width: "100%" }} /><b>{money(m.billBefore)}</b></div>
          <div className="ba"><span>With WELOS</span><i style={{ width: `${Math.max(2, (m.billAfter / Math.max(1, m.billBefore)) * 100)}%` }} /><b>{money(m.billAfter)}</b></div>
          <p className="big-save">You save <b>{money(m.saving)}</b> this month</p>
        </div>
      </Card>
      <Card title="Where your power comes from" className="span2" info={D.utility.netMetering === "yes" ? `Under net metering your solar is counted against your use across the whole month, whether you used it as it was made or exported it. "Banked credit" is surplus from earlier months drawn back at no cost. Only "Bought from grid" is billed.` : `Only solar you use on site counts here. Surplus exported to ${D.utility.name} isn't credited in this model.`}>
        <div className="row-split">
          <Donut parts={[{ label: D.utility.netMetering === "yes" ? "Offset by this month's solar" : "Solar used on site", value: D.utility.netMetering === "yes" ? direct : m.selfUsed + m.batteryShift, color: C.amber }, ...(D.utility.netMetering === "yes" ? [{ label: "Offset by banked credit", value: credit, color: C.ink }] : []), { label: "Bought from grid", value: grid, color: C.stone }]} center={`${fmt(m.load)}`} sub={`kWh used in ${MONTHS[D.mo]}`} />
          <ul className="insights">
            <li><b>{fmt(D.by.solar.metrics.pvKwp, 1)} kWp</b> on your roof is producing {fmt(((m.pv / m.days) / D.by.solar.metrics.pvKwp), 2)} kWh per kW per day this month.</li>
            {D.utility.netMetering === "yes" && <li><b>{fmt(m.creditBank)} kWh</b> of credit is banked for the months when your use outruns the sun.</li>}
            <li>Your last kWh each month costs <b>{fmt(D.totals.marginalRate * 100, 1)} fils</b>; that's what each solar kWh is worth to you.</li>
            <li><button type="button" className="link" onClick={() => go("savings")}>See your payback →</button></li>
          </ul>
        </div>
      </Card>
    </div>
  </>;
}

function Flow({ pv, load, home, toGrid, fromGrid, battery, soc }) {
  const spd = (kw) => `${Math.max(0.6, 3 - kw)}s`;
  return <svg className="flow" viewBox="0 0 300 200" role="img" aria-label={`Solar ${fmt(pv, 2)} kW, home ${fmt(load, 2)} kW, ${toGrid > 0 ? `exporting ${fmt(toGrid, 2)} kW` : `importing ${fmt(fromGrid, 2)} kW`}`}>
    <path d="M70 52 C 120 52, 140 100, 150 100" className={`fl ${home > 0.01 ? "on" : ""}`} style={{ animationDuration: spd(home) }} />
    <path d="M230 52 C 180 52, 160 100, 150 100" className={`fl grid ${fromGrid > 0.01 ? "on" : ""}`} style={{ animationDuration: spd(fromGrid) }} />
    <path d="M70 52 C 120 20, 190 20, 230 52" className={`fl exp ${toGrid > 0.01 ? "on" : ""}`} style={{ animationDuration: spd(toGrid) }} />
    {battery && <path d="M150 100 L150 160" className="fl batt on" />}
    <g transform="translate(50 52)"><circle r="24" className="nd sun" /><text y="4" className="ic">☀</text><text y="42" className="lb">{fmt(pv, 2)} kW</text></g>
    <g transform="translate(250 52)"><circle r="24" className="nd gridn" /><text y="5" className="ic sm">GRID</text><text y="42" className="lb">{toGrid > 0.01 ? `↑ ${fmt(toGrid, 2)}` : `↓ ${fmt(fromGrid, 2)}`} kW</text></g>
    <g transform="translate(150 104)"><circle r="26" className="nd home" /><text y="5" className="ic sm">HOME</text><text y={battery ? -36 : 44} className="lb">{fmt(load, 2)} kW</text></g>
    {battery && <g transform="translate(150 176)"><rect x="-26" y="-12" width="52" height="24" rx="6" className="nd bat" /><text y="4" className="ic sm">{fmt(soc)}%</text></g>}
  </svg>;
}

function Energy({ D, period }) {
  const data = D.months.map((m, i) => ({ label: MONTHS[i], pv: m.pv, load: m.load }));
  const yearPv = D.months.reduce((a, m) => a + m.pv, 0);
  const best = D.months.reduce((b, m) => (m.pv > b.pv ? m : b), D.months[0]);
  const worst = D.months.reduce((b, m) => (m.pv < b.pv ? m : b), D.months[0]);
  const n = periodNumbers(D, period);
  return <>
    <div className="kpis">
      <div className="kpi"><span>Generated</span><b><Count value={n.pv} digits={n.pv < 100 ? 1 : 0} /><small>kWh</small></b><em>{n.label}</em></div>
      <div className="kpi"><span>Specific yield</span><b><Count value={yearPv / D.by.solar.metrics.pvKwp} /><small>kWh/kWp·yr</small></b><em>UAE guides quote ~1,500</em></div>
      <div className="kpi"><span>Peak today</span><b><Count value={D.today.peak.pv} digits={2} /><small>kW</small></b><em>at {D.today.peak.clock}</em></div>
      <div className="kpi"><span>Performance ratio</span><b><Count value={D.by.solar.metrics.performanceRatio * 100} /><small>%</small></b><em>after heat, dust and wiring losses</em></div>
    </div>
    <div className="grid one">
      <Card title="Solar against use, by month" info={`Your roof makes the most in ${MONTHS[best.m]} (${fmt(best.pv)} kWh) and the least in ${MONTHS[worst.m]} (${fmt(worst.pv)} kWh). Your use peaks in summer because of air-conditioning. Months after this one are forecasts from 25 years of NASA sunlight data.`}>
        <MonthBars data={data} a="pv" b="load" labels={["Solar", "Use"]} colors={[C.amber, C.stone]} unit="kWh" current={D.mo} />
      </Card>
      <Card title="Today in detail" info="Solar follows the sun: zero before sunrise, peaking around 12:30, gone by sunset. The forecast part of the curve is lighter.">
        <DayChart curve={D.curve} nowIdx={D.today.nowIdx} battery={D.totals.withBattery} height={200} />
      </Card>
    </div>
  </>;
}

function Savings({ D }) {
  const t = D.totals;
  const data = D.months.map((m, i) => ({ label: MONTHS[i], before: m.billBefore, after: m.billAfter }));
  return <>
    <div className="kpis">
      <div className="kpi"><span>Saved per year</span><b><Count value={t.annualSavingsAed} prefix="AED " /></b><em>{D.result.hasWater && t.waterCounted ? `${money(t.electricitySavingsAed)} electricity + ${money(t.waterSavingsAed)} water` : `${money(t.electricitySavingsAed)} electricity only`}</em></div>
      <div className="kpi"><span>Bill per year</span><b><Count value={t.billAfterAed} prefix="AED " /></b><em>down from {money(t.billBeforeAed)}</em></div>
      <div className="kpi"><span>Payback</span><b><Count value={t.paybackYears || 0} digits={1} /><small>years</small></b><em>on {money(t.totalAed)} installed</em></div>
      <div className="kpi"><span>25-year net</span><b className={t.lifetimeNetAed < 0 ? "neg" : ""}><Count value={t.lifetimeNetAed} prefix="AED " /></b><em>savings minus price, 0.5%/yr panel ageing</em></div>
    </div>
    <div className="grid one">
      <Card title="Your bill, with and without WELOS" info={`Light bars are what ${D.utility.name} would charge without WELOS; amber is what you pay with it. Bills include the fuel surcharge and 5% VAT${D.utility.netMetering === "yes" ? "; summer credit pays down winter bills" : ""}. Meter and housing fees aren't included.`}>
        <MonthBars data={data} a="before" b="after" labels={["Without", "With WELOS"]} colors={[C.stone, C.amber]} unit="" current={D.mo} format={(v) => money(v)} />
      </Card>
      <Card title="When it pays for itself" info={`The line starts at minus the installed price and climbs by each year's savings. It crosses zero at payback, about year ${fmt(t.paybackYears, 1)}. Everything after that is money kept.`}>
        <CashLine cash={D.cash} />
      </Card>
      <Card title="Why each kWh is worth what it is" info="Your utility charges more per kWh as monthly use rises. Solar removes the most expensive kWh first, so it's worth most to heavy users.">
        <Tariff D={D} />
      </Card>
    </div>
  </>;
}

function Tariff({ D }) {
  const u = D.utility;
  const rows = u.basis === "daily"
    ? (u.daily[D.build.customer === "national" ? "national" : "expat"].villa).map(([lim, r], i, a) => [i === 0 ? `Up to ${lim} kWh/day` : `Above ${a[i - 1][0]} kWh/day`, r])
    : u.slabs.map(([lim, r], i, a) => [i === 0 ? `0 – ${fmt(lim)} kWh/month` : lim === Infinity ? `Above ${fmt(a[i - 1][0])} kWh/month` : `${fmt(a[i - 1][0] + 1)} – ${fmt(lim)} kWh/month`, r]);
  const avg = D.months.reduce((a, m) => a + m.load, 0) / 12;
  return <table className="tariff"><thead><tr><th>Band</th><th>Rate</th><th>With surcharge + VAT</th></tr></thead><tbody>
    {rows.map(([l, r], i) => <tr key={l} className={i === 0 && u.basis !== "daily" && avg <= 2000 ? "you" : ""}><td>{l}</td><td>{fmt(r * 100, 1)} fils</td><td>{fmt((r + u.fuelSurcharge) * 1.05 * 100, 1)} fils</td></tr>)}
  </tbody><caption>{u.name} · your average month ≈ {fmt(avg)} kWh. Each solar kWh you use is worth up to {fmt(D.totals.marginalRate * 100, 1)} fils.</caption></table>;
}

function Water({ D }) {
  if (!D.result.hasWater) return (
    <div className="grid two">
      <Card title="No water system in this build" className="span2" info="Solar-first leaves out rain capture, storage, treatment, condensate recovery and water routing, so there is nothing to measure here and no water savings are counted.">
        <p className="empty-note">Your build is {D.result.package.name}. To capture rain and AC condensate for irrigation and flushing, choose Essential, Complete or Max on the product page.</p>
        <a className="link" href="/product.html">Change the build →</a>
      </Card>
    </div>
  );
  const data = D.water.map((w, i) => ({ label: MONTHS[i], rain: w.rain, cond: w.condensate }));
  const yr = D.water.reduce((a, w) => a + w.rain + w.condensate, 0);
  const tank = D.by.water.metrics.tankL;
  const level = Math.min(100, 30 + (D.water[D.mo].rain / Math.max(1, tank)) * 40);
  return <>
    <div className="kpis">
      <div className="kpi"><span>Captured per year</span><b><Count value={yr} /><small>L</small></b><em>rain{D.by.condensate.included ? " + AC condensate" : ""}</em></div>
      <div className="kpi"><span>Tank</span><b><Count value={tank} /><small>L</small></b><em>{D.by.water.spec.split("→")[0].trim()} first</em></div>
      <div className="kpi"><span>Water saved</span><b><Count value={D.totals.waterSavingsAed} prefix="AED " /></b><em>per year at utility water rates</em></div>
      <div className="kpi"><span>Covers</span><b><Count value={Math.min(100, D.totals.waterCoveragePct)} /><small>%</small></b><em>of non-potable use</em></div>
    </div>
    <div className="grid two">
      <Card title="Water captured, by month" className="span2" info={`UAE rain falls mostly between November and March, so the tank fills in winter.${D.by.condensate.included ? " AC condensate is steadier and peaks in summer, when cooling runs hardest." : ""} Monthly split is an assumption spread over the annual estimate.`}>
        <MonthBars data={data} a="rain" b={D.by.condensate.included ? "cond" : null} labels={["Rain", "Condensate"]} colors={[C.sky, "#8cc8ea"]} unit="L" current={D.mo} />
      </Card>
      <Card title="Tank" info="Water passes the first-flush diverter and filters before it reaches the tank. It's for irrigation, flushing and panel cleaning, not drinking.">
        <div className="tankviz"><div className="tank"><i style={{ height: `${level}%` }} /><span>{fmt(level)}%</span></div><p>{fmt((level / 100) * tank)} of {fmt(tank)} L<br /><small>simulated level</small></p></div>
      </Card>
    </div>
  </>;
}

function Storage({ D }) {
  const t = D.totals;
  if (t.withBattery) {
    const soc = D.curve.map((p) => p.soc);
    return <>
      <div className="kpis">
        <div className="kpi"><span>Battery</span><b><Count value={D.by.battery.metrics.batteryKwh} /><small>kWh</small></b><em>LiFePO4</em></div>
        <div className="kpi"><span>Charge now</span><b><Count value={D.curve[D.today.nowIdx].soc} /><small>%</small></b><em>simulated</em></div>
        <div className="kpi"><span>Backup</span><b><Count value={t.backupHours} /><small>h</small></b><em>for essential loads in an outage</em></div>
        <div className="kpi"><span>Bill value</span><b><Count value={Math.max(0, D.by.battery.metrics.batteryAnnualValue)} prefix="AED " /></b><em>per year from storage</em></div>
      </div>
      <div className="grid one">
        <Card title="Battery through the day" info={`The battery charges from midday surplus and carries the evening. It never drops below the reserve the controller holds (20%, or 35% when a storm or outage is expected). ${D.utility.netMetering === "yes" ? `With ${D.utility.name} net metering, its job is backup rather than savings.` : ""}`}>
          <SocChart soc={soc} nowIdx={D.today.nowIdx} />
        </Card>
      </div>
    </>;
  }
  const data = D.months.map((m, i) => ({ label: MONTHS[i], bank: m.creditBank, exp: m.exported }));
  return <>
    <div className="kpis">
      <div className="kpi"><span>Credit banked</span><b><Count value={D.months[D.mo].creditBank} /><small>kWh</small></b><em>at the end of {MONTHS[D.mo]}</em></div>
      <div className="kpi"><span>Exported per year</span><b><Count value={t.exportKwh} /><small>kWh</small></b><em>{D.utility.netMetering === "yes" ? "credited at your own rate" : "not credited in this model"}</em></div>
      <div className="kpi"><span>Bought per year</span><b><Count value={t.importKwh} /><small>kWh</small></b><em>after credit</em></div>
      <div className="kpi"><span>Battery</span><b>None</b><em>the grid stores your surplus</em></div>
    </div>
    <div className="grid one">
      <Card title="Your credit bank" info={D.utility.netMetering === "yes" ? `${D.utility.scheme}: ${D.utility.schemeNote} The bars show credit building through the sunny months and being drawn down when your use is higher than your output. That is why a battery isn't needed for savings.` : `${D.utility.schemeNote}`}>
        <MonthBars data={data} a="bank" b="exp" labels={["Credit banked", "Exported that month"]} colors={[C.ink, C.amber]} unit="kWh" current={D.mo} />
      </Card>
    </div>
  </>;
}

function SocChart({ soc, nowIdx }) {
  const W = 720, H = 200, pt = 12, pb = 24;
  const x = (i) => (i / (soc.length - 1)) * W, y = (v) => pt + (1 - v / 100) * (H - pt - pb);
  const d = soc.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join("");
  return <div className="ch-day"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Battery state of charge today">
    <line x1="0" x2={W} y1={y(20)} y2={y(20)} className="reserve" /><path d={`${d}L${W} ${y(0)}L0 ${y(0)}Z`} className="soc-area" /><path d={d} className="soc" pathLength="1" vectorEffect="non-scaling-stroke" />
    <line x1={x(nowIdx)} x2={x(nowIdx)} y1={pt} y2={H - pb} className="now" /></svg>
    <div className="ch-x">{["00:00", "06:00", "12:00", "18:00", "24:00"].map((t, i) => <span key={t} style={{ left: `${i * 25}%` }}>{t}</span>)}</div></div>;
}

function System({ D }) {
  const parts = D.result.components.filter((c) => c.included);
  return <>
    <div className="grid two">
      <Card title="Health" aside={<span className="pill ok"><i />All systems normal</span>} info="Status comes from the controller's self-checks. In this demo every device reports normal.">
        <div className="health">
          <Ring value={D.by.solar.metrics.performanceRatio * 100} label="Performance ratio" />
          <div><b>{modeLabel(D.today.mode)}</b><span>controller mode now</span><b>welOS 2.4 (demo)</b><span>firmware</span><b>{D.region.name}</b><span>{D.region.lat.toFixed(2)}°N, {D.region.lon.toFixed(2)}°E</span></div>
        </div>
      </Card>
      <Card title="Installed" info={`Configured on the product page. Indicative installed price ${money(D.totals.totalAed)}.`}>
        <ul className="devices">{parts.map((c) => <li key={c.id}><i className="ok" /><div><b>{c.name}</b><span>{c.capacity.text}</span></div></li>)}</ul>
      </Card>
    </div>
    <div className="grid one"><Card title="Under the hood" info="The engineering Control OS shows the same controller's topology, decision trace and event log.">
      <div className="hood"><p>Every 250 ms the edge controller reads its sensors, checks them against fixed limits and decides whether to charge, export, clean or capture rain. It works without an internet connection.</p><a className="mac-btn" href="/control.html">Open Control OS</a></div>
    </Card></div>
  </>;
}

function Activity({ D }) {
  const ev = D.today.events.slice().reverse();
  return <div className="grid one"><Card title="Today" info="Every entry is generated by the simulation. Actions marked simulated did not operate any hardware.">
    <ol className="log">{ev.length ? ev.map((e, i) => <li key={i} className={e.level}><time>{e.clock}</time><div><b>{e.title}</b><span>{e.detail}</span></div></li>) : <li><div><b>Quiet so far</b><span>Nothing has happened yet today.</span></div></li>}</ol>
  </Card></div>;
}

function About({ D }) {
  return <div className="about"><img src="/brand/welos-icon.svg" alt="" /><h2>welOS</h2><p>Version 2.4 (demo)</p><dl>
    <div><dt>System</dt><dd>WELOS {D.B.tier} · {D.B.label}</dd></div><div><dt>Location</dt><dd>{D.region.name} · {D.utility.name}</dd></div>
    <div><dt>Solar</dt><dd>{fmt(D.by.solar.metrics.pvKwp, 1)} kWp</dd></div><div><dt>Storage</dt><dd>{D.totals.withBattery ? `${fmt(D.by.battery.metrics.batteryKwh)} kWh` : "None (grid-tied)"}</dd></div>
    <div><dt>Data</dt><dd>Simulated from the WELOS sizing, tariff and control engines</dd></div></dl></div>;
}

function Help({ D }) {
  return <div className="help"><h2>How to read your numbers</h2><ul>
    <li><b>Generated</b> is the energy your panels produced. It depends on the sun, heat (hot panels are less efficient) and dust.</li>
    <li><b>Saved</b> is the difference between your {D.utility.name} bill without WELOS and with it, using the real slab tariff, fuel surcharge and VAT.</li>
    <li><b>Self-powered</b> is the share of your use that your roof covered{D.utility.netMetering === "yes" ? ", including credit you banked earlier" : ""}.</li>
    <li><b>{D.utility.netMetering === "yes" ? "Credit" : "Exports"}</b>: {D.utility.schemeNote}</li>
    <li><b>Payback</b> is the installed price divided by yearly savings. After it, savings are money kept.</li>
    <li>Everything here is a <b>simulation</b> of the system you configured. No real meter is connected.</li>
  </ul></div>;
}

if (who) createRoot(document.getElementById("os-root")).render(<App />);
