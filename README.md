# WELOS

WELOS is an integrated renewable-energy and rainwater product concept with a local, offline-first control OS. This repository contains the public site, an interactive 3D product model, a browser control simulator and ESP32-S3 reference firmware.

## Run
```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The product tools are separate entry points:

- `/` — Tesla-style landing: hero, WELOS S/M/L, **Design yours** (location → NASA climate → build sized to the site with Essential/Recommended/Max packages, instant AED price and monthly estimate, per-part “why this size” rules), **WELOS AI** (site analysis + ask-a-question), WELOS OS, the problem, and links to the 3D tools
- `/model.html` — integrated rooftop 3D appliance with selectable hardware, software stack and full-system separation
- `/explore.html` — scroll-driven exploded-view story of the same appliance, with supplied reference visuals tied to each subsystem, plus each subsystem's capacity and sizing rules for the visitor's configured site
- `/model.html?exploded=1` — opens the 3D assembly with its components separated
- `/configure.html` — climate-informed or manual site configurator with a live 3D add-on preview
- `/control.html` — live WELOS OS simulator

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
- `src/site/presets.js` holds built-in reference climates so the demo works instantly and offline; live values come from NASA POWER via `/api/climate`.
- `api/advisor.js` asks an LLM to explain the engine's build for the site. It never changes the numbers. Provider order: Groq (free tier) → Claude (optional) → rule-based advice. On any error it falls through, and the page labels which one is showing.
- To enable the AI advisor on Vercel: create a free key at console.groq.com → Vercel Project → Settings → Environment Variables → add `GROQ_API_KEY` (optionally `GROQ_MODEL` to pin a model), then redeploy. `ANTHROPIC_API_KEY` is optional. For local dev, export the key before `npm run dev`; the Vite dev server serves `/api/*` too.

## Verify

```bash
npm run check
npm run firmware:build  # requires PlatformIO
```
