// Everything floating over the 3D view: floor tabs (with the View and Sun popovers), the tool
// options bar, the status bar, walk-through help and the photo renderer.
import { useRef, useState } from 'react';
import { useTopic, useBridge, set } from './store.js';
import { Num, Seg, Color, useOutside } from './controls.js';
import { elevations } from '../js/design.js';
import { FINISHES } from '../js/materials.js';
import { sunTimes } from '../js/sun.js';

const pad2 = (n) => String(n).padStart(2, '0');
const compass = (b) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((b * 180) / Math.PI / 45) % 8];

export const DISPLAY = [
  ['clear', 'Clearances', 'Space furniture needs to be used and doors need to open. Problems get a red outline'],
  ['dims', 'Dimensions', 'Lengths of every outside wall and room sizes, drawn on the floor'],
  ['areas', 'Room areas', 'Floor area of each room (m²)'],
  ['grid', 'Grid', '1 m squares, with 10 cm squares when you zoom in'],
  ['snap', 'Snap to grid', 'Walls, corners and furniture move in 5 cm steps (hold Alt to move freely)'],
];

function ViewMenu({ app }) {
  const d = app.viewer.display;
  return (
    <div className="menu view-menu" id="viewMenu" role="menu">
      {DISPLAY.map(([k, name, tip]) => (
        <label key={k} title={tip}>
          <input type="checkbox" data-disp={k} checked={!!d[k]} onChange={(e) => app.setDisplay(k, e.target.checked)} />
          <span><b>{name}</b><em>{tip}</em></span>
        </label>
      ))}
    </div>
  );
}

