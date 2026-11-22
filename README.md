# WELOS

WELOS is an integrated rooftop resource system: a solar canopy that is also a rain catchment, an optional vertical-axis wind module, LiFePO4 storage, a first-flush / filter / UV water train, and a deterministic, offline-first edge controller. This repository contains the website (a shared 3D digital twin), the browser control engine, the sizing engine, the WELOS AI advisor API and ESP32-S3 reference firmware.

## Run

```bash
npm install
npm run dev
```

## The site

Every page shows the same digital twin in a different context. See [docs/EXPERIENCE.md](docs/EXPERIENCE.md) for the architecture and design decisions.

| Page | What it is |
| --- | --- |
| `/` Story | Seven-scene scroll story: rooftop reveal, sun / wind / rain, the integrated network, the controller's rulebook, the exploded machine, a combined-stress day, and the transition into the OS. |
| `/explorer.html` System Explorer | Select any of the 27 parts, isolate layers, separate the assembly, trace power and water connections, switch physical ↔ schematic. Deep links: `/explorer.html#water-pump`. |
| `/lab.html` Simulation Lab | Scrub a 24-hour operating day over the rooftop (sun, shadows, dust, rain, flows, controller modes), change conditions, compare scenarios, read the event log. `#cleaning` opens the ten-step self-cleaning sequence. |
| `/control.html` Control OS | Operator view: SVG topology with upstream/downstream tracing, decision trace, supervisor requests, scenario replay and activity log. |
| `/studio.html` Studio | Configure a system for a location and roof with the sizing engine; compare packages; export a JSON summary or print. |

`/model.html`, `/configure.html` and `/explore.html` redirect to the new pages.

## Where the numbers come from

- **Controller decisions**: `src/control/engine.js` (unchanged rules, mirrored by `firmware/src/ControlEngine.cpp`).
- **Operating-day simulation**: `src/twin/sim.js` drives the engine with a deterministic environment (solar geometry for Dubai, clear-sky irradiance, scenario shapes for wind, rain, dust and load). It is labelled as a simulation of a concept reference unit everywhere it appears; there is no random number and no real telemetry.
- **Sizing and prices**: `src/site/sizing.js` (indicative AED estimates, not a quotation).

The 3D model and BOM are an engineering concept, not production CAD or a substitute for licensed structural, electrical, grid and water-safety design.

## Code map

```
src/twin/       sim.js (day simulation) · model.js (assembly, layers, routes) · rooftop.js · stage.js (renderer)
                topology.js (nodes/edges shared by Explorer and Control OS) · useStage.js (React hook)
src/ui/         base.css (design system) · chrome-html.js (header/footer injected at build) · chrome.js
src/home/       scroll story
src/explorer/   System Explorer
src/lab/        Simulation Lab and self-cleaning sequence
src/control/    engine.js, simulator.js (legacy live simulator, kept for tests), Control OS UI
src/studio/     Studio configurator
src/site/       sizing.js, presets.js
src/ai/         WELOS AI sidebar
api/            Vercel functions: advisor, climate (NASA POWER), location (OSM)
firmware/       ESP32-S3 reference firmware
```

Brand: the amber ring mark with the `welos™` wordmark (`public/brand/`; `*-ink.png` are the same marks with the wordmark in ink for light backgrounds). Site palette: Paper `#F3F1EC`, Ink `#14191F`, Amber `#F2A007` (power), Ember `#EF6A12`, Sky `#1AA7E0` (water).

## WELOS AI

`api/advisor.js` explains the sizing engine's build; it never changes the numbers. Provider order: Groq → Claude (optional) → rule-based advice. Set `GROQ_API_KEY` (and optionally `ANTHROPIC_API_KEY`) in Vercel to enable it.

## Verify

```bash
npm run check            # engine, parts, sizing, twin simulation + topology tests, production build
npm run firmware:build   # requires PlatformIO
```
