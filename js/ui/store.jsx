// Bridge between the app (js/app.js, plain JS that owns the design) and the React panels.
// The app sets `bridge.app` (its commands and settings) and calls set()/bump() when something
// the panels show has changed; components read it with useBridge().
import { useSyncExternalStore } from 'react';

const subs = new Set();
let version = 0;

export const bridge = {
  app: null,
  state: { palette: false, menu: null, settings: false, tour: -1, save: { status: 'saved' } },
};

export function bump() {
  version++;
  for (const f of subs) f();
}

export function set(patch) {
  Object.assign(bridge.state, patch);
  bump();
}

const subscribe = (f) => (subs.add(f), () => subs.delete(f));
export function useBridge() {
  useSyncExternalStore(subscribe, () => version);
  return [bridge.state, bridge.app];
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
