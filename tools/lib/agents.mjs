// AI agent ("harness") connections for the Roomcraft MCP server.
// The app shows a setup prompt per harness; the agent installs the server into its own
// user-level config. We detect setup two ways: the harness's config mentions "roomcraft",
// and the MCP server records every client that connects (userdata/.state/connections.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, STATE } from './paths.mjs';

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const XDG = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
const mac = process.platform === 'darwin', win = process.platform === 'win32';
export const SERVER = path.join(ROOT, 'tools', 'mcp-server.mjs');
export const NODE = process.execPath;
const CONNECTIONS = path.join(STATE, 'connections.json');

const q = (s) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
const serverJson = (extra = {}) => ({ command: NODE, args: [SERVER], ...extra });

/** Harness definitions. `json` = [configPath, key] for JSON configs we can edit ourselves. */
export const HARNESSES = [
  {
    // First: the agent we prioritise. Grok Build is new, so its prompt asks it to check its own current docs.
    id: 'grok', name: 'Grok Build', match: /grok/i,
    config: path.join(HOME, '.grok', 'user-settings.json'), json: 'mcpServers',
    jsonEntry: () => ({ transport: 'stdio', ...serverJson() }),
    hint: [
      'Grok Build changes quickly, so before you start: run `grok --help` and `grok mcp --help` (if they exist), and search the web for the current official xAI Grok Build documentation on adding a user-level (global) stdio MCP server. Prefer its own MCP command if it has one; otherwise add the entry above to your user settings file (find its current location in the docs if the path above is different).',
      'Also find out how Grok Build runs a single prompt non-interactively from the command line (for example `grok -p "..."`) and tell me the exact command, so Roomcraft\'s Assistant can talk to you in the background. If it differs from `grok -p`, tell me to set ROOMCRAFT_GROK_CMD (for example ROOMCRAFT_GROK_CMD="grok --prompt") before npm start.',
    ].join('\n\n'),
    after: 'Restart Grok Build so it loads the server.',
  },
  {
    id: 'claude-code', name: 'Claude Code', match: /claude[- ]?code/i,
    config: path.join(HOME, '.claude.json'),
    add: `claude mcp add --scope user roomcraft -- ${q(NODE)} ${q(SERVER)}`,
    list: 'claude mcp list', remove: ['claude', ['mcp', 'remove', '--scope', 'user', 'roomcraft']],
    after: 'Restart Claude Code (or run /mcp) so it loads the server.',
  },
  {
    id: 'codex', name: 'OpenAI Codex', match: /codex/i,
    config: path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'config.toml'),
    add: `codex mcp add roomcraft -- ${q(NODE)} ${q(SERVER)}`,
    list: 'codex mcp list', remove: ['codex', ['mcp', 'remove', 'roomcraft']], toml: true,
    after: 'Start a new Codex session so it loads the server.',
  },
  {
    id: 'cursor', name: 'Cursor', match: /cursor/i,
    config: path.join(HOME, '.cursor', 'mcp.json'), json: 'mcpServers',
    after: 'Open Cursor Settings → MCP and make sure "roomcraft" is enabled.',
  },
  {
    id: 'vscode', name: 'VS Code (Copilot)', match: /visual studio code|vscode|copilot/i,
    config: path.join(mac ? path.join(HOME, 'Library', 'Application Support') : win ? APPDATA : XDG, 'Code', 'User', 'mcp.json'), json: 'servers',
    jsonEntry: () => ({ type: 'stdio', ...serverJson() }),
    add: `code --add-mcp ${q(JSON.stringify({ name: 'roomcraft', command: NODE, args: [SERVER] }))}`,
    after: 'In VS Code run "MCP: List Servers" and start "roomcraft" if needed.',
  },
  {
    id: 'gemini', name: 'Gemini CLI', match: /gemini/i,
    config: path.join(HOME, '.gemini', 'settings.json'), json: 'mcpServers',
    jsonEntry: () => ({ ...serverJson(), trust: true }), // trusted: Roomcraft's tools run without a confirmation each time
    add: `gemini mcp add --scope user --trust roomcraft ${q(NODE)} ${q(SERVER)}`,
    list: 'gemini mcp list', remove: ['gemini', ['mcp', 'remove', '--scope', 'user', 'roomcraft']],
    after: 'Restart Gemini CLI so it loads the server.',
  },
  {
    id: 'opencode', name: 'OpenCode', match: /opencode/i,
    config: path.join(XDG, 'opencode', 'opencode.json'), json: 'mcp',
    jsonEntry: () => ({ type: 'local', command: [NODE, SERVER], enabled: true }),
    after: 'Restart OpenCode so it loads the server.',
  },
  {
    id: 'windsurf', name: 'Windsurf', match: /windsurf|codeium|cascade/i,
    config: path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json'), json: 'mcpServers',
    after: 'In Windsurf open Cascade → MCP servers and refresh.',
  },
  {
    id: 'claude-desktop', name: 'Claude Desktop', match: /claude/i, noShell: true,
    config: path.join(mac ? path.join(HOME, 'Library', 'Application Support') : win ? APPDATA : XDG, 'Claude', 'claude_desktop_config.json'), json: 'mcpServers',
    after: 'Quit and reopen Claude Desktop.',
  },
];

function readConnections() {
  try {
    return JSON.parse(fs.readFileSync(CONNECTIONS, 'utf8'));
  } catch {
    return {};
  }
}

