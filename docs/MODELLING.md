# How to model furniture for Roomcraft

This guide is for AI agents that turn a product link into a furniture model. Every product link a person gives
Roomcraft (through the link box or in chat) is sent to their agent with a short version of these rules.

**The goal: it should look like the real product at a glance, at the right size.**

## Limits

| | Limit | Why |
| --- | --- | --- |
| Triangles per item you build | **200,000** (aim for 5k–60k) | The app stays smooth with a full house; renders report the count |
| Component source (`.jsx`) | 150 KB | Use loops for repeated parts |

`save_model_file` keeps store models **exactly as the shop provides them**: nothing is compressed, simplified or
resized. It reports the file size and triangle count. If a store model is very heavy (well over 200k triangles),
the app warns the person and offers the simple shape; building the model yourself may be the better choice.

## Which way to build it

1. **Store has a real 3D file** (`read_link` shows `modelUrl`, or you find a `.glb` on the page): use `add_item`
   with `from_url`, then `save_model_file`. Check the renders against the photos. Store models are the most realistic
   choice when they're right, but some are placeholders, or are wrongly scaled or rotated.
2. **A standard shape fits:** set the right `category` (sofa, armchair, bed, table, …) with the exact size and
   colours. The generator builds a good-looking model:
   - names with "office", "round" or "pouf" change the style;
   - sofas deeper than 1.25 m get a chaise.
3. **Unusual shape** (a curved sofa, a tulip or pedestal base, a fluted sideboard, a rattan chair, a sculptural
   lamp): write a React Three Fiber component with `write_model_component` (see [R3F-MODELS.md](R3F-MODELS.md)).

## What makes it look real (without making it heavy)

- **Size first.**
  - Overall width × depth × height in cm, from the dimensions text. Check them against the photos (a seat is
    about 45 cm high, a table 75 cm, a door 210 cm).
  - Width is side to side facing the front; depth is front to back.
- **Proportions and silhouette:**
  - get the big shapes right: arm height and thickness, seat depth, leg height and taper, back angle;
  - these matter more than small detail.
- **Soft edges:** real furniture has no razor-sharp edges. Use `RoundedBox` or bevels:
  - 5–20 mm radius on wood and metal;
  - 20–60 mm on upholstery.
- **Materials:**
  - `meshStandardMaterial` / `meshPhysicalMaterial`, with realistic roughness and metalness:
    - fabric: roughness 0.85–1;
    - wood: 0.5–0.7;
    - lacquer: 0.2–0.35;
    - brushed metal: metalness 1, roughness 0.3–0.45;
    - chrome: metalness 1, roughness 0.05–0.15;
    - glass: `meshPhysicalMaterial` with transmission 0.9 and roughness 0.05;
  - use the colour options' hex values from the product, and the accent colour for legs and frames.
- **Right amount of detail:**
  - include what you'd notice from 2 m away: cushions and their seams, piping, buttons on tufted pieces, drawer
    fronts and handles, visible legs and feet, a lampshade's shape;
  - skip what you wouldn't: stitching, screws, weave (a roughness value suggests it).
- **Curves:**
  - 24–48 segments for round parts, 8–16 for small ones (legs, handles);
  - `latheGeometry` for turned shapes;
  - `extrudeGeometry` with bevels for profiles;
  - `tubeGeometry` for bent metal.
- **Repeated parts** (slats, spindles, buttons): generate them in a loop.
- **No image textures, no internet assets, no animation, no text.**
- **Orientation:** front faces +z, bottom at y = 0, centred on x/z.

## Checking (mandatory)

1. Look at the renders: three-quarter and front, plus side or top when shape matters.
2. Compare them with **every** product photo from `read_link`:
   - shape and silhouette;
   - proportions;
   - colours and materials;
   - obvious details.
3. Fix with `update_item` or `write_model_component`, and look again.
4. `verify_item` with notes on what you compared, and anything you couldn't match.

## Colours

- Give each colour option a realistic hex, not a pure primary. For example, "Oatmeal" is #d9cdb8, not #ffff00.
- Name wood finishes with a wood word (oak, walnut, ash…) so the app uses a wood texture.
- The accent colour is for legs and frames (black metal is #2b2b2b, brass #b08d57).
