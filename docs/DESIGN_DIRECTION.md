# WELOS — Design direction

## Directions considered

| | A. Engineering sheet in daylight | B. Night instrument | C. Product photography |
|---|---|---|---|
| Idea | Warm paper, ink hairlines, part codes and leader lines, as on a drawing sheet; the 3D unit is the illustration | Keep the dark console, add glow and telemetry | Apple-style studio renders, minimal UI |
| Originality | High: grows from the model's own part codes (W01, S01, R03…) and callouts | Low: the "AI dashboard" look the brief rules out | Medium: generic premium-product grammar |
| Clarity | High: dark text on light, colour reserved for meaning | Medium: low-contrast labels | High for the hero, weak for data |
| Feasibility | High: the existing model, callout and flow systems were built for a light paper theme | High | Low: needs photographic renders that don't exist |
| Brand fit | Ring colours read best on light; wordmark recoloured to ink | Matches the old site only | Neutral |

**Chosen: A.** It is the only one where the visual language comes from the product itself, and it serves both the engineer (codes, thresholds, sources) and the homeowner (one clear sentence, a model that responds).

## 1. Core principles

1. **Say what it is in one sentence, then prove it.** Hero copy names the product, the inputs, the outputs and the mechanism. The model beside it is already working.
2. **Colour is information.** Sun/ember = energy, water blue = water, ink = structure and control. Nothing is coloured for decoration.
3. **Every number carries its source.** *Engine output*, *Engine assumption*, *Simulated* or *Concept*, marked with a small glyph (`.w-src`).
4. **Real thresholds, not adjectives.** "Brakes the rotor above 15 m/s", "cleans when dust costs 18%", values read from `DEFAULT_CONFIG`.
5. **Stillness by default.** Things move only to show flow, response or order.

## 2. Visual identity rationale

- **Logo:** the amber ring and `welos™` wordmark are untouched in shape. For light surfaces the wordmark pixels were recoloured to ink (`welos-header-ink.png`, `welos-lockup-ink.png`); the ring keeps its original gradient and glow.
- **Part codes as identity.** The model's component codes (W01–W03, S01–S05, E01–E06, R01–R05, C01–C08) appear on story chapters, callouts and part cards. They make WELOS recognisable without its name.
- **Leader lines and paper plates.** Callouts are small paper tags with a 1 px rule and an elbow leader to the part: the drawing-sheet vocabulary, not floating glass.

## 3. Colour and type

| Token | Value | Use | Contrast on paper |
|---|---|---|---|
| `--paper` | `#F4F1EA` | page | — |
| `--ink` | `#10151B` | text, structure | 16.3:1 |
| `--ink-2` | `#3E4650` | secondary text | 8.5:1 |
| `--ink-3` | `#5F6771` | labels, captions | 5.1:1 |
| `--sun` | `#FFB800` | energy fills, primary button (ink text 10.6:1) | fill only |
| `--ember` | `#F86A00` | stored/wind energy fills | fill only |
| `--sun-gradient` | `#FFC400 → #F86A00` | sampled from the ring; energy paths, the one-cycle sweep, coverage bars | fill only |
| `--energy-ink` | `#A34A00` | energy text | 5.3:1 |
| `--water` / `--water-ink` | `#1386B5` / `#0B6F93` | water fills / text | — / 5.0:1 |

Type: **Mona Sans** (variable, width axis 75–125%) for everything, set slightly wide (104–106%) for display and normal for UI; **JetBrains Mono** only for part codes, clocks and axis ticks. Both are self-hosted (OFL), preloaded, latin-only subsets. Tabular figures on every metric. No all-caps labels, no letter-spaced eyebrows.

## 4. Motion language

One easing family (`cubic-bezier(.2,.7,.1,1)`), three durations (140/320/720 ms), all zeroed under `prefers-reduced-motion`.

| Motion | What it explains |
|---|---|
| Rotor speed ∝ wind speed; stops when braked | The turbine's real operating state |
| Flow tubes: visible only on live conduits, dash direction = energy direction, speed ∝ kW | Where power and water are going |
| Exploded view along each part's service path | How the unit comes apart and what each part is |
| A single gradient sweep across the four decision stages, staggered 110 ms | The order of one control cycle |
| Hero tour cycles conditions every 6.5 s (pausable, off with reduced motion, stops on interaction or scroll) | That the system responds, before anyone touches it |

No scroll-jacking: scroll position maps to story time with per-chapter weights; nothing is pinned or intercepted.

## 5. Storytelling structure

1. **Hero:** what it is, plus a working model with five real conditions.
2. **Inside (scroll):** chapter per subsystem, each with *Captures / Becomes / Controller* and an engineering-detail drawer.
3. **How power moves / how water moves / the loop:** the integration argument.
4. **The problem:** the same villa, roof today vs with WELOS, engine figures only.
5. **How it decides:** sense → protect → choose mode → route, traced live.
6. **Size it:** sizing engine + a 24 h control-engine day on the chosen build.
7. **Scales, what's real today, tools.**

## 6. Chart rules

- One question per chart, stated as its title; the first insight sentence answers it.
- Direct labels on areas; the key is a secondary aid. A scrubber gives exact values (keyboard accessible).
- Stacks that add up: sun→home + battery→home + grid→home = home use; surplus stacks above it.
- Night is shaded as context, not data. No dual axes, no 3D, no gauges.
- Every chart has a text equivalent (insight list + hidden hourly table).

## 7. 3D strategy

- One WebGL scene for hero and story (the existing 174-mesh model), lazy-loaded after first paint; the hero text and controls render before it.
- Transparent canvas over the page so the hero's warm light comes from CSS, not a skybox.
- The shadow catcher is clipped to the shadow camera to avoid edge shading.
- No-WebGL fallback: a still render (`/explore/poster.webp`) and the story chapters as a readable document.

## 8. Responsive behaviour

- **Desktop:** text column left, model right, condition dock bottom-left.
- **Portrait tablet:** stacked: text, model, dock; the camera re-frames for the tall viewport.
- **Phone:** dock pinned under the header (one scrolling row of conditions), model in the middle, text at the bottom over a paper scrim; no hero tags, at most two callouts per chapter; Control OS swaps the flow diagram for a direction list.

## 9. Accessibility

- Skip link to the demo; visible 2 px ink focus rings; 44 px minimum targets on primary controls.
- Conditions are a proper radiogroup with arrow-key support; the dock and trace are `aria-live`.
- Charts: `role="img"` with generated descriptions, plus tabular data.
- No information is carried by colour alone (labels on every series, text for every state).
- axe-core (WCAG 2.0/2.1/2.2 A and AA rule sets): 0 violations on all three pages after fixes.
