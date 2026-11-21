# WELOS

WELOS is an integrated renewable-energy and rainwater product concept with a local, offline-first control OS. This repository contains the public site, an interactive 3D product model, a browser control simulator and ESP32-S3 reference firmware.

## Run
```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Entry points:

- `/` — **one roof, one day**: a pinned 3D rooftop in Dubai where scrolling moves the clock. Sunrise, midday surplus, dust and rinse, the evening sea breeze, night on the battery, a storm, the unit taken apart, and a simulated day showing what WELOS OS decides. Readouts come from a 24-hour simulation of a sized villa. Below: the three sizes (priced by the sizing engine) and what's next.
- `/studio.html` — **Design your roof**: pick the place, size, package and add-ons on the left; the 3D roof in the middle updates live and plays your simulated day with the time scrubber; the right shows price, saving, payback, coverage, your day chart and every part with the rule that sized it. Click parts to inspect them, or take the unit apart. `?tier=M` opens a size.
- `/control.html` — live WELOS OS simulator.
- **WELOS AI** — the site advisor in a slide-out sidebar on every page, following the build you designed.
- `/model.html`, `/configure.html` and `/explore.html` redirect to the new pages.

Code map: `src/stage/stage.js` (the 3D rooftop: sky, sun, city, rain, energy and water flows), `src/stage/model.js` (the WELOS unit), `src/stage/day.js` (24-hour simulation), `src/site/sizing.js` (sizing and pricing engine), `src/ai/` (WELOS AI sidebar), `src/landing/` and `src/studio/` (pages).

Brand: the amber ring logo with the `welos™` wordmark in light (`welos-header.png`) and ink (`welos-header-ink.png`) versions; colours Night `#090D12`, Deep `#111A24`, Paper `#F5F3ED`, Sun `#FFB800` (energy), Steel `#C7D0D9`, Sky `#00BFEA` (water); type Archivo, with its wide cut for headlines.

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
