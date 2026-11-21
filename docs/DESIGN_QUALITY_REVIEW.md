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

## Remaining weaknesses (not fixed in this pass)

1. **Studio** keeps its previous information architecture (configurator + component index). It is restyled, not redesigned; three.js is not yet lazy-loaded there.
2. **Story callouts** at a few camera angles (solar, power chapters) still sit close to each other on desktop.
3. **Hero dust condition** shows a rinse-rail cleaning cycle, while the sizing engine recommends a dry robot for very dry sites like Dubai. The model shows the rinse rail, so the hero follows the model; the Studio explains the robot choice.
4. **Hourly load and sun shapes** in the day chart are illustrative (documented in `PRODUCT_DISCOVERY.md`).
5. Screenshots used software WebGL; real-GPU frame rates on low-end phones are unmeasured.
6. No user testing; the five-second test above is an expert review.
