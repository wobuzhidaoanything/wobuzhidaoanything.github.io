// Runs the user's own AI agent in the background (its command-line tool, headless) so the app
// can chat with it and hand it jobs, like "model this product link". Nothing to open: the
// server starts the agent when needed and streams what it says back to the page.
//
// Each run is limited to Roomcraft's MCP tools where the agent's CLI allows it, and runs in
// this repository (so it reads AGENTS.md). One run at a time; the rest wait in a queue.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, STATE as STATE_DIR } from './paths.mjs';
import { HARNESSES, SERVER, NODE, agentStatus } from './agents.mjs';

const win = process.platform === 'win32';
const STATE = path.join(STATE_DIR, 'chat.json');
const MCP_JSON = path.join(STATE_DIR, 'mcp.json');

const SYSTEM = [
  'You are the AI assistant inside Roomcraft, a 3D house planner running on this computer. The user talks to you from a chat panel in the app.',
  'Work only through the roomcraft MCP tools (read_link, add_item, update_item, write_model_component, get_model_component, render_item, verify_item, save_model_file, list_models, get_design, write_design, render_design, place_item, stair_info, export_glb). Do not edit files in the repository.',
  'Always look at renders with your own vision before saying something is done, and compare them with product photos or floor plans.',
  'The app updates live when you save. Keep replies short and plain (a few sentences, no headings); the user sees them in a small panel.',
].join(' ');

/** How to run each agent headless. `args` builds the command line; `session` resumes a conversation. */
const RUNNERS = {
  'claude-code': {
    bin: 'claude',
    args: ({ prompt, session }) => [
      '-p', prompt, '--output-format', 'stream-json', '--verbose',
      '--mcp-config', mcpJson(), '--allowedTools', 'mcp__roomcraft', '--append-system-prompt', SYSTEM,
      ...(session ? ['--resume', session] : []),
    ],
  },
  codex: {
    bin: 'codex',
    args: ({ prompt, session }) => [
      'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
      '-c', `mcp_servers.roomcraft.command=${JSON.stringify(NODE)}`, '-c', `mcp_servers.roomcraft.args=[${JSON.stringify(SERVER)}]`,
      ...(session ? ['resume', session] : []), withSystem(prompt, session),
    ],
  },
  gemini: {
    bin: 'gemini',
    noResume: true, // its --resume takes "latest" or an index, not an id: the chat history goes in the prompt
    args: ({ prompt }) => ['-p', withSystem(prompt, null), '--output-format', 'stream-json', '--allowed-mcp-server-names', 'roomcraft'],
  },
  opencode: {
    bin: 'opencode',
    args: ({ prompt, session }) => ['run', '--format', 'json', ...(session ? ['--session', session] : []), withSystem(prompt, session)],
  },
  cursor: {
    bin: 'cursor-agent',
    args: ({ prompt, session }) => ['-p', withSystem(prompt, session), '--output-format', 'stream-json', '--approve-mcps', ...(session ? ['--resume', session] : [])],
  },
  // Grok Build: `grok -p "…"` by default; ROOMCRAFT_GROK_CMD overrides it (e.g. "grok --prompt")
  grok: {
    bin: (process.env.ROOMCRAFT_GROK_CMD || 'grok').trim().split(/\s+/)[0],
    noResume: true,
    args: ({ prompt }) => {
      const custom = (process.env.ROOMCRAFT_GROK_CMD || '').trim().split(/\s+/).slice(1);
      return [...(custom.length ? custom : ['-p']), withSystem(prompt, null)];
    },
  },
};

const TOOL_NAMES = new Set(['read_link', 'list_models', 'add_item', 'update_item', 'write_model_component', 'get_model_component', 'render_item', 'verify_item', 'save_model_file', 'list_designs', 'get_design', 'write_design', 'render_design', 'stair_info', 'place_item', 'export_glb']);

const withSystem = (prompt, session) => (session ? prompt : `${SYSTEM}\n\n${prompt}`);

