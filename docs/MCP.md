# Connecting AI agents

Roomcraft ships an MCP server (`tools/mcp-server.mjs`). With it, your AI agent can:

- read product links, returning size, colours and the product photo;
- create furniture models and check them visually;
- trace floor plans into multi-floor houses;
- place furniture;
- export the house for Blender.

It works on the designs saved on your computer, and the open app updates live.

## Easiest: from the app

1. `npm start`
2. The app shows **Connect your AI agent** on first run. Later, it's under the **Agents** button.
3. Pick your agent. The app gives you a prompt; paste it into that agent. The agent installs the Roomcraft server
   into its own user-level settings, using the right command for that agent and the exact paths on this computer.
4. Approve what the agent asks, and restart it if it says so.
5. The first time the agent uses a Roomcraft tool, the app lists it as **Connected**. From the same screen you can
   **Set up another** agent or **Remove** one. Remove uses the agent's own command where possible, otherwise it
   edits its config file and keeps a backup next to it.

For agents that can't run commands, such as **Claude Desktop**, and for any agent with a JSON config file, the app
also offers **Add it automatically**.

## Assistant: the app drives your agent

With a terminal agent installed, the app's **Assistant** panel runs it in the background. Nothing extra needs to be
open. The local server (`tools/lib/runner.mjs`) starts one headless run at a time, in this repository, and streams
the replies to the page:

| Agent | Command the app runs | Tools allowed |
| --- | --- | --- |
| Claude Code | `claude -p … --output-format stream-json --mcp-config userdata/.state/mcp.json --allowedTools mcp__roomcraft` | Roomcraft's only |
| Codex | `codex exec --json --sandbox read-only -c mcp_servers.roomcraft…` | Roomcraft's + read-only sandbox |
| Gemini CLI | `gemini -p … --output-format stream-json --allowed-mcp-server-names roomcraft` | Roomcraft's (set up with `--trust`) |
| OpenCode | `opencode run --format json …` | per your OpenCode permissions |
| Cursor CLI | `cursor-agent -p … --output-format stream-json --approve-mcps` | per your Cursor permissions |
| Grok CLI | `grok -p …` | per your Grok settings |

Claude Code and Codex get the server on the command line, so they work even before setup. The others use the
server they were set up with (**Agents**). Conversations continue across messages (the agent's own session id; for
Gemini and Grok the recent messages are sent along). Pasted product links become jobs: *read every photo and the
description → set size, category and colours → render → compare → verify*.

## Manual setup

Use absolute paths. `node` is your Node.js; `<repo>` is where you cloned Roomcraft.

| Agent | Command or config |
| --- | --- |
| Claude Code | `claude mcp add --scope user roomcraft -- node <repo>/tools/mcp-server.mjs` |
| OpenAI Codex | `codex mcp add roomcraft -- node <repo>/tools/mcp-server.mjs`, or `~/.codex/config.toml`: `[mcp_servers.roomcraft]` with `command = "node"`, `args = ["<repo>/tools/mcp-server.mjs"]` |
| Gemini CLI | `gemini mcp add --scope user roomcraft node <repo>/tools/mcp-server.mjs` |
| VS Code (Copilot) | `code --add-mcp '{"name":"roomcraft","command":"node","args":["<repo>/tools/mcp-server.mjs"]}'` |
| Cursor | `~/.cursor/mcp.json` → `mcpServers.roomcraft` (JSON below) |
| OpenCode | `~/.config/opencode/opencode.json` → `"mcp": {"roomcraft": {"type": "local", "command": ["node", "<repo>/tools/mcp-server.mjs"], "enabled": true}}` |
| Grok Build | `grok mcp add` if your version has it (check `grok mcp --help` and xAI's current Grok Build docs), otherwise `~/.grok/user-settings.json` → `mcpServers.roomcraft`. For the Assistant: `grok -p`, or set `ROOMCRAFT_GROK_CMD` (e.g. `"grok --prompt"`) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` → `mcpServers.roomcraft` |
| Claude Desktop | `claude_desktop_config.json` → `mcpServers.roomcraft` (use the app's "Add it automatically") |
| Anything else | the JSON below in its MCP config |

```json
{ "mcpServers": { "roomcraft": { "command": "node", "args": ["<repo>/tools/mcp-server.mjs"] } } }
```

## Tools

| Tool | What it does |
| --- | --- |
| `read_link` | Product page → name, size (cm), colours, category, 3D model URL, **product photo (image)** |
| `list_models` / `add_item` / `update_item` | The furniture model library; add and update **return renders** |
| `render_item` / `verify_item` | Look at a model, then record the visual check. **Refused unless the current version was rendered** |
| `save_model_file` | Download a store `.glb` into `userdata/models/` for a permanent copy |
| `write_model_component` / `get_model_component` | Build a model as a React Three Fiber component ([R3F-MODELS.md](R3F-MODELS.md)) |
| `list_designs` / `get_design` | The houses on this device, and one house's full JSON with a summary and problems |
| `write_design` | Save a whole house, e.g. a traced floor plan. **Returns plan + 3D renders of every floor** |
| `render_design` | Plan and/or 3D renders per floor, plus an outside view |
| `stair_info` | Real stair numbers (steps, rise, tread, footprint) for a floor |
| `place_item` | Put a model in a house and get a render of that floor back |
| `export_glb` | Whole house as `.glb` for Blender, saved to `userdata/exports/` |

The vision rule and the design format are in [AGENTS.md](../AGENTS.md).

## No MCP? Use the CLI

```bash
npm run -s link -- https://…                          # product info as JSON
echo "https://…" | npm run -s link -- -               # pipe links in
node tools/cli.mjs add '{"name":"…","category":"sofa","width_cm":228,"depth_cm":95,"height_cm":83}'
node tools/cli.mjs render <itemId>                    # PNGs in userdata/.state/renders/, look at them
node tools/cli.mjs verify <itemId> --notes "…"
node tools/cli.mjs write-design plan.json             # save a design, render every floor
node tools/cli.mjs render-design --views plan,3d --exterior
node tools/cli.mjs export --out house.glb
```

Rendering uses a headless Chromium that downloads once (about 150 MB) on first use. To use an existing
Chrome instead, set `ROOMCRAFT_CHROME=/path/to/chrome`.
