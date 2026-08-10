# SEA STATE / CONTAMINATION INDEX

Speculative design dashboard for a university Worldbuilding final project: a near-future (2040–2075) ocean monitoring instrument in which the sea is a managed waste sink. Drag the **Contamination Index** to watch the water, sky, fog, floating waste and invasive biomass degrade continuously.

**World premise:** AI data centres became the dominant energy consumer; renewables and nuclear could not scale fast enough, so coal and kerosene returned at industrial scale. Food is almost entirely ultra-processed and chemically formulated. Battery production (grid storage, vehicles, AI hardware) exploded. The three systems — energy, food processing, batteries — drive the contamination this instrument reports.

## Open locally

Serve the folder over HTTP (required — `scene.js` is an ES module and loads
Three.js + GLTFLoader via an import map, which browsers refuse from `file://`):

```bash
# from this directory
python3 -m http.server 8080
# then open http://localhost:8080/
```

### Demo & capture

| URL | Behaviour |
|-----|-----------|
| `/?demo=1` | Slow auto-scrub of Contamination Index **0 → Terminal**, then **parks** at CI ≈ 92 (for booth / critique). Manual slider takes over if you drag. |
| `/?hero=1` | Jump to Terminal still bookmark (CI ≈ 92 + camera preset) for key-image capture. |

Keyboard (when focus is not in a field): **`D`** starts the demo scrub; **`H`** applies the hero bookmark.

## Files

| File | Role |
|------|------|
| `index.html` | Minimal app shell (top bar + single right panel) + import map / module wiring |
| `scene.js` | ES module: ocean/sky shaders, camera rig, instanced procedural debris fill, GLB hero debris, invasive biomass, ash fallout |
| `models/*.glb` | Local GLB waste models (bottle, can, cardboard box, barrel, battery), cloned 15–30× and faded in with the index; procedural debris remains as fill and as fallback if a GLB fails to load |
| `contamination-map.js` | Pure Contamination Index → metrics / visual parameters (shared with tests) |
| `test/metrics-check.js` | Node test of the shipped mapping functions |

## Controls

- **Contamination Index** slider (0–100): primary control; drives metrics, year, regime, status, and 3D degradation.
- **Drag**: orbit the observation platform.
- **Right-drag / Shift-drag / two-finger drag**: pan (moves the platform, including vertically).
- **Wheel / pinch / `+` `-`**: zoom (clamped).
- **Arrow keys**: orbit / vertical trim.
- Camera never dips below the waterline and cannot leave the survey sector; a gentle drift resumes ~5 s after you let go.
- **Click the water**: authorized discard — sector sample (operator industrial dump, not a sandbox toy).
- Opening card (once on load) frames the managed-sink premise; dismiss or wait for auto-fade.
- Bottom-left **instrument log** updates with each stage band (`SSA-MON // …`).

## Readouts

All metrics derive continuously from the Contamination Index:

- **Particles** (µg/L) — coal/kerosene ash, black carbon, battery-mineral runoff.
- **Nutrients** (mg/L) — ultra-processed food industry discharge.
- **Light depth** (m) — how far light reaches underwater; near-zero at terminal.
- **Life health** (%) — oxygen / toxicity / habitat composite; collapses non-linearly.
- **Stage** — premise band (Rising demand → Coal return → Food & batteries → Heavy load → Systemic decay → Terminal) with a short institutional caption per band.
- **Year** (2026–2075) and **Status** (OK → Elevated → Critical → Terminal).

Floating waste composition shifts by stage (ordinary bottles/film early → battery, solar scrap, food packaging, medical plastics, then biomass). A survey buoy and exclusion ring mark the monitored sector.

## Verify

```bash
node test/metrics-check.js
node test/ui-shell-check.js
node test/stage-captions-check.js
```

## Deploy (GitHub Pages)

Push this repository and enable Pages on the root (or `/docs`). Entry point is `index.html`. No build step.
