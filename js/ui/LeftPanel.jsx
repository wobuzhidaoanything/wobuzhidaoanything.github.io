// Left panel: add furniture from links and browse your models; in Edit house it becomes the
// Build panel with the drawing tools and floors.
import { useState } from 'react';
import { useTopic, openDialog } from './store.js';
import { CATEGORY_LABELS } from '../js/models.js';

const ICONS = {
  default: <><rect x="5" y="11" width="22" height="12" rx="3" /><path d="M8 23v3M24 23v3" /></>,
  sofa: <><rect x="4" y="13" width="24" height="9" rx="3" /><rect x="7" y="8" width="18" height="7" rx="2" /><path d="M7 22v3M25 22v3" /></>,
  bed: <><rect x="4" y="15" width="24" height="7" rx="2" /><path d="M5 22v3M27 22v3M5 15V8M9 13h6" /></>,
  plant: <><path d="M11 20h10l-1.5 7h-7z" /><path d="M16 20c0-6-5-9-8-9 0 5 4 8 8 9zM16 20c0-7 4-11 8-11 0 6-4 10-8 11z" /></>,
  lamp: <><path d="M11 5h10l3 8H8z" /><path d="M16 13v14M11 27h10" /></>,
  rug: <><rect x="5" y="9" width="22" height="14" rx="1" /><rect x="9" y="12" width="14" height="8" /></>,
};
const iconFor = (cat) => <svg viewBox="0 0 32 32">{ICONS[cat] || ICONS[{ armchair: 'sofa', floorlamp: 'lamp' }[cat]] || ICONS.default}</svg>;

function LinkBox({ app }) {
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const go = (t = text) => {
    const urls = app.extractUrls(t);
    setText('');
    app.importUrls(urls);
  };
  const ready = app.chat?.ready;
  return (
    <section className="import" id="linkBox">
      <h2>Add furniture from a link</h2>
      <div className={`dropzone${over ? ' over' : ''}`} onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
        <textarea id="linkInput" rows="2" value={text} placeholder="Paste or drop product links (IKEA, Amazon, Wayfair, Shopify stores…)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), go())}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (app.extractUrls(t).length) (e.preventDefault(), go(`${text} ${t}`));
          }} />
        <div className="dz-row"><span className="hint">Drop links anywhere</span><button className="btn primary small" id="importBtn" onClick={() => go()}>Import</button></div>
        {ready && (
          <label className="check small-check auto-model" id="autoModelRow">
            <input type="checkbox" id="autoModel" checked={app.pref.get('autoModel', true)} onChange={(e) => app.setSetting('autoModel', e.target.checked)} />
            <span>Let <b>{ready.name}</b> model each link from its photos</span>
          </label>
        )}
      </div>
      <Queue app={app} />
    </section>
  );
}

function Queue({ app }) {
  const { ui } = app;
  const act = ([label, kind, arg], i) => (
    <span key={i}>
      {' · '}
      <a onClick={() => app.queueAction(kind, arg)}>{label}</a>
    </span>
  );
  const finished = ui.queue.filter((q) => q.status !== 'pending' && q.status !== 'busy').length;
  return (
    <>
    {finished > 1 && <button className="btn small ghost queue-clear" onClick={() => app.dismissQueue('finished')}>Clear finished</button>}
    <ul className="queue" id="queue">
      {ui.queue.slice(-6).reverse().map((q) => (
        <li key={q.id} className={q.status === 'error' ? 'err' : q.status === 'warn' ? 'warn' : ''} data-q={q.id}>
          <span className="st">{q.status === 'pending' || q.status === 'busy' ? <span className="spin"></span> : q.status === 'error' ? '✕' : q.status === 'warn' ? '!' : '✓'}</span>
          <div className="body">
            <div className="t" title={q.url}>{q.title || q.url}</div>
            <div className="m">{q.message || 'Reading page…'}{(q.actions || []).map(act)}</div>
          </div>
          {q.status !== 'pending' && <button className="x" data-dismiss title="Dismiss" onClick={() => app.dismissQueue(q.id)}>×</button>}
        </li>
      ))}
    </ul>
    </>
  );
}

