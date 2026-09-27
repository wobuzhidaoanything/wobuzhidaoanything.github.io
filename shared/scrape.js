// Universal product-page reader, run by the local server (npm start). Pure string parsing,
// so it also runs in the browser (category guesses) and in tests.
//
// Strategy, most reliable first:
//   1. Store-specific JSON APIs (Shopify /products/<handle>.js, IKEA 3D lookup)
//   2. schema.org JSON-LD (Product / ProductGroup / hasVariant)
//   3. Embedded state blobs (Amazon twister data, __NEXT_DATA__, etc.) via key regexes
//   4. Visible text: labelled dimensions ("Width: 228 cm") and triplets ("80"W x 35"D x 30"H")
//   5. OpenGraph / <title> for name and image

import { colorFromName, isColorName } from './colors.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const CATEGORIES = [
  ['sofa', ['sectional', 'sofa', 'couch', 'loveseat', 'settee', 'chesterfield', 'daybed', 'futon']],
  ['armchair', ['armchair', 'accent chair', 'lounge chair', 'recliner', 'wingback', 'club chair', 'rocking chair']],
  ['bed', ['bed frame', 'bed', 'bunk', 'mattress', 'divan']],
  ['wardrobe', ['wardrobe', 'armoire', 'closet', 'pax']],
  ['bookshelf', ['bookcase', 'bookshelf', 'shelving unit', 'shelf unit', 'shelving', 'etagere', 'kallax', 'billy', 'shelf']],
  ['dresser', ['dresser', 'chest of drawers', 'drawer', 'malm']],
  ['nightstand', ['nightstand', 'bedside table', 'night table', 'bedside']],
  ['tvstand', ['tv stand', 'tv bench', 'tv unit', 'media console', 'entertainment center', 'tv cabinet']],
  ['sideboard', ['sideboard', 'buffet', 'credenza', 'console table', 'cabinet', 'cupboard', 'storage']],
  ['desk', ['desk', 'workstation', 'writing table', 'computer table']],
  ['coffeetable', ['coffee table', 'cocktail table']],
  ['sidetable', ['side table', 'end table', 'accent table']],
  ['table', ['dining table', 'kitchen table', 'table']],
  ['stool', ['bar stool', 'stool', 'counter stool']],
  ['ottoman', ['ottoman', 'pouf', 'pouffe', 'footstool', 'bench']],
  ['chair', ['dining chair', 'office chair', 'desk chair', 'chair', 'seat']],
  ['floorlamp', ['floor lamp', 'standing lamp', 'arc lamp', 'torchiere']],
  ['lamp', ['table lamp', 'desk lamp', 'lamp', 'light', 'pendant']],
  ['rug', ['rug', 'carpet', 'runner', 'mat']],
  ['plant', ['plant', 'planter', 'tree', 'ficus', 'monstera', 'pot']],
  ['tv', ['television', ' tv ', 'oled', 'qled', 'smart tv', 'monitor']],
  ['mirror', ['mirror']],
  ['curtain', ['curtain', 'drape']],
];

// Generic words that only decide the category when nothing more specific matches
// ("Coffee table with storage" is a coffee table, not a cabinet).
const WEAK = new Set(['storage', 'cabinet', 'cupboard', 'drawer', 'seat', 'light', 'pot', 'mat', 'shelf', 'bench', 'tree', 'runner', 'monitor', 'bedside']);

export function guessCategory(...texts) {
  const sources = texts.filter(Boolean).map((t) => ' ' + String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ');
  const matches = (s, w) => s.includes(w.length <= 4 || WEAK.has(w) ? ' ' + w.trim() : w);
  // Title first, so breadcrumbs ("Living room > Sofas") don't override a "coffee table" title.
  for (const weak of [false, true]) {
    for (const s of sources) {
      for (const [cat, words] of CATEGORIES) {
        if (words.some((w) => WEAK.has(w) === weak && matches(s, w))) return cat;
      }
    }
  }
  return 'box';
}

// ---------- helpers ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", times: '×', frac12: '½', rdquo: '"', ldquo: '"', prime: '′', Prime: '″' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/dt|\/dd|\/td|\/th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*/g, '\n');
}

