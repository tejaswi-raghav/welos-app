import React, { useEffect, useMemo, useRef, useState } from "react";
import { sizeSystem, ruleAdvice, ruleAnswer, PRESET_QUESTIONS, CURRENCY } from "../site/sizing.js";
import { loadBuild, DEFAULT_PRESET } from "../site/presets.js";
import { regionById } from "../site/regions.js";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const shortPlace = (name) => String(name).split(",").slice(0, 2).join(",").trim();
const fallbackBuild = () => ({ place: DEFAULT_PRESET.name, climate: DEFAULT_PRESET.climate, tier: "S", package: "complete", inputs: {}, choices: {}, example: true });
const currentBuild = () => loadBuild() || fallbackBuild();
const onStudio = () => /product\.html$/.test(location.pathname);

/**
 * WELOS AI — the site advisor, kept in a slide-out sidebar so it never interrupts
 * the page. It follows the build saved by the configurator (live via the
 * "welos:build" event). The sizing engine owns every number; the API only
 * explains it, and the rule-based answers keep it useful offline.
 */
export default function AdvisorSidebar() {
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState(currentBuild);
  const [advice, setAdvice] = useState(null);
  const [state, setState] = useState("idle");
  const [thread, setThread] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const panel = useRef(null);
  const lastFocus = useRef(null);

  const place = shortPlace(build.place);
  const result = useMemo(() => sizeSystem(build.climate, build.tier, build.inputs || {}, build.choices || {}, build.package, build.region ? { utilityId: regionById[build.region]?.utility, customer: build.customer, backup: build.backup, waterSavings: build.waterSavings !== false } : {}), [build]);
  const instant = useMemo(() => ruleAdvice(result, place), [result, place]);
  const shown = advice || instant;
  const t = result.totals;
  const body = { place, tier: build.tier, package: build.package, climate: build.climate, inputs: build.inputs || {}, choices: build.choices || {},
    context: { utilityId: regionById[build.region]?.utility || "dewa", customer: build.customer, backup: build.backup === true, waterSavings: build.waterSavings !== false } };
  const key = JSON.stringify(body);

  // open / close from anywhere on the page
  useEffect(() => {
    const onClick = (e) => {
      const trigger = e.target.closest?.('[data-ai-open], a[href="#ai"], a[href="/#ai"]');
      if (!trigger) return;
      e.preventDefault();
      lastFocus.current = document.activeElement;
      setBuild(currentBuild());
      setOpen(true);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    let timer;
    const onBuild = (e) => { clearTimeout(timer); timer = setTimeout(() => setBuild(e.detail?.climate ? e.detail : currentBuild()), 250); };
    document.addEventListener("click", onClick);
    addEventListener("keydown", onKey);
    addEventListener("welos:build", onBuild);
    return () => { document.removeEventListener("click", onClick); removeEventListener("keydown", onKey); removeEventListener("welos:build", onBuild); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("ai-open", open);
    if (open) setTimeout(() => panel.current?.focus(), 40);
    else lastFocus.current?.focus?.();
  }, [open]);

  // ask the advisor only while the sidebar is open, after the build settles
  useEffect(() => {
    setAdvice(null); setThread([]);
    if (!open) { setState("idle"); return undefined; }
    const controller = new AbortController();
    setState("thinking");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.headline) throw new Error("advisor");
        setAdvice(data);
        setState(data.source === "ai" ? "ai" : "rules");
      } catch (error) {
        if (error.name !== "AbortError") setState("rules");
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, key]);

  async function ask(text, preset) {
    const q = (preset ? PRESET_QUESTIONS.find((p) => p.id === preset)?.text : text || "").trim();
    if (!q || asking) return;
    setQuestion(""); setAsking(true);
    setThread((th) => [...th, { q, a: null }]);
    let answer = null;
    try {
      const response = await fetch("/api/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, question: q, preset }) });
      answer = (await response.json()).answer;
    } catch { /* offline: fall back below */ }
    if (!answer && preset) answer = ruleAnswer(result, preset);
    if (!answer) answer = "WELOS AI isn't connected right now, so I can only answer the suggested questions. The build, prices and every sizing rule still work offline.";
    setThread((th) => th.map((item, i) => (i === th.length - 1 ? { q, a: answer } : item)));
    setAsking(false);
  }

  const pill = state === "thinking" ? "Analysing your site…" : state === "ai" ? "Live AI analysis" : "Rule-based analysis";

  return (
    <aside className={`wai ${open ? "on" : ""}`} aria-hidden={!open} aria-labelledby="ai-title" role="dialog">
      <div className="wai-scrim" onClick={() => setOpen(false)} />
      <div className="wai-panel" tabIndex={-1} ref={panel}>
        <header className="wai-head">
          <div>
            <span className="wai-kicker"><i /> WELOS AI</span>
            <h2 id="ai-title">Your site advisor</h2>
            <p className="wai-for">WELOS {build.tier} {result.package.name} · {place}{build.example ? " (example)" : ""}</p>
          </div>
          <button className="wai-x" type="button" onClick={() => setOpen(false)} aria-label="Close WELOS AI">✕</button>
        </header>

        <div className="wai-body">
          <div className="wai-strip">
            <div><b>{CURRENCY} {fmt(t.totalAed)}</b><span>installed</span></div>
            <div><b>{fmt(Math.min(t.energyCoveragePct, 100))}%</b><span>power</span></div>
            <div><b>{fmt(Math.min(t.waterCoveragePct, 100))}%</b><span>water</span></div>
            <div><b>{t.paybackYears ? `${fmt(t.paybackYears, 1)} y` : "—"}</b><span>payback</span></div>
          </div>
          <span className={`wai-pill ${state}`}>{pill}</span>
          <h3 className="wai-headline">{shown.headline}</h3>
          <p className="wai-sum">{shown.summary}</p>

          <h4 className="wai-h4">Why it's built this way</h4>
          <ul className="wai-list">{shown.reasons.map((r, i) => <li key={i}><b>{r.component}</b>{r.text}</li>)}</ul>
          <h4 className="wai-h4">Make it better</h4>
          <ul className="wai-list">{shown.upgrades.map((u, i) => <li key={i}><b>{u.title}</b>{u.text}</li>)}</ul>
          <h4 className="wai-h4">Verify on site</h4>
          <ul className="wai-q">{shown.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>

          <div className="wai-ask">
            <h4 className="wai-h4">Ask about your build</h4>
            {thread.length > 0 && <ol className="wai-thread">{thread.map((m, i) => <li key={i}><p className="me">{m.q}</p><p className={`bot ${m.a ? "" : "wait"}`}>{m.a || "Thinking…"}</p></li>)}</ol>}
            <div className="wai-chips">{PRESET_QUESTIONS.map((p) => <button type="button" key={p.id} disabled={asking} onClick={() => ask(null, p.id)}>{p.text}</button>)}</div>
            <form className="wai-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="e.g. What if I double the water demand?" aria-label="Ask WELOS AI" />
              <button type="submit" disabled={asking || !question.trim()}>{asking ? "…" : "Ask"}</button>
            </form>
          </div>
          {!onStudio() && <a className="wai-link" href="/product.html">{build.example ? "Configure your own site" : "Change this build"} on the product page →</a>}
          <p className="wai-fine">The sizing engine sets every number and price; WELOS AI explains them. Indicative UAE estimates, not a quotation.</p>
        </div>
      </div>
    </aside>
  );
}
