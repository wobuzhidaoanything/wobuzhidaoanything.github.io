// Hover tips for every button: what it does, and its shortcut as keys. Reads the elements'
// `title` (moved to data-tip so the browser's own slow tooltip doesn't also show).
import { useEffect, useState } from 'react';
import { useBridge, Keys } from './store.js';

const KEY = '(?:Ctrl|Shift|Alt|Esc|Enter|Delete|Space|Tab|PageUp|PageDown|F\\d{1,2}|[A-Z0-9?,\\[\\]])';
const SHORTCUT = new RegExp(`\\s*\\((${KEY}(?:\\+${KEY})*(?:(?: or |, )${KEY}(?:\\+${KEY})*)*)\\)\\s*$`);

/** "Undo (Ctrl+Z)" → { text: 'Undo', keys: 'Ctrl+Z' } */
export function splitTip(tip) {
  const m = SHORTCUT.exec(tip);
  return m ? { text: tip.slice(0, m.index), keys: m[1].replace(/, /g, ' or ') } : { text: tip, keys: null };
}

export default function Tooltip() {
  const [, app] = useBridge();
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let timer, current;
    const hide = () => (clearTimeout(timer), (current = null), setTip(null));
    const over = (e) => {
      const el = e.target.closest?.('[title], [data-tip]');
      if (el === current) return;
      hide();
      if (!el || el.closest('.label-layer, dialog.help-dialog .help-body')) return;
      if (el.hasAttribute('title')) {
        el.dataset.tip = el.getAttribute('title');
        el.removeAttribute('title');
        if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', splitTip(el.dataset.tip).text);
      }
      if (!el.dataset.tip || app?.settings().tips === false) return;
      current = el;
      timer = setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        setTip({ ...splitTip(el.dataset.tip), x: r.left + r.width / 2, y: r.bottom + 8, above: r.bottom + 60 > innerHeight, top: r.top - 8 });
      }, 450);
    };
    addEventListener('pointerover', over);
    addEventListener('pointerdown', hide, true);
    addEventListener('keydown', hide, true);
    addEventListener('scroll', hide, true);
    return () => {
      removeEventListener('pointerover', over);
      removeEventListener('pointerdown', hide, true);
      removeEventListener('keydown', hide, true);
      removeEventListener('scroll', hide, true);
    };
  }, [app]);

  if (!tip) return null;
  const left = Math.max(8, Math.min(innerWidth - 8, tip.x));
  return (
    <div className={`tooltip${tip.above ? ' above' : ''}`} role="tooltip" style={{ left, top: tip.above ? tip.top : tip.y }} ref={(el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
      if (dx) el.style.marginLeft = `${dx}px`;
    }}>
      {tip.text}
      {tip.keys && <Keys keys={tip.keys} />}
    </div>
  );
}
