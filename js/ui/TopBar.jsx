// The top bar, grouped by task: your designs · views and editing · search, undo, share ·
// your AI agent · help and settings.
import { useRef, useState } from 'react';
import { useTopic, set, openDialog } from './store.js';
import { useOutside, Icon } from './controls.js';
import SaveState from './SaveState.js';

const VIEWS = [['3d', '3D', 'cube', 'Dollhouse view (1)'], ['plan', 'Plan', 'plan', 'Floor plan (2)'], ['split', 'Split', 'split', 'Plan and 3D side by side (4)'], ['walk', 'Walk', 'walk', 'Walk through the house (3)']];

function Menu({ id, button, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, open, () => setOpen(false));
  return (
    <div className="menu-wrap" ref={ref}>
      {button(open, () => setOpen(!open))}
      {open && (
        <div className="menu" id={id} role="menu" onClick={(e) => e.target.closest('button') && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const app = useTopic('main');
  useTopic('chat');
  if (!app?.design) return null;
  const { ui, viewer, history } = app;
  const view = viewer.view === 'elevation' ? null : ui.view || viewer.view;
  const chat = app.chat;
  const item = (act, title, sub) => (
    <button data-act={act} onClick={() => app.shareAction(act)}>
      <b>{title}</b>
      <span>{sub}</span>
    </button>
  );
  return (
    <>
      <div className="tb-left">
      <div className="brand"><span className="logo"></span><span>Roomcraft</span></div>
      <button className="design-btn" id="designBtn" title="Your designs: switch, start a new house, version history" onClick={() => openDialog('designs')}>
        <span id="designName">{app.design.name}</span>
        <Icon n="chevron" />
      </button>
      <span id="saveSlot"><SaveState /></span>
      </div>
      <div className="tb-center">
        <div className="seg mode-seg" id="modeSeg" role="tablist" aria-label="Mode">
          <button className={!ui.editing ? 'on' : ''} title="Furnish: add, move and paint furniture and finishes (E switches)" onClick={() => app.setEditing(false)}><Icon n="sofa" />Furnish</button>
          <button id="editBtn" className={ui.editing ? 'on' : ''} title="Build: walls, rooms, doors, windows, stairs and floors (E)" onClick={() => app.setEditing(true)}><Icon n="build" />Build</button>
        </div>
        <div className="seg view-seg" id="viewSeg" role="tablist" aria-label="View">
          {VIEWS.map(([v, label, icon, tip]) => (
            <button key={v} data-view={v} className={view === v ? 'on' : ''} title={tip} onClick={() => app.setView(v)}><Icon n={icon} />{label}</button>
          ))}
        </div>
      </div>
      <div className="tb-right">
      <button className="cmd-btn" id="cmdBtn" title="Find any action by name (Ctrl+K)" onClick={() => set({ palette: true })}>
        <Icon n="search" />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="tb-group">
        <button className="icon-btn" id="undoBtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={history.index <= 0} onClick={() => app.restore(history.index - 1)}>
          <Icon n="undo" />
        </button>
        <button className="icon-btn" id="redoBtn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={history.index >= history.stack.length - 1} onClick={() => app.restore(history.index + 1)}>
          <Icon n="redo" />
        </button>
      </div>
      <Menu
        id="exportMenu"
        button={(open, toggle) => (
          <button className="btn" id="exportBtn" aria-haspopup="menu" aria-expanded={open} title="Pictures, plans, costs and files to share" onClick={toggle}>
            <Icon n="share" />Share
          </button>
        )}
      >
        <div className="menu-head">Pictures</div>
        {item('photo', 'Photo-real picture', 'A realistic render of this view')}
        {item('copy', 'Copy picture', 'This view, ready to paste · Ctrl+Shift+C')}
        {item('png', 'Screenshot', 'This view as .png')}
        <div className="menu-head">Plans &amp; costs</div>
        {item('plan', '2D floor plan', 'PDF or PNG at scale, with dimensions')}
        {item('qty', 'Quantities & costs', 'Areas, paint, flooring, furniture budget (.csv)')}
        <div className="menu-head">Files</div>
        {item('glb', '3D model for Blender', 'Whole house as .glb')}
        {item('design', 'Design file', '.json to back up or share')}
      </Menu>
      <span className="tb-sep"></span>
      <button className="btn chat-btn" id="chatBtn" title={`Talk to your AI agent (C)${chat?.ready ? ` · ${chat.ready.name} is ready` : ''}`} aria-expanded={!!chat?.open} onClick={() => (app.store.kind === 'device' && !ui.agents && !chat?.ready ? app.openAgents() : chat?.toggle())}>
        <Icon n="chat" />
        <span>Assistant</span>
        {app.store.kind === 'device' && <span className={`status-dot${ui.agents || chat?.ready ? ' ok' : ''}`} id="agentsDot"></span>}
        {chat?.busy && <span className="busy-dot" id="chatBusy"></span>}
      </button>
      <span className="tb-sep"></span>
      <button className="icon-btn" id="helpBtn" title="User guide (F1)" aria-label="Help" onClick={() => openDialog('help')}>
        <Icon n="help" />
      </button>
      <button className="icon-btn" id="settingsBtn" title="Settings: dark mode, currency, graphics (Ctrl+,)" aria-label="Settings" onClick={() => set({ settings: true })}>
        <Icon n="settings" />
      </button>
      <Menu
        id="menu"
        button={(open, toggle) => (
          <button className="icon-btn" id="menuBtn" aria-haspopup="menu" aria-expanded={open} aria-label="More" title="More" onClick={toggle}>
            <Icon n="more" />
          </button>
        )}
      >
        {app.store.kind === 'device' && <button data-act="agents" id="agentsBtn" onClick={() => app.openAgents()}>AI agents…</button>}
        {app.store.history && <button data-act="history" onClick={() => app.openHistory(app.design.id)}>Version history…</button>}
        <button data-act="import-design" onClick={() => app.pickFile('design')}>Import design file…</button>
        <button data-act="import-dxf" onClick={() => app.pickFile('dxf')}>Import CAD floor plan (DXF)…</button>
        <hr />
        <button data-act="help" onClick={() => openDialog('help')}>User guide &amp; shortcuts</button>
        <button data-act="tour" onClick={() => app.startTour()}>Show the tour again</button>
        <button data-act="settings" onClick={() => set({ settings: true })}>Settings…</button>
      </Menu>
      </div>
    </>
  );
}