function mcpJson() {
  fs.mkdirSync(path.dirname(MCP_JSON), { recursive: true });
  fs.writeFileSync(MCP_JSON, JSON.stringify({ mcpServers: { roomcraft: { command: NODE, args: [SERVER] } } }, null, 2));
  return MCP_JSON;
}

/** Is `bin` on PATH? (cached for a minute) */
const onPath = new Map();
export function findBin(bin) {
  const hit = onPath.get(bin);
  if (hit && Date.now() - hit.at < 60000) return hit.path;
  let found = null;
  const exts = win ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const f = path.join(dir, bin + ext.toLowerCase());
      try {
        if (fs.statSync(f).isFile()) {
          found = f;
          break;
        }
      } catch {}
    }
    if (found) break;
  }
  onPath.set(bin, { path: found, at: Date.now() });
  return found;
}

/** Agents the app can talk to: installed CLI + Roomcraft set up (or injected per run). */
export function runners() {
  const status = agentStatus().harnesses;
  return HARNESSES.filter((h) => RUNNERS[h.id]).map((h) => {
    const st = status.find((s) => s.id === h.id);
    const available = !!findBin(RUNNERS[h.id].bin);
    // Claude Code and Codex get the server on the command line, so they work even before setup.
    const ready = available && (st.configured || !!st.connection || h.id === 'claude-code' || h.id === 'codex');
    return { id: h.id, name: h.name, bin: RUNNERS[h.id].bin, available, configured: st.configured, ready };
  });
}

// ---------- state: conversation + job log (device-local, gitignored) ----------

let state = load();
function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { runner: null, sessions: {}, messages: [] };
  }
}
function save() {
  state.messages = state.messages.slice(-200);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
}

let listeners = new Set();
export function onAgentEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (ev) => {
  for (const fn of listeners) fn({ type: 'agent', ...ev });
};

const queue = [];
let current = null;
const id = () => Math.random().toString(36).slice(2, 10);

export function chatState() {
  const list = runners();
  const chosen = list.find((r) => r.id === state.runner && r.ready) || list.find((r) => r.ready) || null;
  return {
    runners: list,
    runner: chosen?.id || null,
    busy: !!current,
    current: current && { id: current.id, kind: current.kind, title: current.title },
    queued: queue.map((j) => ({ id: j.id, kind: j.kind, title: j.title })),
    messages: state.messages,
  };
}

export function setRunner(runnerId) {
  if (!RUNNERS[runnerId]) throw new Error('Unknown agent');
  state.runner = runnerId;
  save();
  return chatState();
}

/** Forget the conversation (the next message starts a fresh agent session). */
export function clearChat() {
  state.sessions = {};
  state.messages = [];
  save();
  emit({ event: 'cleared' });
  return chatState();
}

/**
 * Queue a job for the agent.
 *  - kind "chat": { text, context } — continues the chat conversation
 *  - kind "model": { url, itemId, name } — model a product from its link (its own session)
 */
