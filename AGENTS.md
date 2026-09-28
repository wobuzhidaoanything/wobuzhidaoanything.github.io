# Guide for AI agents working with Roomcraft

Roomcraft is a 3D house planner (plain HTML/CSS/JS + three.js/WebGL) that runs locally with `npm start`.
Everything a person designs lives **on their device**, in the git-ignored `userdata/` folder:

- `userdata/designs/<id>.json`: one house design (multi-floor), format below
- `userdata/library.json`: the furniture model library shared by all designs
- `userdata/models/`: downloaded `.glb` files and model components (`<id>.jsx`)
- `userdata/exports/`: exports
- `userdata/.state/`: the active design, version history, render log and chat

Git only carries the software (`assets/` holds the shipped sample house and furniture). Never commit `userdata/`.
Always use the tools below rather than editing these files: saves go through conflict checks and version history.

## Use the tools

The **`roomcraft` MCP server** (`tools/mcp-server.mjs`) is how you work with designs and models. The user connects
you from the app's **Agents** screen; setup for every agent is in [docs/MCP.md](docs/MCP.md). Without MCP, the
same operations exist on the command line: `node tools/cli.mjs` (run it without arguments for help).

| Task | Tools |
| --- | --- |
| Read a product link | `read_link` (returns up to 6 product photos and the description) |
| See pictures pasted into the chat | `view_images` (names come in the message; `photo_upload` puts one on the model) |
| Create or fix a furniture model | `add_item` (use `from_url`), `update_item`, `render_item`, `verify_item`, `save_model_file` |
| How to model a product realistically | [docs/MODELLING.md](docs/MODELLING.md): read it before modelling |
| Model an unusual shape in code | `write_model_component`, `get_model_component`: a React Three Fiber component, see [docs/R3F-MODELS.md](docs/R3F-MODELS.md) |
| Look at / edit a house | `list_designs`, `get_design`, `write_design`, `render_design`, `stair_info`, `place_item` |
| Export for Blender | `export_glb` |

Designs can also carry `site: { lat, lon, north }` (for the sun study), per-side wall finishes
`walls[].finishes: { l|r: [{ from, to, kind, color }] }` (`kind`: paint, wallpaper, tiles, wood, brick, stone, concrete,
carpet; `from`/`to` in metres along the wall from its `a` end; `l` is the side to the left of a→b), room
`ceiling: { kind, color }`, and `locked: true` on walls or placed items.

The app open in the browser updates live when you write a design or the library.

## Vision rule (mandatory for every agent)

Never trust what you haven't looked at.

- **Models:** after `add_item` or `update_item`, look at the returned renders and compare shape, proportions,
  colours and size with the product photo from `read_link`. Fix mismatches with `update_item` and look again, then
  call `verify_item` with notes. Models stay "Unverified" in the app until you do, and `verify_item` is refused for
  any version you haven't rendered.
- **Layouts:** `write_design` and `place_item` return floor renders. Compare them with what was asked, or with the
  floor plan image. If anything differs, fix it and write again.
- Agents without image input can't do this and must say so, leaving items unverified for the person to check.

## Floor plan → house (workflow)

1. Look at the plan image or PDF. Read the overall dimensions and scale: use a dimension line, or a known size
   (an interior door is about 80–90 cm).
2. Choose the origin at the top-left outer corner. **x runs right, z runs down the page, units are metres.**
3. For each storey, write **walls as centre lines**:
   - exterior walls `thickness` 0.2–0.3 with `exterior: true`;
   - interior walls 0.1–0.15;
   - make walls meet end to end at corners and T-junctions, so rooms close.
4. Add `openings` on their wall:
   - `offset` is the distance from the wall's `a` end to the opening's near edge;
   - doors are about 0.8–0.9 × 2.1 m;
   - windows need a `sill`.
5. Add stairs on the lower floor (`stair_info` gives the footprint they need) and leave about 95 cm clear floor at
   both ends. The stairwell in the floor above is cut automatically.
6. Leave `rooms` empty to auto-detect enclosed rooms, or give names and finishes (`floorKind`: wood, tiles, carpet,
   concrete).
7. `write_design`, **look at every floor render**, compare with the plan, fix, repeat.

## Design format (format 2)

All lengths in metres. Rotation in degrees around the vertical axis: 0 = the object's front faces +z (down the plan),
90 = +x, 180 = −z, 270 = −x.

