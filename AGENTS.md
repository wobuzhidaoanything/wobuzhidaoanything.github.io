# Guide for AI agents: editing the house layout

Roomcraft is a static site (plain HTML/CSS/JS + three.js/WebGL, no build step). The house layout
lives in **`data/project.json`**. To change the room or furniture, edit that file, then commit and push.

## Tools (use them)

- Run the site: `npm start` (one command; installs dependencies and opens the browser).
- **MCP server** `roomcraft` (auto-configured for most agents, see [docs/MCP.md](docs/MCP.md)): `read_link`,
  `add_item`, `update_item`, `render_item`, `verify_item`, `save_model_file`, `render_room`, `list_items`.
- No MCP? The same operations are available from the CLI: `node tools/cli.mjs help`.

## Vision rule (mandatory, every agent)

Never trust a model you haven't looked at. After adding or changing a furniture model:
1. look at the product photo (`read_link`, or `node tools/cli.mjs read <url> --photo`);
2. render the model (`render_item` / `node tools/cli.mjs render <id>`) and **look at the images**;
3. compare shape, proportions, colours and size, fix with `update_item` if needed, and look again;
4. only then call `verify_item` with notes on what you compared.

Items stay "Unverified" until this is done, and verification is refused for any version that hasn't been
rendered. After layout edits, check the result with `render_room` (or `node tools/cli.mjs render-room`).
Prefer the tools over hand-editing inventory items, because the tools track verification.

## Workflow

1. `git pull`
2. Edit `data/project.json` (schema below).
3. **Increase `"version"` by 1.** Browsers that already have a saved layout only offer
   "The project file in the repo was updated → Load it" when the version changes.
4. Check it's valid JSON: `node -e "JSON.parse(require('fs').readFileSync('data/project.json'))"`
5. Commit with a message describing the change, then push.

## Units and coordinates

- All lengths are **metres** (0.9 = 90 cm).
- The floor is the x/z plane seen from above: **x** runs to the right and **z** runs toward the
  default camera (the "front"). The "back wall" has the smallest z.
- `rot` is degrees around the vertical axis: 0 = the item's front faces +z, 90 = +x, 180 = −z, 270 = −x.
- A placed item's `x`/`z` is the **centre of its footprint**. An item against the back wall (z = 0) at
  rot 0 has `z = depth / 2`.

## Schema

```jsonc
{
  "version": 3,                       // bump on every edit
  "room": {
    "points": [[0,0],[4.2,0],[4.2,3.6],[0,3.6]],  // floor outline corners [x,z], in order; ≥ 3; any shape
    "height": 2.6,                    // ceiling height
    "floorKind": "wood",              // wood | tiles | carpet | concrete
    "floorColor": "#c49a6c",
    "wallColor": "#efebe4",
    "openings": [                     // doors/windows; wall i runs from points[i] to points[i+1]
      { "id": "o-door", "type": "door", "wall": 1, "offset": 2.6, "width": 0.9, "height": 2.1, "sill": 0, "open": true },
      { "id": "o-win",  "type": "window", "wall": 3, "offset": 1.0, "width": 1.4, "height": 1.4, "sill": 0.8 }
      // offset = distance from the wall's start corner to the opening's near edge
    ]
  },
  "inventory": [                      // furniture models available to place
    {
      "id": "i-sofa",                 // unique, referenced by placed[].itemId
      "name": "IKEA KIVIK 3-seat sofa",
      "category": "sofa",             // decides how the 3D model is generated (list below)
      "dims": { "w": 2.28, "d": 0.95, "h": 0.83 },  // width (side to side), depth (front-back), overall height
      "colors": [ { "name": "Gunnared dark grey", "hex": "#4a4b4d" } ],  // available colour options
      "accent": { "name": "Black", "hex": "#1d1d1f" },   // optional legs/frame colour
      "url": "https://…",             // optional product page
      "image": "https://…",           // optional photo for the inventory card
      "modelUrl": "https://….glb"     // optional real 3D model; scaled to dims automatically
    }
  ],
  "placed": [                         // what's actually in the room
    { "id": "p-sofa", "itemId": "i-sofa", "x": 2.1, "z": 0.475, "rot": 0, "color": "Gunnared dark grey", "y": 0 }
    // color = one of the item's colour names (or a "#rrggbb"); y = lift off the floor (e.g. a lamp on a table)
  ]
}
```

**Categories:** sofa, armchair, chair, stool, ottoman, bed, wardrobe, bookshelf, dresser, nightstand,
sideboard, tvstand, desk, table, coffeetable, sidetable, floorlamp, lamp, rug, plant, tv, mirror,
curtain, box. Names containing "office" (chairs), "round" (tables, rugs) or "pouf" change the style.
Sofas deeper than 1.25 m get a chaise.

## Tips

- Use real product dimensions. Wood finishes should be named with a wood word (oak, walnut…) so they
  get a wood texture.
- Keep every placed item inside the room outline and not overlapping. Leave about 80 cm walkways.
- Keep ids stable when editing existing items; make new ids unique (e.g. `i-desk-2`, `p-desk-2`).
- To preview, run `npm start`.
