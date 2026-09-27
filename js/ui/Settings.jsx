// Settings: appearance, graphics, money, help and the assistant.
import { useEffect, useRef } from 'react';
import { useBridge, set } from './store.js';

const CURRENCIES = ['SGD', 'MYR', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'JPY', 'CNY', 'HKD', 'INR', 'IDR', 'THB', 'PHP', 'KRW'];

function Seg({ value, options, onChange }) {
  return (
    <div className="small-seg">
      {options.map(([v, label]) => (
        <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const [{ settings: open }, app] = useBridge();
  const dlg = useRef(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!app) return null;
  const s = app.settings();
  const put = (k) => (v) => app.setSetting(k, v);
  return (
    <dialog ref={dlg} className="dialog settings" onClose={() => set({ settings: false })}>
      <h3>Settings</h3>
      <div className="set-row">
        <div><b>Appearance</b><span>Dark mode is easier on the eyes at night. “System” follows your computer.</span></div>
        <Seg value={s.theme} onChange={put('theme')} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
      </div>
      <div className="set-row">
        <div><b>Graphics</b><span>High has soft shadows and ambient light. Fast is for older computers.</span></div>
        <Seg value={s.quality} onChange={put('quality')} options={[['high', 'High'], ['low', 'Fast']]} />
      </div>
      <div className="set-row">
        <div><b>Currency</b><span>For prices and budget totals. Prices in other currencies are listed separately.</span></div>
        <select value={s.currency} onChange={(e) => put('currency')(e.target.value)}>
          {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="set-row">
        <div><b>Budget</b><span>Optional. Shown against the furniture total.</span></div>
        <input className="set-num" inputMode="decimal" placeholder="None" defaultValue={s.budget || ''} onChange={(e) => put('budget')(parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
      </div>
      <div className="set-row">
        <div><b>Tips on hover</b><span>Explains each button and shows its shortcut key.</span></div>
        <Seg value={s.tips ? 'on' : 'off'} onChange={(v) => put('tips')(v === 'on')} options={[['on', 'On'], ['off', 'Off']]} />
      </div>
      <div className="set-row">
        <div><b>Model product links with my agent</b><span>Every link you paste is sent to your AI agent, which builds a realistic, compact 3D model from the photos.</span></div>
        <Seg value={s.autoModel ? 'on' : 'off'} onChange={(v) => put('autoModel')(v === 'on')} options={[['on', 'On'], ['off', 'Off']]} />
      </div>
      <div className="set-row">
        <div><b>Getting started</b><span>A one-minute tour of the main controls.</span></div>
        <button type="button" className="btn small" onClick={() => (set({ settings: false }), app.startTour())}>Show the tour</button>
      </div>
      <div className="actions"><span className="spacer"></span><button type="button" className="btn primary" onClick={() => set({ settings: false })}>Done</button></div>
    </dialog>
  );
}
