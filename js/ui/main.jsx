// The React side of the app's UI: command palette, right-click menu, settings, tour, hover tips
// and the save indicator. Mounted once by js/app.js, which passes its commands and settings.
import { createRoot, createPortal } from 'react-dom';
import { bridge, set, bump } from './store.js';
import Palette from './Palette.js';
import ContextMenu from './ContextMenu.js';
import Settings from './Settings.js';
import Tour from './Tour.js';
import Tooltip from './Tooltip.js';
import SaveState from './SaveState.js';

function App() {
  const slot = document.getElementById('saveSlot');
  return (
    <>
      {slot && createPortal(<SaveState />, slot)}
      <Palette />
      <ContextMenu />
      <Settings />
      <Tour />
      <Tooltip />
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