/** Called by the MCP server on `initialize`: remember which harness connected. */
export function recordConnection(clientInfo = {}) {
  const name = String(clientInfo.name || 'unknown');
  const h = HARNESSES.find((x) => x.match.test(name));
  const id = h?.id || `other:${name}`;
  const all = readConnections();
  const now = new Date().toISOString();
  all[id] = { client: name, version: clientInfo.version || null, firstSeen: all[id]?.firstSeen || now, lastSeen: now };
  fs.mkdirSync(path.dirname(CONNECTIONS), { recursive: true });
  fs.writeFileSync(CONNECTIONS, JSON.stringify(all, null, 2));
}

function configured(h) {
  try {
    const text = fs.readFileSync(h.config, 'utf8');
    return h.toml ? /\[mcp_servers\.roomcraft\]/.test(text) : /"roomcraft"\s*:/.test(text);
  } catch {
    return false;
  }
}

/** The prompt the user pastes into their agent so it sets itself up. */
export function setupPrompt(h) {
  const entry = h.jsonEntry ? h.jsonEntry() : serverJson();
  const lines = [
    'Please connect yourself to the Roomcraft MCP server so you can use its tools in every session (user-level, not just this project).',
    '',
    'Server details:',
    '- name: roomcraft',
    '- transport: stdio',
    `- command: ${NODE}`,
    `- args: ["${SERVER}"]`,
    '',
  ];
  if (h.add) lines.push(`Run this command:\n${h.add}`);
  if (h.json) lines.push(`${h.add ? 'If that command is not available, instead add' : 'Add'} this entry under "${h.json}" in ${h.config} (create the file if needed, keep any existing entries, and make a backup first):\n${JSON.stringify({ roomcraft: entry }, null, 2)}`);
  if (h.hint) lines.push(h.hint);
  lines.push(
    '',
    'If any step above does not match your version (command names, config file location or format), search the web for your own current official documentation on adding a user-level stdio MCP server and follow that instead. Never guess silently: tell me what you looked up.',
    '',
    `Then check it is registered${h.list ? ` (\`${h.list}\`)` : ''}, tell me exactly what I need to approve or restart (${h.after}), and once you can see the roomcraft tools, call its list_models tool once so Roomcraft knows the connection works.`
  );
  return lines.join('\n');
}

export function genericPrompt() {
  return setupPrompt({ name: 'your agent', json: 'mcpServers', config: "your agent's MCP config file", after: 'restart the agent' });
}

export function agentStatus() {
  const conns = readConnections();
  const list = HARNESSES.map((h) => ({
    id: h.id,
    name: h.name,
    configured: configured(h),
    connection: conns[h.id] || null,
    canAutoSetup: !!h.json,
    noShell: !!h.noShell,
    configPath: h.config,
    prompt: setupPrompt(h),
  }));
  const others = Object.entries(conns)
    .filter(([id]) => id.startsWith('other:'))
    .map(([id, c]) => ({ id, name: c.client, configured: false, connection: c, canAutoSetup: false, other: true }));
  return { server: SERVER, node: NODE, harnesses: [...list, ...others], genericPrompt: genericPrompt() };
}

function editJson(file, key, fn) {
  let data = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    data = text.trim() ? JSON.parse(text) : {};
    fs.copyFileSync(file, `${file}.roomcraft-backup`);
  }
  data[key] ||= {};
  fn(data[key]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** Write the config ourselves (JSON-config harnesses, e.g. Claude Desktop which can't run commands). */
export function autoSetup(id) {
  const h = HARNESSES.find((x) => x.id === id);
  if (!h?.json) throw new Error('This agent sets itself up from the prompt.');
  editJson(h.config, h.json, (servers) => (servers.roomcraft = h.jsonEntry ? h.jsonEntry() : serverJson()));
  return { ok: true, message: `Added to ${h.config}. ${h.after}` };
}

/** Remove Roomcraft from a harness: its own CLI when available, else edit its config (with a backup). */
export function removeAgent(id) {
  const conns = readConnections();
  delete conns[id];
  fs.mkdirSync(path.dirname(CONNECTIONS), { recursive: true });
  fs.writeFileSync(CONNECTIONS, JSON.stringify(conns, null, 2));
  const h = HARNESSES.find((x) => x.id === id);
  if (!h) return { ok: true, message: 'Forgotten.' };
  if (!configured(h)) return { ok: true, message: `${h.name} no longer has Roomcraft configured.` };
  if (h.remove) {
    const r = spawnSync(h.remove[0], h.remove[1], { encoding: 'utf8', shell: win, timeout: 20000 });
    if (r.status === 0 && !configured(h)) return { ok: true, message: `Removed from ${h.name}. ${h.after}` };
  }
  if (h.json) {
    editJson(h.config, h.json, (servers) => delete servers.roomcraft);
    return { ok: true, message: `Removed from ${h.config} (backup saved next to it). ${h.after}` };
  }
  if (h.toml) {
    const text = fs.readFileSync(h.config, 'utf8');
    fs.copyFileSync(h.config, `${h.config}.roomcraft-backup`);
    fs.writeFileSync(h.config, text.replace(/\n?\[mcp_servers\.roomcraft(\.[^\]]+)?\][^[]*/g, '\n'));
    return { ok: true, message: `Removed from ${h.config} (backup saved next to it). ${h.after}` };
  }
  return { ok: false, message: `Couldn't remove automatically. Ask ${h.name}: "remove the roomcraft MCP server from your configuration".` };
}