```jsonc
{
  "format": 2,
  "id": "my-house",                     // letters, digits, - and _ only
  "name": "My house",
  "wallColor": "#efebe4",
  "floors": [                           // bottom to top; elevations are computed from height + slab
    {
      "name": "Ground floor",
      "height": 2.7,                    // finished floor to ceiling
      "slab": 0.15,                     // floor slab thickness under this floor
      "walls": [ { "id": "w1", "a": [0, 0], "b": [10, 0], "thickness": 0.25, "exterior": true } ],
      "openings": [
        { "id": "o1", "type": "door", "wall": "w1", "offset": 2.0, "width": 0.9, "height": 2.1, "open": false },
        { "id": "o2", "type": "window", "wall": "w1", "offset": 5.0, "width": 1.6, "height": 1.3, "sill": 0.9 }
        // type "opening" = doorless gap
      ],
      "rooms": [ { "id": "r1", "name": "Living", "points": [[0.125, 0.125], [5, 0.125], [5, 7.875], [0.125, 7.875]], "floorKind": "wood", "floorColor": "#c49a6c" } ],
      "stairs": [ { "id": "s1", "shape": "U", "turn": "left", "x": 9.3, "z": 6.9, "rot": 0, "width": 1.0 } ],
      // stairs lead up to the next floor. x/z = bottom-centre of the first step; rot 0 climbs toward −z.
      // Step height/depth are computed from the floor-to-floor height (≤ 18 cm rise, 2·rise + tread ≈ 63 cm).
      "placed": [ { "id": "p1", "itemId": "i-sofa", "x": 3, "z": 0.6, "rot": 0, "color": "Sage green", "y": 0 } ]
      // x/z = centre of the item's footprint; y = lift (e.g. a lamp on a table)
    }
  ]
}
```

Library models (`userdata/library.json` → `items[]`):
`{ id, name, category, dims: {w, d, h}, colors: [{name, hex}], accent?, url?, image?, modelUrl?, verified? }`.

**Categories:** sofa, armchair, chair, stool, ottoman, bed, wardrobe, bookshelf, dresser, nightstand, sideboard,
tvstand, desk, table, coffeetable, sidetable, floorlamp, lamp, rug, plant, tv, mirror, curtain, box. Names containing
"office" (chairs), "round" (tables, rugs) or "pouf" change the style. Sofas deeper than 1.25 m get a chaise.

## Working on the software itself

- No build step: `index.html` + `js/*.js` (ES modules). Libraries are served from `node_modules` via `/vendor/…`,
  and React/R3F from a one-time esbuild bundle at `/r3f/…` (see the import map in `index.html`).
- Key files:
  - `js/design.js`: data model, stairs maths, validation (pure JS, also used by the tools)
  - `js/house.js`: geometry
  - `js/viewer.js`: rendering and interaction
  - `js/walk.js`: walk-through
  - `js/tools.js`: editing tools
  - `js/app.js`: the app's state and actions (design, saving, undo, editing, importing); it draws no UI itself
  - `tools/`: local server, MCP server, CLI
- More key files:
  - `js/edit.js`: structure edits
  - `js/annotate.js`: dimensions and grid
  - `js/measure.js`, `js/paint.js`: measure and paint tools
  - `js/clearance.js`, `js/quantities.js`, `js/sun.js`, `js/planexport.js`: pure logic, tested in Node
  - `js/r3f-host.js`: React Three Fiber model components
  - `js/ui/*.jsx`: the whole UI in React: top bar, left panel, Inspector, floor tabs and tool options, dialogs,
    Help, Assistant, command palette, right-click menu, settings, tour, hover tips. Compiled on request by the local
    server and served at `/ui/<name>.js`. `js/app.js` passes its API once (`appApi()`); `js/ui/store.jsx` is the
    bridge, where each screen area redraws on its own topic (`bump('inspector')`, `bump('status')`…). Number
    fields use `Num` from `js/ui/controls.jsx` (units and sums). Icons are Lucide (`<Icon n="…" />` in
    `controls.jsx`; the bundled icon names are listed in `tools/lib/r3f.mjs`). React is for the software's UI; R3F is only for
    furniture models.
  - `js/units.js` (number fields with units and sums), `js/diff.js` (what an agent changed): pure, tested in Node
  - `docs/user-guide.md`: the in-app Help. **Update it when you change a feature.**
- User data paths come from `tools/lib/paths.mjs`. Tests set `ROOMCRAFT_USERDATA` to a temporary folder.
- Desktop only: don't spend effort on mobile layouts.
- Tests: `npm test`. Check UI changes in a real browser, not just the tests.
