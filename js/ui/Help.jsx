// In-app user guide: docs/user-guide.md with a chapter list (jump to any chapter; the one being
// read is highlighted) and a search box that shows only matching sections.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './controls.js';
import { renderGuide } from '../js/help.js';

let cache = null;
async function loadGuide() {
  if (cache) return cache;
  try {
    const r = await fetch('docs/user-guide.md', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cache = renderGuide(await r.text());
  } catch (err) {
    return { html: `<p>Couldn't load the guide (${String(err.message).replace(/</g, '&lt;')}). It's also in the Roomcraft folder: docs/user-guide.md</p>`, toc: [] };
  }
  return cache;
}

function Guide({ chapter, close }) {
  const [guide, setGuide] = useState(null);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(null);
  const body = useRef(null);
  useEffect(() => void loadGuide().then(setGuide), []);
  const html = useMemo(() => ({ __html: guide?.html || '<p class="muted">Loading…</p>' }), [guide]);
  useEffect(() => {
    if (guide && chapter) body.current?.querySelector(`#${CSS.escape(chapter)}`)?.scrollIntoView({ block: 'start' });
  }, [guide]);
  // Search: show only matching sections and highlight the words (DOM work on the rendered guide)
  useEffect(() => {
    const el = body.current;
    if (!el || !guide) return;
    const blocks = [...el.children];
    for (const b of blocks) {
      b.hidden = false;
      b.querySelectorAll('mark').forEach((m) => m.replaceWith(m.textContent));
      b.normalize();
    }
    const s = q.trim().toLowerCase();
    if (!s) return;
    const groups = [];
    let group = [];
    for (const b of blocks) {
      if (/^H[123]$/.test(b.tagName) && group.length) groups.push(group), (group = []);
      group.push(b);
    }
    groups.push(group);
    let any = false;
    for (const g of groups) {
      const hit = g.some((b) => b.textContent.toLowerCase().includes(s));
      for (const b of g) b.hidden = !hit;
      any ||= hit;
    }
    if (!any) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(s)) hits.push(walker.currentNode);
    for (const n of hits.slice(0, 200)) {
      const i = n.nodeValue.toLowerCase().indexOf(s);
      const after = n.splitText(i);
      after.splitText(s.length);
      const m = document.createElement('mark');
      m.textContent = after.nodeValue;
      after.replaceWith(m);
    }
  }, [q, guide]);
  const onScroll = () => {
    let c = null;
    for (const h of body.current.querySelectorAll('h2, h3')) if (h.offsetTop - body.current.scrollTop < 60) c = h.id;
    if (c !== cur) setCur(c);
  };
  return (
    <>
      <div className="help-layout">
        <nav className="help-nav">
          <input id="helpSearch" type="search" placeholder="Search the guide…" aria-label="Search the guide" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          <div id="helpToc" className="help-toc">
            {guide?.toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} data-id={t.id} className={`l${t.level}${cur === t.id ? ' on' : ''}`}
                onClick={(e) => (e.preventDefault(), body.current.querySelector(`#${CSS.escape(t.id)}`)?.scrollIntoView({ block: 'start' }))}>{t.text}</a>
            ))}
          </div>
        </nav>
        <article id="helpBody" className="help-body" ref={body} onScroll={onScroll} dangerouslySetInnerHTML={html} />
      </div>
      <button className="icon-btn help-close" aria-label="Close" title="Close (Esc)" onClick={close}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
    </>
  );
}

export default function Help() {
  return (
    <Dialog name="help" className="help-dialog" label="User guide">
      {(data, close) => <Guide chapter={typeof data === 'string' ? data : null} close={close} />}
    </Dialog>
  );
}
