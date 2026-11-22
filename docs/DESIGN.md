# Solar Ember — WELOS design system (dark)

The whole site uses the landing page's palette: obsidian and burnt-ember grounds with a soft ember atmosphere (`--field`), ivory type, solar orange for actions and sun gold for labels. Every 3D view stands in front of the same ember field and sun disc.

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

Values are tuned for dark grounds; every text colour is at least 4.5:1 on `--bg`, `--bg-2`, `--surface` and `--surface-2`.

| Meaning | Graphic | Text on dark | Soft fill |
| --- | --- | --- | --- |
| Brand / CTA / current page | `--brand` #F47616 (obsidian text on it) | `--brand-ink` #FF9D57 | `--brand-soft` |
| Electrical power, solar output, battery | `--power` #F0A010 | `--power-ink` #FFC65A | `--power-soft` |
| Water | `--water` #2A9FE0 | `--water-ink` #8CCDF3 | `--water-soft` |
| Warning / blocked | `--warn` #EF6A2A | `--warn-ink` #FFA077 | `--warn-soft` |
| Critical / fault | `--critical` #FF6B5E | | `--critical-soft` |
| OK / success | `--ok` #5CC28A | | `--ok-soft` |
| Control signal | ivory, dotted | | |

Surfaces: `--bg` obsidian #1D0D09, `--bg-2` #26110A, `--surface` #2C150D, `--surface-2` #3A1A0E, lines #452719 / #613A27. Text: ivory #FFF5E6 (17.5:1), `--text-2` #E8D5C2, `--muted` #B9A28F (7:1 on surface). A control filled with `--text` (ivory) carries `--on-text` (obsidian).

## Type

Geist for words, Geist Mono for numbers, labels and engineering data. Two families, no serif. The second clause of a headline is the same family at weight 400 in muted brown (`.t-soft`), not italics or gradient text.

## Surfaces and shape

Obsidian page with the ember atmosphere, `--surface` for raised cards, `--bg-2` for wells and segmented controls. Radii: 6 / 8 / 12 / 18 px. Two shadows, both warm. No glass: overlays are solid surfaces; blur is kept only for the header (10 px) and the macOS-style welOS shell, where vibrancy is part of the metaphor.

## Motion

`--e-out` for entrances, `--e-io` for loops, `--t-fast` (160 ms) for hover, `--t-med` (320 ms) for state changes. Transform and opacity only. Continuous motion exists only where it carries meaning (power and water flow dashes, rotor speed, sun position). `prefers-reduced-motion` turns transitions and loops off.

## 3D

The product is shown in warm graphite, champagne aluminium and ivory powder-coat. Water parts stay blue; power parts amber. On the home story, Explorer, Product and Simulation Lab the rooftop context and sky are faded out so the product stands in front of the ember field and sun disc; a shadow catcher keeps it grounded and a warm back-light traces its edges. Elsewhere the sky dome is tinted toward desert haze while keeping night and storm states legible.
