# SEA STATE / CONTAMINATION INDEX

Speculative design dashboard for a university Worldbuilding final project: a near-future (2040–2075) ocean monitoring instrument in which the sea is a managed waste sink. Drag the **Contamination Index** to watch the water, sky, fog, and floating waste degrade continuously.

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
| `index.html` | Full dashboard UI + Three.js scene (procedural ocean, debris, fog) |
| `contamination-map.js` | Pure Contamination Index → metrics / visual parameters (shared with tests) |
| `test/metrics-check.js` | Node test of the shipped mapping functions |

## Controls

- **Contamination Index** slider (0–100): primary control; drives metrics, year, status, and 3D degradation.
- **Click the sea**: dump a small cluster of extra waste at that location (optional polish).

## Verify metrics

```bash
node test/metrics-check.js
```

## Deploy (GitHub Pages)

Push this repository and enable Pages on the root (or `/docs`). Entry point is `index.html`.
