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

test('a model job is only "done" if the model was changed and verified during the run', async () => {
  const { modelOutcome } = await import('../lib/runner.mjs');
  const draft = { id: 'i-a', name: 'Chair', dims: { w: 0.5 } };
  const job = { itemId: 'i-a', startedAt: Date.parse('2026-01-01T10:00:00Z'), before: JSON.stringify(draft), idsBefore: ['i-a'] };
  // Untouched: failed, with the agent's first sentence as the reason
  let o = modelOutcome(job, { items: [draft] }, "The link doesn't resolve. Could you check it?");
  assert.equal(o.outcome, 'failed');
  assert.equal(o.reason, "The link doesn't resolve.");
  // The agent says so explicitly
  o = modelOutcome(job, { items: [{ ...draft, dims: { w: 0.6 } }] }, 'Tried.\nFAILED: no product photos on the page');
  assert.deepEqual(o, { outcome: 'failed', reason: 'no product photos on the page' });
  // Changed but not checked
  o = modelOutcome(job, { items: [{ ...draft, dims: { w: 0.6 }, verified: false }] }, 'Done!');
  assert.equal(o.outcome, 'unverified');
  // Checked, but the check found a mismatch
  o = modelOutcome(job, { items: [{ ...draft, verified: false, verifiedNotes: 'Mismatch: legs too thin' }] }, 'Done');
  assert.deepEqual(o, { outcome: 'unverified', itemId: 'i-a', reason: 'legs too thin' });
  // Verified during this run
  o = modelOutcome(job, { items: [{ ...draft, verified: true, verifiedAt: '2026-01-01T10:05:00Z' }] }, 'Done');
  assert.deepEqual(o, { outcome: 'done', itemId: 'i-a' });
  // An old verification doesn't count
  o = modelOutcome(job, { items: [{ ...draft, name: 'Chair 2', verified: true, verifiedAt: '2025-01-01T00:00:00Z' }] }, 'Done');
  assert.equal(o.outcome, 'unverified');
  // A new model the agent added instead of the draft
  o = modelOutcome(job, { items: [draft, { id: 'i-b', addedBy: 'agent', verified: true, verifiedAt: '2026-01-01T10:09:00Z' }] }, 'Done');
  assert.deepEqual(o, { outcome: 'done', itemId: 'i-b' });
});
