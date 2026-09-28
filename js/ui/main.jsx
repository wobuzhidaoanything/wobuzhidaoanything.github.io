// The app's whole UI in React. js/app.js owns the design, the 3D view and every action, and
// mounts this once with its API. Each area is rendered into its place on the page.
import { createRoot, createPortal } from 'react-dom';
import { bridge, set, bump } from './store.js';
import TopBar from './TopBar.js';
import LeftPanel from './LeftPanel.js';
import Inspector from './Inspector.js';
import { LevelBar, ToolBar, StatusBar, WalkHelp, Photo, Toast, SaveBanner } from './Stage.js';
import Dialogs from './Dialogs.js';
import Help from './Help.js';
import Chat from './Chat.js';
import Palette from './Palette.js';
import ContextMenu from './ContextMenu.js';
import Settings from './Settings.js';
import Tour from './Tour.js';
import Tooltip from './Tooltip.js';

const $ = (s) => document.querySelector(s);

// App itself never redraws; each area listens to its own topic (see store.jsx).
function App() {
  return (
    <>
      {createPortal(<TopBar />, $('.topbar'))}
      {createPortal(<LeftPanel />, $('#leftPanel'))}
      {createPortal(<Inspector />, $('#inspector'))}
      {createPortal(<><LevelBar /><ToolBar /><StatusBar /><Photo /></>, $('#stageUI'))}
      {createPortal(<WalkHelp />, $('#walkHelp'))}
      <Chat />
      <Dialogs />
      <Help />
      <Palette />
      <ContextMenu />
      <Settings />
      <Tour />
      <Tooltip />
      <Toast />
      <SaveBanner />
    </>
  );
}

export function mountUI(app) {
  bridge.app = app;
  const el = document.createElement('div');
  el.id = 'reactRoot';
  document.body.appendChild(el);
  createRoot(el).render(<App />);
  return { set, bump, get state() { return bridge.state; } };
}
