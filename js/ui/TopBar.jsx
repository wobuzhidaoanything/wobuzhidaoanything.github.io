// The top bar, grouped by task: your designs · views and editing · search, undo, share ·
// your AI agent · help and settings.
import { useRef, useState } from 'react';
import { useTopic, set, openDialog } from './store.js';
import { useOutside } from './controls.js';
import SaveState from './SaveState.js';

const VIEWS = [['3d', '3D', 'Dollhouse view (1)'], ['plan', 'Plan', 'Floor plan (2)'], ['split', 'Split', 'Plan and 3D side by side (4)'], ['walk', 'Walk', 'Walk through the house (3)']];

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
      <div className="brand"><span className="logo"></span>Roomcraft</div>
      <button className="design-btn" id="designBtn" title="Your designs: switch, start a new house, version history" onClick={() => openDialog('designs')}>
        <span id="designName">{app.design.name}</span>
        <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <span id="saveSlot"><SaveState /></span>
      <span className="tb-sep"></span>
      <div className="seg" id="viewSeg" role="tablist" aria-label="View">
        {VIEWS.map(([v, label, tip]) => (
          <button key={v} data-view={v} className={view === v ? 'on' : ''} title={tip} onClick={() => app.setView(v)}>{label}</button>
        ))}
      </div>
      <button className={`btn${ui.editing ? ' on' : ''}`} id="editBtn" title="Walls, rooms, doors, windows, stairs and floors (E)" onClick={() => app.setEditing(!ui.editing)}>
        {ui.editing ? 'Done editing' : 'Edit house'}
      </button>
      <div className="spacer"></div>
      <button className="cmd-btn" id="cmdBtn" title="Find any action by name (Ctrl+K)" onClick={() => set({ palette: true })}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>Search actions</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="tb-group">
        <button className="icon-btn" id="undoBtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={history.index <= 0} onClick={() => app.restore(history.index - 1)}>
          <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        </button>
        <button className="icon-btn" id="redoBtn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={history.index >= history.stack.length - 1} onClick={() => app.restore(history.index + 1)}>
          <svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
        </button>
      </div>
      <Menu
        id="exportMenu"
        button={(open, toggle) => (
          <button className="btn" id="exportBtn" aria-haspopup="menu" aria-expanded={open} title="Pictures, plans, costs and files to share" onClick={toggle}>
            <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>Share
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
      <button className="btn chat-btn" id="chatBtn" title="Talk to your AI agent (C)" aria-expanded={!!chat?.open} onClick={() => chat?.toggle()}>
        <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        <span>Assistant</span>
        {chat?.busy && <span className="busy-dot" id="chatBusy"></span>}
      </button>
      {app.store.kind === 'device' && (
        <button className="btn agents-btn" id="agentsBtn" title={ui.agents ? `${ui.agents} AI agent${ui.agents > 1 ? 's' : ''} set up` : 'Connect an AI agent'} onClick={() => app.openAgents()}>
          <span className={`status-dot${ui.agents ? ' ok' : ''}`} id="agentsDot"></span>
          <span>Agents</span>
        </button>
      )}
      <span className="tb-sep"></span>
      <button className="icon-btn" id="helpBtn" title="User guide (F1)" aria-label="Help" onClick={() => openDialog('help')}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><circle cx="12" cy="17.2" r=".6" /></svg>
      </button>
      <button className="icon-btn" id="settingsBtn" title="Settings: dark mode, currency, graphics (Ctrl+,)" aria-label="Settings" onClick={() => set({ settings: true })}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      </button>
      <Menu
        id="menu"
        button={(open, toggle) => (
          <button className="icon-btn" id="menuBtn" aria-haspopup="menu" aria-expanded={open} aria-label="More" title="More" onClick={toggle}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
          </button>
        )}
      >
        {app.store.history && <button data-act="history" onClick={() => app.openHistory(app.design.id)}>Version history…</button>}
        <button data-act="import-design" onClick={() => app.pickFile('design')}>Import design file…</button>
        <button data-act="import-dxf" onClick={() => app.pickFile('dxf')}>Import CAD floor plan (DXF)…</button>
        <hr />
        <button data-act="help" onClick={() => openDialog('help')}>User guide &amp; shortcuts</button>
        <button data-act="tour" onClick={() => app.startTour()}>Show the tour again</button>
        <button data-act="settings" onClick={() => set({ settings: true })}>Settings…</button>
      </Menu>
    </>
  );
}
