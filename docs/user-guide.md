# Roomcraft user guide

Roomcraft lets you design a house in 3D on your own computer. You can draw the rooms, furnish them with real
products, walk through the result and export it. This guide covers every feature. Each feature has its proper name
(the one design professionals use), followed by a plain explanation.

Press **?** or **F1** at any time to open this guide. The list on the left jumps to any chapter.

**Can't find something?** Press **Ctrl+K** (the **Search actions** box at the top) and type what you want to do, such
as "door", "dark mode" or "plan". Or **right-click** anything in the 3D view to see what you can do with it.

## Getting started

### Starting Roomcraft

Open a terminal in the Roomcraft folder and run `npm start`. Nothing else is needed:

- The first time, it installs what it needs, which takes a minute.
- It opens Roomcraft in your web browser. If the page doesn't open, go to the address shown in the terminal
  (usually http://127.0.0.1:5173).
- Keep the terminal open while you work. Closing it (or pressing Ctrl+C) stops Roomcraft. Your work is kept, and a
  red banner tells you if something couldn't be saved.

### The screen

- **Top bar**, from left to right:
  - your design's name (click it to see all your designs), and whether it's **Saved**;
  - the **view** buttons (3D, Plan, Split, Walk) and **Edit house**;
  - **Search actions** (**Ctrl+K**), **Undo / Redo**;
  - **Share**: photos, pictures, plans, costs and files;
  - **Assistant** and **Agents** (your AI agent);
  - **?** (this guide), the **gear** (Settings) and the **⋮** menu (history, imports, the tour).
- **Floor tabs** (over the picture): pick the floor you're working on, see **All floors** at once, and open the
  **Paint**, **Measure**, **Sun** and **View** options.
- **Left panel:** add furniture from shop links, and browse your furniture models. In Edit house mode it becomes the
  **Build** panel, with the drawing tools.
- **Right panel (the Inspector):** details of whatever you selected, with every setting you can change. With
  nothing selected, it shows the current floor, its rooms, its furniture and a **Check** list of problems.
- **Status bar** (bottom): what a click will do right now, and the pointer's position in metres.
- Press **[** or **]** to hide or show the side panels for more room.
- **Hover** over any button to see what it does and its shortcut key.

### The tour

The first time you open Roomcraft, a short **tour** points out the main controls. Use **→** or **Enter** for the next
stop, and **Esc** to skip. Show it again from **Settings** or **⋮ → Show the tour again**.

### Command search (Ctrl+K)

Every action has a name you can search for. Press **Ctrl+K**, type a few letters, pick with **↑ ↓** and press
**Enter**.
- It lists the shortcut next to each action, so you learn them as you go.
- Your recent actions are at the top.
- Type a furniture model's name to add it to the room, or a floor's name to go there.
- With something selected, its actions (turn, duplicate, lock…) come first.

### Right-click menu

**Right-click** anything in the 3D view or plan for a short menu of what you can do with it:
- **Furniture:** duplicate, turn, push against the wall, lock, copy, edit the model, zoom to it, delete.
- **A wall** (in Edit house): add a door, window, opening or corner **right where you clicked**, open its elevation,
  paint it, lock or delete it.
- **A room:** rename it, select everything in it, paint the floor, zoom to it, paste.
- **Empty space:** paste, select all, measure, zoom to the house.

A right-*drag* still moves the view, as before.

### Settings

The **gear** button (or **Ctrl+,**):
- **Appearance:** **Light**, **Dark**, or **System** (follows your computer). The house keeps its real colours.
- **Graphics:** **High** (soft shadows and ambient light) or **Fast** for older computers.
- **Currency** for prices (Singapore dollars to start with), and an optional **Budget**.
- **Tips on hover** on or off.
- **Model product links with my agent** on or off.

### Typing numbers

Number boxes understand units and sums, so you don't need a calculator:
- **240**, **2.4 m**, **2400 mm** and **1.2 m + 1.2 m** all give 240 cm;
- **3 x 60** gives 180, **(400 - 90) / 2** gives 155;
- **↑ / ↓** change the number by a step (**Shift**: ten steps).

## Views

### 3D view (dollhouse)

A bird's-eye 3D view of the floor you're on, like looking into a dollhouse.

- Drag with the left mouse button to turn around the house.
- Drag with the right button to slide the view.
- Scroll to zoom.

**Walls: cut / full** (in the floor tabs) chooses between two looks:
- **Cut** is the default. Walls are sliced at 1.25 m, as on an architect's plan, so you can see into every room.
- **Full** shows walls at their real height.

### Plan view

The floor seen straight from above, like a paper floor plan: drag to slide, scroll to zoom. It's the easiest view for
drawing walls and arranging furniture precisely.

### Split view

Plan on the left and 3D on the right, both live. Work in whichever half you like; changes show in both at once.

### Walk-through

See the house at eye height and walk around it like in a video game.

- Click the picture to look around with the mouse.
- **W A S D** to walk; hold **Shift** to walk faster.
- Walls and furniture stop you. Walk onto the stairs to climb or go down; each step rises like a real one.
- **Esc** gives the mouse back.

### Elevation view

A flat, straight-on view of one wall, as seen from inside the room. It's used to place things at the right height:
hanging a TV, shelves or art, or checking a window's height.

- To open it, select a wall and click **Elevation view** in its panel.
- It shows the ceiling height, each door's and window's height, and how high each piece of furniture reaches.
- Drag furniture sideways along the wall, or up and down.
- **Other side** looks at the wall from the other side. **Close** or **Esc** goes back.

### All floors, Zoom to fit, north arrow

- **All floors** (floor tabs) shows the whole house, roof included.
- **Zoom to fit** (**F**) brings the whole house back into view if you get lost.
- The **north arrow** (bottom left) appears once you set where the house is (see *Sun study*). It shows which way
  north is.

## Your designs and saving

### Saving

Everything saves **automatically** on your computer, a moment after each change. There's no Save button. Next to the
design's name you see **Saved**, **Saving…** or, if something is wrong, **Not saved** in red.

- Designs live in the `userdata` folder inside Roomcraft. To back everything up, copy that folder.
- `git pull` (updating Roomcraft) never touches it.

### Designs list

Click your design's name (top left) to:
- see a small picture of each design, taken as you work;
- make a **New house**, **Import** a design file, or open another design;
- **Duplicate** a design (to try an idea without losing the original), **Rename** or **Delete** it;
- open a design's **History**.

### Version history

Roomcraft keeps earlier versions of every design by itself: one every couple of minutes while you work, and one
each time an AI agent changes the design.

- Open **Designs → History** to see them.
- **Restore** puts an earlier version back. The version you replace is kept too, so nothing is lost.
- **Open as copy** opens an old version as a separate design.

### Two editors at once

If your AI agent (or another window) changes the design while you're changing it too, Roomcraft doesn't overwrite
anything:
- it shows their version;
- it keeps yours in **History**;
- a message tells you what happened.

## Building the house (Edit house)

Click **Edit house** (or press **E**) to change the building itself. Furniture fades out, so walls and doors are
easy to grab. The **Build** panel appears on the left, and a **tool options bar** appears over the picture for
whichever tool you pick. Press **E** again or click **Done editing** when you're finished.

### New house

**Designs → New house** asks for the outside width and depth, the number of floors and the ceiling height. It makes
an empty shell with outside walls on every floor, ready for rooms.

### Wall tool (W)

Click where a wall starts, then click at each corner. To finish, click the starting point, double-click, or press
**Esc**.

- Lengths show as you draw.
- Walls lock to straight and 45° angles; hold **Shift** for any angle.
- Walls **snap** to corners and to the grid; hold **Alt** to place them freely.
- The options bar chooses **Interior** or **Exterior** walls and their **thickness**.
- **Rooms appear automatically** once walls enclose an area. They keep their names and floor finishes when you move
  walls later.

### Door (D), Window (N) and Opening (O) tools

Click on a wall to put one there.
- The options bar sets the default width.
- An **opening** is a doorway with no door.
- Nothing is placed where it would overlap another door or window.

### Stairs tool (S)

Click where the stairs start; they climb away from you.

- The options bar picks **Straight**, **L-turn** or **U-turn**, and which way they turn.
- Roomcraft works out the steps like a builder would: steps no taller than 18 cm, and a comfortable step depth.
  The panel shows the number of steps, their height and depth.
- The hole in the floor above is cut automatically.
- Leave about 1 m of free floor at the top and bottom.

### Floors

- **+ Floor** (floor tabs) adds a floor on top.
- Double-click a floor tab to rename it.
- With nothing selected, the right panel sets the floor's **ceiling height** and **slab** (floor thickness).

### Importing a plan (DXF)

**Build → Import DXF** reads a CAD drawing's lines as walls. Roomcraft works out the units (mm, cm or m) from the
drawing's size when the file doesn't say.

To trace a floor plan picture or PDF, give it to your AI agent (see *AI agents*).

## Reshaping walls

In Edit house mode:

- **Move a corner:** drag a dot at the end of a wall. Walls meeting there follow. Walls that join the side of a moved
  wall stay attached.
- **Push or pull a wall:** drag it sideways.
  - Walls at right angles stretch to follow.
  - Where the wall carries on straight, a step is added instead.
- **Add a corner (split):** double-click a wall where you want the corner, or use **Add corner** in its panel.
  Then drag the new dot.
- **Recess or bay:** in the wall's panel, enter where it starts, how wide and how deep, then click:
  - **Make recess** to push that part of the wall into the room (an alcove);
  - **Make bay** to push it out (a bay window area).
- **Exact sizes:** type the **length** and **thickness** in the wall's panel.
  **Exterior wall** marks outside walls.
- **Lock** a wall so it can't be dragged, pushed or deleted by accident. A change that would move a locked wall is
  refused, with a message saying why.
- **Delete** a wall to merge two rooms into one.

### The Check list

With nothing selected, the right panel shows a **Check** list of problems on the floor. Examples:
- stairs that cross a wall;
- a door that doesn't fit its wall;
- furniture blocking a door (see *Clearances*).

### Small gaps

If two walls almost meet (within 3 cm), Roomcraft joins them for you, so the room is still recognised.

## Doors and windows

- **Move:** drag a door or window along its wall. Drag it onto another wall and it moves over. It stops at other
  doors and windows instead of overlapping them.
- **Exact position:** in its panel, type the distance **From start** or **From end** of the wall. The panel also
  shows the clear space on each side.
- **Nudge:** the **←** and **→** keys move it 1 cm at a time (10 cm with **Shift**).
- **Size:**
  - **Width** and **Height**, plus the **Sill** height for windows (the distance from the floor to the bottom of the
    window);
  - **Type** turns a door into a window or an opening, and back.
- **Swing:**
  - **Hinge side** moves the hinges to the other end;
  - **Flip swing** makes the door open to the other side of the wall;
  - **Shown open** draws the door open in 3D.
  - The swing is drawn in the Plan view.

## Furniture

### Adding furniture from a shop link

Paste (or drag and drop) product links into **Add furniture from a link**. IKEA, Amazon, Wayfair, Shopify shops and
most others work.

- Roomcraft reads the name, size, colours, photo and, when the shop has one, the real 3D model.
- With an AI agent connected, the box **Let … model each link** hands each link to your agent. It looks at every
  photo and the description, then:
  - builds a more accurate model;
  - checks it against the photos;
  - marks it as checked. You can keep working meanwhile.
- Every link counts as a product, whether you paste it here or in the Assistant chat. Your agent gets
  instructions to make the model **realistic**. A shop's own 3D file is kept exactly as the shop provides it.
- When the model is done, it moves to the top of your models with a green **Ready to place** badge, and a message
  offers **Add to room**.

### Your models (the library)

The left panel lists every furniture model you have. Every design can use them.

- **Add** puts a model in the room. You can also drag its card into the picture.
- **Edit** changes its size, colours or type.
- **+ Custom** makes a model from scratch (for example, a built-in cupboard of any size).
- **Search** by name or type, or use the **filters** under the search box: **Favourites**, **In this house**, or a
  type such as Sofas.
- **☆** marks a model as a **favourite**, which keeps it at the top.
- Prices show in your currency (Settings).

### Moving and arranging

- **Move:** drag furniture. It stays inside the house, slides flush against walls it touches, and sits on tables and
  rugs.
- **Rotate:** drag the blue dot, or press **R** (**Shift+R** turns the other way).
- **Nudge:** the arrow keys move it 1 cm (10 cm with **Shift**).
- **Against wall:** pushes it back to the nearest wall.
- **Lift:** raises it off the floor, for example a lamp on a shelf. The Elevation view does this visually.
- **Colour:** pick one of the product's colours, or any colour with **Custom**.
- **Floor:** moves it to another floor.
- **Duplicate** (**Ctrl+D**) and **Remove** (**Delete**).

### Working with several items

- **Select several:**
  - **Shift-click** or **Ctrl-click** items to add them to the selection (or take them out);
  - or hold **Shift** and drag across empty floor to draw a **selection box**;
  - **Ctrl+A** selects all the furniture on the floor.
- Drag any selected item to move them all together. **R** turns the group. The arrow keys nudge it.
- **Align** lines them up by their left, centre or right edges, or their back, middle or front edges.
- **Distribute** spaces three or more items evenly.
- **Copy and paste:** **Ctrl+C**, then **Ctrl+V** pastes where the pointer is, even on another floor.
- **Lock** (**L**) stops items being moved, turned or removed by accident. A rug is a good example. Press **L**
  again to unlock.

## Finishes (Paint tool)

**Paint** (floor tabs, or **P**) puts a finish on walls and floors: **Paint, Wallpaper, Tiles, Wood, Brick, Stone,
Concrete** or **Carpet**, in any colour.

- **One side:** click a wall to finish that side of it, between the walls that meet it. One long wall can be
  wallpaper in the living room and tiles in the kitchen.
- **Whole room:** click a wall to finish every wall of that room.
- Click a **floor** to change that room's floor finish.
- **Alt+click** picks up the finish you click on, like an eyedropper, to use it elsewhere.

The room's panel also has:
- the **Ceiling** finish;
- **Walls of this room** (paint them all at once);
- the **Floor finish**.

A wall's panel shows the finish on each side, with **Reset** to go back to the house's wall colour.

## Display, grid and measuring

### View menu

**View ▾** in the floor tabs turns these on or off:

- **Dimensions:** the length of every outside wall, drawn on the floor like on an architect's plan. Also each
  rectangular room's width × depth. Odd-shaped houses get an overall width and depth too.
- **Room areas:** each room's floor area in m².
- **Grid:** 1 m squares on the floor. Smaller 10 cm squares appear as you zoom in. **G** toggles it.
- **Snap to grid:** walls, corners and furniture move in 5 cm steps, so things line up neatly. Hold **Alt** while
  dragging to move freely.
- **Clearances:** see the next chapter.

### Measure tool (M)

Click **Measure** (or press **M**) and choose a mode:

- **Distance:** click two points to get the straight distance between them. It works on floors, walls and furniture,
  and the label also shows the horizontal (↔) and vertical (↕) parts. Hold **Shift** to measure along one direction
  only.
- **Path:** click point after point along a curve or route, then double-click or press **Enter**. Gives the total
  length, for example of a curved wall or a walking route.
- **Along surface:** click two points to get the distance *over* the surface between them, following curves and
  bumps. Examples: over a sofa arm, or around a curved headboard.

Points snap to wall corners (hold **Alt** not to). Measurements stay on screen until you click **Clear all**.
**Esc** cancels the one in progress.

## Clearances

Roomcraft checks that there's room to use your furniture and open your doors (**View → Clearances**, on by default).

- **Use zones:** when you select furniture, a tinted area shows the space it needs in front or around it. Green means
  free, red means something is in the way. Typical needs:
  - about 45 cm in front of a sofa;
  - 60 cm to pull out a chair;
  - 75 cm in front of a wardrobe;
  - 60 cm beside a bed.
- **Door swings:** the area each door sweeps as it opens is shown while you arrange furniture.
- **Problems:** anything that blocks a door, or crowds another item's use zone, gets a **red outline**. A plain
  explanation appears in its panel and in the floor's **Check** list, such as *"Only 30 cm in front of the sofa;
  about 45 cm is comfortable"*.

Things that belong together don't count as problems: chairs at a table, a coffee table in front of a sofa,
nightstands beside a bed.

## Sun study

See where the sunlight falls in each room at any date and time.

1. Click **Sun** in the floor tabs.
2. Enter the house's **latitude** and **longitude**, or click **Use my location**. To find them, search the address
   on an online map; the coordinates are usually shown there.
3. Turn **North** until the arrow matches the real direction of the house.
4. Tick **Sun study**, pick a **date**, and drag the **time** slider.

- The sun and its shadows move in the 3D view, the walk-through and photos.
- The panel shows sunrise, sunset and where the sun is.
- Times are in your computer's time zone.

## Pictures, exports and printing

- **Share → Photo-real picture:** a photo-realistic picture of the current view, with real light bounces and soft shadows. It takes a
  little while; you can keep it or save it.
- **Share → Copy picture** (**Ctrl+Shift+C**): copies the current view, ready to paste into a chat, email or
  document.
- **Share → 3D model for Blender:** the whole house as one `.glb` file. Open it in Blender with
  *File → Import → glTF 2.0*. Everything is named and grouped by floor, room, walls, doors and windows, stairs and
  furniture, and each finish is its own material.
- **Share → 2D floor plan:** a clean drawing of each floor to print or send to a builder.
  - Content: walls, doors with their swings, windows, stairs, room names and areas, furniture outlines, dimensions,
    a scale bar, a north arrow and a title.
  - Settings: pick **A4** or **A3**, and a **scale** such as 1:50 (1 m on the house = 2 cm on paper) or 1:100, or
    **Largest that fits**.
  - Save as **PDF** (one page per floor) or **PNG**.
  - Print at 100 % (*actual size*) to keep the scale.
- **Share → Quantities & costs:** a table (a **schedule**) with, for each room:
  - floor area, and flooring to order (10 % extra for cuts);
  - wall area to paint or cover, by finish, with doors and windows taken off;
  - ceiling area and skirting length;
  - the furniture with prices, and the total for the whole house in your currency (and against your budget, if
    you set one).

  **Download .csv** opens in Excel or Google Sheets.
- **Share → Screenshot:** the current view as a picture.
- **Share → Design file:** a `.json` copy of the design, including the furniture it uses, to back up or share.
  Import it from the Designs list.

## AI agents

Roomcraft works with the AI coding agent you already use:
- **Grok Build** (listed first);
- Claude Code, OpenAI Codex, Cursor, VS Code, Gemini CLI, OpenCode, Windsurf and Claude Desktop.

### Connecting an agent (Agents)

Click **Agents**, pick yours, and paste the prompt it gives you into your agent. The agent sets itself up. If
anything differs in its version, it looks up its own current instructions. Roomcraft notices when it's connected (the
dot turns green). The same screen sets up another agent or removes one.

