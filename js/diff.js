// What changed between two versions of a design, in words ("2 walls moved, a sofa added"),
// for the Assistant's change cards. Pure; tested in Node.
const byId = (list = []) => new Map(list.map((x) => [x.id, x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n, word) => (n === 1 ? `1 ${word}` : `${n} ${word === 'stairs' ? word : word + 's'}`);

/** Short sentences describing how design `a` became `b`. `nameOf(itemId)` names furniture. */
export function describeChange(a, b, nameOf = () => null) {
  const out = [];
  if ((a.name || '') !== (b.name || '')) out.push(`renamed to “${b.name}”`);
  const fa = byId(a.floors), fb = byId(b.floors);
  for (const f of b.floors) if (!fa.has(f.id)) out.push(`${f.name} added`);
  for (const f of a.floors) if (!fb.has(f.id)) out.push(`${f.name} removed`);
  for (const f of b.floors) {
    const g = fa.get(f.id);
    if (!g) continue;
    const parts = [];
    for (const [key, word] of [['walls', 'wall'], ['openings', 'door or window'], ['stairs', 'stairs'], ['rooms', 'room']]) {
      const A = byId(g[key]), B = byId(f[key]);
      const added = [...B.keys()].filter((k) => !A.has(k)).length;
      const removed = [...A.keys()].filter((k) => !B.has(k)).length;
      const changed = [...B.keys()].filter((k) => A.has(k) && !same(A.get(k), B.get(k))).length;
      if (added) parts.push(`${plural(added, word).replace('door or windows', 'doors or windows')} added`);
      if (removed) parts.push(`${plural(removed, word).replace('door or windows', 'doors or windows')} removed`);
      if (changed) parts.push(`${plural(changed, word).replace('door or windows', 'doors or windows')} changed`);
    }
    const A = byId(g.placed), B = byId(f.placed);
    const name = (p) => nameOf(p.itemId) || 'an item';
    const addedItems = [...B.values()].filter((p) => !A.has(p.id));
    const removedItems = [...A.values()].filter((p) => !B.has(p.id));
    const moved = [...B.values()].filter((p) => A.has(p.id) && !same(A.get(p.id), p));
    const list = (ps) => (ps.length <= 2 ? ps.map(name).join(' and ') : `${ps.length} items`);
    if (addedItems.length) parts.push(`${list(addedItems)} added`);
    if (removedItems.length) parts.push(`${list(removedItems)} removed`);
    if (moved.length) parts.push(`${list(moved)} moved or changed`);
    if (g.height !== f.height || g.slab !== f.slab) parts.push('height changed');
    if (g.name !== f.name) parts.push(`renamed to “${f.name}”`);
    if (parts.length) out.push(`${f.name}: ${parts.join(', ')}`);
  }
  if (!out.length && !same({ ...a, updatedAt: 0, updatedBy: 0 }, { ...b, updatedAt: 0, updatedBy: 0 })) out.push('house settings changed');
  return out;
}