function meta(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${key.replace(/[.:]/g, '\\$&')}["'][^>]*>`,
    'i'
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const c = tag.match(/content=["']([^"']*)["']/i);
  return c ? decodeEntities(c[1]).trim() : null;
}

function absolutize(u, base) {
  if (!u) return null;
  try {
    return new URL(decodeEntities(String(u)).replace(/\\\//g, '/'), base).href;
  } catch {
    return null;
  }
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

// ---------- units & dimensions ----------

const UNIT_RE = '(mm|cm|m|in(?:ch(?:es)?)?\\.?|"|″|”|\'\'|ft|feet|foot|\'|′)';
const NUM_RE = '(\\d+(?:[.,]\\d+)?(?:\\s+\\d/\\d+|\\s*[½¼¾])?)';

function parseNum(s) {
  s = String(s).trim();
  let extra = 0;
  const frac = s.match(/\s+(\d)\/(\d+)$/);
  if (frac) {
    extra = +frac[1] / +frac[2];
    s = s.slice(0, frac.index);
  }
  const uni = s.match(/\s*([½¼¾])$/);
  if (uni) {
    extra += { '½': 0.5, '¼': 0.25, '¾': 0.75 }[uni[1]];
    s = s.slice(0, uni.index);
  }
  // "1,234" (thousands) vs "12,5" (decimal comma)
  if (/^\d{1,3},\d{3}$/.test(s)) s = s.replace(',', '');
  else s = s.replace(',', '.');
  return parseFloat(s) + extra;
}

export function toMeters(value, unit) {
  const u = String(unit || '').toLowerCase().replace(/\.$/, '');
  if (u === 'mm' || u === 'mmt') return value / 1000;
  if (u === 'cm' || u === 'cmt') return value / 100;
  if (u === 'm' || u === 'mtr') return value;
  if (['in', 'inch', 'inches', '"', '″', '”', "''", 'inh'].includes(u)) return value * 0.0254;
  if (['ft', 'feet', 'foot', "'", '′', 'fot'].includes(u)) return value * 0.3048;
  return null;
}

// Parses things like "80 cm", "31.5\"", {value: 80, unitCode: "CMT"}, "2' 6\"".
export function parseLength(v, fallbackUnit) {
  if (v == null) return null;
  if (typeof v === 'number') return fallbackUnit ? toMeters(v, fallbackUnit) : null;
  if (typeof v === 'object') {
    const val = v.value ?? v.amount ?? v['@value'];
    const unit = v.unitCode || v.unitText || v.unit || fallbackUnit;
    if (val == null) return null;
    const n = typeof val === 'number' ? val : parseNum(val);
    return Number.isFinite(n) ? toMeters(n, unit) : parseLength(String(val), unit);
  }
  const s = decodeEntities(String(v));
  const ftIn = s.match(/(\d+(?:\.\d+)?)\s*(?:'|′|ft|feet)\s*(\d+(?:\.\d+)?)\s*(?:"|″|in)/i);
  if (ftIn) return +ftIn[1] * 0.3048 + +ftIn[2] * 0.0254;
  const m = s.match(new RegExp(NUM_RE + '\\s*' + UNIT_RE + '?', 'i'));
  if (!m) return null;
  const n = parseNum(m[1]);
  return toMeters(n, m[2] || fallbackUnit);
}

const plausible = (m) => m != null && Number.isFinite(m) && m >= 0.005 && m <= 12;

const SKIP_CONTEXT = /(package|packaging|carton|shipping|parcel|box|seat|arm|leg|back ?rest|backrest|cushion|drawer|shelf|mattress|inner|interior|clearance|opening|cord|cable|pillow|headboard|min\.?|max\.?|shade)\s*$/i;

/**
 * Finds width/depth/height in free text. Returns {w,d,h} in metres (fields may be missing)
 * plus the matched snippet.
 */
export function dimsFromText(text) {
  const out = {};
  let snippet = null;
  const t = text.replace(/\s+/g, ' ');

  // 1. Labelled values: "Width: 228 cm", "Overall Depth - 95cm", "Height 33.5 in"
  const labelRe = new RegExp(
    `(overall |total |product |assembled |item )?(width|depth|height|length|diameter|w|d|h|l)\\s*(?:\\(([a-z"]+)\\))?\\s*[:=\\-–]?\\s*${NUM_RE}\\s*${UNIT_RE}?(?![a-z])`,
    'gi'
  );
  const labelled = { w: [], d: [], h: [], l: [], dia: [] };
  let m;
  while ((m = labelRe.exec(t))) {
    const label = m[2].toLowerCase();
    // Single-letter labels need a delimiter so we don't match "w" inside words.
    if (label.length === 1 && !/[\s(,;|]|^/.test(t[m.index - 1] || ' ')) continue;
    if (label.length === 1 && !/[:=\-–]/.test(m[0]) && !m[5]) continue;
    const before = t.slice(Math.max(0, m.index - 28), m.index);
    if (!m[1] && SKIP_CONTEXT.test(before)) continue;
    const unit = m[5] || m[3];
    if (!unit) continue;
    const val = toMeters(parseNum(m[4]), unit);
    if (!plausible(val)) continue;
    const key = { width: 'w', w: 'w', depth: 'd', d: 'd', height: 'h', h: 'h', length: 'l', l: 'l', diameter: 'dia' }[label];
    labelled[key].push({ val, overall: !!m[1], i: m.index, raw: m[0] });
  }
  const pick = (arr) => (arr.find((x) => x.overall) || arr[0])?.val;
  if (labelled.w.length || labelled.h.length || labelled.d.length || labelled.dia.length) {
    out.w = pick(labelled.w) ?? pick(labelled.l) ?? pick(labelled.dia);
    out.d = pick(labelled.d) ?? (labelled.w.length ? pick(labelled.l) : undefined) ?? pick(labelled.dia);
    out.h = pick(labelled.h);
    snippet = [labelled.w[0], labelled.d[0], labelled.h[0]].filter(Boolean).map((x) => x.raw).join(' · ');
  }

  // 2. Triplets / pairs: "80"W x 35"D x 30"H", "W 200 x D 90 x H 80 cm", "228 x 95 x 83 cm"
  const part = `(?:([WDHL])\\s*[:.]?\\s*)?${NUM_RE}\\s*${UNIT_RE}?\\s*(?:\\(?([WDHL])\\)?(?![a-z]))?`;
  const sep = '\\s*[x×X*]\\s*';
  const triRe = new RegExp(part + sep + part + '(?:' + sep + part + ')?', 'g');
  let best = null;
  while ((m = triRe.exec(t))) {
    const groups = [m.slice(1, 5), m.slice(5, 9), m.slice(9, 13)].filter((g) => g[1] != null);
    const unit = groups.map((g) => g[2]).filter(Boolean).pop() ||
      (t.slice(m.index + m[0].length, m.index + m[0].length + 12).match(new RegExp('^\\s*' + UNIT_RE, 'i')) || [])[1];
    if (!unit) continue;
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (/(package|packaging|carton|shipping|parcel|box) ?(dimensions|size|measurements)?[^.]{0,30}$/i.test(before)) continue;
    const vals = groups.map((g) => toMeters(parseNum(g[1]), g[2] || unit));
    if (!vals.every(plausible)) continue;
    const letters = groups.map((g) => (g[0] || g[3] || '').toUpperCase());
    const header = (before.match(/\(?\b([LWDH])\s*[x×]\s*([LWDH])(?:\s*[x×]\s*([LWDH]))?\)?[^x×]{0,30}$/i) || []).slice(1).map((c) => (c || '').toUpperCase());
    const order = letters.some(Boolean) ? letters : header.some(Boolean) ? header : ['W', 'D', 'H'].slice(0, vals.length);
    const cand = {};
    const hasL = order.includes('L');
    order.forEach((c, i) => {
      if (vals[i] == null) return;
      if (c === 'L') cand.w = vals[i];
      else if (c === 'W') cand[hasL ? 'd' : 'w'] = vals[i];
      else if (c === 'D') cand.d = vals[i];
      else if (c === 'H') cand.h = vals[i];
    });
    const score = Object.keys(cand).length * 10 + (letters.some(Boolean) ? 5 : 0) +
      (/(dimension|size|measure|overall|product)/i.test(before) ? 4 : 0);
    if (!best || score > best.score) best = { cand, score, raw: m[0] + (groups.at(-1)[2] ? '' : ' ' + unit) };
  }
  if (best) {
    for (const k of ['w', 'd', 'h']) if (out[k] == null && best.cand[k] != null) out[k] = best.cand[k];
    if (!snippet || Object.keys(best.cand).length === 3) snippet = best.raw.trim();
  }
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return { dims: out, snippet };
}

function mergeDims(target, src) {
  for (const k of ['w', 'd', 'h']) if (target[k] == null && src?.[k] != null) target[k] = src[k];
  return target;
}

// ---------- JSON-LD ----------

export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      out.push(node);
      if (node['@graph']) walk(node['@graph']);
    };
    walk(data);
  }
  return out;
}

const hasType = (node, ...types) => {
  const t = [].concat(node['@type'] || []).map(String);
  return types.some((x) => t.includes(x));
};

function productFromJsonLd(nodes, base) {
  const product = nodes.find((n) => hasType(n, 'ProductGroup')) || nodes.find((n) => hasType(n, 'Product', 'IndividualProduct', 'ProductModel'));
  if (!product) return null;
  const res = { dims: {}, colors: [], images: [] };
  res.name = decodeEntities(first(product.name) || '').trim() || null;
  res.brand = decodeEntities(first(product.brand)?.name || (typeof product.brand === 'string' ? product.brand : '') || '') || null;
  const img = first(product.image);
  res.image = absolutize(typeof img === 'object' ? img?.url || img?.contentUrl : img, base);
  res.images = [product.image].flat(2).map((x) => absolutize(typeof x === 'object' ? x?.url || x?.contentUrl : x, base)).filter(Boolean);
  res.description = decodeEntities(String(product.description || '')).slice(0, 4000);
  const offer = first(product.offers?.offers || product.offers);
  if (offer) {
    res.price = offer.price ?? offer.lowPrice ?? null;
    res.currency = offer.priceCurrency || null;
  }
  res.category = typeof product.category === 'string' ? product.category : null;

  const readDims = (p) => {
    const d = {};
    const w = parseLength(p.width);
    const dd = parseLength(p.depth);
    const h = parseLength(p.height);
    if (plausible(w)) d.w = w;
    if (plausible(dd)) d.d = dd;
    if (plausible(h)) d.h = h;
    for (const prop of [].concat(p.additionalProperty || [])) {
      const n = String(prop?.name || prop?.propertyID || '').toLowerCase();
      const v = parseLength(prop?.value != null ? { value: prop.value, unitCode: prop.unitCode || prop.unitText } : null) ??
        parseLength(String(prop?.value ?? ''));
      if (!plausible(v) || SKIP_CONTEXT.test(n.replace(/(width|depth|height|length).*$/, ''))) continue;
      if (/width|breite|largeur/.test(n) && d.w == null) d.w = v;
      else if (/depth|tiefe|profondeur/.test(n) && d.d == null) d.d = v;
      else if (/height|höhe|hauteur/.test(n) && d.h == null) d.h = v;
      else if (/length|länge/.test(n) && d.w == null) d.w = v;
      if (/dimension|size|measure/.test(n) && typeof prop.value === 'string') mergeDims(d, dimsFromText(prop.value).dims);
    }
    if (typeof p.size === 'string') mergeDims(d, dimsFromText(p.size).dims);
    return d;
  };
  res.dims = readDims(product);

  const colorOf = (p) => decodeEntities(first(p.color) || '').trim();
  const c0 = colorOf(product);
  if (c0) res.colors.push({ name: c0, image: res.image });
  for (const v of [].concat(product.hasVariant || [])) {
    const name = colorOf(v) || (isColorName(v.name) ? decodeEntities(v.name) : '');
    const vimg = first(v.image);
    if (name) res.colors.push({ name, image: absolutize(typeof vimg === 'object' ? vimg?.url : vimg, base) });
    if (!Object.keys(res.dims).length) mergeDims(res.dims, readDims(v));
  }
  for (const n of nodes) {
    if (hasType(n, 'BreadcrumbList')) {
      res.breadcrumbs = [].concat(n.itemListElement || []).map((e) => e?.name || e?.item?.name).filter(Boolean).join(' > ');
    }
  }
  return res;
}

// ---------- colours from markup ----------

function colorsFromHtml(html) {
  const found = [];
  // Explicit "Color: Grey" / "Colour - Walnut" in text or attributes
  const labelRe = /(?:colou?r|finish)(?:\s*name)?["']?\s*[:=]\s*["']?([^"'<>\n,;{}]{2,40})/gi;
  let m;
  while ((m = labelRe.exec(html))) found.push(m[1]);
  // Swatch-ish elements: <... class="swatch" aria-label="Dark grey">
  const swRe = /<[^>]*(?:swatch|colou?r|variant)[^>]*>/gi;
  while ((m = swRe.exec(html))) {
    const tag = m[0];
    for (const a of tag.matchAll(/(?:aria-label|title|data-value|data-color|data-colour|data-name|alt|value)=["']([^"']{2,50})["']/gi)) found.push(a[1]);
  }
  // Amazon twister: "color_name":["Beige","Dark Grey"]
  for (const a of html.matchAll(/"color_name"\s*:\s*\[([^\]]*)\]/g)) {
    for (const s of a[1].matchAll(/"([^"]{1,60})"/g)) found.push(s[1]);
  }
  // Amazon older markup: title="Click to select Beige"
  for (const a of html.matchAll(/title=["']Click to select ([^"']+)["']/gi)) found.push(a[1]);
  return found
    .map((s) => decodeEntities(s).replace(/^(select|choose|colou?r)\s*[:\-]?\s*/i, '').replace(/\s*(selected|swatch|option|image)$/i, '').trim())
    .filter((s) => s.length <= 40 && isColorName(s) && !/[{}<>=]/.test(s));
}

function dedupeColors(list) {
  const seen = new Map();
  for (const c of list) {
    if (!c?.name) continue;
    const name = c.name.replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, hex: c.hex || colorFromName(name), image: c.image || null });
    else if (!seen.get(key).image && c.image) seen.get(key).image = c.image;
  }
  return [...seen.values()].filter((c) => c.hex).slice(0, 24);
}

