// Small building blocks shared by the panels: number fields that take units and sums, colour
// pickers that preview live and save when you let go, segmented buttons, dialogs and icons.
import { useEffect, useRef, useState } from 'react';
import { evalNumber } from '../js/units.js';
import { bridge, useBridge, closeDialog } from './store.js';

const fmt = (v) => (v == null || Number.isNaN(v) ? '' : String(Math.round(v * 1000) / 1000));

/**
 * A number field. Accepts "240", "2.4 m", "1.2 m + 30 cm", "3 x 60" (converted to `unit`).
 * Saves on Enter or when you leave the field; ↑/↓ step it (Shift: 10 steps).
 */
export function Num({ value, unit = null, step = 1, min, max, onCommit, id, title, placeholder, disabled }) {
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  const commit = (t = text) => {
    if (!String(t).trim() && placeholder) return onCommit?.(null);
    const v = evalNumber(t, unit);
    if (v == null) {
      if (String(t).trim()) bridge.app?.toast(`“${t}” isn’t a number Roomcraft understands. Try 240, 2.4 m or 1.2 m + 30 cm.`);
      return setText(fmt(value));
    }
    let nv = v;
    if (min != null) nv = Math.max(min, nv);
    if (max != null) nv = Math.min(max, nv);
    setText(fmt(nv));
    if (nv !== value) onCommit?.(nv);
  };
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-num=""
      disabled={disabled}
      placeholder={placeholder}
      data-tip={title || (unit ? `Type a number in ${unit}, or with a unit (2.4 m, 85 cm) or a sum (1.2 m + 30 cm). ↑/↓ change it.` : undefined)}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => ((focused.current = false), commit())}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.preventDefault(), commit(), e.currentTarget.select());
        else if (e.key === 'Escape') (setText(fmt(value)), e.currentTarget.blur());
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const v = evalNumber(text, unit) ?? value ?? 0;
          const t = fmt(Math.round((v + step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)) * 1000) / 1000);
          setText(t);
          commit(t);
        }
      }}
    />
  );
}

/** Labelled number field (the label names the unit). */
export function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <Num {...props} />
    </label>
  );
}

/** Colour picker: onLive while dragging the picker, onCommit when it closes. */
export function Color({ value, onLive, onCommit, id, title }) {
  const ref = useRef(null);
  const cb = useRef({});
  cb.current = { onLive, onCommit };
  useEffect(() => {
    const el = ref.current;
    const live = () => cb.current.onLive?.(el.value);
    const done = () => cb.current.onCommit?.(el.value);
    el.addEventListener('input', live);
    el.addEventListener('change', done);
    return () => (el.removeEventListener('input', live), el.removeEventListener('change', done));
  }, []);
  useEffect(() => {
    if (ref.current && ref.current.value !== value && document.activeElement !== ref.current) ref.current.value = value;
  }, [value]);
  return <input ref={ref} type="color" id={id} defaultValue={value} data-tip={title} />;
}

/** Segmented buttons: options = [[value, label], …] */
export function Seg({ value, options, onChange, className = 'small-seg' }) {
  return (
    <div className={className}>
      {options.map(([v, label]) => (
        <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** A modal dialog opened with openDialog(name, data); its children only exist while it's open. */
export function Dialog({ name, className = '', children, label }) {
  const [{ dialogs }] = useBridge();
  const data = dialogs[name];
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (data && !d.open) d.showModal();
    if (!data && d.open) d.close();
  }, [data]);
  return (
    <dialog ref={ref} id={`${name}Dialog`} className={`dialog ${className}`} aria-label={label} onClose={() => bridge.state.dialogs[name] && closeDialog(name)}>
      {data ? children(data, () => closeDialog(name)) : null}
    </dialog>
  );
}

/** Close a popover when clicking anywhere else. */
export function useOutside(ref, open, close, ignore) {
  useEffect(() => {
    if (!open) return;
    const down = (e) => !ref.current?.contains(e.target) && !(ignore && e.target.closest?.(ignore)) && close();
    const key = (e) => e.key === 'Escape' && close();
    const t = setTimeout(() => (addEventListener('pointerdown', down, true), addEventListener('keydown', key, true)));
    return () => (clearTimeout(t), removeEventListener('pointerdown', down, true), removeEventListener('keydown', key, true));
  }, [open]);
}

export const Svg = ({ d, children, viewBox = '0 0 24 24' }) => <svg viewBox={viewBox}>{d ? <path d={d} /> : children}</svg>;
