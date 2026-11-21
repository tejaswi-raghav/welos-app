# WELOS

WELOS is an integrated renewable-energy and rainwater product concept with a local, offline-first control OS. This repository contains the public site, an interactive 3D product model, a browser control simulator and ESP32-S3 reference firmware.

## Run
```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Entry points:

- `/` — **landing**: a 3D hero whose five conditions (midday, evening, dust, storm, grid outage) run the real control engine; a scroll-driven exploded view of the unit (select any part for its role and validation status); the problem in engine figures; a live trace of one control decision; a sizing demo with a 24-hour control-engine simulation of the chosen build; scale comparison; what is real today.
- `/studio.html` — **Studio**: the 3D model and the full configurator side by side (`#both`, `#model`, `#configure`; `?tier=M` opens a scale). The landing demo saves its build here.
- `/control.html` — **Control OS**: the controller running on simulated sensors. Inject a condition and see the mode, the reason and where the power goes.
- **WELOS AI** — slide-out advisor (`src/ai/`) opened from every page header.
- `/model.html`, `/configure.html` and `/explore.html` redirect to the new pages.

Design system: `src/design/tokens.css` (light paper, ink, ring-sampled sun/ember gradient for energy, blue for water; Mona Sans + JetBrains Mono self-hosted in `public/fonts`). Brand: the amber ring logo with the `welos™` wordmark (`public/brand/`; `*-ink.png` variants for light surfaces). See [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md).

Every number on the site is labelled as engine output, engine assumption, simulated or concept. The marketing site uses one reference build, *WELOS S · Villa · Recommended · Dubai*, computed by `src/os/reference.js`, so hero, day chart and scale table can't disagree. See [docs/PRODUCT_DISCOVERY.md](docs/PRODUCT_DISCOVERY.md).

## Product foundation

- Solar photovoltaic canopy with integrated rain catchment
- Compact vertical-axis wind module with independent braking
- First-flush, filtration, UV, tank, pumping and water-quality instrumentation
- 48 V LiFePO4 storage, MPPT, wind rectification and hybrid inverter
- ESP32-S3 edge controller, local API, authenticated commands and offline operation
- Deterministic safety-oriented control modes and fault handling

See [hardware/bom.json](hardware/bom.json) for the structured concept BOM and [docs/HARDWARE_ARCHITECTURE.md](docs/HARDWARE_ARCHITECTURE.md) for interfaces and prototype gates. The 3D model and BOM are an engineering concept, not production CAD or a substitute for licensed structural, electrical, grid and water-safety design.

## Site configurator and AI advisor

- `src/site/sizing.js` is the deterministic sizing and pricing engine. Tiers (S villa, M residential, L commercial), climate thresholds and AED rates are all in that file; `RATES` holds every price and tariff assumption.
- `src/os/` drives the control engine for the site: `scenarios.js` (hero conditions), `day.js` (24 h simulation with illustrative sun and load shapes), `explain.js` (plain-English mode reasons). Tested in `src/os/os.test.js`.
- `src/site/presets.js` holds built-in reference climates so the demo works instantly and offline; live values come from NASA POWER via `/api/climate`.
- `api/advisor.js` asks an LLM to explain the engine's build for the site. It never changes the numbers. Provider order: Groq (free tier) → Claude (optional) → rule-based advice. On any error it falls through, and the page labels which one is showing.
- To enable the AI advisor on Vercel: create a free key at console.groq.com → Vercel Project → Settings → Environment Variables → add `GROQ_API_KEY` (optionally `GROQ_MODEL` to pin a model), then redeploy. `ANTHROPIC_API_KEY` is optional. For local dev, export the key before `npm run dev`; the Vite dev server serves `/api/*` too.

## Verify

```bash
npm run check
npm run firmware:build  # requires PlatformIO
```