function SunPanel({ app }) {
  const { ui, design } = app;
  const site = design.site || {};
  const pos = app.applySun();
  const t = site.lat != null ? sunTimes(new Date(`${ui.sunDate}T12:00`), site.lat, site.lon) : null;
  const hm = (d) => (d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '—');
  const [h, mi] = ui.sunTime.split(':').map(Number);
  const saveSite = (patch) => {
    design.site = { ...(design.site || {}), ...patch };
    app.commit({ rebuild: false });
  };
  return (
    <div className="menu sun-panel" id="sunPanel">
      <div className="sun-grid">
        <label className="check small-check"><input type="checkbox" id="sunOn" checked={!!ui.sunOn} onChange={(e) => app.setSunOn(e.target.checked)} /> <b>Sun study</b></label>
        <div className="row">
          <label className="field-label">Latitude<Num id="sunLat" value={site.lat} step={0.01} min={-90} max={90} placeholder="51.50" title="Degrees north (negative: south)" onCommit={(v) => saveSite({ lat: v ?? undefined })} /></label>
          <label className="field-label">Longitude<Num id="sunLon" value={site.lon} step={0.01} min={-180} max={180} placeholder="-0.12" title="Degrees east (negative: west)" onCommit={(v) => saveSite({ lon: v ?? undefined })} /></label>
        </div>
        <button className="btn small" id="sunHere" onClick={() => app.useMyLocation()}>Use my location</button>
        <label className="field-label">North <span>{Math.round(site.north || 0)}°</span>
          <input id="sunNorth" type="range" min="0" max="359" value={Math.round(site.north || 0)}
            onChange={(e) => ((design.site = { ...(design.site || {}), north: +e.target.value }), app.applySun(), app.bump('main'))}
            onPointerUp={() => app.commit({ rebuild: false })} onKeyUp={() => app.commit({ rebuild: false })} />
        </label>
        <label className="field-label">Date<input id="sunDate" type="date" value={ui.sunDate} onChange={(e) => ((ui.sunDate = e.target.value || ui.sunDate), app.applySun(), app.bump('main'))} /></label>
        <label className="field-label">Time <b>{ui.sunTime}</b>
          <input id="sunTime" type="range" min="0" max="1439" step="15" value={h * 60 + mi}
            onChange={(e) => {
              const v = +e.target.value;
              ui.sunTime = `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
              app.applySun();
              app.bump('main');
            }} />
        </label>
        <p className="hint">
          {site.lat == null
            ? 'Enter where the house is (or use your location) to see real sunlight and shadows.'
            : `Sunrise ${hm(t?.rise)} · sunset ${hm(t?.set)}${pos ? ` · sun ${Math.round((pos.altitude * 180) / Math.PI)}° up, from ${compass(pos.bearing)}` : ''}`}
        </p>
      </div>
    </div>
  );
}

export function LevelBar() {
  const app = useTopic('main');
  const [pop, setPop] = useState(null); // { kind: 'view'|'sun', left, top }
  const popRef = useRef(null);
  useOutside(popRef, !!pop, () => setPop(null), '[data-sun], [data-viewmenu]');
  if (!app?.design) return null;
  const { viewer, design, ui } = app;
  const toggle = (kind, e, dx) => {
    if (pop?.kind === kind) return setPop(null);
    const r = e.currentTarget.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
    setPop({ kind, left: Math.max(8, r.left - s.left + dx), top: r.bottom - s.top + 6 });
  };
  if (viewer.view === 'elevation') {
    const e = viewer.elev;
    return (
      <div className="level-bar" id="levelBar" role="tablist" aria-label="Floors">
        <button className="on" disabled>Elevation</button>
        <span className="lvl-note">{app.floorNow().name} · wall {e.len.toFixed(2)} m · drag furniture along the wall or up and down</span>
        <span className="sep"></span>
        <button title="Look at the other side of this wall" onClick={() => app.openElevation(e.wallId, -e.side)}>⇄ Other side</button>
        <button title="Back (Esc)" onClick={() => app.closeElevation()}>Close</button>
      </div>
    );
  }
  const ys = elevations(design);
  const all = viewer.showAll;
  const walk = viewer.view === 'walk';
  return (
    <>
      <div className="level-bar" id="levelBar" role="tablist" aria-label="Floors">
        {design.floors.map((f, i) => (
          <button key={f.id} role="tab" data-floor={i} className={!all && i === viewer.activeFloor ? 'on' : ''} title={`${f.name} · level ${app.cm(ys[i])} cm · double-click to rename`}
            onClick={() => app.setFloor(i)}
            onDoubleClick={() => {
              const name = prompt('Floor name', f.name);
              if (name?.trim()) (f.name = name.trim()), app.commit({ rebuild: false });
            }}>
            <span className="lv">{i === 0 ? 'G' : i}</span>{f.name}
          </button>
        ))}
        {design.floors.length > 1 && !walk && <button role="tab" className={all ? 'on' : ''} data-all title="See the whole house" onClick={() => app.showAllFloors()}>All floors</button>}
        {ui.editing && (<><span className="sep"></span><button className="add" data-addfloor title="Add a floor above the top one" onClick={() => app.addFloorAbove()}>+ Floor</button></>)}
        {(viewer.view === '3d' || viewer.split) && !all && (
          <><span className="sep"></span><button data-walls title="Walls full height, or cut at 1.25 m like a plan" onClick={() => app.toggleWallMode()}>{viewer.wallMode === 'cut' ? 'Walls: cut' : 'Walls: full'}</button></>
        )}
        <span className="sep"></span>
        {!walk && <button data-measure className={ui.tool === 'measure' ? 'on' : ''} title="Measure distances, paths and along surfaces (M)" onClick={() => app.setTool(ui.tool === 'measure' ? null : 'measure')}>Measure</button>}
        {!walk && <button data-paint className={ui.tool === 'paint' ? 'on' : ''} title="Paint walls and floors: paint, wallpaper, tiles, wood… (P)" onClick={() => app.setTool(ui.tool === 'paint' ? null : 'paint')}>Paint</button>}
        <button data-sun className={ui.sunOn ? 'on' : ''} title="Sun and shadows for a place, date and time" onClick={(e) => toggle('sun', e, -120)}>{ui.sunOn ? `☀ ${ui.sunTime}` : 'Sun'}</button>
        {!walk && (<><span className="sep"></span><button data-viewmenu aria-haspopup="menu" title="Show or hide dimensions, areas and the grid" onClick={(e) => toggle('view', e, -180)}>View ▾</button></>)}
      </div>
      {pop && (
        <div ref={popRef} className="popover-anchor" style={{ position: 'absolute', left: pop.left, top: pop.top, zIndex: 8 }}>
          {pop.kind === 'view' ? <ViewMenu app={app} /> : <SunPanel app={app} />}
        </div>
      )}
    </>
  );
}

export function ToolBar() {
  const app = useTopic('main');
  if (!app?.design) return null;
  const { ui, measure, paint } = app;
  const t = ui.tool;
  if (!t) return null;
  const widthKey = { door: 'doorWidth', window: 'windowWidth', opening: 'openingWidth' }[t];
  const redraw = () => app.bump('main', 'status');
  return (
    <div className="tool-bar" id="toolBar">
      <b>{{ wall: 'Wall', door: 'Door', window: 'Window', opening: 'Opening', stairs: 'Stairs', measure: 'Measure', paint: 'Paint' }[t]}</b>
      {t === 'paint' && (
        <>
          <select id="tbFinish" title="Finish" value={paint.finish.kind} onChange={(e) => ((paint.finish = { kind: e.target.value, color: FINISHES.find((f) => f.kind === e.target.value).color }), redraw())}>
            {FINISHES.map((f) => <option key={f.kind} value={f.kind}>{f.name}</option>)}
          </select>
          <Color id="tbFinishColor" title="Colour" value={paint.finish.color} onLive={(c) => (paint.finish = { ...paint.finish, color: c })} onCommit={redraw} />
          <Seg value={paint.scope} options={[['surface', 'One side'], ['room', 'Whole room']]} onChange={(v) => ((paint.scope = v), redraw())} />
          <span>Alt+click picks up a finish</span>
        </>
      )}
      {t === 'measure' && (
        <>
          <Seg value={measure.mode} options={[['distance', 'Distance'], ['path', 'Path'], ['surface', 'Along surface']]} onChange={(v) => (measure.setMode(v), app.updateHint(), redraw())} />
          <button className="tb-btn" id="tbClearMeasure" disabled={!measure.results.length} onClick={() => (measure.clear(), redraw())}>Clear all</button>
        </>
      )}
      {t === 'wall' && (
        <>
          <Seg value={ui.wallExterior ? '1' : '0'} options={[['0', 'Interior'], ['1', 'Exterior']]} onChange={(v) => app.setWallKind(v === '1')} />
          <label>Thickness <Num id="tbThick" unit="cm" min={5} max={60} value={app.cm(ui.wallThickness)} onCommit={(v) => ((ui.wallThickness = v / 100), redraw())} /> cm</label>
        </>
      )}
      {widthKey && <label>Width <Num id="tbWidth" unit="cm" min={30} max={400} step={5} value={app.cm(ui[widthKey])} onCommit={(v) => ((ui[widthKey] = v / 100), redraw())} /> cm</label>}
      {t === 'stairs' && (
        <>
          <Seg value={ui.stairShape} options={[['straight', 'Straight'], ['L', 'L-turn'], ['U', 'U-turn']]} onChange={(v) => ((ui.stairShape = v), redraw())} />
          {ui.stairShape !== 'straight' && <Seg value={ui.stairTurn} options={[['left', 'Turn left'], ['right', 'Turn right']]} onChange={(v) => ((ui.stairTurn = v), redraw())} />}
        </>
      )}
      <span>Esc to finish</span>
      <button className="x" id="tbClose" title="Stop (Esc)" onClick={() => app.setTool(null)}>×</button>
    </div>
  );
}

export function StatusBar() {
  const app = useTopic('status');
  if (!app?.ui) return <div className="status-bar"></div>;
  return (
    <div className="status-bar">
      <span id="hintbar">{app.ui.hintText}</span>
      <span className="coords" id="coords">{app.ui.coords}</span>
    </div>
  );
}

export function WalkHelp() {
  const app = useTopic('status');
  if (!app?.design) return null;
  const name = app.floorNow().name;
  if (app.ui.walkLocked) return <><b>{name}</b> · W A S D to walk · Shift to hurry · Esc to release the mouse</>;
  return <><b>{name}</b> · <u>Click to look around</u> · W A S D to walk · walk onto the stairs to change floors</>;
}

export function Photo() {
  const [{ photo }, app] = useBridge();
  if (!photo) return null;
  return (
    <div className="photo-overlay" id="photoOverlay">
      <div className="photo-card">
        <b id="photoTitle">{photo.title}</b>
        {!photo.url && !photo.error && <div className="bar"><span style={{ width: `${(photo.progress || 0) * 100}%` }}></span></div>}
        <div className="muted" id="photoInfo">{photo.info}</div>
        {photo.url && <img id="photoImg" src={photo.url} alt="Photo-real picture of the view" />}
        <div className="actions">
          <button className="btn" id="photoCancel" onClick={() => app.cancelPhoto()}>{photo.url || photo.error ? 'Close' : 'Cancel'}</button>
          {photo.url && <button className="btn primary" id="photoSave" onClick={() => app.savePhoto(photo.url)}>Download</button>}
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const [{ toast }, app] = useBridge();
  // Keep showing the last message while it fades out
  const last = useRef(null);
  if (toast) last.current = toast;
  const t = toast || last.current;
  return (
    <div className={`toast${toast ? ' show' : ''}`} id="toast" role="status" aria-live="polite">
      {t && (
        <>
          {t.msg}
          {t.undo && <button data-t="undo" onClick={() => (app.restore(app.history.index - 1), set({ toast: null }))}>Undo</button>}
          {t.action && <button data-t="act" onClick={() => (t.action[1](), set({ toast: null }))}>{t.action[0]}</button>}
        </>
      )}
    </div>
  );
}

export function SaveBanner() {
  const [{ banner }] = useBridge();
  return banner ? <div className="save-banner" id="saveBanner" role="alert">{banner}</div> : null;
}
