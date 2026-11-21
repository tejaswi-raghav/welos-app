# WELOS — Design quality review

Reviewed from rendered screenshots (headless Chrome, SwiftShader WebGL) at 1440×900, 1280×720, 820×1180 and 390×844. Screenshots: `docs/screenshots/`.

## Rubric

0–3 broken or misleading · 4–6 works but generic or confusing · 7–8 clear and consistent, minor defects · 9–10 distinctive, clear, no known defects.

## Scores

| Criterion | Weight | Landing | Studio | Control OS | Evidence |
|---|---:|---:|---:|---:|---|
| Product clarity | 25% | 9 | 7 | 8 | Hero states product, inputs, mechanism and market in two lines; the model shows a working decision on load. Studio still opens on a dense configurator. Control OS leads with mode + plain-English reason. |
| Brand originality | 20% | 8 | 6 | 8 | Part codes, leader-line plates and ring-derived energy gradient are WELOS-specific. Studio inherits the older configurator layout under new tokens. |
| Visual elegance | 15% | 8 | 7 | 8 | Calm paper, ink hairlines, one accent family. Remaining: story callouts can crowd at some camera angles. |
| Functional usability | 15% | 9 | 8 | 8 | Every control acts on real state; demo, scale table, part picking, tour pause, AI sidebar verified by script. |
| Information design | 10% | 9 | 7 | 8 | Day chart answers one question with direct labels and an insight list; every figure tagged by source. |
| Motion quality | 5% | 8 | 7 | 8 | Motion maps to physics (rotor ∝ wind, flow ∝ kW). Reduced-motion fully supported. |
| Accessibility | 5% | 9 | 8 | 9 | axe 0 violations on all pages; keyboard radiogroups; text alternatives for charts. |
| Performance | 5% | 8 | 6 | 9 | Landing: CLS 0, text paints before three.js (lazy, 143 kB gz). Studio loads three.js eagerly. |
| **Weighted** | | **8.7** | **7.0** | **8.2** | |

Scores are my assessment against the rubric, not user-tested. They are below 9 where the evidence says so.

## Five-second test (landing hero)

A first-time visitor sees, without scrolling or reading anything else:

1. **What it is:** "Power and water from your own roof." + "one rooftop unit that captures sun, wind and rain".
2. **How it works:** "stores them, and runs its own controller to decide where every watt and litre goes."
3. **Proof it works:** a 3D unit with live tags (SUN 8.0 kW, BATTERY charging 5.8 kW, HOME 2.6 kW), and a decision sentence from the engine.
4. **Who it's for:** "Built for the UAE".
5. **What to do:** "Size it for my roof".

**Pass.** The old hero ("SUN. WIND. WATER.") named three inputs but not a product, a user or an outcome.

## User-experience checks

| Check | Result |
|---|---|
| Understand WELOS within five seconds | Pass (above) |
| Identify the real-world problem | Pass: "The problem" section, plus the dust/storm/outage conditions in the hero |
| Understand the mechanism within thirty seconds | Pass: hero conditions + "How it decides" trace |
| Explore a working demonstration | Pass: conditions (control engine), sizing + 24 h day (sizing + control engine) |
| Interpret results without specialist knowledge | Pass: insight sentences, "Why:" lines, units everywhere |
| Find and use the actual product | Pass: Studio and Control OS in nav, demo saves the build for the Studio |
| Recognise the brand across pages | Pass: shared tokens, type, ink wordmark and header on all three pages |

## Strengths

- The hero demonstration is real: five sensor snapshots through `evaluateController()`; the model, tags and dock all read the same result.
- The day chart closes the loop between sizing and control; switching city or scale re-runs both engines.
- Honest labelling throughout; the fake "Link healthy" indicator and conflicting prototype specs are gone.


## Round 2: the living rooftop

Changes after review feedback ("keep the landing mostly the exploded view", "explain the numbers visually", "the Studio 3D section doesn't work") and the Phase 14 brief.

| Experience | What was built | Driven by |
|---|---|---|
| Living rooftop (hero) | The unit now stands on an architectural section of a UAE villa roof (slab, parapets, AC condensers). Drag to turn (±28°, damped, mouse/pen only so touch still scrolls). Five conditions, plus an All / Energy / Water switch that isolates flows and labels. | `evaluateController()` per condition |
| 24 hours | A scrubber and play button replay one simulated day on the 3D scene: the sun travels east to west, the sky warms at sunrise and sunset and cools at night, the rotor follows the wind, flows reverse when the battery discharges, and a plain sentence names each transition. Includes a mini timeline of generation, demand and battery level. | `simulateDay()`: every step stores the engine's full decision |
| Product film | 17 choreographed scenes now read as 8 chapters (rooftop, take it apart, sun and wind, power and control, rain to water, follow the flows, the loop, back together). Each chapter is a headline plus icon rows; engineering detail sits behind "Details". Scroll length cut from about 21 screens to about 11. | Existing choreography |
| Self-cleaning | A standalone demo: dust, wind, sunlight and tank sliders, four presets including three blocked states, the controller's five checks with live values and limits, a rinse that runs only when every check passes, then the recovery and the 12 L it cost. | `evaluateController()` cleaning eligibility |
| Inside the controller | The decision trace (inputs → protect → mode → route) stays. Control OS nodes now open a "Why" card with the measurements and limits behind each node's behaviour. | Engine config and result |
| Studio | The 3D view was rebuilt: the model fills the stage, views fit any panel shape, the chosen system stays solid while the rest fades, controls sit in one dock, and part details appear in a card that collapses on small screens. The summary numbers and climate strip are now pictures. | Sizing engine |
| Numbers as pictures | Waffle (share of power), water cube beside a person (annual litres), dust before and after cleaning, battery with its reserve, hours dial, panel grid (module count), bathtubs (tank size), payback timeline. | Sizing engine |

Checks this round: axe 0 violations on all three pages; 16 scripted interactions pass (conditions, 24 h scrub and play, flow filter, part picking, chapter jump, cleaning blocked and completed, trace, demo re-run, AI sidebar, Studio system and part select, configurator update, Control OS node "why", outage scenario); no horizontal overflow at 1440, 1280, 820 or 390 px; no console errors; `npm run check` passes.

Still open: the Studio configurator column keeps its form structure; real-GPU performance on low-end phones is unmeasured; the essentials load used for "hours of outage cover" (0.6 kW) is an assumption and labelled as one.

## Remaining weaknesses (first pass)

1. **Studio** keeps its previous information architecture (configurator + component index). It is restyled, not redesigned; three.js is not yet lazy-loaded there.
2. **Story callouts** at a few camera angles (solar, power chapters) still sit close to each other on desktop.
3. **Hero dust condition** shows a rinse-rail cleaning cycle, while the sizing engine recommends a dry robot for very dry sites like Dubai. The model shows the rinse rail, so the hero follows the model; the Studio explains the robot choice.
4. **Hourly load and sun shapes** in the day chart are illustrative (documented in `PRODUCT_DISCOVERY.md`).
5. Screenshots used software WebGL; real-GPU frame rates on low-end phones are unmeasured.
6. No user testing; the five-second test above is an expert review.
