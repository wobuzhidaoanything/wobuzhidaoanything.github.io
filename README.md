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

`git pull` updates the software. Your designs and models stay on your computer in `designs/`, which git ignores,
so pulling never touches them.

## What you can do

- **Houses of any size, multi-floor:**
  - start a new house at any width, depth, number of floors and ceiling height;
  - draw walls with snapping and live lengths;
  - click to create rooms;
  - add doors, windows and openings;
  - place straight, L or U stairs, whose step height and depth follow real building rules and adapt to the
    floor-to-floor height (the stairwell is cut in the floor above);
  - import CAD floor plans (DXF).
- **Floor by floor:** switch floors and see each one cut like an architect's plan, in 3D or top-down.
- **Walk through:** first-person with mouse-look and W A S D. You collide with walls and furniture and climb
  the stairs step by step between floors.
- **Furniture from links:** paste or drop product links (IKEA, Amazon, Wayfair, Shopify stores…). Their size,
  colours and 3D models are read on your computer. Models without a store 3D file are generated in detail at the
  exact size. Drag to place, rotate, recolour; items snap to walls and stack on tables and rugs.
- **Photo:** a path-traced, photoreal image of the current view.
- **Export:** one `.glb` for Blender with everything named and grouped by floor, room, walls, openings, stairs and
  furniture. Design files (`.json`) are for backup and sharing.
- **Several designs:** create, switch, duplicate, rename and import designs. Everything saves automatically.

## AI agents

Open **Agents** in the app, pick your agent (Claude Code, Codex, Cursor, VS Code, Gemini CLI, OpenCode, Grok,
Windsurf, Claude Desktop or any MCP client) and paste the prompt it gives you. The agent sets itself up. Then it
can read links, create furniture models (checking renders with its own vision), trace a floor plan image into the
house, place furniture and export. The open app updates live. Details: [docs/MCP.md](docs/MCP.md) and
[AGENTS.md](AGENTS.md).

## Structure

```
index.html, css/        the app (no build step; libraries served from node_modules)
js/design.js            house data model, stairs maths, validation (shared with the tools)
js/plan.js              2D plan operations (wall union, room detection)
js/house.js             house geometry (walls with CSG openings, slabs, stairs, railings)
js/viewer.js            three.js viewer, floors, selection, dragging
js/walk.js              walk-through with collisions and stairs
js/tools.js             wall/room/door/window/stairs tools
js/app.js               UI, designs, undo, import/export
js/models.js            parametric furniture models
js/effects.js           ambient occlusion (quality setting)
js/photo.js, export.js  photoreal render, GLB export
tools/                  npm start server, MCP server, CLI, headless renderer
data/                   the sample house and shipped furniture models
worker/                 optional Cloudflare Worker link reader for hosted copies
```

Libraries: three.js, three-mesh-bvh (fast raycasting and walking), three-bvh-csg and polygon-clipping (clean
cut-outs), camera-controls, n8ao and postprocessing (ambient occlusion), three-gpu-pathtracer (photos), dxf-parser,
Playwright (agent renders).

Tests: `npm test`.
