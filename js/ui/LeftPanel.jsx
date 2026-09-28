// Left panel: add furniture from links and browse your models; in Build mode it becomes the
// Build panel with the drawing tools and floors.
import { useState } from 'react';
import { useTopic, openDialog } from './store.js';
import { CATEGORY_LABELS } from '../js/models.js';
import { Icon, categoryIcon } from './controls.js';

const iconFor = (cat) => <Icon n={categoryIcon(cat)} />;

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
      <h2><Icon n="link" />Add from a shop</h2>
      <div className={`dropzone${over ? ' over' : ''}`} onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
        <textarea id="linkInput" rows="2" value={text} placeholder="Paste a product link (IKEA, Amazon, Wayfair, any shop)…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), go())}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (app.extractUrls(t).length) (e.preventDefault(), go(`${text} ${t}`));
          }} />
        <div className="dz-row"><span className="hint">or drop links anywhere</span><button className="btn primary small" id="importBtn" disabled={!text.trim()} onClick={() => go()}>Add</button></div>
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
        <h2><Icon n="sofa" />Your furniture <span className="count" id="invCount">{library.items.length}</span></h2>
        <button className="btn small ghost" id="newItemBtn" title="Make a model of any size, e.g. a built-in cupboard" onClick={() => app.newItem()}><Icon n="plus" />Custom</button>
      </div>
      <div className="search-wrap"><Icon n="search" /><input className="search" id="invSearch" type="search" placeholder="Search your furniture" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
                <div className="thumb" style={i.image ? { backgroundImage: `url("${i.image}")` } : undefined}>
                  {i.image ? null : iconFor(i.category)}
                  <button className={`fav${i.favorite ? ' on' : ''}`} data-act="fav" title={i.favorite ? 'Remove from favourites' : 'Favourite: keep it at the top'} aria-label="Favourite"
                    onClick={() => (i.favorite ? delete i.favorite : (i.favorite = true), app.commit({ lib: true, rebuild: false }))}>
                    {i.favorite ? '★' : '☆'}
                  </button>
                </div>
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
                  <button className="add-btn" data-act="add" title="Add to the room (or drag the card into the view)" aria-label={`Add ${i.name} to the room`} onClick={() => (ui.ready?.delete(i.id), app.addToRoom(i.id))}><Icon n="plus" /></button>
                  <button className="icon-btn small" data-act="edit" title="Edit size, colours and 3D model" aria-label="Edit" onClick={() => app.openItemDialog(i)}><Icon n="pencil" /></button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function BuildPanel({ app }) {
  const { design, ui, viewer } = app;
  const t = ui.tool || 'select';
  const fi = viewer.activeFloor;
  return (
    <div id="buildPanel">
      <section>
        <h2><Icon n="build" />Building {app.floorNow().name}</h2>
        <ol className="how">
          <li>Pick a tool on the left of the view: <b>Wall</b>, <b>Door</b>, <b>Window</b>, <b>Stairs</b>…</li>
          <li>Click in the view to place it. Rooms appear by themselves when walls close a space.</li>
          <li>Drag corners and walls to reshape; double-click a wall to add a corner.</li>
        </ol>
        <p className="hint">Current tool: <b>{{ wall: 'Wall', door: 'Door', window: 'Window', opening: 'Opening', stairs: 'Stairs', measure: 'Measure', paint: 'Paint' }[t] || 'Select'}</b> · <kbd>Esc</kbd> goes back to Select</p>
      </section>
      <section>
        <h2><Icon n="floors" />Floors</h2>
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
        <h2><Icon n="plus" />Start over</h2>
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
