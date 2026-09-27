import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../lib/runner.mjs';

const run = (lines) => {
  const out = { text: '', tools: [], session: null, final: null };
  for (const l of lines) parseLine(typeof l === 'string' ? l : JSON.stringify(l), out);
  return out;
};

test('Claude Code / Cursor stream-json: text, Roomcraft tools, session and final result', () => {
  const o = run([
    { type: 'system', subtype: 'init', session_id: 's-1' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ToolSearch' }, { type: 'tool_use', name: 'mcp__roomcraft__read_link' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it' }] } },
    { type: 'result', result: 'Modelled the table.', session_id: 's-1' },
  ]);
  assert.equal(o.session, 's-1');
  assert.deepEqual(o.tools, ['read_link']);
  assert.equal(o.final, 'Modelled the table.');
});

test('Codex --json: thread id, tool calls and agent messages', () => {
  const o = run([
    { type: 'thread.started', thread_id: 't-9' },
    { type: 'item.started', item: { type: 'mcp_tool_call', server: 'roomcraft', tool: 'update_item' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Done.' } },
  ]);
  assert.equal(o.session, 't-9');
  assert.deepEqual(o.tools, ['update_item']);
  assert.equal(o.text, 'Done.');
});

test('Gemini stream-json, OpenCode json and plain text', () => {
  const g = run([{ type: 'init', session_id: 'g' }, { type: 'tool_use', tool_name: 'render_item' }, { type: 'message', role: 'assistant', content: 'Hel', delta: true }, { type: 'message', role: 'assistant', content: 'lo', delta: true }]);
  assert.equal(g.text, 'Hello');
  assert.deepEqual(g.tools, ['render_item']);
  const oc = run([{ type: 'tool_use', part: { tool: 'roomcraft_verify_item', sessionID: 'x' } }, { type: 'text', part: { text: 'Checked.' } }]);
  assert.equal(oc.session, 'x');
  assert.deepEqual(oc.tools, ['verify_item']);
  assert.equal(oc.text, 'Checked.');
  assert.equal(run(['plain output', 'second line']).text, 'plain output\nsecond line');
});
