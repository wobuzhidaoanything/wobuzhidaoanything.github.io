// Right panel (the Inspector): details and settings for whatever is selected, or the current
// floor when nothing is.
import { useTopic } from './store.js';
import { Field, Num, Color, Seg } from './controls.js';
import { CATEGORY_LABELS } from '../js/models.js';
import { FINISHES, FINISH_NAMES } from '../js/materials.js';
import { paintSpan } from '../js/house.js';
import { elevations, wallFrame, stairLayout, area, pointInPolygon } from '../js/design.js';
import { footprint } from '../js/plan.js';
import { splitWall, makeRecess, moveCorner, moveOpening, openingGaps } from '../js/edit.js';

export const ROOM_NAMES = ['Living room', 'Kitchen', 'Dining room', 'Kitchen & dining', 'Bedroom', 'Master bedroom', 'Kids’ room', 'Guest room', 'Bathroom', 'En-suite', 'Toilet', 'Study', 'Home office', 'Family room', 'Hall', 'Entrance', 'Corridor', 'Laundry', 'Utility', 'Storage', 'Walk-in wardrobe', 'Balcony', 'Garage', 'Yard', 'Helper’s room', 'Prayer room'];
const ROOM_QUICK = ['Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Study', 'Dining room'];

const Group = ({ label, right, children, className = '' }) => (
  <div className={`group ${className}`}>
    {label != null && <div className="lbl">{label}{right != null && <span>{right}</span>}</div>}
    {children}
  </div>
);
const Tip = ({ children }) => <div className="tip">{children}</div>;
const EditTip = ({ what }) => <Tip>Switch to <b>Build</b> (E) to change {what}.</Tip>;
const Check = ({ checked, onChange, children, title, id }) => (
  <label className="row" style={{ gap: 8, marginTop: 8, cursor: 'pointer' }} title={title}>
    <input type="checkbox" id={id} checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {children}
  </label>
);
const rot = (v) => ((v % 360) + 360) % 360;

function Walk({ app }) {
  return (
    <div className="insp">
      <h3>Walking</h3>
      <div className="sub">You're on {app.floorNow().name}</div>
      <Tip>Click the view to look around with your mouse. <b>W A S D</b> or the arrow keys to walk, <b>Shift</b> to hurry, scroll to step. Walk onto the stairs to change floors. <b>Esc</b> releases the mouse; press it again to leave.</Tip>
      <div className="group" style={{ marginTop: 14 }}><button className="btn" style={{ width: '100%' }} id="leaveWalk" onClick={() => app.setView('3d')}>Back to 3D view</button></div>
    </div>
  );
}