export function enqueue(kind, data) {
  const st = chatState();
  const runnerId = data.runner || st.runner;
  const r = st.runners.find((x) => x.id === runnerId);
  if (!r?.ready) throw new Error('No agent is ready. Open Agents to set one up (a terminal agent such as Claude Code, Codex or Gemini CLI).');
  const job = { id: id(), kind, runner: runnerId, ...data };
  if (kind === 'chat') {
    job.title = data.text.slice(0, 80);
    job.prompt = (data.context ? `[App context: ${data.context}]\n\n` : '') + data.text;
    job.session = state.sessions[runnerId] || null;
    if (RUNNERS[runnerId].noResume) {
      const recent = state.messages.filter((m) => m.role === 'user' || (m.role === 'agent' && !m.job)).slice(-8);
      if (recent.length) job.prompt = `Conversation so far:\n${recent.map((m) => `${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n')}\n\nNew message:\n${job.prompt}`;
    }
    message({ role: 'user', text: data.text });
  } else if (kind === 'model') {
    job.title = `Model ${data.name || data.url}`;
    job.prompt = modelPrompt(data);
    message({ role: 'job', text: `Modelling ${data.name || 'a product'} from its link…`, job: job.id, url: data.url, status: 'queued' });
  } else throw new Error('Unknown job');
  queue.push(job);
  pump();
  return { ok: true, job: job.id, ...chatState() };
}

/**
 * The instructions sent with every product link (link box or chat). Realistic, but light: the
 * full guide is docs/MODELLING.md.
 */
export function modelPrompt({ url, itemId, name }) {
  return [
    `Make a realistic 3D model of this product for Roomcraft: ${url}`,
    itemId ? `A quick draft is already in the library as item "${itemId}"${name ? ` (${name})` : ''}. Improve that item (update_item / save_model_file / write_model_component); don't add a duplicate.` : 'Add it with add_item (from_url).',
    '',
    'Goal: looks like the real product at a glance, at the exact size, and small on disk. Rules (full guide: docs/MODELLING.md in the Roomcraft repo):',
    '1. read_link. Study EVERY product photo and the description. Find the real overall width × depth × height in cm (width = side to side facing the front); sanity-check against the photos (seat ≈ 45 cm, table ≈ 75 cm).',
    '2. Pick the lightest way that looks right:',
    '   a. The store has a real 3D file → save_model_file (it is compressed to the 5 MB budget automatically; check it is not a placeholder, wrongly scaled or rotated).',
    '   b. A standard shape fits → update_item with the right category, size, colour options (realistic hex values; wood finishes named with a wood word) and accent colour for legs/frames.',
    '   c. An unusual shape → write_model_component (React Three Fiber). Soft edges (RoundedBox/bevels), realistic roughness/metalness, 24–48 segments on round parts, loops for repeated parts, front facing +z, bottom at y = 0. No image textures, internet assets, animation or text.',
    '3. Budget: ≤ 5 MB per model file, ≤ 200k triangles (aim for 5k–60k; the renders report the count). Include detail you would notice from 2 m away (cushions, seams, legs, handles, buttons); skip stitching and screws.',
    '4. Look at the renders and compare with every photo: silhouette, proportions, colours, materials. Fix and render again until it matches.',
    '5. verify_item with notes on what you compared and anything you could not match.',
    '',
    'Finish with one short line: what the model looks like now, its size and file weight, and anything you could not match.',
  ].join('\n');
}

function message(m) {
  const full = { id: id(), at: new Date().toISOString(), ...m };
  state.messages.push(full);
  save();
  emit({ event: 'message', message: full });
  return full;
}
function patchMessage(mid, patch) {
  const m = state.messages.find((x) => x.id === mid);
  if (!m) return;
  Object.assign(m, patch);
  save();
  emit({ event: 'update', message: m });
}

export function stop() {
  queue.length = 0;
  if (current?.proc) {
    current.stopped = true;
    current.proc.kill(win ? undefined : 'SIGTERM');
  }
  return chatState();
}

function pump() {
  emit({ event: 'state', state: { busy: !!current, current: current && { id: current.id, kind: current.kind, title: current.title }, queued: queue.length } });
  if (current || !queue.length) return;
  run(queue.shift());
}

function run(job) {
  current = job;
  const def = RUNNERS[job.runner];
  const bin = findBin(def.bin);
  const jobMsg = state.messages.find((m) => m.job === job.id);
  if (jobMsg) patchMessage(jobMsg.id, { status: 'running' });
  const reply = message({ role: 'agent', text: '', tools: [], runner: job.runner, job: job.kind === 'model' ? job.id : undefined, streaming: true });
  const args = def.args({ prompt: job.prompt, session: job.session });
  let proc;
  try {
    proc = spawn(bin, args, { cwd: ROOT, env: { ...process.env, ROOMCRAFT_AGENT_RUN: '1' }, shell: win && /\.(cmd|bat)$/i.test(bin), stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return finish(job, reply, `Couldn't start ${def.bin}: ${err.message}`, true);
  }
  job.proc = proc;
  const parsed = { text: '', tools: [], session: null, final: null };
  let buf = '';
  let errText = '';
  const update = () => patchMessage(reply.id, { text: parsed.final || parsed.text, tools: parsed.tools.slice(-30) });
  let pending = null;
  const later = () => pending || (pending = setTimeout(() => ((pending = null), update()), 250));
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) parseLine(line, parsed);
    }
    later();
  });
  proc.stderr.on('data', (d) => (errText = (errText + d).slice(-4000)));
  proc.on('error', (err) => finish(job, reply, `Couldn't start ${def.bin}: ${err.message}`, true));
  proc.on('close', (code) => {
    if (buf.trim()) parseLine(buf.trim(), parsed);
    clearTimeout(pending);
    if (parsed.session && job.kind === 'chat') {
      state.sessions[job.runner] = parsed.session;
      save();
    }
    const text = (parsed.final || parsed.text).trim();
    if (job.stopped) return finish(job, reply, (text ? text + '\n\n' : '') + 'Stopped.', false, parsed);
    if (code !== 0 && !text) return finish(job, reply, `${def.bin} exited with code ${code}. ${tail(errText)}`.trim(), true, parsed);
    finish(job, reply, text || 'Done.', false, parsed);
  });
}

