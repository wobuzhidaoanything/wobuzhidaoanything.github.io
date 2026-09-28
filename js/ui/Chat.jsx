// The Assistant panel: chat with your own AI agent, its jobs, and cards (with Undo) for the
// changes it makes to the house.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTopic } from './store.js';
import { Icon } from './controls.js';
import { dimsFromText } from '../shared/scrape.js';

const MAX_IMAGES = 6;

/** A pasted or dropped picture → a data: URL, at most 2000 px (PNG stays PNG for screenshots). */
async function toDataUrl(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
}

const imagesIn = (list) => [...(list || [])].filter((f) => f.kind === 'file' ? f.type.startsWith('image/') : f.type?.startsWith('image/')).map((f) => (f.getAsFile ? f.getAsFile() : f)).filter(Boolean);
const cm = (m) => Math.round(m * 1000) / 10;

function Message({ m, st, chat, last }) {
  if (m.role === 'job') {
    const label = { queued: 'Waiting', running: 'Working…', done: 'Done', unverified: 'Needs a check', error: 'Failed', stopped: 'Stopped' }[m.status] || m.status;
    const again = (m.status === 'error' || m.status === 'unverified' || m.status === 'stopped') && m.url;
    return (
      <div className={`chat-job ${m.status}`} data-id={m.id}>
        <span className="st">{label}</span>
        <span className="jt">{m.text.replace(/…$/, '')}{m.note && <em>{m.note}</em>}</span>
        {again && <button className="btn small" data-retry onClick={() => chat.retry(m)} disabled={!chat.ready}>Try again</button>}
      </div>
    );
  }
  const name = m.role === 'agent' ? st.runners.find((r) => r.id === m.runner)?.name || 'Agent' : '';
  return (
    <div className={`chat-msg ${m.role}${m.error ? ' error' : ''}`} data-id={m.id}>
      {name && <span className="who">{name}</span>}
      {m.role === 'agent' && m.streaming && !m.text ? <span className="typing"><i></i><i></i><i></i></span> : m.text}
      {m.images?.length > 0 && (
        <div className="chat-pics">{m.images.map((n) => <a key={n} href={`api/uploads/${n}`} target="_blank" rel="noopener"><img src={`api/uploads/${n}`} alt="Attached picture" /></a>)}</div>
      )}
      {m.tools?.length > 0 && <div className="tools">{[...new Set(m.tools)].map((t) => <span key={t}>{t.replace(/_/g, ' ')}</span>)}</div>}
      {m.role === 'agent' && m.error && !m.job && last && <div><button className="btn small" data-retry onClick={() => chat.retry(m)} disabled={!chat.ready || st.busy}>Try again</button></div>}
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
  const [pics, setPics] = useState([]); // [{ id, url }]
  const [over, setOver] = useState(false);
  const file = useRef(null);
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
  const attach = async (files) => {
    if (!files.length) return;
    const room = MAX_IMAGES - pics.length;
    if (room <= 0) return chat?.say(`At most ${MAX_IMAGES} pictures per message.`);
    const add = [];
    for (const f of files.slice(0, room)) {
      try {
        add.push({ id: Math.random().toString(36).slice(2), url: await toDataUrl(f) });
      } catch {
        chat?.say('That picture couldn’t be read.');
      }
    }
    setPics((p) => [...p, ...add].slice(0, MAX_IMAGES));
    setTimeout(() => input.current?.focus(), 0);
  };
  // Paste a picture anywhere in the app (outside other text fields): it goes to the Assistant
  useEffect(() => {
    if (!chat?.local) return;
    const paste = (e) => {
      const files = imagesIn(e.clipboardData?.items);
      if (!files.length) return;
      const t = e.target;
      if (t !== input.current && /input|textarea|select/i.test(t.tagName || '')) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (!chat.open) chat.toggle(true);
      attach(files);
    };
    addEventListener('paste', paste);
    return () => removeEventListener('paste', paste);
  });
  if (!chat || !open) return null;
  const st = chat.state;
  const r = chat.ready;
  const usable = st.runners.filter((x) => x.ready);
  const send = async () => {
    const t = text, p = pics;
    if (!t.trim() && !p.length) return;
    setText('');
    setPics([]);
    if (!(await chat.send(t, p.map((x) => x.url)))) (setText(t), setPics(p));
  };
  const { dims } = dimsFromText(text);
  const size = Object.keys(dims).length >= 2 ? ['w', 'd', 'h'].filter((k) => dims[k]).map((k) => `${{ w: 'W', d: 'D', h: 'H' }[k]} ${cm(dims[k])}`).join(' × ') + ' cm' : null;
  const items = [];
  const cards = (after) => chat.changes.filter((c) => c.after === after).forEach((c) => items.push(<Change key={c.id} c={c} chat={chat} />));
  cards(null);
  for (const m of st.messages) {
    items.push(<Message key={m.id} m={m} st={st} chat={chat} last={m === st.messages.at(-1)} />);
    cards(m.id);
  }
  // Cards whose message was cleared go at the end
  chat.changes.filter((c) => c.after && !st.messages.some((m) => m.id === c.after)).forEach((c) => items.push(<Change key={c.id} c={c} chat={chat} />));
  const installed = st.runners.filter((x) => x.available);
  const empty = !chat.local ? (
    <>The assistant works when Roomcraft runs on your computer with <code>npm start</code>.</>
  ) : r ? (
    <>Ask <b>{r.name}</b> anything about your house: “make the living room 50 cm wider”, “add a sofa from this link”, “what’s the stair rise?”.<br /><br />Paste product links, or paste pictures of a piece with its size (e.g. <i>200 x 90 x 80 cm</i>), and it models them. It runs in the background; no terminal needed.</>
  ) : (
    <>
      No terminal agent found to chat with.<br />The assistant runs a command-line agent in the background: Claude Code, Codex, Gemini CLI, OpenCode, Cursor CLI or Grok CLI.
      {!installed.length && <><br /><br />Install one of them, then set it up here.</>}
      <br /><button className="btn small" id="chatSetup" onClick={() => app.openAgents()}>Set up an agent</button><br /><br />
      <span className="hint">Desktop apps (Claude Desktop, VS Code, Windsurf) can use Roomcraft from their own window but can’t be driven from here.</span>
    </>
  );
  return (
    <aside className={`chat-panel${over ? ' drop' : ''}`} id="chatPanel" aria-label="Assistant"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && (e.preventDefault(), e.stopPropagation(), setOver(true))}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
      onDrop={(e) => {
        const files = imagesIn(e.dataTransfer.files);
        setOver(false);
        if (files.length) (e.preventDefault(), e.stopPropagation(), attach(files));
      }}>
      <div className="chat-head">
        <b>Assistant</b>
        {usable.length > 1 && (
          <select id="chatRunner" title="Which agent answers" value={st.runner || ''} onChange={(e) => chat.setRunner(e.target.value)}>
            {usable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <span className="spacer"></span>
        {chat.local && <button className="btn small ghost" title="Connect or change AI agents" onClick={() => app.openAgents()}>Agents</button>}
        <button className="icon-btn" id="chatClear" title="New conversation" aria-label="New conversation" onClick={() => chat.clear()}><Icon n="plus" /></button>
        <button className="icon-btn" id="chatClose" title="Close (Esc)" aria-label="Close" onClick={() => chat.toggle(false)}><Icon n="close" /></button>
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
        {pics.length > 0 && (
          <div className="chat-attach">
            {pics.map((p) => (
              <span key={p.id} className="chat-thumb">
                <img src={p.url} alt="Picture to send" />
                <button type="button" title="Remove" aria-label="Remove picture" onClick={() => setPics((x) => x.filter((y) => y !== p))}>×</button>
              </span>
            ))}
          </div>
        )}
        {(size || pics.length > 0) && (
          <div className="chat-size" id="chatSize">
            {size ? <>Size: <b>{size}</b> · your agent models it at this size</> : 'Add the size (e.g. 200 x 90 x 80 cm) so the model is exact, or your agent will estimate it'}
          </div>
        )}
        <textarea id="chatInput" ref={input} rows="2" disabled={!r} placeholder="Ask your agent, or paste a link, or pictures + size (200 x 90 x 80 cm)" value={text}
          onPaste={(e) => {
            const files = imagesIn(e.clipboardData.items);
            if (files.length) (e.preventDefault(), e.stopPropagation(), attach(files));
          }}
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
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => (attach(imagesIn(e.target.files)), (e.target.value = ''))} />
          <button type="button" className="icon-btn" id="chatAttach" disabled={!r} title="Attach pictures (or paste / drop them here)" aria-label="Attach pictures" onClick={() => file.current.click()}>
            <Icon n="attach" />
          </button>
          <button className="btn primary small" id="chatSend" disabled={!r || (!text.trim() && !pics.length)}>Send</button>
        </div>
      </form>
    </aside>
  );
}