// ---------- 3D model discovery ----------

export function findModelUrls(html, base) {
  const urls = new Set();
  for (const m of html.matchAll(/<model-viewer[^>]*\ssrc=["']([^"']+)["']/gi)) urls.add(absolutize(m[1], base));
  const cleaned = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  for (const m of cleaned.matchAll(/(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:glb|gltf)(?:\?[^\s"'<>()\\]*)?(?=["'\s<)\\])/gi)) {
    urls.add(absolutize(m[0], base));
  }
  return [...urls].filter(Boolean).sort((a, b) => (/\.glb/i.test(b) ? 1 : 0) - (/\.glb/i.test(a) ? 1 : 0));
}

// ---------- store adapters ----------

async function fetchText(url, fetchImpl, extraHeaders = {}) {
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      ...extraHeaders,
    },
    redirect: 'follow',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, url: res.url || url };
}

async function shopifyProduct(pageUrl, fetchImpl) {
  const u = new URL(pageUrl);
  const handle = u.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (!handle) return null;
  const prefix = u.pathname.slice(0, u.pathname.indexOf('/products/'));
  const { ok, text } = await fetchText(`${u.origin}${prefix}/products/${handle}.js`, fetchImpl, { accept: 'application/json' });
  if (!ok) return null;
  let p;
  try {
    p = JSON.parse(text);
  } catch {
    return null;
  }
  const res = { source: 'shopify', dims: {}, colors: [], models: [] };
  res.name = p.title;
  res.brand = p.vendor;
  res.category = p.type;
  res.image = absolutize(p.featured_image || p.images?.[0], pageUrl);
  res.images = (p.images || []).map((x) => absolutize(x, pageUrl)).filter(Boolean);
  res.price = p.price != null ? (p.price / 100).toFixed(2) : null;
  const descText = htmlToText(p.description || '');
  res.description = descText.slice(0, 4000);
  mergeDims(res.dims, dimsFromText(descText).dims);
  res.dimsText = dimsFromText(descText).snippet;
  const optIndex = (p.options || []).findIndex((o) => /colou?r|finish|fabric|material|upholstery|shade/i.test(o.name || o));
  for (const v of p.variants || []) {
    const name = optIndex >= 0 ? v[`option${optIndex + 1}`] : v.options?.find(isColorName);
    if (name) res.colors.push({ name, image: absolutize(v.featured_image?.src, pageUrl) });
    // Variant titles often carry size: "Large / 220 x 95 cm"
    mergeDims(res.dims, dimsFromText(v.title || '').dims);
  }
  for (const media of p.media || []) {
    if (media.media_type === 'model') {
      const glb = (media.sources || []).find((s) => s.format === 'glb') || media.sources?.[0];
      if (glb?.url) res.models.push(absolutize(glb.url, pageUrl));
    }
  }
  return res;
}

async function ikeaModel(pageUrl, fetchImpl) {
  const u = new URL(pageUrl);
  const item = u.pathname.match(/-(s?\d{8})\/?$/i)?.[1];
  const [, cc = 'us', lang = 'en'] = u.pathname.match(/^\/([a-z]{2})\/([a-z]{2})\//i) || [];
  if (!item) return null;
  try {
    const { ok, text } = await fetchText(
      `https://web-api.ikea.com/${cc}/${lang}/rotera/data/exists/${item.replace(/^s/i, '')}/`,
      fetchImpl,
      { accept: 'application/json' }
    );
    if (!ok) return null;
    const url = text.match(/"(?:modelUrl|model_url|url)"\s*:\s*"([^"]+\.glb[^"]*)"/i)?.[1] || findModelUrls(text, pageUrl)[0];
    return url ? absolutize(url, pageUrl) : null;
  } catch {
    return null;
  }
}

function amazonExtras(html) {
  const res = { dims: {}, colors: [] };
  const title = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)</i)?.[1];
  if (title) res.name = decodeEntities(title).trim();
  const img = html.match(/"hiRes"\s*:\s*"(https:[^"]+)"/)?.[1] || html.match(/data-old-hires=["'](https:[^"']+)["']/)?.[1];
  if (img) res.image = img;
  // Product details tables: <th> Product Dimensions </th><td> 35"D x 80"W x 33"H </td>
  const rows = [...html.matchAll(/<(?:th|span)[^>]*>\s*([^<]*(?:Dimensions|Size)[^<]*)<\/(?:th|span)>[\s\S]{0,200}?<(?:td|span)[^>]*>([\s\S]*?)<\/(?:td|span)>/gi)];
  for (const r of rows) {
    if (/package|shipping/i.test(r[1])) continue;
    const found = dimsFromText(htmlToText(r[2]));
    if (Object.keys(found.dims).length) {
      mergeDims(res.dims, found.dims);
      res.dimsText = res.dimsText || found.snippet;
    }
  }
  return res;
}

