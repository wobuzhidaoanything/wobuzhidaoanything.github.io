# Connecting AI agents (MCP)

Roomcraft includes an MCP server, `tools/mcp-server.mjs`, that any MCP-capable agent can use to:

| Tool | What it does |
| --- | --- |
| `read_link` | Reads a product page instantly: name, size (cm), colour options, category, 3D model URL, **and the product photo as an image** |
| `list_items` | Lists the model inventory (with verified status) and what's placed |
| `add_item` | Adds a three.js furniture model to `data/project.json` (optionally prefilled `from_url`) and **returns renders** |
| `update_item` | Corrects a model and returns fresh renders |
| `render_item` | Renders a model (three-quarter, front, side, top; 1 m grid) |
| `verify_item` | Records the visual check. **Refused unless the current version was rendered** |
| `save_model_file` | Downloads a `.glb` into `models/` so the repo keeps its own copy |
| `render_room` | Renders the room (3D, plan, eye level) to check layout edits |

## Setup (once per computer)

```bash
git clone <this repo> && cd <repo>
npm start          # installs dependencies, opens the site; Ctrl+C to stop
```

The first render downloads a headless Chromium (about 150 MB, one time). To use an existing Chrome
instead, set `ROOMCRAFT_CHROME=/path/to/chrome`.

## Per agent

Most agents pick the server up **automatically** from files committed in this repo. Open the repo
folder in the agent and approve the `roomcraft` server when asked.

| Agent | Config in repo | Manual alternative |
| --- | --- | --- |
| **Claude Code** | `.mcp.json` (approve on first run) | `claude mcp add roomcraft -- node tools/mcp-server.mjs` |
| **OpenAI Codex CLI** | none (Codex uses a user config) | `codex mcp add roomcraft -- node "$(pwd)/tools/mcp-server.mjs"`, or add to `~/.codex/config.toml`: see below |
| **Cursor** | `.cursor/mcp.json` | Settings → MCP → enable `roomcraft` |
| **VS Code (Copilot agent mode)** | `.vscode/mcp.json` | Command palette → "MCP: List Servers" → start `roomcraft` |
| **Gemini CLI** | `.gemini/settings.json` | `gemini mcp add roomcraft node tools/mcp-server.mjs` |
| **OpenCode** | `opencode.json` | `opencode mcp add` |
| **Grok Build / Grok CLI** | `.grok/settings.json` | `grok mcp add roomcraft --transport stdio --command node --args tools/mcp-server.mjs` (check `grok mcp --help`; the flags differ between versions) |
| **Windsurf** | none | Settings → Cascade → MCP servers → add the JSON below |
| **Claude Desktop / other clients** | none | Add the JSON below to the client's MCP config (use an absolute path) |

Codex `~/.codex/config.toml`:

```toml
[mcp_servers.roomcraft]
command = "node"
args = ["/absolute/path/to/repo/tools/mcp-server.mjs"]
```

Generic JSON (Windsurf, Claude Desktop, Cline, Zed, etc.):

```json
{
  "mcpServers": {
    "roomcraft": { "command": "node", "args": ["/absolute/path/to/repo/tools/mcp-server.mjs"] }
  }
}
```

Check it works by asking the agent: *"List the roomcraft tools, then read this link: <product URL>"*.

## No MCP? Use the CLI (works with any agent or shell)

```bash
npm run -s link -- https://www.ikea.com/…          # product info as JSON
echo "https://…" | npm run -s link -- -            # pipe links in
node tools/cli.mjs read <url> --photo              # also saves the product photo as a PNG
node tools/cli.mjs add '{"name":"…","category":"sofa","width_cm":228,"depth_cm":95,"height_cm":83,"colors":[{"name":"Dark grey","hex":"#4a4b4d"}]}'
node tools/cli.mjs render <itemId>                 # writes PNGs to .roomcraft/renders/
node tools/cli.mjs verify <itemId> --notes "compared shape, proportions and colours with the photo"
node tools/cli.mjs render-room --views 3d,plan
```

## The vision rule (every agent)

Every model an agent adds or changes is saved as **unverified**, and the site shows an "Unverified" badge on
it. To verify it, the agent must:

1. look at the product photo (`read_link`, or `read --photo`),
2. look at the renders of the model's current version,
3. compare shape, proportions, colours and size, and
4. call `verify_item` with notes, or fix the model with `update_item` and look again.

`verify_item` is refused if the model changed since it was last rendered, so it can't be skipped. Agents
without image input can't do step 2 and should leave items unverified for a human to check.
