# WELOS site: experience architecture and decisions

## 1. Reference study

The benchmark was AquaGrid (live site and source, `tejaswi-raghav/audacity-aquagrid`). What it does well, and what was carried over as a principle rather than copied:

| AquaGrid | WELOS interpretation |
| --- | --- |
| One twin (city, network, plant) reused by every section | One rooftop twin (`src/twin`) reused by every page |
| Layer separation with plates and risers | Service-direction exploded view of the real assembly, plus six engineering layers in the Explorer |
| Sticky stage + step cards with clock pills for the 14:00 incident | Combined-stress day on the homepage, steps chosen from the simulation's own event log |
| SVG network with upstream tracing | SVG topology in the Control OS, sharing node and edge definitions with the 3D routes |
| Values from a backend simulation, "nothing shown in its place" when offline | Values from the deterministic browser simulation of the existing control engine; every surface is labelled simulated |

The identity is deliberately different: a warm architectural paper and ink palette from the WELOS ring (amber, ember), Geist + Geist Mono with Instrument Serif accents, a physically lit rooftop instead of an isometric city, and amber-solid / sky-dashed conventions for power and water.

## 2. One twin, separated state

| Concern | Where |
| --- | --- |
| Physical geometry | `twin/model.js` builds the transcribed engineering model (`model-data.js`) and tags parts; `rooftop.js` adds context |
| Environmental + simulation state | `twin/sim.js` → frames (sun, wind, rain, dust, load, controller result, battery, tank, soiling) |
| Animation state | `Stage` damps explode, schematic, environment fade, focus, sun direction, rotor speed |
| Interaction state | Page code (selection, layer, scenario, timeline index) |
| Camera state | `Stage.setPose` (tweened) / `setPoseNow` (scroll-scrubbed) / OrbitControls |

A frame is the unit of truth: the same frame drives the 3D scene (sun position, rotor brake, dust film, rain, rinse, tank gauge, battery LEDs, flow routes), the topology, the charts and the explanation text.

## 3. Honesty rules applied

- No random values. `sim.js` is deterministic; tests assert repeatability.
- Controller behaviour is `src/control/engine.js` unchanged. Explanations (`explainFrame`) are written from the same thresholds in `DEFAULT_CONFIG`, and a test asserts that the explained actions match the engine outputs.
- Self-cleaning never invents a recovery figure: soiling reduction per cycle is the existing simulator's rinse rate × cycle duration; output effects use the simulator's derating formula.
- Actions are labelled simulated; the Control OS states that no actuator is operated.
- Removed claims from the previous homepage that no source supported (fixed 400 W turbine rating, 21.5% module efficiency, 3.5 kWh battery, 50 L/min capture, LoRaWAN, 45 dB).
- The reference simulation unit (3.6 kWp, 24 kWh, 420 L) comes from `simulator.js` / `DEFAULT_CONFIG`; Studio sizes real systems with `sizing.js`, and says so.

## 4. Motion system

- Camera: cubic in-out with a slight upward arc for tweened moves; scroll scenes hold the camera for ~60% of each chapter and move only in the tail, so text is read while the view is still.
- Physical motion is damped (sun direction, rotor spin-up and braking, explode, ghosting) rather than keyframed.
- Operational UI uses short, sharp transitions; typography uses one restrained mask reveal on the hero.
- Page transitions are cross-document View Transitions: the header and the twin stage are shared elements; everything else crossfades. Unsupported browsers navigate normally.
- `prefers-reduced-motion`: camera moves jump, flows stop animating, the rotor stops, CSS transitions collapse.

## 5. Performance and fallbacks

- One WebGL renderer per page, paused when the canvas is off-screen or the tab is hidden; DPR capped (1.75 desktop / 1.5 mobile); shadow map 2048 / 1024.
- The Control OS does not load three.js.
- Without WebGL the pages still work: the homepage shows a reference image behind the story, the Explorer keeps its parts, layers and connection panels, the Lab keeps its timeline, charts and explanations.

## 6. Accessibility

- Every 3D interaction has a DOM equivalent (parts list, layer list, topology nodes are keyboard-focusable buttons).
- Text contrast meets WCAG AA on the paper and bone surfaces (muted and faint text tokens were checked).
- Charts carry labels; the Lab narrates each frame in plain language.

## 7. Known gaps

- Swiftshader screenshots were used for QA; real-GPU performance on low-end phones still needs profiling on devices.
- The rooftop is illustrative context, not a surveyed roof. Studio's extra canopy bays convey scale only.
- Studio's Dubai build selects a waterless robot (sizing engine), while the controller and story describe a rain-fed rinse rail; this is a pre-existing divergence between the two engines worth resolving in the product definition.
- View Transitions between pages are cross-fades with a shared stage, not continuous camera paths across documents.
