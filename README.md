# DIU-7 | One Day of Food and Water

An interactive speculative-worldbuilding artifact set in Singapore in 2074. The Daily Food & Water Service presents an opaque, standardized daily unit as normal public infrastructure.

Four selectable profiles share one procedural Three.js product:

- **Basic:** 2,140 calories, 60 g protein, 2.8 L water — S$11.20/day
- **Performance:** 2,700 calories, 120 g protein, 3.2 L water — S$14.80/day
- **Nutrition:** 2,140 calories, 60 g protein, expanded vitamin/mineral profile — S$14.40/day
- **Premium:** 2,600 calories, 110 g protein, expanded vitamin/mineral profile — S$18.60/day

The values are fictional product content informed by general Singapore adult dietary guidance. They are not personal nutrition or medical advice.

## Open locally

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/).

## Presentation modes

| URL | Behaviour |
| --- | --- |
| `/?hero=1` | Opens directly to the assembled poster composition. |
| `/?demo=1` | Runs the optional inspection and regular-food comparison sequence. |

Keyboard shortcuts: **E** opens or closes the unit, **M** opens the regular-food comparison, **H** restores the hero composition, and **D** starts the demo. Drag to turn; use wheel or pinch to zoom.

## Files

| File | Role |
| --- | --- |
| `index.html` | Streamlined interface, pack selector, regular-food comparison and responsive layout. |
| `scene.js` | Three.js renderer, opaque procedural model, dynamic bottle label, lighting and interactions. |
| `world-data.js` | Fictional world, pack, component and equivalent-food records. |
| `test/*.js` | Node checks for pack data, required interface content and model behavior. |

## Verify

```bash
for test_file in test/*.js; do node "$test_file"; done
```

## Deploy with GitHub Pages

The project has no build step. Publish this folder from the repository root; `index.html` is the entry point and Three.js loads through the existing import map.