### What your agent can do

- Read shop links and build furniture models. It must look at its own renders and compare them with the product
  photos before a model counts as checked.
- Trace a floor plan picture or PDF into the house, floor by floor, checking its drawing against the plan.
- Place furniture, change the design, and export.
- For unusual shapes, write the model as a small **React Three Fiber** component (a piece of 3D code). Roomcraft
  shows it like any other model.

The open app updates live whenever the agent changes something. Your version is always kept in History.

### Assistant (C)

**Assistant** opens a chat with your agent inside Roomcraft; you don't need to open a terminal. Roomcraft runs the
agent in the background and tells it which design, floor and item you're looking at.

- Ask for anything in plain words, for example *"make the living room 50 cm wider"* or *"add this sofa from the
  link and put it under the window"*.
- The panel shows what the agent is doing and which tools it used.
- **Stop** ends a job. **+** starts a new conversation.
- Paste a product link and it's modelled like one from the link box.
- **No link? Paste pictures.** Paste (**Ctrl+V**), drop or attach (📎) up to 6 pictures of a piece, such as shop
  photos, your own photos or a screenshot, and type its size, for example *200 x 90 x 80 cm* or
  *W 140 x D 70 x H 75 cm*. Roomcraft shows the size it read under the pictures. Your agent builds the model at
  exactly that size from the pictures and checks it against them. Without a size, it estimates one and tells you.
  - Width is side to side facing the front, depth is front to back.
  - Pasting a picture anywhere in Roomcraft (outside a text box) opens the Assistant with it attached.
  - Pictures stay on this computer (in `userdata/.state/uploads/`).