function Item({ app, id }) {
  const { design, cm } = app;
  const { p, floor } = app.findPlaced(id);
  const item = p && app.itemById(p.itemId);
  if (!item) return null;
  const d = app.dimsOf(item);
  const cur = app.colorOf(item, p);
  const custom = p.color?.startsWith?.('#');
  const save = () => app.commit({ rebuild: false });
  const setPos = (k) => (v) => ((p[k] = k === 'y' ? Math.max(0, v / 100) : v / 100), save());
  return (
    <div className="insp">
      {item.image && <div className="hero" style={{ backgroundImage: `url("${item.image}")` }}></div>}
      <h3>{item.name}</h3>
      <div className="sub">
        {CATEGORY_LABELS[item.category] || item.category} · {floor.name}
        {item.price ? ` · ${item.currency || app.pref.get('currency', 'SGD')} ${item.price}` : ''}
        {item.url && <> · <a href={item.url} target="_blank" rel="noopener">Product ↗</a></>}
      </div>
      {item.verified === false && <div className="note">Added by an AI agent and not yet visually checked.</div>}
      {app.clearanceProblems().filter((x) => x.placedId === p.id).map((x, i) => <div key={i} className="note warn">⚠ {x.message}.</div>)}
      <Group label="Colour" right={cur?.name || ''}>
        <div className="color-list">
          {(item.colors || []).map((c) => (
            <button key={c.name} className={`color-chip${!custom && c.name === cur?.name ? ' on' : ''}`} data-color={c.name} onClick={() => ((p.color = c.name), save())}>
              <span className="dot" style={{ background: c.hex }}></span>{c.name}
            </button>
          ))}
          <label className={`color-chip${custom ? ' on' : ''}`} title="Any colour">
            <Color id="customColor" value={custom ? p.color : cur?.hex || '#cccccc'} onLive={(v) => ((p.color = v), app.viewer.syncFurniture())} onCommit={(v) => ((p.color = v), save())} />Custom
          </label>
        </div>
      </Group>
      <Group label={<>Size <button className="btn small ghost" id="editSize" onClick={() => app.openItemDialog(item)}>Edit model</button></>}>
        <div>{cm(d.w)} W × {cm(d.d)} D × {cm(d.h)} H cm</div>
      </Group>
      <Group label="Rotate" right={`${Math.round(p.rot || 0)}°`}>
        <div className="row">
          {[[-90, '↺ 90°'], [-15, '↺ 15°'], [15, '↻ 15°'], [90, '↻ 90°']].map(([v, t]) => <button key={v} className="btn small" data-rot={v} onClick={() => app.rotateItem(p, v)}>{t}</button>)}
        </div>
      </Group>
      <Group label="Position (cm)">
        <div className="num-row">
          <Field label="X" unit="cm" value={cm(p.x)} onCommit={setPos('x')} />
          <Field label="Z" unit="cm" value={cm(p.z)} onCommit={setPos('z')} />
          <Field label="Lift" unit="cm" min={0} value={cm(p.y || 0)} onCommit={setPos('y')} />
        </div>
      </Group>
      {design.floors.length > 1 && (
        <Group label="Floor">
          <select id="moveFloor" value={floor.id} onChange={(e) => app.moveToFloor(p, floor, e.target.value)}>
            {design.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Group>
      )}
      {item.modelUrl && <Group><Check id="useModel" checked={item.useModel !== false} onChange={(v) => ((item.useModel = v), app.commit({ lib: true, rebuild: false }))}>Use the store's 3D model</Check></Group>}
      <Group>
        <div className="row">
          <button className="btn small" id="wallBtn" onClick={() => (app.againstWall(p, floor), save())}>Against wall</button>
          <button className="btn small" id="dupBtn" title="Ctrl+D" onClick={() => app.duplicate(id)}>Duplicate</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className={`btn small${p.locked ? ' on' : ''}`} id="lockBtn" title="A locked item can't be moved, turned or deleted by accident (L)" onClick={() => app.toggleLock()}>{p.locked ? '🔒 Locked' : 'Lock'}</button>
          <button className="btn small danger" id="removeBtn" title="Delete" onClick={() => app.deleteSelection()}>Remove</button>
        </div>
      </Group>
    </div>
  );
}

function Multi({ app }) {
  const ps = app.selectedPlaced();
  const locked = ps.filter((p) => p.locked).length;
  const B = ({ k, label, tip, dis }) => <button className="btn small icon-txt" data-align={k} title={tip} disabled={dis} onClick={() => app.alignItems(k)}>{label}</button>;
  const names = ps.map((p) => app.itemById(p.itemId)?.name).filter(Boolean);
  return (
    <div className="insp">
      <h3>{ps.length} items</h3>
      <div className="sub">{names.slice(0, 4).join(', ')}{ps.length > 4 ? '…' : ''}{locked ? ` · ${locked} locked` : ''}</div>
      <Group label="Align">
        <div className="row"><B k="left" label="⇤ Left" tip="Line up their left edges" /><B k="cx" label="↔ Centre" tip="Line up their centres (left–right)" /><B k="right" label="Right ⇥" tip="Line up their right edges" /></div>
        <div className="row" style={{ marginTop: 6 }}><B k="top" label="⤒ Back" tip="Line up their back edges (top of the plan)" /><B k="cz" label="↕ Middle" tip="Line up their centres (front–back)" /><B k="bottom" label="Front ⤓" tip="Line up their front edges (bottom of the plan)" /></div>
      </Group>
      <Group label="Distribute">
        <div className="row"><B k="dx" label="↔ Evenly across" tip="Equal gaps from left to right" dis={ps.length < 3} /><B k="dz" label="↕ Evenly down" tip="Equal gaps from back to front" dis={ps.length < 3} /></div>
      </Group>
      <Group>
        <div className="row">
          <button className="btn small" id="mRot" onClick={() => app.rotateGroup(90)}>↻ Rotate 90°</button>
          <button className="btn small" id="mDup" title="Ctrl+D" onClick={() => (app.copyItems(), app.pasteItems({ offset: true }))}>Duplicate</button>
          <button className="btn small" id="mCopy" title="Ctrl+C" onClick={() => app.copyItems()}>Copy</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small" id="mLock" onClick={() => app.toggleLock()}>{locked === ps.length ? 'Unlock all' : 'Lock all'}</button>
          <button className="btn small danger" id="mDel" onClick={() => app.deleteSelection()}>Remove</button>
        </div>
      </Group>
      <Tip>Shift-click adds or removes items. Shift-drag on the floor draws a selection box. Drag any selected item to move them together.</Tip>
    </div>
  );
}

function Recess({ app, f, w, len }) {
  const rw = Math.min(2, Math.max(0.5, +(len / 3).toFixed(2)));
  const v = app.ui.recess?.wall === w.id ? app.ui.recess : { wall: w.id, start: (len - rw) / 2, width: rw, depth: 0.6 };
  const put = (k) => (x) => ((app.ui.recess = { ...v, [k]: x / 100 }), app.bump('inspector'));
  const make = (sign) => {
    const { start, width, depth } = v;
    if (!(start >= 0 && width >= 0.2 && depth >= 0.05)) return app.toast('Enter a start, width (20 cm or more) and depth.');
    if (start + width > len + 1e-6) return app.toast(`That runs past the end of the wall (${app.cm(len)} cm).`);
    const cut = f.openings.find((o) => o.wall === w.id && o.offset < start + width && o.offset + o.width > start && (o.offset < start || o.offset + o.width > start + width));
    if (cut) return app.toast(`A ${cut.type} crosses the edge of that ${sign > 0 ? 'recess' : 'bay'}. Move it or change the numbers.`);
    const mid = makeRecess(f, w.id, { start, width, depth: sign * depth });
    app.ui.recess = null;
    app.tidy(f);
    app.commit();
    app.viewer.select({ type: 'wall', id: mid });
    app.toast(sign > 0 ? 'Recess made. Drag the back wall to change its depth.' : 'Bay made. Drag the front wall to change its depth.', { undo: true });
  };
  return (
    <Group label="Recess or bay">
      <div className="num-row">
        <Field label="From start" unit="cm" id="rStart" min={0} step={5} value={app.cm(v.start)} onCommit={put('start')} />
        <Field label="Width" unit="cm" id="rWidth" min={20} step={5} value={app.cm(v.width)} onCommit={put('width')} />
        <Field label="Depth" unit="cm" id="rDepth" min={5} step={5} value={app.cm(v.depth)} onCommit={put('depth')} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" id="rIn" title="Push part of the wall into the building" onClick={() => make(1)}>Make recess</button>
        <button className="btn small" id="rOut" title="Push part of the wall outward" onClick={() => make(-1)}>Make bay</button>
      </div>
    </Group>
  );
}

function Wall({ app, id }) {
  const { design, cm, ui, viewer } = app;
  const f = app.floorNow();
  const w = f.walls.find((x) => x.id === id);
  if (!w) return null;
  const { len, dir } = wallFrame(w);
  const ops = f.openings.filter((o) => o.wall === id).sort((a, b) => a.offset - b.offset);
  const edit = ui.editing;
  const setLen = (v) => {
    const L = v / 100;
    if (!(L >= 0.1)) return app.bump('inspector');
    moveCorner(f, w.b.slice(), [+(w.a[0] + dir[0] * L).toFixed(4), +(w.a[1] + dir[1] * L).toFixed(4)]);
    app.tidy(f);
    app.commit();
  };
  return (
    <div className="insp">
      <h3>Wall</h3>
      <div className="sub">{f.name} · {w.exterior ? 'exterior' : 'interior'} · {cm(len)} cm</div>
      {edit && (
        <>
          <Group>
            <div className="num-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Length (cm)" unit="cm" id="wLen" min={10} value={cm(len)} onCommit={setLen} />
              <Field label="Thickness (cm)" unit="cm" id="wThick" min={5} max={60} value={cm(w.thickness)} onCommit={(v) => ((w.thickness = v / 100), app.tidy(f), app.commit())} />
            </div>
            <Check id="wExt" checked={w.exterior} onChange={(v) => ((w.exterior = v), app.commit())}>Exterior wall</Check>
            <Check id="wLock" checked={w.locked} title="A locked wall can't be dragged, pushed or deleted by accident" onChange={(v) => (v ? (w.locked = true) : delete w.locked, app.commit({ rebuild: false }))}>Locked</Check>
          </Group>
          <Group label="Add to this wall">
            <div className="row">
              {['door', 'window', 'opening'].map((t) => <button key={t} className="btn small" data-add={t} onClick={() => app.addOpening(w, t)}>+ {t[0].toUpperCase() + t.slice(1)}</button>)}
            </div>
          </Group>
          <Recess app={app} f={f} w={w} len={len} />
        </>
      )}
      <Group label="Finish">
        {['l', 'r'].map((sd) => {
          const list = [].concat(w.finishes?.[sd] || []);
          const names = [...new Set(list.map((x) => FINISH_NAMES[x.kind] || x.kind))].join(' + ');
          return (
            <div key={sd} className="finish-row">
              {list.length ? list.slice(0, 4).map((x, i) => <span key={i} className="sw" style={{ background: x.color }}></span>) : <span className="sw" style={{ background: design.wallColor || '#efebe4' }}></span>}
              <span>{sd === 'l' ? 'Side A' : 'Side B'}: {list.length ? names : 'house colour'}</span>
              {list.length > 0 && <button className="btn small ghost" data-unfinish={sd} title="Back to the house wall colour" onClick={() => (delete w.finishes[sd], app.commit())}>Reset</button>}
            </div>
          );
        })}
        <p className="hint" style={{ margin: '6px 0 0' }}>Use <b>Paint</b> (P) to change a side.</p>
      </Group>
      <Group><button className="btn small" id="wElev" title="Look straight at this wall, with heights" onClick={() => app.openElevation(id)}>Elevation view</button></Group>
      {ops.length > 0 && (
        <Group label="On this wall">
          {ops.map((o) => (
            <button key={o.id} className="btn small ghost list-btn" data-op={o.id} onClick={() => viewer.select({ type: 'opening', id: o.id })}>
              <span>{o.type === 'door' ? 'Door' : o.type === 'window' ? 'Window' : 'Opening'} · {cm(o.width)} cm</span><em>{cm(o.offset)} cm in</em>
            </button>
          ))}
        </Group>
      )}
      {edit ? (
        <>
          <Group>
            <div className="row">
              <button className="btn small" id="wSplit" title="Adds a corner in the middle; drag it to angle the wall"
                onClick={() => (splitWall(f, w.id, len / 2) ? (app.commit(), app.toast('Corner added in the middle. Drag its dot to move it.')) : app.toast('This wall is too short to split.'))}>Add corner</button>
              <button className="btn small danger" id="wDel" onClick={() => app.deleteSelection()}>Delete wall</button>
            </div>
          </Group>
          <Tip>Drag the wall to push or pull it: square neighbours stretch, others get a step. Drag the dots to move corners (Shift for any angle). Double-click a wall to add a corner there.</Tip>
        </>
      ) : (
        <EditTip what="walls" />
      )}
    </div>
  );
}

function Opening({ app, id }) {
  const { cm } = app;
  const f = app.floorNow();
  const o = f.openings.find((x) => x.id === id);
  if (!o) return null;
  const w = f.walls.find((x) => x.id === o.wall);
  const { len, dir } = wallFrame(w);
  const g = openingGaps(f, id);
  const name = o.type === 'door' ? 'Door' : o.type === 'window' ? 'Window' : 'Opening';
  if (!app.ui.editing)
    return (
      <div className="insp">
        <h3>{name}</h3>
        <div className="sub">{f.name} · {cm(o.width)} × {cm(o.height)} cm</div>
        <EditTip what="it" />
      </div>
    );
  const setType = (t) => {
    o.type = t;
    if (t === 'window') Object.assign(o, { sill: 0.9, height: Math.min(o.height, 1.4, f.height - 1) });
    else Object.assign(o, { sill: 0, height: Math.min(2.1, f.height - 0.1), width: t === 'door' ? Math.max(o.width, 0.6) : o.width });
    app.tidy(f);
    app.commit();
  };
  const setSize = (k) => (cmv) => {
    const v = cmv / 100;
    const min = { width: o.type === 'door' ? 0.6 : 0.3, height: 0.3, sill: 0 }[k];
    if (v < min) return app.toast(`Minimum ${cm(min)} cm.`), app.bump('inspector');
    if (k === 'width') {
      const room = g.left + g.right + o.width - 0.1;
      if (v > room) return app.toast(`Only ${cm(room)} cm free here.`), app.bump('inspector');
      const grow = v - o.width;
      o.width = v;
      if (g.right < grow + 0.05) o.offset = Math.max(0.05, o.offset - (grow + 0.05 - g.right));
    } else if (k === 'height') o.height = Math.min(v, f.height - (o.type === 'window' ? o.sill : 0) - 0.05);
    else o.sill = Math.min(v, f.height - o.height - 0.05);
    app.tidy(f);
    app.commit();
  };
  // Through moveOpening so it never overlaps a neighbour or leaves the wall.
  const place = (offset) => {
    const u = Math.max(0, Math.min(len - o.width, offset)) + o.width / 2;
    moveOpening(f, id, [w.a[0] + dir[0] * u, w.a[1] + dir[1] * u], { reach: 0.01, snap: 0.01 });
    app.commit();
  };
  return (
    <div className="insp">
      <h3>{name}</h3>
      <div className="sub">{f.name} · on a {cm(len)} cm wall</div>
      <Group label="Type"><Seg className="seg small-seg" value={o.type} options={[['door', 'Door'], ['window', 'Window'], ['opening', 'Opening']]} onChange={setType} /></Group>
      <Group>
        <div className="num-row">
          <Field label="Width" unit="cm" min={30} value={cm(o.width)} onCommit={setSize('width')} />
          <Field label="Height" unit="cm" min={30} value={cm(o.height)} onCommit={setSize('height')} />
          {o.type === 'window' ? <Field label="Sill" unit="cm" min={0} value={cm(o.sill)} onCommit={setSize('sill')} /> : <span></span>}
        </div>
      </Group>
      <Group label="Position" right={`${cm(g.left)} cm clear · ${cm(g.right)} cm clear`}>
        <div className="num-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="From start" unit="cm" min={0} value={cm(o.offset)} onCommit={(v) => place(v / 100)} />
          <Field label="From end" unit="cm" min={0} value={cm(len - o.offset - o.width)} onCommit={(v) => place(len - o.width - v / 100)} />
        </div>
      </Group>
      {o.type === 'door' && (
        <Group label="Swing">
          <div className="row">
            <button className="btn small" id="oHinge" title="Hinge on the other side" onClick={() => ((o.hinge = o.hinge === 'end' ? 'start' : 'end'), app.commit())}>⇄ Hinge side</button>
            <button className="btn small" id="oSwing" title="Open to the other side of the wall" onClick={() => ((o.swing = o.swing === 'out' ? 'in' : 'out'), app.commit())}>⇅ Flip swing</button>
          </div>
          <Check id="oOpen" checked={o.open} onChange={(v) => ((o.open = v), app.commit())}>Shown open</Check>
        </Group>
      )}
      <Group><button className="btn small danger" id="oDel" onClick={() => app.deleteSelection()}>Delete</button></Group>
      <Tip>Drag it along the wall, or onto another wall. It stops at other doors and windows. Arrow keys nudge it 1 cm (Shift: 10 cm).</Tip>
    </div>
  );
}

function Stairs({ app, id }) {
  const { design, cm, viewer } = app;
  const f = app.floorNow();
  const s = f.stairs.find((x) => x.id === id);
  if (!s) return null;
  const ys = elevations(design);
  const fi = viewer.activeFloor;
  const H = ys[fi + 1] - ys[fi];
  const L = stairLayout(s, H);
  const head = (
    <>
      <h3>Stairs</h3>
      <div className="sub">{f.name} → {design.floors[fi + 1]?.name || ''}</div>
      <div className="stat-grid">
        <div><b>{L.n}</b><span>steps</span></div>
        <div><b>{Math.round(L.riser * 1000)}</b><span>mm rise</span></div>
        <div><b>{Math.round(L.going * 1000)}</b><span>mm tread</span></div>
        <div><b>{cm(H)}</b><span>cm climb</span></div>
      </div>
    </>
  );
  if (!app.ui.editing) return <div className="insp">{head}<EditTip what="them" /></div>;
  return (
    <div className="insp">
      {head}
      <Group label="Shape"><Seg className="seg small-seg" value={s.shape} options={[['straight', 'Straight'], ['L', 'L-turn'], ['U', 'U-turn']]} onChange={(v) => ((s.shape = v), app.commit())} /></Group>
      {s.shape !== 'straight' && <Group label="Turns"><Seg className="seg small-seg" value={s.turn} options={[['left', 'Left'], ['right', 'Right']]} onChange={(v) => ((s.turn = v), app.commit())} /></Group>}
      <Group><div className="num-row" style={{ gridTemplateColumns: '1fr' }}><Field label="Width (cm)" unit="cm" id="sWidth" min={60} max={200} step={5} value={cm(s.width)} onCommit={(v) => ((s.width = v / 100), app.commit())} /></div></Group>
      <Group label="Rotate" right={`${Math.round(s.rot || 0)}°`}>
        <div className="row">
          {[[-90, '↺ 90°'], [90, '↻ 90°']].map(([d, t]) => <button key={d} className="btn small" data-srot={d} onClick={() => ((s.rot = rot((s.rot || 0) + d)), app.commit())}>{t}</button>)}
        </div>
      </Group>
      <Group><button className="btn small danger" id="sDel" onClick={() => app.deleteSelection()}>Delete stairs</button></Group>
      <Tip>Step height and tread depth follow real building rules (max 18 cm rise, 2 × rise + tread ≈ 63 cm) and adjust to the floor-to-floor height automatically. The stairwell is cut in the floor above.</Tip>
    </div>
  );
}

function Room({ app, id }) {
  const { design, ui, viewer } = app;
  const f = app.floorNow();
  const r = f.rooms.find((x) => x.id === id);
  if (!r) return null;
  const items = f.placed.filter((p) => pointInPolygon(p.x, p.z, r.points));
  const wallFin = ui.roomWall?.room === r.id ? ui.roomWall : { room: r.id, kind: 'paint', color: design.wallColor || '#efebe4' };
  const ceil = (patch) => ((r.ceiling = { kind: r.ceiling?.kind || 'paint', color: r.ceiling?.color || '#f6f5f2', ...patch }), app.commit());
  const applyWalls = () => {
    const fin = { kind: wallFin.kind, color: wallFin.color };
    const sides = app.paint.roomSides(r);
    for (const { wall, side, from, to } of sides) paintSpan(wall, side, { from, to, ...fin });
    app.commit();
    app.toast(`${FINISH_NAMES[fin.kind]} on ${sides.length} wall side${sides.length === 1 ? '' : 's'} of ${r.name || 'this room'}.`, { undo: true });
  };
  return (
    <div className="insp">
      <h3>{r.name || 'Room'}</h3>
      <div className="sub">{f.name} · {Math.abs(area(r.points)).toFixed(1)} m²</div>
      <Group>
        <label className="field-label">Name
          <input id="rName" list="roomNames" key={r.id + r.name} defaultValue={r.name || ''} placeholder="Pick or type a name"
            onBlur={(e) => e.target.value.trim() !== (r.name || '') && ((r.name = e.target.value.trim()), app.commit())}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <datalist id="roomNames">{ROOM_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="chips wrap" style={{ marginTop: 6 }}>
          {ROOM_QUICK.map((n) => <button key={n} className={`chip${r.name === n ? ' on' : ''}`} data-rname={n} onClick={() => ((r.name = n), app.commit())}>{n}</button>)}
        </div>
      </Group>
      <Group label="Floor finish">
        <div className="swatch-input">
          <select id="rKind" value={r.floorKind || 'wood'} onChange={(e) => ((r.floorKind = e.target.value), app.commit())}>
            {['wood', 'tiles', 'carpet', 'concrete'].map((k) => <option key={k}>{k}</option>)}
          </select>
          <Color id="rColor" value={r.floorColor || '#c49a6c'} onLive={(v) => (r.floorColor = v)} onCommit={(v) => ((r.floorColor = v), app.commit())} />
        </div>
      </Group>
      <Group label="Ceiling">
        <div className="swatch-input">
          <select id="rCeilKind" value={r.ceiling?.kind || 'paint'} onChange={(e) => ceil({ kind: e.target.value })}>
            {FINISHES.filter((x) => ['paint', 'wood', 'concrete', 'tiles'].includes(x.kind)).map((x) => <option key={x.kind} value={x.kind}>{x.name}</option>)}
          </select>
          <Color id="rCeilColor" value={r.ceiling?.color || '#f6f5f2'} onCommit={(v) => ceil({ color: v })} />
        </div>
      </Group>
      <Group label="Walls of this room">
        <div className="swatch-input">
          <select id="rWallKind" value={wallFin.kind} onChange={(e) => ((ui.roomWall = { ...wallFin, kind: e.target.value }), app.bump('inspector'))}>
            {FINISHES.filter((x) => x.kind !== 'carpet').map((x) => <option key={x.kind} value={x.kind}>{x.name}</option>)}
          </select>
          <Color id="rWallColor" value={wallFin.color} onCommit={(v) => ((ui.roomWall = { ...wallFin, color: v }), app.bump('inspector'))} />
          <button className="btn small" id="rWallApply" onClick={applyWalls}>Apply</button>
        </div>
      </Group>
      {items.length > 0 && (
        <Group label="In this room">
          {items.map((p) => <button key={p.id} className="btn small ghost list-btn" data-sel={p.id} onClick={() => viewer.select({ type: 'item', id: p.id })}>{app.itemById(p.itemId)?.name || 'Item'}</button>)}
        </Group>
      )}
      {ui.editing && <Tip>Rooms follow the walls. Delete or move a wall to merge or reshape rooms.</Tip>}
    </div>
  );
}

function Cost({ app, floors }) {
  const c = app.furnitureCost(floors);
  if (!c.main && !c.other.length) return null;
  const budget = app.pref.get('budget', 0);
  const pct = budget ? Math.round((c.main / budget) * 100) : 0;
  return (
    <Group className="cost" label="Furniture cost" right={floors.length > 1 ? 'whole house' : 'this floor'}>
      <div className="cost-total">{app.money(c.main, c.cur)}{c.other.map(([k, v]) => <em key={k}> + {app.money(v, k)}</em>)}</div>
      {budget > 0 && (
        <>
          <div className={`budget-bar${pct > 100 ? ' over' : ''}`}><span style={{ width: `${Math.min(100, pct)}%` }}></span></div>
          <div className="hint">{pct}% of your {app.money(budget, c.cur)} budget{pct > 100 ? ` · ${app.money(c.main - budget, c.cur)} over` : ` · ${app.money(budget - c.main, c.cur)} left`}</div>
        </>
      )}
    </Group>
  );
}

function Floor({ app }) {
  const { design, ui, viewer, cm } = app;
  const f = app.floorNow();
  const ys = elevations(design);
  const fi = viewer.activeFloor;
  const gross = footprint(f).reduce((s, p) => s + Math.abs(area(p[0].slice(0, -1))), 0);
  const problems = app.floorProblems(f, fi);
  const text = (id, value, onSave) => (
    <input id={id} key={id + value} defaultValue={value} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== value && onSave(e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
  return (
    <div className="insp">
      <h3>{f.name}</h3>
      <div className="sub">Level {cm(ys[fi])} cm · {gross.toFixed(1)} m² · {f.rooms.length} rooms · {f.placed.length} items</div>
      {ui.editing && (
        <>
          <Group><label className="field-label">Floor name{text('fName', f.name, (v) => ((f.name = v), app.commit()))}</label></Group>
          <Group>
            <div className="num-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Ceiling height (cm)" unit="cm" id="fHeight" min={200} max={600} step={5} value={cm(f.height)} onCommit={(v) => ((f.height = v / 100), app.commit())} />
              <Field label={fi === 0 ? 'Ground slab (cm)' : 'Floor slab (cm)'} unit="cm" id="fSlab" min={5} max={60} value={cm(f.slab)} onCommit={(v) => ((f.slab = v / 100), app.commit())} />
            </div>
          </Group>
        </>
      )}
      {problems.length ? (
        <div className="group problems"><div className="lbl">Check</div><ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
      ) : (
        <div className="group problems ok">✓ No problems on this floor</div>
      )}
      {f.rooms.length > 0 && (
        <Group label="Rooms">
          {f.rooms.map((r) => (
            <button key={r.id} className="btn small ghost list-btn" data-room={r.id} onClick={() => viewer.select({ type: 'room', id: r.id })}>
              <span>{r.name || 'Room'}</span><em>{Math.abs(area(r.points)).toFixed(1)} m²</em>
            </button>
          ))}
        </Group>
      )}
      {f.placed.length > 0 && (
        <Group label="Furniture">
          {f.placed.map((p) => {
            const it = app.itemById(p.itemId);
            if (!it) return null;
            const c = app.colorOf(it, p);
            return (
              <button key={p.id} className="btn small ghost list-btn" data-sel={p.id} onClick={() => viewer.select({ type: 'item', id: p.id })}>
                <span className="sw" style={{ background: c?.hex || '#ccc' }}></span>{it.name}
              </button>
            );
          })}
        </Group>
      )}
      <Cost app={app} floors={[f]} />
      {design.floors.length > 1 && <Cost app={app} floors={design.floors} />}
      {!ui.editing && (
        <>
          <Group><button className="btn" style={{ width: '100%' }} id="walkHere" onClick={() => app.setView('walk')}>Walk through {f.name}</button></Group>
          <Group><button className="btn" style={{ width: '100%' }} id="editHouse" onClick={() => app.setEditing(true)}>Edit walls, rooms &amp; stairs</button></Group>
        </>
      )}
      <Group label="House">
        {ui.editing && <label className="field-label">Name{text('hName', design.name, (v) => ((design.name = v), app.commit()))}</label>}
        <div className="swatch-input" style={{ marginTop: 6 }}>
          <Color id="wallColor" value={design.wallColor || '#efebe4'} onLive={(v) => (design.wallColor = v)} onCommit={(v) => ((design.wallColor = v), app.commit())} />
          <span className="hint">Wall colour</span>
        </div>
      </Group>
    </div>
  );
}

export default function Inspector() {
  const app = useTopic('inspector');
  if (!app?.design) return null;
  const s = app.viewer.sel;
  const key = s ? `${s.type}:${s.id || s.ids?.join(',')}` : `floor:${app.viewer.activeFloor}`;
  let body;
  if (app.viewer.view === 'walk') body = <Walk app={app} />;
  else if (s?.type === 'item') body = <Item app={app} id={s.id} />;
  else if (s?.type === 'items') body = <Multi app={app} />;
  else if (s?.type === 'wall') body = <Wall app={app} id={s.id} />;
  else if (s?.type === 'opening') body = <Opening app={app} id={s.id} />;
  else if (s?.type === 'stairs') body = <Stairs app={app} id={s.id} />;
  else if (s?.type === 'room') body = <Room app={app} id={s.id} />;
  else body = <Floor app={app} />;
  return <div key={key}>{body}</div>;
}
