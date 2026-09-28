// First-run tour: five short stops around the screen. Replay it from Settings or Help.
import { useEffect, useLayoutEffect, useState } from 'react';
import { useBridge, set, Keys } from './store.js';

export const STEPS = [
  { sel: '#designBtn', title: 'Your houses', text: 'Switch between designs, start a new house or open earlier versions. Everything saves by itself, on this computer.' },
  { sel: '#modeSeg', title: 'Furnish or Build', text: 'Furnish is for furniture, colours and finishes. Build is for walls, doors, windows, stairs and floors.', keys: 'E' },
  { sel: '#viewSeg', title: 'Look at it your way', text: '3D dollhouse, flat floor plan, both side by side, or walk through it like a game.', keys: '1 or 2 or 4 or 3' },
  { sel: '#toolDock', title: 'Your tools', text: 'What a click does: select, measure, paint, and in Build mode draw walls, doors, windows and stairs. Esc always goes back to Select.' },
  { sel: '#linkBox', title: 'Add real furniture', text: 'Paste a product link from any shop. Roomcraft reads its size and colours, and your AI agent can build a realistic 3D model from the photos.' },
  { sel: '#viewDock', title: 'What you see', text: 'Cut or full walls, real sun and shadows, dimensions and the grid, and zoom to fit.', keys: 'F' },
  { sel: '#cmdBtn', title: 'Can’t find something?', text: 'Search every action by name. Right-click anything in the 3D view for what you can do with it.', keys: 'Ctrl+K' },
];

export default function Tour() {
  const [{ tour }, app] = useBridge();
  const [rect, setRect] = useState(null);
  const step = STEPS[tour];

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.sel);
    if (!el || !el.getClientRects().length) {
      // Not on screen (panel hidden): skip it
      set({ tour: tour + 1 < STEPS.length ? tour + 1 : -1 });
      return;
    }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [tour]);

  useEffect(() => {
    if (!step) return;
    const key = (e) => {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

  if (!step || !rect) return null;
  function end() {
    set({ tour: -1 });
    try {
      localStorage.setItem('roomcraft.pref.tourDone', 'true');
    } catch {}
    app?.tourEnded?.();
  }
  function next() {
    tour + 1 < STEPS.length ? set({ tour: tour + 1 }) : end();
  }
  function back() {
    tour > 0 && set({ tour: tour - 1 });
  }
  const pad = 6;
  const below = rect.bottom + 200 < innerHeight;
  const cardLeft = Math.max(12, Math.min(innerWidth - 332, rect.left + rect.width / 2 - 160));
  return (
    <div className="tour">
      <svg className="tour-dim" width={innerWidth} height={innerHeight}>
        <path fillRule="evenodd" d={`M0 0H${innerWidth}V${innerHeight}H0Z M${rect.left - pad} ${rect.top - pad}h${rect.width + pad * 2}v${rect.height + pad * 2}h${-(rect.width + pad * 2)}Z`} />
      </svg>
      <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="tour-card" role="dialog" aria-label={step.title} style={{ left: cardLeft, ...(below ? { top: rect.bottom + 14 } : { bottom: innerHeight - rect.top + 14 }) }}>
        <div className="tour-count">{tour + 1} of {STEPS.length}</div>
        <b>{step.title}</b>
        <p>{step.text}</p>
        {step.keys && <div className="tour-keys">Shortcut: <Keys keys={step.keys} /></div>}
        <div className="actions">
          <button className="btn small ghost" onClick={end}>Skip</button>
          <span className="spacer"></span>
          {tour > 0 && <button className="btn small" onClick={back}>Back</button>}
          <button className="btn small primary" onClick={next} autoFocus>{tour + 1 < STEPS.length ? 'Next' : 'Start designing'}</button>
        </div>
      </div>
    </div>
  );
}
