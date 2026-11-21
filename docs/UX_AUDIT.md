# WELOS — UX audit (before)

Screenshots of the version audited are in the pull request (`before/`). Severity: **S1** blocks understanding or trust · **S2** materially hurts comprehension or usability · **S3** polish.

## Landing (`/`)

| Sev | Issue | User impact |
|---|---|---|
| S1 | Hero says "SUN. WIND. WATER." with no product noun, user or outcome. Five-second test fails: a visitor can't tell whether this is a product, a campaign or a utility. | Visitors leave without knowing what WELOS is. |
| S1 | Three incompatible spec sets (800 W / 3.5 kWh prototype vs 10.5 kWp / 20 kWh sizing vs 3.6 kWp / 24 kWh simulator) shown as if one product. | An engineer stops trusting every number. |
| S1 | The exploded view is 17 scenes and ~21 screens of scroll before anything else is reachable; low-value scenes (chassis, base frame, reassembly) cost as much scroll as the key ones. | Scroll fatigue; the products, demo and tools are effectively hidden. |
| S2 | Scene panels overflow at 1440×900: spec table, UAE note and the "for your site" box run under the footer readout (scene 02 screenshot). Callout labels overlap the model and each other. | Text unreadable exactly where explanation matters. |
| S2 | Nothing on the page is interactive except scrolling; the 3D model can't be touched, and the only demonstration of what the controller does is a separate page. | No "aha" moment; the product's intelligence is invisible. |
| S2 | No explanation of *how the system decides*; the control engine (the most real part of the product) is mentioned only as "WELOS OS decides". | Visitors miss the differentiator. |
| S2 | Dark navy page with neon-cyan accents, 96 px background grid, registration marks, glowing AI button and "SCENE 00/16 · AZ 37.3° EL 14.7°" telemetry readout. Reads as generic sci-fi dashboard, not a credible hardware company. | Weak brand; "looks AI-generated". |
| S2 | AI-rendered reference images float beside the model and compete with it; their placement algorithm sometimes covers parts. | Two competing representations of the product. |
| S2 | Products section shows three image cards with prices but no comparison of what changes between scales. | Hard to choose. |
| S3 | Uppercase mega-type used for five different statements ("ONE SYSTEM. TWO ESSENTIAL RESOURCES.", "HARVEST.", "TREAT."). Repetition dilutes emphasis. | Noise. |
| S3 | Fonts loaded from two third-party CDNs (Google Fonts + Fontshare), render-blocking, and absent when offline. | FOUT / layout shift. |
| S3 | Roadmap: 13 items with chips, three lanes, plus a security list. Dense. | Skimmed, not read. |

## Studio (`/studio.html`)

| Sev | Issue | User impact |
|---|---|---|
| S2 | Dark theme disconnected from any light brand surface; heavy pill/segmented controls and amber-filled tabs. | Inconsistent brand across pages. |
| S2 | "Showing your configured modules" banner overlaps the WebGL watermark text at the top of the model pane. | Looks broken. |
| S3 | Component index of 27 near-identical cells under the model. | Dense, low information scent. |

## Control OS (`/control.html`)

| Sev | Issue | User impact |
|---|---|---|
| S1 | Header shows "Link healthy" with a glowing dot, and a node ID, on a page driven entirely by a browser simulator. | Fake live telemetry: misleading. |
| S2 | Nine equally weighted panels; five KPI tiles of identical prominence; the most important information (what the system is doing and why) is one line of small text. | No hierarchy: current state → insight → action is not followed. |
| S2 | Energy bus drawn as boxes with no direction of flow; reader must add numbers to see where power goes. | Requires interpretation. |
| S2 | Manual mode buttons look disabled (low-contrast text on dark) even when enabled. | Controls appear dead. |
| S3 | Monospace everywhere, 9–10 px labels, letter-spaced caps. | Readability and contrast below WCAG AA in several labels. |

## Cross-cutting

| Sev | Issue |
|---|---|
| S2 | No `prefers-reduced-motion` handling outside the exhibit; no WebGL fallback beyond an error string. |
| S2 | Many 10–11 px, 60%-opacity labels on dark: contrast ratios around 3:1. |
| S3 | `lucide-react` icons used for decoration in Studio tabs. |
| S3 | Landing bundle pulls `RoomEnvironment` (~550 kB) synchronously. |

## What works and is kept

- The 3D engineering model (174 meshes, 27 tagged components) and its explode choreography and energy/water flow tubes: genuinely product-specific.
- `parts.js` already records role, evidence and validation status per component, an honest data source for part details.
- The sizing engine's per-component "why" and rule lists.
- The control engine's plain-English decision strings.
