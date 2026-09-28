// The Assistant panel: chat with your own AI agent, its jobs, and cards (with Undo) for the
// changes it makes to the house.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTopic } from './store.js';

function Message({ m, st }) {
  if (m.role === 'job') {
    const label = { queued: 'Waiting', running: 'Working…', done: 'Done', error: 'Failed', stopped: 'Stopped' }[m.status] || m.status;
    return <div className={`chat-job ${m.status}`} data-id={m.id}><span className="st">{label}</span><span>{m.text.replace(/…$/, '')}</span></div>;
  }
  const name = m.role === 'agent' ? st.runners.find((r) => r.id === m.runner)?.name || 'Agent' : '';
  return (
    <div className={`chat-msg ${m.role}${m.error ? ' error' : ''}`} data-id={m.id}>
      {name && <span className="who">{name}</span>}
      {m.role === 'agent' && m.streaming && !m.text ? <span className="typing"><i></i><i></i><i></i></span> : m.text}
      {m.tools?.length > 0 && <div className="tools">{[...new Set(m.tools)].map((t) => <span key={t}>{t.replace(/_/g, ' ')}</span>)}</div>}
    </div>
  );
}

function Change({ c, chat }) {
  return (
    <div className={`chat-change${c.undone ? ' undone' : ''}`}>
      <div>
        <b>{c.undone ? 'Change undone' : 'Your agent changed the house'}</b>
        {c.lines.map((l, i) => <span key={i}>{l}</span>)}
      </div>
      {c.undone ? <button className="btn small ghost" data-redo onClick={() => chat.redoChange(c)}>Redo</button> : <button className="btn small" data-undo onClick={() => chat.undoChange(c)}>Undo</button>}
    </div>
  );
}

export default function Chat() {
  const app = useTopic('chat');
  const [text, setText] = useState('');
  const log = useRef(null);
  const input = useRef(null);
  const chat = app?.chat;
  const open = !!chat?.open;
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  });
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);
  if (!chat || !open) return null;
  const st = chat.state;
  const r = chat.ready;
  const usable = st.runners.filter((x) => x.ready);
  const send = async () => {
    const t = text;
    setText('');
    if (!(await chat.send(t))) setText(t);
  };
  const items = [];
  const cards = (after) => chat.changes.filter((c) => c.after === after).forEach((c) => items.push(<Change key={c.id} c={c} chat={chat} />));
  cards(null);
  for (const m of st.messages) {
    items.push(<Message key={m.id} m={m} st={st} />);
    cards(m.id);
  }
  // Cards whose message was cleared go at the end
  chat.changes.filter((c) => c.after && !st.messages.some((m) => m.id === c.after)).forEach((c) => items.push(<Change key={c.id} c={c} chat={chat} />));
  const installed = st.runners.filter((x) => x.available);
  const empty = !chat.local ? (
    <>The assistant works when Roomcraft runs on your computer with <code>npm start</code>.</>
  ) : r ? (
    <>Ask <b>{r.name}</b> anything about your house: “make the living room 50 cm wider”, “add a sofa from this link”, “what’s the stair rise?”.<br /><br />Paste product links and it models them from their photos. It runs in the background; no terminal needed.</>
  ) : (
    <>
      No terminal agent found to chat with.<br />The assistant runs a command-line agent in the background: Claude Code, Codex, Gemini CLI, OpenCode, Cursor CLI or Grok CLI.
      {!installed.length && <><br /><br />Install one of them, then set it up here.</>}
      <br /><button className="btn small" id="chatSetup" onClick={() => app.openAgents()}>Set up an agent</button><br /><br />
      <span className="hint">Desktop apps (Claude Desktop, VS Code, Windsurf) can use Roomcraft from their own window but can’t be driven from here.</span>
    </>
  );
  return (
    <aside className="chat-panel" id="chatPanel" aria-label="Assistant">
      <div className="chat-head">
        <b>Assistant</b>
        {usable.length > 1 && (
          <select id="chatRunner" title="Which agent answers" value={st.runner || ''} onChange={(e) => chat.setRunner(e.target.value)}>
            {usable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <span className="spacer"></span>
        <button className="icon-btn" id="chatClear" title="New conversation" aria-label="New conversation" onClick={() => chat.clear()}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
        <button className="icon-btn" id="chatClose" title="Close (Esc)" aria-label="Close" onClick={() => chat.toggle(false)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </div>
      <div className="chat-log" id="chatLog" aria-live="polite" ref={log}>
        {(!st.messages.length || !r) && !chat.changes.length ? <div className="chat-empty">{empty}</div> : (
          <>
            {items}
            {!r && <div className="chat-empty">{chat.local ? 'Set up a terminal agent to chat here.' : ''}</div>}
          </>
        )}
      </div>
      <form className="chat-compose" id="chatForm" onSubmit={(e) => (e.preventDefault(), send())}>
        <textarea id="chatInput" ref={input} rows="2" disabled={!r} placeholder="Ask your agent… paste product links to have them modelled" value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), send());
            else if (e.key === 'Escape') chat.toggle(false);
            e.stopPropagation(); // typing here never triggers app shortcuts
          }} />
        <div className="row">
          <span className="hint" id="chatHint">{chat.hint || 'Enter to send · Shift+Enter for a new line'}</span>
          <span className="spacer"></span>
          {st.busy && <button type="button" className="btn small danger ghost" id="chatStop" onClick={() => chat.stop()}>Stop</button>}
          <button className="btn primary small" id="chatSend" disabled={!r}>Send</button>
        </div>
      </form>
    </aside>
  );
}