- **Changes your agent makes are applied straight away.** Each one shows as a card in the chat that says what
  changed (for example *"Ground floor: 1 wall added, Sofa moved"*), with an **Undo** button (and **Redo**).

The Assistant works with the agents that have a command-line version: Grok Build, Claude Code, Codex, Gemini CLI,
OpenCode and Cursor. Desktop-only apps can still use Roomcraft from their own window.

## Keyboard shortcuts

| Keys | Does |
| --- | --- |
| **1** / **2** / **3** / **4** | 3D / Plan / Walk / Split view |
| **E** | Edit house on/off |
| **V W D N O S** | Edit house tools: select, wall, door, window, opening, stairs |
| **P** | Paint tool |
| **M** | Measure tool |
| **C** | Assistant |
| **G** | Grid on/off |
| **F** | Zoom to the selection (the whole house when nothing is selected) |
| **Ctrl+K** | Search actions |
| **Ctrl+,** | Settings |
| **Ctrl+Shift+C** | Copy a picture of the view |
| Right-click | What you can do with what's under the pointer |
| **PgUp** / **PgDn** | Floor up / down |
| **Ctrl+Z** / **Ctrl+Shift+Z** | Undo / redo |
| **Ctrl+C** / **Ctrl+V** | Copy / paste furniture (pastes at the pointer) |
| **Ctrl+D** | Duplicate |
| **Ctrl+A** | Select all furniture on the floor |
| **Delete** | Remove the selection |
| **R** / **Shift+R** | Turn 90° one way / the other |
| **L** | Lock / unlock the selected furniture |
| **Arrow keys** | Nudge 1 cm (**Shift**: 10 cm) |
| **Shift**-click, **Shift**-drag | Add to the selection, selection box |
| **Alt** (while dragging) | No snapping |
| **Shift** (while drawing walls) | Any angle |
| **[** / **]** | Hide / show the left / right panel |
| **Esc** | Stop the tool, deselect, leave a view |
| **?** or **F1** | This guide |

