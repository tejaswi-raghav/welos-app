# WELOS

WELOS is an integrated renewable-energy and rainwater product concept with a local, offline-first control OS. This repository contains the public site, an interactive 3D product model, a browser control simulator and ESP32-S3 reference firmware.

## Run
```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Entry points:

- `/` — **exploded view landing**: scroll the appliance apart; each part says what it does, how it works and what energy or resource it captures, with UAE notes and its capacity sized for the visitor's configured site. Below: what each module captures, the three product scales (priced by the sizing engine), what comes next, and links into the tools.
- `/studio.html` — **Studio**: the 3D model and the **Design yours** configurator side by side, with buttons for *Side by side*, *3D model* and *Configure* (`#both`, `#model`, `#configure`; `?tier=M` opens a scale). Modules switched on or off in the configurator appear on the model.
- `/control.html` — live WELOS OS simulator
- **WELOS AI** — the site advisor lives in a slide-out sidebar (`src/ai/`) opened from every page's header, so it never interrupts the page. It follows the build saved by the configurator.
- `/glass.html` and `/classic.html` — previous landings, kept as fallbacks. `/model.html`, `/configure.html` and `/explore.html` redirect to the new pages.

Brand: the amber ring logo with the `welos™` wordmark (`public/brand/`) and the palette Night `#090D12`, Deep `#111A24`, Paper `#F5F3ED`, Sun `#FFB800`, Steel `#C7D0D9`, Sky `#00BFEA`.

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
