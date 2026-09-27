// In-app user guide: renders docs/user-guide.md with a chapter list on the left (jump to any
// chapter; the current one is highlighted as you scroll) and a search box.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

/** Inline markdown: code, bold, italic, links (the guide only uses these). */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
}

/** Markdown → HTML for the guide's subset: headings, paragraphs, nested lists, tables. Returns { html, toc }. */
export function renderGuide(md) {
  const out = [];
  const toc = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let para = [];
  const stack = []; // open lists: { kind, indent }
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeLists = (indent = -1) => {
    while (stack.length && stack.at(-1).indent > indent) out.push(`</li></${stack.pop().kind}>`);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      closeLists();
      const level = h[1].length, text = h[2], id = slug(text);
      if (level > 1) toc.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }
    if (/^\|/.test(l)) {
      flush();
      closeLists();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = l.match(/^(\s*)(?:(-)|(\d+)\.)\s+(.*)$/);
    if (li) {
      flush();
      const indent = li[1].length, kind = li[2] ? 'ul' : 'ol';
      closeLists(indent);
      const top = stack.at(-1);
      if (top && top.indent === indent) out.push('</li>');
      else out.push(`<${kind}>`), stack.push({ kind, indent });
      // Continuation lines (indented further, not a new item) belong to this item
      let text = li[4];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s*(-|\d+\.)\s/.test(lines[i + 1]) && lines[i + 1].match(/^\s*/)[0].length > indent) text += ' ' + lines[++i].trim();
      out.push(`<li>${inline(text)}`);
      continue;
    }
    if (!l.trim()) {
      flush();
      // A blank line inside a list item followed by an indented paragraph keeps the list open
      if (stack.length && i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) continue;
      closeLists();
      continue;
    }
    if (stack.length && /^\s{2,}\S/.test(l)) {
      out.push(`<p>${inline(l.trim())}</p>`);
      continue;
    }
    closeLists();
    para.push(l.trim());
  }
  flush();
  closeLists();
  return { html: out.join('\n'), toc };
}

let loaded = null;

/** Open the guide in `dialog` (with #helpToc, #helpBody, #helpSearch inside). */
export async function openGuide(dialog, { chapter } = {}) {
  const toc = dialog.querySelector('#helpToc'), body = dialog.querySelector('#helpBody'), search = dialog.querySelector('#helpSearch');
  if (!loaded) {
    try {
      const r = await fetch('docs/user-guide.md', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      loaded = renderGuide(await r.text());
    } catch (err) {
      loaded = { html: `<p>Couldn't load the guide (${esc(err.message)}). It's also in the Roomcraft folder: docs/user-guide.md</p>`, toc: [] };
    }
    body.innerHTML = loaded.html;
    toc.innerHTML = loaded.toc.map((t) => `<a href="#${t.id}" data-id="${t.id}" class="l${t.level}">${esc(t.text)}</a>`).join('');
    toc.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-id]');
      if (!a) return;
      e.preventDefault();
      body.querySelector(`#${CSS.escape(a.dataset.id)}`)?.scrollIntoView({ block: 'start' });
    });
    // Highlight the chapter being read
    body.addEventListener('scroll', () => {
      let cur = null;
      for (const h of body.querySelectorAll('h2, h3')) if (h.offsetTop - body.scrollTop < 60) cur = h.id;
      for (const a of toc.querySelectorAll('a')) a.classList.toggle('on', a.dataset.id === cur);
    });
    // Search: show only matching sections, highlight the words
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const blocks = [...body.children];
      let sectionShown = false, headerEls = [];
      for (const el of blocks) {
        el.hidden = false;
        el.querySelectorAll('mark').forEach((m) => m.replaceWith(m.textContent));
      }
      if (!q) return;
      // Group blocks by h3/h2 section
      let group = [];
      const groups = [];
      for (const el of blocks) {
        if (/^H[123]$/.test(el.tagName) && group.length) groups.push(group), (group = []);
        group.push(el);
      }
      groups.push(group);
      for (const g of groups) {
        const hit = g.some((el) => el.textContent.toLowerCase().includes(q));
        for (const el of g) el.hidden = !hit;
        if (hit) sectionShown = true;
        void headerEls;
      }
      if (!sectionShown) return;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(q)) hits.push(walker.currentNode);
      for (const n of hits.slice(0, 200)) {
        const i = n.nodeValue.toLowerCase().indexOf(q);
        const m = document.createElement('mark');
        const after = n.splitText(i);
        after.splitText(q.length);
        m.textContent = after.nodeValue;
        after.replaceWith(m);
      }
    });
  }
  dialog.showModal();
  if (chapter) body.querySelector(`#${CSS.escape(chapter)}`)?.scrollIntoView({ block: 'start' });
  setTimeout(() => search.focus(), 0);
}