// ---------- main ----------

export async function scrapeProduct(inputUrl, { fetchImpl = fetch } = {}) {
  let url;
  try {
    url = new URL(String(inputUrl).trim());
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported.');

  const page = await fetchText(url.href, fetchImpl);
  if (!page.ok && page.status >= 400) {
    const blocked = page.status === 403 || page.status === 503 || /captcha|robot check/i.test(page.text);
    throw new Error(blocked ? `The store blocked the request (HTTP ${page.status}). Add the item manually or try another listing.` : `Store returned HTTP ${page.status}.`);
  }
  return parseProductPage(page.text, page.url, { fetchImpl });
}

export async function parseProductPage(html, pageUrl, { fetchImpl = null } = {}) {
  const host = new URL(pageUrl).hostname;
  const result = {
    url: pageUrl,
    source: 'generic',
    name: null,
    brand: null,
    image: null,
    price: null,
    currency: null,
    category: 'box',
    dims: {},
    dimsText: null,
    colors: [],
    modelUrl: null,
    notes: [],
  };
  const colors = [];
  const models = [];
  const images = [];
  const take = (src) => {
    if (!src) return;
    images.push(src.image, ...(src.images || []));
    for (const k of ['name', 'brand', 'image', 'price', 'currency', 'dimsText', 'description', 'breadcrumbs']) {
      if (result[k] == null && src[k] != null && src[k] !== '') result[k] = src[k];
    }
    if (src.category && typeof src.category === 'string') result.rawCategory = result.rawCategory || src.category;
    mergeDims(result.dims, src.dims);
    colors.push(...(src.colors || []));
    models.push(...(src.models || []));
  };

  // Store-specific
  const isShopify = /cdn\.shopify\.com|Shopify\.shop|shopify-section/i.test(html) || /\/products\/[^/]+/.test(new URL(pageUrl).pathname);
  if (isShopify && fetchImpl) {
    try {
      const s = await shopifyProduct(pageUrl, fetchImpl);
      if (s) {
        result.source = 'shopify';
        take(s);
      }
    } catch {}
  }
  if (/amazon\./i.test(host)) {
    result.source = 'amazon';
    take(amazonExtras(html));
  }

  // JSON-LD
  const ld = productFromJsonLd(extractJsonLd(html), pageUrl);
  if (ld) {
    if (result.source === 'generic') result.source = 'jsonld';
    take(ld);
  }

  // Meta / title
  take({
    name: meta(html, 'og:title') || meta(html, 'twitter:title') || decodeEntities(html.match(/<title[^>]*>([^<]*)</i)?.[1] || '').trim() || null,
    image: absolutize(meta(html, 'og:image') || meta(html, 'twitter:image') || meta(html, 'og:image:secure_url'), pageUrl),
    images: [...html.matchAll(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi)].map((m) => absolutize(decodeEntities(m[1]), pageUrl)),
    brand: meta(html, 'og:site_name') || meta(html, 'product:brand'),
    price: meta(html, 'product:price:amount') || meta(html, 'og:price:amount'),
    currency: meta(html, 'product:price:currency') || meta(html, 'og:price:currency'),
    description: meta(html, 'og:description') || meta(html, 'description'),
  });
  const metaColor = meta(html, 'product:color');
  if (metaColor) colors.push({ name: metaColor });

  // Structured dimension keys hiding in embedded JSON (Next.js state, IKEA hydration props, Wayfair, etc.)
  const cleaned = html.replace(/\\"/g, '"').replace(/\\u0022/g, '"');
  const keyDims = {};
  for (const [k, re] of [
    ['w', /"(?:overall_?)?width"\s*:\s*\{?[^{}]{0,80}?"?(?:value|amount)?"?\s*:?\s*"?(\d+(?:\.\d+)?)"?\s*,?\s*"?(?:unit(?:Code|Text)?|uom)"?\s*:\s*"([a-z"]+)"/i],
    ['d', /"(?:overall_?)?depth"\s*:\s*\{?[^{}]{0,80}?"?(?:value|amount)?"?\s*:?\s*"?(\d+(?:\.\d+)?)"?\s*,?\s*"?(?:unit(?:Code|Text)?|uom)"?\s*:\s*"([a-z"]+)"/i],
    ['h', /"(?:overall_?)?height"\s*:\s*\{?[^{}]{0,80}?"?(?:value|amount)?"?\s*:?\s*"?(\d+(?:\.\d+)?)"?\s*,?\s*"?(?:unit(?:Code|Text)?|uom)"?\s*:\s*"([a-z"]+)"/i],
  ]) {
    const m = cleaned.match(re);
    const v = m && toMeters(+m[1], m[2]);
    if (plausible(v)) keyDims[k] = v;
  }

  // Visible text
  const text = htmlToText(html);
  const fromText = dimsFromText(text);
  // Prefer a focused section if the page has one ("Dimensions", "Measurements", "Specifications")
  const sectionIdx = text.search(/\b(product (dimensions|size|measurements)|dimensions|measurements|specifications|overall size)\b/i);
  const fromSection = sectionIdx >= 0 ? dimsFromText(text.slice(sectionIdx, sectionIdx + 1500)) : { dims: {} };
  const textSources = [fromSection, fromText].sort((a, b) => Object.keys(b.dims).length - Object.keys(a.dims).length);
  if (!result.dimsText) result.dimsText = textSources[0].snippet;
  mergeDims(result.dims, keyDims);
  for (const s of textSources) mergeDims(result.dims, s.dims);
  if (result.description) mergeDims(result.dims, dimsFromText(result.description).dims);

  // Colours
  colors.push(...colorsFromHtml(html).map((name) => ({ name })));
  result.colors = dedupeColors(colors);

  // 3D models
  if (/ikea\./i.test(host) && fetchImpl) {
    const m = await ikeaModel(pageUrl, fetchImpl);
    if (m) models.unshift(m);
  }
  models.push(...findModelUrls(html, pageUrl));
  result.modelUrl = models.find(Boolean) || null;

  // Tidy up
  if (result.name) result.name = result.name.replace(/\s*[|–-]\s*(IKEA|Amazon\.[a-z.]+|Wayfair|West Elm|[A-Z][\w ]+\.com)\s*$/i, '').replace(/^Amazon\.[a-z.]+\s*:\s*/i, '').trim().slice(0, 140);
  result.category = guessCategory(result.name, result.rawCategory, result.breadcrumbs, result.description?.slice(0, 300));
  for (const k of ['w', 'd', 'h']) if (result.dims[k] != null) result.dims[k] = Math.round(result.dims[k] * 1000) / 1000;
  const missing = ['w', 'd', 'h'].filter((k) => result.dims[k] == null);
  if (missing.length) result.notes.push(`Could not find: ${missing.map((k) => ({ w: 'width', d: 'depth', h: 'height' })[k]).join(', ')}.`);
  if (!result.colors.length) result.notes.push('No colour options found.');
  // Every product photo we found (the agent looks at them to model the item), and the description text.
  result.images = [...new Set(images.filter((u) => u && /^https?:/.test(u)))].slice(0, 12);
  result.details = result.description ? String(result.description).replace(/\s+/g, ' ').trim().slice(0, 2500) : null;
  delete result.description;
  if (result.price != null) result.price = String(result.price);
  return result;
}
