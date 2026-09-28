// Bridge between the app (js/app.js, which owns the design, the 3D view and every action) and
// the React UI. The app passes its API once (`bridge.app`) and calls bump() when something
// changed. Each area of the screen listens to its own topic so that, for example, dragging a sofa
// only redraws the Inspector and moving the pointer only redraws the status bar:
//   main       top bar, floor tabs, tool options, left panel
//   inspector  right panel
//   status     hint and pointer position, walk help
//   chat       Assistant panel
//   state      dialogs, menus, toasts and other UI state kept in bridge.state
// bump() with no topic redraws everything.
import { useSyncExternalStore } from 'react';

const topics = new Map();
function topic(name) {
  let t = topics.get(name);
  if (!t) {
    t = { v: 0, subs: new Set() };
    t.subscribe = (f) => (t.subs.add(f), () => t.subs.delete(f));
    t.get = () => t.v;
    topics.set(name, t);
  }
  return t;
}

export const bridge = {
  app: null,
  state: { palette: false, menu: null, settings: false, tour: -1, save: { status: 'saved' }, dialogs: {}, toast: null, photo: null, banner: null },
};

export function bump(...names) {
  for (const n of names.length ? names : [...topics.keys()]) {
    const t = topic(n);
    t.v++;
    for (const f of t.subs) f();
  }
}

export function set(patch) {
  Object.assign(bridge.state, patch);
  bump('state');
}

/** Redraw this component when `name` is bumped. Returns the app API. */
export function useTopic(name) {
  const t = topic(name);
  useSyncExternalStore(t.subscribe, t.get);
  return bridge.app;
}

/** [UI state, app API], redrawn when the UI state changes. */
export function useBridge() {
  useTopic('state');
  return [bridge.state, bridge.app];
}

export function openDialog(name, data = true) {
  set({ dialogs: { ...bridge.state.dialogs, [name]: data } });
}
export function closeDialog(name) {
  const d = { ...bridge.state.dialogs };
  delete d[name];
  set({ dialogs: d });
}

/** "Ctrl+Shift+Z" → <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>; "A or B" → two options. */
export function Keys({ keys }) {
  if (!keys) return null;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <span className="keys-hint">
      {String(keys).split(' or ').map((alt, i) => (
        <span key={i}>
          {i > 0 && <span className="or">or</span>}
          {alt.split('+').map((k, j) => <kbd key={j}>{mac && k === 'Ctrl' ? '⌘' : k}</kbd>)}
        </span>
      ))}
    </span>
  );
}