function Library({ app }) {
  const { library, ui } = app;
  const [q, setQ] = useState('');
  const [dragging, setDragging] = useState(null);
  const filter = ui.invFilter || 'all';
  const cats = [...new Set(library.items.map((i) => i.category))].sort((a, b) => (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b));
  const chips = [['all', 'All'], ['fav', '★ Favourites'], ['placed', 'In this house'], ...cats.map((c) => [c, CATEGORY_LABELS[c] || c])];
  const f = chips.some(([k]) => k === filter) ? filter : 'all';
  const s = q.trim().toLowerCase();
  const list = library.items
    .filter((i) => !s || i.name.toLowerCase().includes(s) || (CATEGORY_LABELS[i.category] || '').toLowerCase().includes(s))
    .filter((i) => f === 'all' || (f === 'fav' ? i.favorite : f === 'placed' ? app.placedCount(i.id) : i.category === f))
    // Just modelled by your agent first, then favourites
    .sort((a, b) => (ui.ready?.has(b.id) ? 1 : 0) - (ui.ready?.has(a.id) ? 1 : 0) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  const cur = app.pref.get('currency', 'SGD');
  return (
    <section className="inv">
      <div className="inv-head">
        <h2>Models <span className="count" id="invCount">{library.items.length}</span></h2>
        <button className="btn small" id="newItemBtn" title="Make a model of any size, e.g. a built-in cupboard" onClick={() => app.newItem()}>+ Custom</button>
      </div>
      <input className="search" id="invSearch" type="search" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} />
      {library.items.length > 3 && (
        <div className="chips" id="invFilters">
          {chips.map(([k, n]) => <button key={k} className={`chip${k === f ? ' on' : ''}`} data-filter={k} onClick={() => ((ui.invFilter = k), app.bump('main'))}>{n}</button>)}
        </div>
      )}
      <div className="cards" id="inventory">
        {!library.items.length ? (
          <div className="empty">No models yet.<br />Paste a product link above or add a custom model.</div>
        ) : !list.length ? (
          <div className="empty">{f === 'fav' && !s ? 'No favourites yet. Click ☆ on a model to keep it at the top.' : 'No matches.'}</div>
        ) : (
          list.map((i) => {
            const d = app.dimsOf(i);
            const n = app.placedCount(i.id);
            const pick = ui.pickedColor[i.id] || i.colors?.[0]?.name;
            const ready = ui.ready?.has(i.id);
            return (
              <div key={i.id} className={`card${ready ? ' ready' : ''}${dragging === i.id ? ' dragging' : ''}`} draggable="true" data-id={i.id} title="Drag into the room, or click Add"
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-roomcraft-item', i.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  setDragging(i.id);
                }}
                onDragEnd={() => setDragging(null)}>
                <div className="thumb" style={i.image ? { backgroundImage: `url("${i.image}")` } : undefined}>{i.image ? null : iconFor(i.category)}</div>
                <div>
                  <div className="nm">{i.name}</div>
                  {ready ? <div className="badge-ready" title="Your AI agent finished this model">✓ Ready to place</div> : i.verified === false ? (
                    app.chat?.ready
                      ? <button className="badge-unverified" title="Not yet checked against its photos. Click to ask your agent to check and fix it" onClick={() => app.checkWithAgent(i)}>Unverified · check</button>
                      : <div className="badge-unverified" title="Added by an AI agent and not yet checked against a render">Unverified</div>
                  ) : null}
                  <div className={`sz${i.needsDims ? ' missing' : ''}`}>
                    {i.needsDims ? '⚠ Check size · ' : ''}{app.cm(d.w)} × {app.cm(d.d)} × {app.cm(d.h)} cm{n ? ` · ${n} placed` : ''}{i.price ? ` · ${i.currency || cur} ${i.price}` : ''}
                  </div>
                  <div className="swatches">
                    {(i.colors || []).slice(0, 10).map((c) => (
                      <button key={c.name} className={`sw${c.name === pick ? ' on' : ''}`} data-color={c.name} title={c.name} style={{ background: c.hex }} onClick={() => app.pickColor(i.id, c.name)}></button>
                    ))}
                    {i.colors?.length > 10 && <span className="hint">+{i.colors.length - 10}</span>}
                  </div>
                </div>
                <div className="card-actions">
                  <button className="btn small primary" data-act="add" title="Put it in the room" onClick={() => (ui.ready?.delete(i.id), app.addToRoom(i.id))}>Add</button>
                  <button className="btn small ghost" data-act="edit" title="Size, colours and 3D model" onClick={() => app.openItemDialog(i)}>Edit</button>
                  <button className={`fav${i.favorite ? ' on' : ''}`} data-act="fav" title={i.favorite ? 'Remove from favourites' : 'Favourite: keep it at the top'} aria-label="Favourite"
                    onClick={() => (i.favorite ? delete i.favorite : (i.favorite = true), app.commit({ lib: true, rebuild: false }))}>
                    {i.favorite ? '★' : '☆'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const TOOLS = [
  ['select', 'Select', 'V', <path d="M5 3l14 8-6 2-2 6z" />],
  ['wall', 'Wall', 'W', <path d="M3 17h18M3 17V7h18v10M8 7v10M14 7v10" />],
  ['door', 'Door', 'D', <><path d="M6 21V4h10v17M4 21h16" /><circle cx="13" cy="13" r="1" /></>],
  ['window', 'Window', 'N', <><rect x="4" y="5" width="16" height="14" /><path d="M12 5v14M4 12h16" /></>],
  ['opening', 'Opening', 'O', <path d="M5 21V8a7 7 0 0 1 14 0v13" />],
  ['stairs', 'Stairs', 'S', <path d="M4 20h4v-4h4v-4h4V8h4" />],
];

function BuildPanel({ app }) {
  const { design, ui, viewer } = app;
  const t = ui.tool || 'select';
  const fi = viewer.activeFloor;
  return (
    <div id="buildPanel">
      <section>
        <h2>Build · {app.floorNow().name}</h2>
        <div className="tool-grid">
          {TOOLS.map(([k, name, key, svg]) => (
            <button key={k} className={`tool${t === k ? ' on' : ''}`} data-tool={k} title={`${name} (${key})`} onClick={() => app.setTool(k === 'select' ? null : k)}>
              <svg viewBox="0 0 24 24">{svg}</svg>{name}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>Rooms follow the walls automatically. Drag a corner or a wall to reshape; double-click a wall to add a corner.</p>
      </section>
      <section>
        <h2>Floors</h2>
        <div className="floor-list">
          {design.floors.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => (
            <button key={f.id} className={`floor-row${i === fi ? ' on' : ''}`} data-f={i} onClick={() => app.setFloor(i)}>
              <span className="badge">{i === 0 ? 'G' : i}</span><span>{f.name}</span><em>{f.rooms.length} rooms</em>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" id="addFloor" onClick={() => app.addFloorAbove()}>+ Floor above</button>
          <button className="btn small danger ghost" id="delFloor" disabled={design.floors.length < 2} onClick={() => app.deleteFloor()}>Delete floor</button>
        </div>
      </section>
      <section>
        <h2>Start over</h2>
        <div className="row">
          <button className="btn small" id="newHouse2" onClick={() => openDialog('newHouse')}>New house…</button>
          <button className="btn small" id="dxf2" onClick={() => app.pickFile('dxf')}>Import DXF…</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Have a floor plan image? Give it to your AI agent (see <b>Agents</b>) and it will trace it into this house.</p>
      </section>
    </div>
  );
}

export default function LeftPanel() {
  const app = useTopic('main');
  useTopic('chat');
  if (!app?.design) return null;
  if (app.ui.editing) return <BuildPanel app={app} />;
  return (
    <div id="furniturePanel">
      <LinkBox app={app} />
      <Library app={app} />
    </div>
  );
}