## Troubleshooting

- **A red banner says changes aren't saved.** Roomcraft's server stopped (the terminal was closed, or Ctrl+C was
  pressed). Run `npm start` again. Your changes are still in the page and save by themselves when it's back.
- **A room isn't recognised.** Its walls don't fully enclose it. Look for a missing wall or a gap in Plan view with
  **Dimensions** on. Very small gaps are closed automatically.
- **Everything is slow.** A shop's 3D model may be very detailed; Roomcraft warns you. Click **Use simple shape**,
  or untick *Use the store's 3D model* in the item's panel. Switching **Settings → Graphics** from *High* to *Fast*
  also helps.
- **The 3D view doesn't appear.** Your browser has 3D graphics (WebGL) turned off. Turn on hardware acceleration,
  or try Chrome, Edge or Firefox.
- **My agent isn't detected.** Finish its setup (restart it if its instructions say so), then open **Agents**
  again.
- **I made a mistake.** **Ctrl+Z** undoes. For older states, use **Designs → History**.

## Where your files are

- `userdata/` is **yours**, and stays on this computer (git ignores it). Copy it to back up or move your work. It
  holds:
  - `designs/`: your houses;
  - `library.json`: your furniture models;
  - `models/`: downloaded 3D files and agent-made model components;
  - `textures/`;
  - `exports/`: files your agent exported;
  - `.state/`: history, agent chat, design pictures and settings.
- `assets/` ships with Roomcraft: the sample house and the starting furniture.
- Updating Roomcraft (`git pull`) only changes the software, never your `userdata`.
