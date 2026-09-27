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

## AI modeller (free with OpenRouter)

Click **Ask AI**, paste an OpenRouter key (stored only in your browser) and pick a model. Free models are
listed first, loaded live from OpenRouter. Describe furniture ("an IKEA KIVIK 3-seat sofa with all its colours")
and it creates the model in your inventory with real dimensions and colour options, or checks and corrects
existing items. It can **only** create and check inventory models. It never sees or changes your room; you
place items yourself.

## Changing things by asking Claude

Describe what you want in the Claude Code chat ("add a 200 cm oak dining table by the window",
"make the room an L shape, 5 by 4 m"). Claude edits `data/project.json` and bumps its `version`.
The next time you open the site it offers **Load it**, which merges those changes with your own
imported items. To hand your current layout to Claude, use **⋮ → Export project** and share the file.

## Structure

```
index.html          page shell (three.js via import map, no build step)
css/style.css
js/app.js           state, inventory, import, inspector, undo, persistence
js/chat.js          AI modeller panel (OpenRouter), inventory-only actions
js/viewer.js        three.js scene, interaction, camera modes
js/room.js          polygon room, walls with openings
js/models.js        parametric furniture generators
js/materials.js     procedural textures and materials
shared/colors.js    colour-name → hex (used by site and worker)
data/project.json   the project Claude edits
worker/             Cloudflare Worker that reads product links (see worker/README.md)
```

Run locally with any static server, e.g. `npx http-server .`, then open http://localhost:8080.
