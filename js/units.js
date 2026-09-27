// Number fields that understand people: "2.4 m", "240", "1.2 m + 30 cm", "3 × 60", "2,4".
// Pure maths, also tested in Node.
const TO_M = { mm: 0.001, cm: 0.01, m: 1 };

/**
 * Evaluate what someone typed into a length field whose unit is `unit` ('cm', 'm', 'mm' or
 * null for plain numbers). Returns the value in that unit, or null if it doesn't make sense.
 */
export function evalNumber(text, unit = null) {
  const src = String(text ?? '').trim().toLowerCase().replace(/,(?=\d)/g, '.').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!src) return null;
  const toks = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|m)?(?![a-z])|([-+*/()]))/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(i))) break;
      return null;
    }
    i = re.lastIndex;
    if (m[1] != null) {
      let v = parseFloat(m[1]);
      if (m[2] && unit && TO_M[unit]) v = (v * TO_M[m[2]]) / TO_M[unit];
      toks.push({ n: v });
    } else toks.push({ op: m[3] });
  }
  let k = 0;
  const peek = () => toks[k]?.op;
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = toks[k++].op === '+' ? v + term() : v - term();
    return v;
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = toks[k++].op === '*' ? v * factor() : v / factor();
    return v;
  }
  function factor() {
    const t = toks[k++];
    if (!t) return NaN;
    if (t.op === '-') return -factor();
    if (t.op === '+') return factor();
    if (t.op === '(') {
      const v = expr();
      return toks[k++]?.op === ')' ? v : NaN;
    }
    return t.n ?? NaN;
  }
  const v = expr();
  return k === toks.length && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
}

/** The unit a field shows, from its label: "Width (cm)", "Position (cm)", "Height (m)". */
export function unitFromLabel(text) {
  const m = /\((mm|cm|m)\)|\b(mm|cm|m)\b\s*$/.exec(String(text || '').trim());
  return m ? m[1] || m[2] : null;
}
