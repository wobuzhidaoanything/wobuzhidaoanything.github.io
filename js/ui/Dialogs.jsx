// The app's dialogs: model editor, designs, new house, version history, 2D plan export,
// quantities & costs, and connecting AI agents.
import { useEffect, useMemo, useState } from 'react';
import { useBridge, openDialog, closeDialog } from './store.js';
import { Dialog, Num } from './controls.js';
import { CATEGORY_LABELS, DEFAULT_DIMS } from '../js/models.js';
import { FINISH_NAMES } from '../js/materials.js';
import { floorQuantities, quantitiesCSV } from '../js/quantities.js';
import { planSVG, fitScale, svgToCanvas, makePDF } from '../js/planexport.js';
import { colorFromName } from '../shared/colors.js';
import { guessCategory } from '../shared/scrape.js';

const cm = (m) => (m == null ? '' : Math.round(m * 1000) / 10);

// ---------- model editor ----------

function ColorRow({ c, onChange, onRemove }) {
  return (
    <div className="color-row">
      <input type="color" value={c.hex} onChange={(e) => onChange({ ...c, hex: e.target.value, manual: true })} />
      <input type="text" placeholder="Colour name, e.g. Light beige" value={c.name}
        onChange={(e) => {
          const hex = colorFromName(e.target.value);
          onChange({ ...c, name: e.target.value, hex: hex && !c.manual ? hex : c.hex });
        }} />
      <button type="button" title="Remove" onClick={onRemove}>×</button>
    </div>
  );
}

