// Right-click menu: the actions for whatever is under the pointer.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBridge, set, Keys } from './store.js';

export default function ContextMenu() {
  const [{ menu }, app] = useBridge();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [i, setI] = useState(-1);
  const items = menu?.items || [];
  const actionable = items.map((x, k) => (x.sep || x.disabled ? -1 : k)).filter((k) => k >= 0);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(menu.x, innerWidth - r.width - 8), top: Math.min(menu.y, innerHeight - r.height - 8) });
    setI(-1);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => set({ menu: null });
    const down = (e) => !ref.current?.contains(e.target) && close();
    const key = (e) => {
      if (e.key === 'Escape') (e.stopPropagation(), close());
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const at = actionable.indexOf(i);
        const n = e.key === 'ArrowDown' ? (at + 1) % actionable.length : (at - 1 + actionable.length) % actionable.length;
        setI(actionable[n]);
      } else if (e.key === 'Enter' && i >= 0) (e.preventDefault(), e.stopPropagation(), run(items[i]));
    };
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key, true);
    addEventListener('wheel', close, true);
    addEventListener('resize', close);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
      removeEventListener('wheel', close, true);
      removeEventListener('resize', close);
    };
  });

  if (!menu) return null;
  function run(x) {
    set({ menu: null });
    if (x && !x.disabled) app.runCommand(x);
  }
  return (
    <div className="ctx-menu" ref={ref} role="menu" style={pos || { left: menu.x, top: menu.y, visibility: 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      {menu.title && <div className="ctx-title">{menu.title}</div>}
      {items.map((x, k) =>
        x.sep ? (
          <hr key={k} />
        ) : (
          <button key={k} role="menuitem" disabled={x.disabled} className={`${x.danger ? 'danger' : ''}${k === i ? ' on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => run(x)}>
            <span>{x.label}</span>
            <Keys keys={x.keys} />
          </button>
        )
      )}
    </div>
  );
}
