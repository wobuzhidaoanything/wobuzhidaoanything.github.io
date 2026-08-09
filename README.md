# SEA STATE / CONTAMINATION INDEX

Speculative design dashboard for a university Worldbuilding final project: a near-future (2040–2075) ocean monitoring instrument in which the sea is a managed waste sink. Drag the **Contamination Index** to watch the water, sky, fog, floating waste and invasive biomass degrade continuously.

**World premise:** AI data centres became the dominant energy consumer; renewables and nuclear could not scale fast enough, so coal and kerosene returned at industrial scale. Food is almost entirely ultra-processed and chemically formulated. Battery production (grid storage, vehicles, AI hardware) exploded. The three systems — energy, food processing, batteries — drive the contamination this instrument reports.

## Open locally

Serve the folder (recommended — works with CDN scripts and relative assets):

```bash
# from this directory
python3 -m http.server 8080
# then open http://localhost:8080/
```

Or open `index.html` in a browser after Three.js has been cached from the CDN (needs network on first load).

## Files

| File | Role |
|------|------|
| `index.html` | Dashboard UI (panel, metrics, status) + script wiring |
| `scene.js` | Three.js scene: ocean/sky shaders, camera rig, instanced debris field, invasive biomass, ash fallout |
| `contamination-map.js` | Pure Contamination Index → metrics / visual parameters (shared with tests) |
| `test/metrics-check.js` | Node test of the shipped mapping functions |

## Controls

- **Contamination Index** slider (0–100): primary control; drives metrics, year, regime, status, and 3D degradation.
- **Drag**: orbit the observation platform.
- **Right-drag / Shift-drag / two-finger drag**: pan (moves the platform, including vertically).
- **Wheel / pinch / `+` `-`**: zoom (clamped).
- **Arrow keys**: orbit / vertical trim.
- Camera never dips below the waterline and cannot leave the survey sector; a gentle drift resumes ~5 s after you let go.
- **Click the water**: dispense a small cluster of sample waste at that location.

## Readouts

All metrics derive continuously from the Contamination Index:

- **Particulate & Metal Load** (µg/L) — coal/kerosene ash, black carbon, battery-mineral runoff.
- **Nutrient & Process Residue** (mg/L N-eq) — ultra-processed food industry discharge.
- **Photic Depth** (m) — light penetration; near-zero in the terminal range.
- **Non-Human Viability** (%) — oxygen stress / toxicity / habitat composite; collapses non-linearly.
- **Operating Regime** — the premise stage (Early AI Energy Demand → Coal & Kerosene Return → … → Terminal).
- **Observation Year** (2026–2075) and **System Status** (Nominal → Elevated → Critical → Terminal).

## Verify metrics

```bash
node test/metrics-check.js
```

## Deploy (GitHub Pages)

Push this repository and enable Pages on the root (or `/docs`). Entry point is `index.html`. No build step.
