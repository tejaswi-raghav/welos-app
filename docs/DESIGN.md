# Solar Ember — WELOS design system

Source of truth: `src/ui/base.css` (tokens and primitives). Page stylesheets use tokens only; the 3D stage mirrors the semantic colours in `src/twin/stage.js` (`COLORS`) and maps the CAD finishes to warm materials in `src/twin/model.js` (`FINISH`).

## Audit (before)

1. Cool grey "paper" (`#f3f1ec`) with blue-grey ink (`#14191f`), and a blue sky dome in 3D: nothing tied the site to the brand.
2. Three type families; serif italics on almost every headline.
3. Translucent glass panels with heavy blur on most overlays.
4. welOS had its own ~150 hardcoded macOS colours outside the design system; the AI sidebar carried fallback hexes for every token.
5. One colour name did two jobs: "ember" was both a brand colour and the warning state.
6. Fully rounded pills on buttons, chips, segments and overlays.

## Brand primitives

| Role | Token | Hex |
| --- | --- | --- |
| Obsidian | `--obsidian` | `#1D0D09` |
| Burnt Ember | `--ember-deep` | `#8E2E0F` |
| Solar Orange | `--solar-orange` | `#F47616` |
| Sun Gold | `--sun-gold` | `#FFC65A` |
| Warm Ivory | `--ivory` | `#FFF5E6` |
| Soft Canvas | `--canvas` | `#FAF1E7` |
| Muted Brown | `--brown` | `#75665D` |
| Border | `--sand` | `#E8D8C9` |

Signature gradient `--grad-sun`: `linear-gradient(115deg, #8E2E0F 0%, #F47616 52%, #FFC65A 100%)`. It appears only at brand moments: the home hero field, the sign-in composition, the footer rule, the AI panel rule and the welOS wallpaper.

## Semantic roles (never swap meaning)

| Meaning | Graphic | Text (AA on ivory) | Soft fill |
| --- | --- | --- | --- |
| Brand / CTA / current page | `--brand` #F47616 (obsidian text on it, 6.7:1) | `--brand-ink` #A23B0A (6.1:1) | `--brand-soft` |
| Electrical power, solar output, battery | `--power` #F0A010 | `--power-ink` #8A5300 (5.9:1) | `--power-soft` |
| Water | `--water` #1A8FD0 | `--water-ink` #0B5E8A (6.5:1) | `--water-soft` |
| Warning / blocked | `--warn` #D9480F | `--warn-ink` #9C330A (6.7:1) | `--warn-soft` |
| Critical / fault | `--critical` #B3261E (6.1:1) | | `--critical-soft` |
| OK / success | `--ok` #2F7A4D (4.9:1) | | `--ok-soft` |
| Control signal | obsidian, dotted | | |

Body text is obsidian (17.5:1); secondary text `--text-2` #46352D (10.8:1); muted `--muted` #75665D (5.1:1).

## Type

Geist for words, Geist Mono for numbers, labels and engineering data. Two families, no serif. The second clause of a headline is the same family at weight 400 in muted brown (`.t-soft`), not italics or gradient text.

## Surfaces and shape

Ivory page, `--surface` #FFFBF4 for raised cards, `--bg-2` canvas for wells and segmented controls. Radii: 6 / 8 / 12 / 18 px. Two shadows, both warm. No glass: overlays are solid surfaces; blur is kept only for the header (10 px) and the macOS-style welOS shell, where vibrancy is part of the metaphor.

## Motion

`--e-out` for entrances, `--e-io` for loops, `--t-fast` (160 ms) for hover, `--t-med` (320 ms) for state changes. Transform and opacity only. Continuous motion exists only where it carries meaning (power and water flow dashes, rotor speed, sun position). `prefers-reduced-motion` turns transitions and loops off.

## 3D

The product is shown in warm graphite, champagne aluminium and ivory powder-coat. Water parts stay blue; power parts amber. On the home hero the rooftop context and sky fade out so the product stands in front of the CSS sun disc; a shadow catcher keeps it grounded and a warm back-light traces its edges. Elsewhere the sky dome is tinted toward desert haze while keeping night and storm states legible.
