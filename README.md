# DIU-7 // Civic Daily Intake Unit

An interactive speculative-worldbuilding artifact set in Singapore in 2074. The Civic Nutrition Network terminal presents one standardized daily food-hydration unit as routine public infrastructure: desirable, clinical and normal within the society that produces it.

The procedural Three.js model combines an atmospheric barrier shell, purified hydration reservoir, macronutrient matrix, adaptive additive cartridge, controlled mixing valve and structural distribution spine. Select a component, separate the assembly, or compare it with the increasingly expensive conventional food and potable water it replaces.

## Open locally

The project has no build step. Serve this folder over HTTP so the browser can load its ES modules:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/).

## Presentation modes

| URL | Behaviour |
| --- | --- |
| `/?hero=1` | Opens directly to a poster-ready assembled DIU composition. |
| `/?demo=1` | Runs a restrained 26-second inspection sequence through component separation and the equivalent meal view. |

Keyboard shortcuts: **E** toggles exploded view, **M** toggles the equivalent meal, **H** restores the hero composition, and **D** starts the demo. Drag to rotate; use wheel or pinch to zoom.

## Files

| File | Role |
| --- | --- |
| `index.html` | Static institutional interface, responsive layout and comparison view. |
| `scene.js` | Three.js renderer, procedural DIU model, product label, lighting, selection and animation. |
| `world-data.js` | Pure fictional civic, product, component and equivalent-meal records shared with Node tests. |
| `test/world-data-check.js` | Validates the fictional world and product record. |
| `test/ui-shell-check.js` | Checks required interface language, controls, modes and obsolete-language removal. |
| `test/product-model-check.js` | Checks procedural component and interaction hooks. |

## Verify

```bash
for test_file in test/*.js; do node "$test_file"; done
```

## Deploy with GitHub Pages

Publish the folder from the repository root (or move it to `/docs`) and enable GitHub Pages. `index.html` is the entry point; the module import map resolves Three.js from jsDelivr at runtime.

All nutritional, medical, infrastructure and price content in this project is fictional speculative-design material, not health advice or a real product claim.
