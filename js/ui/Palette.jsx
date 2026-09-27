// Command palette (Ctrl+K): type what you want to do; every action, floor and model is here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBridge, set, Keys } from './store.js';

const norm = (s) => String(s || '').toLowerCase();

function score(c, words) {
  const label = norm(c.label);
  const hay = `${label} ${norm(c.group)} ${norm(c.keywords)}`;
  if (!words.every((w) => hay.includes(w))) return -1;
  let s = 0;
  if (label.startsWith(words[0])) s += 10;
  if (words.every((w) => label.includes(w))) s += 5;
  return s + (c.recent ? 2 : 0);
}

export default function Palette() {
  const [{ palette }, app] = useBridge();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  const all = useMemo(() => (palette && app ? app.commands() : []), [palette, app]);
  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      const recent = app?.recentCommands?.() || [];
      const rec = recent.map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...c, group: 'Recent' }));
      return [...rec, ...all.filter((c) => !c.hidden && !recent.includes(c.id))];
    }
    return all
      .map((c) => [c, score(c, words)])
      .filter(([, s]) => s >= 0)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
      .slice(0, 60);
  }, [q, all]);

  useEffect(() => {
    if (!palette) return;
    setQ('');
    setI(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [palette]);
  useEffect(() => setI(0), [q]);
  useEffect(() => list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }), [i]);

  if (!palette) return null;
  const close = () => set({ palette: false });
  const run = (c) => {
    if (!c || c.disabled) return;
    close();
    app.runCommand(c);
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') (e.preventDefault(), setI((v) => Math.min(shown.length - 1, v + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setI((v) => Math.max(0, v - 1)));
    else if (e.key === 'Enter') (e.preventDefault(), run(shown[i]));
  };
  let lastGroup = null;
  return (
    <div className="palette-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Commands">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="What do you want to do? Try “door”, “sofa”, “plan”, “export”…" aria-label="Search commands" />
        <div className="palette-list" ref={list} role="listbox">
          {shown.length === 0 && <div className="palette-empty">Nothing matches “{q}”.</div>}
          {shown.map((c, k) => {
            const head = !q && c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <div key={c.group + c.id}>
                {head && <div className="palette-group">{head}</div>}
                <button role="option" aria-selected={k === i} className={`palette-item${k === i ? ' on' : ''}${c.disabled ? ' off' : ''}`} onMouseMove={() => k !== i && setI(k)} onClick={() => run(c)}>
                  {q && <span className="pg">{c.group}</span>}
                  <span className="pl">{c.label}</span>
                  {c.note && <span className="pn">{c.note}</span>}
                  <Keys keys={c.keys} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot"><Keys keys="↑" /><Keys keys="↓" /> choose · <Keys keys="Enter" /> do it · <Keys keys="Esc" /> close</div>
      </div>
    </div>
  );
}