function ItemForm({ data, close, app }) {
  const { item, isNew, note } = data;
  const def = DEFAULT_DIMS[item.category] || [0.6, 0.6, 0.6];
  const [v, setV] = useState(() => ({
    name: item.name || '', category: item.category || 'box', url: item.url || '',
    w: cm(item.dims?.w || def[0]), d: cm(item.dims?.d || def[1]), h: cm(item.dims?.h || def[2]),
    colors: (item.colors?.length ? item.colors : [{ name: '', hex: '#cccccc' }]).map((c, k) => ({ ...c, key: k, manual: !!c.name })),
    image: item.image || '', modelUrl: item.modelUrl || '', useModel: item.useModel !== false,
    accentOn: !!item.accent, accent: item.accent?.hex || '#4a3426',
  }));
  const put = (patch) => setV((o) => ({ ...o, ...patch }));
  const setCategory = (cat) => {
    const d = DEFAULT_DIMS[cat] || def;
    put(isNew ? { category: cat, w: cm(d[0]), d: cm(d[1]), h: cm(d[2]) } : { category: cat });
  };
  const submit = (e) => {
    e.preventDefault();
    app.saveItem(item, v, isNew);
    close();
  };
  return (
    <form method="dialog" id="itemForm" onSubmit={submit}>
      <h3 id="itemDialogTitle">{isNew ? 'New model' : 'Edit model'}</h3>
      {note && <div className="note" id="itemNote">{note}</div>}
      <label>Name<input name="name" required autoFocus value={v.name}
        onChange={(e) => {
          put({ name: e.target.value });
          const cat = isNew && guessCategory(e.target.value);
          if (cat && cat !== 'box' && cat !== v.category) setCategory(cat);
        }} /></label>
      <div className="grid2">
        <label>Type<select name="category" id="categorySelect" value={v.category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <label>Product link<input name="url" type="url" placeholder="https://" value={v.url} onChange={(e) => put({ url: e.target.value })} /></label>
      </div>
      <fieldset className="dims">
        <legend>Size (cm)</legend>
        {[['w', 'Width'], ['d', 'Depth'], ['h', 'Height']].map(([k, l]) => (
          <label key={k}>{l}<Num unit="cm" min={0.5} value={v[k]} onCommit={(x) => put({ [k]: x })} /></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Colours available</legend>
        <div id="colorRows" className="color-rows">
          {v.colors.map((c, i) => (
            <ColorRow key={c.key} c={c} onChange={(n) => put({ colors: v.colors.map((x, j) => (j === i ? n : x)) })} onRemove={() => put({ colors: v.colors.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <button type="button" className="btn small" id="addColorBtn" onClick={() => put({ colors: [...v.colors, { name: '', hex: '#cccccc', key: Date.now() }] })}>+ Add colour</button>
      </fieldset>
      <details>
        <summary>More: legs colour, photo, 3D model</summary>
        <div className="grid2">
          <label>Legs / frame colour<span className="inline">
            <input type="checkbox" name="accentOn" checked={v.accentOn} onChange={(e) => put({ accentOn: e.target.checked })} />
            <input type="color" name="accent" value={v.accent} onChange={(e) => put({ accent: e.target.value, accentOn: true })} />
          </span></label>
          <label>Photo URL<input name="image" type="url" value={v.image} onChange={(e) => put({ image: e.target.value })} /></label>
        </div>
        <label>3D model URL (.glb / .gltf)<input name="modelUrl" type="text" placeholder="Leave empty to use a generated model" value={v.modelUrl} onChange={(e) => put({ modelUrl: e.target.value })} /></label>
        <label className="check"><input type="checkbox" name="useModel" checked={v.useModel} onChange={(e) => put({ useModel: e.target.checked })} /> Use the 3D model when available</label>
      </details>
      <div className="actions">
        {!isNew && <button type="button" className="btn danger ghost" id="deleteItemBtn" onClick={() => app.deleteItem(item) && close()}>Delete model</button>}
        <span className="spacer"></span>
        <button type="button" className="btn" id="cancelItemBtn" onClick={close}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </form>
  );
}

// ---------- designs ----------

function Designs({ app, close }) {
  const [list, setList] = useState(null);
  const load = () => app.store.list().then(setList);
  useEffect(() => void load(), []);
  const device = app.store.kind === 'device';
  const run = (fn) => async () => (await fn(), load());
  return (
    <>
      <div className="dlg-head"><h3>Your designs</h3><span className="muted" id="storageNote">{device ? 'Saved on this computer (userdata/ folder)' : 'Saved in this browser. Run npm start to save to your computer.'}</span></div>
      <div className="design-list" id="designList">
        {!list && <p className="muted">Loading…</p>}
        {list?.map((d) => (
          <div key={d.id} className={`design-row${d.id === app.design.id ? ' on' : ''}`} data-id={d.id}>
            {device && <div className="dr-thumb"><img alt="" loading="lazy" src={`api/thumbs/${encodeURIComponent(d.id)}?v=${encodeURIComponent(d.updatedAt || '')}`} onError={(e) => e.currentTarget.remove()} /></div>}
            <div className="dr-main">
              <b>{d.name || 'Untitled'}</b>
              <span>{d.floors} floor{d.floors === 1 ? '' : 's'} · {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ''}{d.updatedBy === 'agent' ? ' · edited by agent' : ''}</span>
            </div>
            <div className="dr-actions">
              {d.id === app.design.id ? <span className="pill">Open</span> : <button className="btn small primary" data-open onClick={async () => (await app.openDesign(d.id), close())}>Open</button>}
              <button className="btn small ghost" data-dup onClick={run(() => app.duplicateDesign(d.id))}>Duplicate</button>
              <button className="btn small ghost" data-rename onClick={run(() => app.renameDesign(d.id))}>Rename</button>
              {app.store.history && <button className="btn small ghost" data-hist title="Earlier versions, saved automatically" onClick={() => app.openHistory(d.id)}>History</button>}
              <button className="btn small ghost danger" data-del disabled={list.length < 2} onClick={run(() => app.deleteDesign(d.id))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="actions">
        <button className="btn" id="importDesignBtn" onClick={() => (app.pickFile('design'), close())}>Import file…</button>
        <span className="spacer"></span>
        <button className="btn" onClick={close}>Close</button>
        <button className="btn primary" id="newDesignBtn" onClick={() => openDialog('newHouse')}>+ New house</button>
      </div>
    </>
  );
}

function NewHouse({ app, close }) {
  const [v, setV] = useState({ name: 'My house', width: 10, depth: 8, floors: 2, height: 2.7 });
  const put = (k) => (x) => setV((o) => ({ ...o, [k]: x }));
  return (
    <form method="dialog" id="newHouseForm" onSubmit={(e) => {
      e.preventDefault();
      close();
      closeDialog('designs');
      app.createHouse({ name: v.name.trim() || 'My house', width: v.width, depth: v.depth, floors: Math.round(v.floors), floorHeight: v.height });
    }}>
      <h3>New house</h3>
      <p className="muted">Start with an empty shell. Draw interior walls in Build mode, give an AI agent a floor plan, or import a DXF.</p>
      <label>Name<input name="name" required value={v.name} onChange={(e) => put('name')(e.target.value)} /></label>
      <div className="grid2">
        <label>Width (m)<Num unit="m" min={3} max={60} step={0.1} value={v.width} onCommit={put('width')} /></label>
        <label>Depth (m)<Num unit="m" min={3} max={60} step={0.1} value={v.depth} onCommit={put('depth')} /></label>
        <label>Floors<Num min={1} max={6} value={v.floors} onCommit={(x) => put('floors')(Math.round(x))} /></label>
        <label>Ceiling height (m)<Num unit="m" min={2.1} max={6} step={0.05} value={v.height} onCommit={put('height')} /></label>
      </div>
      <div className="actions"><span className="spacer"></span><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn primary">Create</button></div>
    </form>
  );
}

function History({ app, id, close }) {
  const [list, setList] = useState(null);
  useEffect(() => void app.store.history(id).catch(() => []).then(setList), [id]);
  const when = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '?');
  return (
    <>
      <div className="dlg-head"><h3>Version history</h3></div>
      <p className="muted">Earlier versions of this design, saved automatically on this computer. Restoring one keeps the current version here too.</p>
      <div id="historyList" className="history-list">
        {list == null ? <p className="muted">Loading…</p> : !list.length ? (
          <p className="muted">No earlier versions yet. Roomcraft keeps one every couple of minutes while you work, and one every time an AI agent changes the design.</p>
        ) : list.map((v) => (
          <div key={v.file} className="design-row" data-v={v.file}>
            <div><b>{when(v.savedAt)}</b><div className="muted">{v.by === 'agent' ? 'saved by your AI agent' : 'saved by you'} · {v.floors} floor{v.floors === 1 ? '' : 's'}, {v.rooms} rooms, {v.items} items</div></div>
            <span className="spacer"></span>
            <button className="btn small" data-restore onClick={async () => (await app.restoreVersion(id, v.file), close())}>Restore</button>
            <button className="btn small ghost" data-copy onClick={async () => (await app.openVersionCopy(id, v.file), close())}>Open as copy</button>
          </div>
        ))}
      </div>
      <div className="actions"><span className="spacer"></span><button className="btn" onClick={close}>Close</button></div>
    </>
  );
}

// ---------- 2D plan ----------

function Plan({ app, close }) {
  const { design } = app;
  const [o, setO] = useState({ floors: [app.viewer.activeFloor], paper: 'A4', scale: 'fit', dims: true, areas: true, furniture: true });
  const put = (patch) => setO((x) => ({ ...x, ...patch }));
  const opts = (fi) => ({ paper: o.paper, scale: o.scale === 'fit' ? fitScale(design.floors[fi], o.paper) : +o.scale, dims: o.dims, areas: o.areas, furniture: o.furniture, itemById: app.itemById, dimsOf: app.dimsOf });
  const fis = design.floors.map((_, i) => i).filter((i) => o.floors.includes(i));
  const preview = useMemo(() => (fis.length ? planSVG(design, fis[0], opts(fis[0])) : null), [JSON.stringify(o)]);
  const tight = fis.filter((fi) => !planSVG(design, fi, opts(fi)).fits);
  const pages = async () => {
    const out = [];
    for (const fi of fis) {
      const r = planSVG(design, fi, opts(fi));
      out.push({ fi, r, canvas: await svgToCanvas(r.svg, r.width, r.height, 300) });
    }
    return out;
  };
  const png = async () => {
    for (const { fi, canvas } of await pages()) app.download(`${app.fileName(design.name)} ${app.fileName(design.floors[fi].name)} plan.png`, canvas.toDataURL('image/png'));
  };
  const pdf = async () => {
    const ps = await pages();
    if (!ps.length) return;
    const list = [];
    for (const { r, canvas } of ps) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
      list.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx: canvas.width, heightPx: canvas.height, widthMm: r.width, heightMm: r.height });
    }
    app.download(`${app.fileName(design.name)} plans.pdf`, URL.createObjectURL(new Blob([makePDF(list)], { type: 'application/pdf' })));
    app.toast('Saved the plan PDF. Print at 100% (actual size) to keep the scale.');
  };
  const check = (k, label) => <label className="check small-check"><input type="checkbox" id={`plan${k[0].toUpperCase() + k.slice(1)}`} checked={o[k]} onChange={(e) => put({ [k]: e.target.checked })} /> {label}</label>;
  return (
    <>
      <div className="dlg-head"><h3>2D floor plan</h3></div>
      <div className="plan-export">
        <div className="plan-opts">
          <div className="lbl">Floors</div>
          <div id="planFloors">
            {design.floors.map((f, i) => (
              <label key={f.id} className="check small-check"><input type="checkbox" value={i} checked={o.floors.includes(i)} onChange={(e) => put({ floors: e.target.checked ? [...o.floors, i] : o.floors.filter((x) => x !== i) })} /> {f.name}</label>
            ))}
          </div>
          <label className="field-label">Paper<select id="planPaper" value={o.paper} onChange={(e) => put({ paper: e.target.value })}><option value="A4">A4 landscape</option><option value="A3">A3 landscape</option></select></label>
          <label className="field-label">Scale<select id="planScale" value={o.scale} onChange={(e) => put({ scale: e.target.value })}><option value="fit">Largest that fits</option><option value="50">1:50</option><option value="100">1:100</option><option value="200">1:200</option></select></label>
          {check('dims', 'Dimensions')}
          {check('areas', 'Room areas')}
          {check('furniture', 'Furniture')}
          <p className="hint" id="planNote">
            {!fis.length ? '' : tight.length
              ? `At this scale ${tight.map((fi) => design.floors[fi].name).join(', ')} won't fit on ${o.paper}. Choose a larger paper or scale, or "Largest that fits".`
              : `Print at 100% ("actual size") to keep the scale 1:${preview?.scale}.`}
          </p>
        </div>
        <div className="plan-preview" id="planPreview">
          {preview ? <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: preview.svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} /> : <p className="muted">Pick at least one floor.</p>}
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" id="planPdf" disabled={!fis.length} onClick={pdf}>Download PDF</button>
        <button className="btn" id="planPng" disabled={!fis.length} onClick={png}>Download PNG</button>
        <span className="spacer"></span>
        <button className="btn" onClick={close}>Close</button>
      </div>
    </>
  );
}

// ---------- quantities ----------

function Quantities({ app, close }) {
  const { design } = app;
  const m2 = (v) => `${v.toFixed(1)} m²`;
  const Fin = ({ f }) => <><span className="sw" style={{ background: f.color }}></span>{FINISH_NAMES[f.kind] || f.kind}</>;
  const c = app.furnitureCost();
  const budget = app.pref.get('budget', 0);
  const cur = app.pref.get('currency', 'SGD');
  return (
    <>
      <div className="dlg-head"><h3>Quantities &amp; costs</h3></div>
      <p className="muted">How much floor, paint and skirting each room needs (doors and windows taken off, flooring with 10% extra for cuts), and the furniture in it.</p>
      <div id="qtyBody" className="qty-body">
        {(c.main > 0 || c.other.length > 0) && (
          <div className="qty-total">Furniture for the whole house: <b>{app.money(c.main, c.cur)}</b>{c.other.map(([k, v]) => ` + ${app.money(v, k)}`).join('')}{budget ? ` · budget ${app.money(budget, c.cur)}` : ''}</div>
        )}
        {design.floors.map((f) => {
          const q = floorQuantities(f, { itemById: app.itemById, wallColor: design.wallColor });
          const cost = Object.entries(q.totals.cost).map(([k, v]) => `${k || cur} ${v.toFixed(2)}`).join(' + ');
          return (
            <div key={f.id}>
              <h4>{f.name} <em>{m2(q.totals.floorArea)} of rooms · {m2(q.totals.wallArea)} of walls · {q.totals.skirting.toFixed(1)} m skirting{cost ? ` · furniture ${cost}` : ''}</em></h4>
              <table className="qty">
                <thead><tr><th>Room</th><th>Floor</th><th>Flooring to order</th><th>Walls</th><th>Ceiling</th><th>Skirting</th><th>Furniture</th></tr></thead>
                <tbody>
                  {q.rooms.map((r, i) => (
                    <tr key={i}>
                      <td><b>{r.name}</b></td>
                      <td>{m2(r.floorArea)}</td>
                      <td><Fin f={{ kind: r.flooring.kind, color: r.flooring.color || '#c49a6c' }} /> {m2(r.flooring.order)}</td>
                      <td>{r.walls.map((w, j) => <div key={j}><Fin f={w.finish} /> {m2(w.area)}</div>)}</td>
                      <td>{m2(r.ceilingArea)}</td>
                      <td>{r.skirting.toFixed(1)} m</td>
                      <td>{r.items.length ? r.items.map(({ item }, j) => <div key={j}>{item.name}{item.price ? <em> {item.currency || cur} {item.price}</em> : null}</div>) : <em>none</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {q.finishes.length > 0 && (
                <p className="qty-sum">Wall coverings on this floor: {q.finishes.map((w, j) => <span key={j}>{j > 0 && ' · '}<Fin f={w.finish} /> {w.finish.color} <b>{m2(w.area)}</b></span>)}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="actions">
        <button className="btn" id="qtyCsv" onClick={() => app.download(`${app.fileName(design.name)} quantities.csv`, URL.createObjectURL(new Blob(['﻿' + quantitiesCSV(design, { itemById: app.itemById })], { type: 'text/csv' })))}>Download .csv (Excel)</button>
        <span className="spacer"></span>
        <button className="btn" onClick={close}>Close</button>
      </div>
    </>
  );
}

// ---------- AI agents ----------

function Agents({ app, close }) {
  const [data, setData] = useState(null);
  const [pick, setPick] = useState(null);
  const [copied, setCopied] = useState('');
  const load = () => fetch('api/agents').then((r) => r.json()).then(setData).catch(() => setData({ harnesses: [] }));
  useEffect(() => void load(), []);
  if (!data) return <p className="muted">Loading…</p>;
  const connected = data.harnesses.filter((h) => h.connection || h.configured);
  const h = pick && data.harnesses.find((x) => x.id === pick);
  const prompt = h ? h.prompt : data.genericPrompt;
  const post = async (url, id) => {
    const r = await (await fetch(url, { method: 'POST', body: JSON.stringify({ id }) })).json();
    app.toast(r.message || r.error);
    app.refreshAgentsDot();
    load();
  };
  return (
    <>
      <div className="dlg-head"><h3 id="agentsTitle">{connected.length ? 'AI agents' : 'Connect your AI agent'}</h3></div>
      <p className="muted" id="agentsIntro">Your agent can read product links, create furniture models (and check them with its own eyes), trace floor plans into the house and export it. Pick the agent you use; it sets itself up from a prompt.</p>
      <div id="agentsConnected">
        {connected.length > 0 && (
          <>
            <div className="lbl">Set up</div>
            {connected.map((c) => (
              <div key={c.id} className="agent-row">
                <div><b>{c.name}</b><span>{c.connection ? `Connected · last used ${new Date(c.connection.lastSeen).toLocaleString()}` : 'Configured, waiting for its first connection. Restart the agent and ask it to list the roomcraft tools.'}</span></div>
                <button className="btn small danger ghost" data-remove={c.id} onClick={() => post('api/agents/remove', c.id)}>Remove</button>
              </div>
            ))}
            <div className="lbl" style={{ marginTop: 14 }}>Set up another agent</div>
          </>
        )}
      </div>
      <div className="agent-grid" id="agentGrid">
        {data.harnesses.filter((x) => !x.other).map((x) => (
          <button key={x.id} className={`agent-card${x.connection || x.configured ? ' done' : ''}${pick === x.id ? ' on' : ''}`} data-agent={x.id} onClick={() => (setPick(x.id), setCopied(''))}>
            <b>{x.name}</b><span>{x.connection ? 'Connected' : x.configured ? 'Configured' : 'Set up'}</span>
          </button>
        ))}
        <button className={`agent-card${pick === 'other' ? ' on' : ''}`} data-agent="other" onClick={() => (setPick('other'), setCopied(''))}><b>Other agent</b><span>Any MCP client</span></button>
      </div>
      {pick && (
        <div id="agentSetup">
          <div className="setup-steps">
            <div className="step"><span>1</span><div>{h?.noShell ? `${h.name} can't run setup commands itself, so Roomcraft can add itself to its config for you.` : `Copy this prompt and paste it into ${h?.name || 'your agent'}. It installs the Roomcraft server into its own settings.`}</div></div>
            {!h?.noShell && (
              <div className="prompt-box">
                <pre>{prompt}</pre>
                <button className="btn small primary" id="copyPrompt" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied('Copied ✓');
                  } catch {
                    setCopied('Select the text and press Ctrl+C');
                  }
                }}>{copied || 'Copy prompt'}</button>
              </div>
            )}
            {h?.canAutoSetup && (
              <div className="step"><span>{h.noShell ? '2' : 'or'}</span><div><button className={`btn small${h.noShell ? ' primary' : ''}`} id="autoSetup" onClick={() => post('api/agents/setup', h.id)}>Add it to {h.name} automatically</button> <em className="muted">{h.configPath}</em></div></div>
            )}
            <div className="step"><span>{h?.noShell ? '3' : '2'}</span><div>Approve what the agent asks for and restart it if it says so. It shows as connected here the first time it uses Roomcraft.</div></div>
          </div>
        </div>
      )}
      <div className="actions">
        <label className="check small-check"><input type="checkbox" id="agentsDontAsk" defaultChecked={app.pref.get('agentsDontAsk', false)} onChange={(e) => app.pref.set('agentsDontAsk', e.target.checked)} /> Don't show at start</label>
        <span className="spacer"></span>
        <button className="btn" onClick={close}>Done</button>
      </div>
    </>
  );
}

export default function Dialogs() {
  const [, app] = useBridge();
  if (!app?.design) return null;
  return (
    <>
      <Dialog name="item">{(data, close) => <ItemForm key={data.item.id} data={data} close={close} app={app} />}</Dialog>
      <Dialog name="designs" className="wide">{(_, close) => <Designs app={app} close={close} />}</Dialog>
      <Dialog name="newHouse">{(_, close) => <NewHouse app={app} close={close} />}</Dialog>
      <Dialog name="history">{(id, close) => <History app={app} id={id} close={close} />}</Dialog>
      <Dialog name="plan" className="wide" label="2D floor plan">{(_, close) => <Plan app={app} close={close} />}</Dialog>
      <Dialog name="qty" className="wide">{(_, close) => <Quantities app={app} close={close} />}</Dialog>
      <Dialog name="agents" className="wide">{(_, close) => <Agents app={app} close={close} />}</Dialog>
    </>
  );
}
