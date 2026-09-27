# Roomcraft

Design a whole house in 3D on your own computer. Set its size and floors, draw or trace the floor plan, furnish it
from any store link, walk through it (stairs included), and export it to Blender.

## Run it

```bash
git clone <this repo> && cd <repo>
npm start
```

That's the only command. The first run installs dependencies. After that it opens the app at
http://127.0.0.1:5173. It needs Node.js 18.17 or newer.

`git pull` updates the software. Your designs, models and exports stay on your computer in `userdata/`, which git
ignores, so pulling never touches them. To back everything up, copy that one folder. Designs from older versions
(`designs/`, `models/`) move there automatically.

The full **user guide** is in the app: the **Help** button, or **F1**. It's also in
[docs/user-guide.md](docs/user-guide.md).

## What you can do

- **Houses of any size, multi-floor:**
  - start a new house at any width, depth, number of floors and ceiling height;
  - draw walls with snapping and live lengths; rooms follow the walls automatically (names and finishes are kept);
  - reshape like a CAD tool: drag corners, push or pull walls (neighbours stretch or a step is added), make a
    recess or bay, double-click a wall to add a corner;
  - add doors, windows and openings, then drag them along a wall or onto another; they never overlap, and you
    can set the exact distance from either end, flip the hinge side and the swing;
  - place straight, L or U stairs, whose step height and depth follow real building rules and adapt to the
    floor-to-floor height (the stairwell is cut in the floor above);
  - import CAD floor plans (DXF).
- **Floor by floor:** level tabs over the view switch floors (or show the whole house); each floor is cut like
  an architect's plan, in 3D or top-down. A status bar shows what a click will do and the pointer position;
  `[` and `]` hide the side panels.
- **Views:** 3D dollhouse, 2D plan, split plan + 3D side by side, wall elevations (straight-on, with heights; drag
  things up and down to hang them), walk-through, all floors.
- **Precision:** dimension lines and room areas on the floor, an adaptive grid with snapping (Alt = free), and a
  measure tool (distance, path, along a curved surface).
- **Arranging:** multi-select (Shift-click or box), align and distribute, copy/paste at the pointer, lock.
  Clearance checks flag furniture that blocks a door or crowds another item's use space.
- **Finishes:** paint, wallpaper, tiles, wood, brick, stone, concrete or carpet on each side of each wall (per room),
  floors and ceilings.
- **Sun study:** the real sun and shadows for the house's location, date and time.
- **Walk through:** first-person with mouse-look and W A S D. You collide with walls and furniture and climb
  the stairs step by step between floors.
- **Furniture from links:** paste or drop product links (IKEA, Amazon, Wayfair, Shopify stores…). Their size,
  colours and 3D models are read on your computer. Models without a store 3D file are generated in detail at the
  exact size. Drag to place, rotate, recolour; items snap to walls and stack on tables and rugs.
- **Photo:** a path-traced, photoreal image of the current view.
- **2D plans and quantities:** print-ready floor plans to scale (PDF/PNG, A4/A3, 1:50/1:100) and a quantities
  schedule (areas, paint, flooring, skirting, furniture costs) as CSV.
- **Safe by design:** autosave with version history; nothing is overwritten when an agent edits at the same time;
  clear warnings if the server stops.
- **Export:** one `.glb` for Blender with everything named and grouped by floor, room, walls, openings, stairs and
  furniture. Design files (`.json`) are for backup and sharing.
- **Several designs:** create, switch, duplicate, rename and import designs. Everything saves automatically.
- **Easy to find your way:** one top bar grouped by task, **Ctrl+K** to search every action by name (with its
  shortcut), a right-click menu on anything in the view, hover tips with shortcut keys, and a short first-run tour.
- **Comfort:** dark mode (follows your computer), a Saved indicator, design pictures in the designs list,
  favourites and filters in the model library, number boxes that take units and sums (`2.4 m`, `1.2 m + 30 cm`),
  **F** to zoom to the selection, copy a picture of the view, and furniture totals in your currency (SGD by default)
  against a budget.

## AI agents

Open **Agents** in the app, pick your agent (Claude Code, Codex, Cursor, VS Code, Gemini CLI, OpenCode, Grok,
Windsurf, Claude Desktop or any MCP client) and paste the prompt it gives you. The agent sets itself up. Then it
can read links, create furniture models (checking renders with its own vision), trace a floor plan image into the
house, place furniture and export. The open app updates live. Details: [docs/MCP.md](docs/MCP.md) and
[AGENTS.md](AGENTS.md).

**Assistant (no terminal needed).** If you have a terminal agent installed, `npm start` finds it, and the
**Assistant** button (or `C`) opens a chat with it inside the app. Supported agents: Claude Code, Codex, Gemini CLI,
OpenCode, Cursor CLI and Grok CLI. The app runs the agent in the background with your own login, limited to
Roomcraft's tools where the agent allows it. It knows which design, floor and selection you're looking at.

- Paste product links into the link box: a quick draft appears at once, then your agent reads every product photo
  and the description, models the item, compares renders with the photos, and marks it checked. You can turn this
  off with the checkbox under the link box.
- Links pasted into the chat are modelled the same way. Models are kept realistic but compact (5 MB at most; shop
  3D files are compressed automatically; see [docs/MODELLING.md](docs/MODELLING.md)).
- Changes the agent makes to the house are applied at once and show as cards in the chat with **Undo**.
- You can chat while jobs run. They queue, and the panel shows each job's progress and the tools used.
- Desktop-only apps (Claude Desktop, VS Code, Windsurf) can still use Roomcraft from their own window, but the app
  can't drive them.
- The conversation is kept on this computer in `userdata/.state/chat.json` (git ignores it). The **+** button starts a new
  one.

## Structure

```
index.html, css/        the app (no build step; libraries served from node_modules)
js/design.js            house data model, stairs maths, validation (shared with the tools)
js/plan.js              2D plan operations (wall union, room detection)
js/house.js             house geometry (walls with CSG openings, slabs, stairs, railings)
js/viewer.js            three.js viewer, floors, selection, dragging
js/walk.js              walk-through with collisions and stairs
js/tools.js             wall/door/window/stairs tools
js/edit.js              structure edits (corners, push/pull, recess, split, door moves, cleanup)
js/app.js               UI, designs, undo, import/export
js/chat.js              Assistant panel (chat with your agent)
js/models.js            parametric furniture models
js/effects.js           ambient occlusion (quality setting)
js/photo.js, export.js  photoreal render, GLB export
tools/                  npm start server, MCP server, background agent runner, CLI, headless renderer
assets/                 the sample house and shipped furniture models
userdata/               your designs, library, models, exports, history (git-ignored, created on first run)
docs/                   user guide (shown in the app), agent setup (MCP), R3F model components
shared/                 product-page reader and colour names (used by the server and the app)
```

Libraries: three.js, three-mesh-bvh (fast raycasting and walking), three-bvh-csg and polygon-clipping (clean
cut-outs), camera-controls, n8ao and postprocessing (ambient occlusion), three-gpu-pathtracer (photos), dxf-parser,
Playwright (agent renders).

Tests: `npm test`.
