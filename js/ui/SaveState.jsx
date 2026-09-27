// "Saved" / "Saving…" / "Not saved" next to the design name.
import { useEffect, useState } from 'react';
import { useBridge } from './store.js';

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? 'just now' : s < 60 ? `${s} seconds ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function SaveState() {
  const [{ save }] = useBridge();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const { status, at } = save;
  const label = { saved: 'Saved', saving: 'Saving…', error: 'Not saved' }[status];
  const tip = status === 'saved' ? `Saved on this computer${at ? ` ${ago(at)}` : ''}. Earlier versions are in History.` : status === 'saving' ? 'Saving your latest change…' : 'Couldn’t save yet; retrying. Your changes are kept.';
  return (
    <span className={`save-state ${status}`} data-tip={tip} aria-live="polite">
      <i />
      {label}
    </span>
  );
}