const tail = (s) => s.trim().split('\n').slice(-4).join('\n');

function finish(job, reply, text, error, parsed = { tools: [] }) {
  if (current !== job) return;
  patchMessage(reply.id, { text, tools: parsed.tools.slice(-30), streaming: false, error: error || undefined });
  const jobMsg = state.messages.find((m) => m.job === job.id && m.role === 'job');
  if (jobMsg) patchMessage(jobMsg.id, { status: error ? 'error' : job.stopped ? 'stopped' : 'done' });
  current = null;
  emit({ event: 'done', job: job.id, kind: job.kind, error: !!error, itemId: job.itemId });
  pump();
}

/**
 * Understands the streaming JSON of Claude Code / Cursor (stream-json), Codex (--json),
 * Gemini CLI (stream-json) and OpenCode (--format json); anything else is plain text.
 */
export function parseLine(line, out) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    out.text += (out.text ? '\n' : '') + line;
    return;
  }
  const sid = j.session_id || j.sessionId || j.sessionID || j.thread_id || j.part?.sessionID;
  if (sid && typeof sid === 'string') out.session = sid;
  // Only Roomcraft's own tools are worth showing (not the agent's internal helpers)
  const tool = (name) => {
    const t = String(name || '').replace(/^mcp__roomcraft__|^roomcraft[_.:]+|^mcp_roomcraft_/, '');
    if (TOOL_NAMES.has(t)) out.tools.push(t);
  };
  // Claude Code / Cursor
  if (j.type === 'assistant' && Array.isArray(j.message?.content)) {
    for (const c of j.message.content) {
      if (c.type === 'text' && c.text) out.text += (out.text ? '\n\n' : '') + c.text;
      if (c.type === 'tool_use') tool(c.name);
    }
    return;
  }
  if (j.type === 'result') {
    if (typeof j.result === 'string' && j.result.trim()) out.final = j.result;
    return;
  }
  // Codex
  if (j.type === 'item.completed' || j.type === 'item.started') {
    const it = j.item || {};
    if (j.type === 'item.completed' && (it.type === 'agent_message' || it.item_type === 'assistant_message') && it.text) out.text += (out.text ? '\n\n' : '') + it.text;
    if (j.type === 'item.started' && /tool|mcp/.test(it.type || it.item_type || '')) tool(it.tool || it.name);
    return;
  }
  // Gemini CLI
  if (j.type === 'message' && j.role === 'assistant' && typeof j.content === 'string') {
    out.text += j.content;
    return;
  }
  if (j.type === 'tool_use') return tool(j.tool_name || j.name || j.part?.tool);
  // OpenCode
  if (j.type === 'text' && j.part?.text) {
    out.text += (out.text ? '\n\n' : '') + j.part.text;
    return;
  }
  if (j.type === 'tool' || j.part?.type === 'tool') return tool(j.part?.tool);
}
