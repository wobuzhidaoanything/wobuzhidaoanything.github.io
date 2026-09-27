# Roomcraft

Free 3D room planner that runs on GitHub Pages. Build a room of any shape, drop in furniture from any
store link, pick its colour, and see it to scale.

- **Any room shape:** rectangle, L, T, U presets, or drag corners and add new ones. Set wall lengths, ceiling
  height, floor type and colours, and add doors and windows.
- **Furniture from links:** paste or drag product links (IKEA, Amazon, Wayfair, Shopify stores, anything
  with product data). The link reader worker pulls dimensions, colour options and 3D models.
- **Real-looking models:** uses the store's 3D model when there is one. Otherwise a detailed model is
  generated for the type (sofa with cushions and chaise, bed with bedding, bookcase with books,
  wardrobe, dresser, tables, chairs, lamps, plants, rugs, TV, mirror, curtains…) at the exact size,
  with fabric, wood and metal materials.
- **Easy to arrange:** drag to move, drag the blue dot to rotate, items snap flush to walls and sit on
  tables and rugs. 3D, plan and walk-through views, undo/redo, screenshots, export/import.

## Run it (one command)

```bash
npm start
```

This installs what's needed on first run, serves the site at http://127.0.0.1:5173, opens your browser, and
reads pasted product links locally, so there's no worker to deploy. Needs Node.js 18.17+.

## AI agents (MCP)

`tools/mcp-server.mjs` lets any MCP-capable agent read product links, add furniture models, and **see
renders of them** before marking them verified. Config files for Claude Code, Cursor, VS Code, Gemini CLI,
OpenCode and Grok are committed, so it's picked up after `git pull`. Setup for every agent (including
Codex and Windsurf) and the CLI alternative: [docs/MCP.md](docs/MCP.md).

## Editing the layout with an AI agent

The house layout is `data/project.json`. Any coding agent (Claude Code, Codex, Cursor…) can
`git pull`, edit that file, bump its `version`, and push. [AGENTS.md](AGENTS.md) explains the format
and coordinates. Open the site afterwards and it offers **Load it**, which merges the changes with any
items you imported yourself. To hand your current layout to an agent, use **⋮ → Export project** and
commit the file as `data/project.json`.

## Structure

```
index.html          page shell (three.js via import map, no build step)
css/style.css
js/app.js           state, inventory, import, inspector, undo, persistence
js/viewer.js        three.js scene, interaction, camera modes
js/room.js          polygon room, walls with openings
js/models.js        parametric furniture generators
js/materials.js     procedural textures and materials
shared/colors.js    colour-name → hex (used by site and worker)
data/project.json   the house layout (edited by you or an AI agent, see AGENTS.md)
tools/              npm start server, MCP server, CLI, headless renderer
preview.html        render page used by the tools
docs/MCP.md         agent setup guides
worker/             optional Cloudflare Worker link reader for a hosted copy (see worker/README.md)
```

