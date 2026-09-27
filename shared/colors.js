// Colour-name → hex lookup shared by the app and the product-page reader.
// Retailer colour names look like "Tresund light beige" or "Walnut veneer",
// so we look for the longest known colour phrase inside the name and apply
// light/dark modifiers.

const BASE = {
  // neutrals
  'white': '#f4f3ef', 'off-white': '#ecE8de', 'off white': '#ece8de', 'snow': '#f7f7f5',
  'cream': '#eee3cc', 'ivory': '#efe8d6', 'bone': '#e6dfcf', 'chalk': '#ecebe5',
  'beige': '#d8c8aa', 'sand': '#cdb892', 'taupe': '#9c8b7a', 'linen': '#ddd3c0',
  'natural': '#d9c7a4', 'oatmeal': '#d6c9b1', 'mushroom': '#a89a8a', 'stone': '#b5ada1',
  'greige': '#b3aa9c', 'ecru': '#dcd2bb', 'grey': '#8d8d8d', 'gray': '#8d8d8d',
  'silver grey': '#b8bab9', 'slate': '#5f6970', 'ash grey': '#b2b0aa', 'anthracite': '#3b3d40',
  'charcoal': '#3a3a3c', 'graphite': '#45474a', 'black': '#1d1d1f', 'jet black': '#111111',
  'ebony': '#2a241f',
  // browns & woods
  'brown': '#6b4a33', 'chocolate': '#4a2f22', 'espresso': '#3a2a20', 'coffee': '#5a3f2e',
  'mocha': '#6f5244', 'caramel': '#a86f3c', 'cognac': '#9a4f26', 'tan': '#b88f63',
  'camel': '#b58a5a', 'walnut': '#5d4030', 'oak': '#b89468', 'white oak': '#cdb591',
  'light oak': '#caa77a', 'dark oak': '#6e4f33', 'birch': '#dcc59c', 'pine': '#d7b27a',
  'beech': '#d2ac7b', 'teak': '#9a6b3f', 'ash': '#cdb693', 'bamboo': '#d4b77f',
  'rattan': '#c9a36b', 'wicker': '#b98d57', 'cane': '#caa56b', 'cherry': '#8b3f2a',
  'mahogany': '#6a2d1f', 'acacia': '#8f5e37', 'mango': '#9a7048', 'rosewood': '#65000b',
  'wenge': '#3d2b22', 'maple': '#dcb982', 'cedar': '#a8683c', 'elm': '#a57b52',
  'driftwood': '#9b8e7c', 'honey': '#c48a3c', 'wood': '#a27b54', 'veneer': '#a27b54',
  'leather': '#7a4b2e',
  // blues
  'blue': '#3b5f8f', 'navy': '#23304a', 'navy blue': '#23304a', 'midnight': '#1f2a3d',
  'midnight blue': '#1f2a3d', 'royal blue': '#2c4fa0', 'cobalt': '#1f4fa0', 'denim': '#4a6484',
  'indigo': '#34406b', 'sky blue': '#8fb8d8', 'powder blue': '#b4c9d8', 'steel blue': '#4f6f8f',
  'petrol': '#1f4f5a', 'teal': '#2e6e6c', 'turquoise': '#3fa8a4', 'aqua': '#6cc5c1',
  'cyan': '#4fb3c4', 'duck egg': '#b7cfc6',
  // greens
  'green': '#4d7050', 'dark green': '#2f4a35', 'forest': '#2f4a35', 'forest green': '#2f4a35',
  'emerald': '#1f6b50', 'bottle green': '#1f4a3a', 'olive': '#6f6f3f', 'khaki': '#a39a6a',
  'sage': '#9aa98f', 'mint': '#a8d5ba', 'moss': '#6b7a45', 'pistachio': '#b4c78f',
  'eucalyptus': '#7f9b8c', 'jade': '#4e9b7f', 'lime': '#9cc44a',
  // warm colours
  'yellow': '#e3c04b', 'mustard': '#c8952d', 'ochre': '#c08a2e', 'gold': '#c9a54c',
  'saffron': '#e0a030', 'orange': '#dd7a33', 'burnt orange': '#b85a25', 'amber': '#d08a2a',
  'peach': '#efb895', 'apricot': '#eba77a', 'coral': '#e27762', 'salmon': '#e39883',
  'terracotta': '#b8603f', 'rust': '#a44d2b', 'brick': '#9b4a37', 'copper': '#b0673f',
  'red': '#b3312c', 'dark red': '#7c211e', 'burgundy': '#6b1f2b', 'wine': '#6b2233',
  'oxblood': '#5a1d1f', 'maroon': '#5e1f23', 'cranberry': '#8a2437',
  'pink': '#e6a9b4', 'blush': '#e8c1bb', 'dusty pink': '#cf9c9e', 'dusty rose': '#c58f92',
  'rose': '#d07e8c', 'fuchsia': '#c43b86', 'magenta': '#b43b8a', 'mauve': '#a47f93',
  'purple': '#6a4a86', 'plum': '#5d3350', 'aubergine': '#3d2436', 'lilac': '#bca7cf',
  'lavender': '#b3a6d4', 'violet': '#7a5aa6',
  // metals & materials
  'brass': '#b5954a', 'bronze': '#8a6a3f', 'silver': '#c4c6c8', 'chrome': '#d6d8da',
  'stainless steel': '#b9bcbe', 'steel': '#a3a7aa', 'aluminium': '#bfc2c4', 'aluminum': '#bfc2c4',
  'nickel': '#b6b3aa', 'iron': '#4a4a4a', 'gunmetal': '#4a4d51', 'pewter': '#8e9290',
  'marble': '#e6e3de', 'concrete': '#a5a39e', 'terrazzo': '#ddd6cc', 'glass': '#cfe3e6',
  'clear': '#dbe9ec', 'transparent': '#dbe9ec', 'smoked': '#5c5a58', 'boucle': '#e9e3d6',
  'bouclé': '#e9e3d6', 'velvet': null, 'multicolour': '#b07a6a', 'multicolor': '#b07a6a',
};

const KIND_WORDS = {
  wood: ['oak', 'walnut', 'birch', 'pine', 'beech', 'teak', 'ash', 'bamboo', 'cherry', 'mahogany',
    'acacia', 'mango', 'rosewood', 'wenge', 'maple', 'cedar', 'elm', 'driftwood', 'wood', 'veneer', 'rattan', 'wicker', 'cane'],
  metal: ['brass', 'bronze', 'silver', 'chrome', 'steel', 'aluminium', 'aluminum', 'nickel', 'iron', 'gunmetal', 'pewter', 'gold', 'copper'],
  glass: ['glass', 'clear', 'transparent', 'smoked'],
  stone: ['marble', 'concrete', 'terrazzo', 'stone'],
};

const KEYS = Object.keys(BASE).filter((k) => BASE[k]).sort((a, b) => b.length - a.length);

function wordMatch(text, key) {
  const i = text.indexOf(key);
  if (i < 0) return -1;
  const before = text[i - 1];
  const after = text[i + key.length];
  const isWord = (c) => c && /[a-z]/.test(c);
  return isWord(before) || isWord(after) ? -1 : i;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  r = Math.round(r + (t - r) * p);
  g = Math.round(g + (t - g) * p);
  b = Math.round(b + (t - b) * p);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Best-effort hex for a colour name, or null when no colour word is present. */
export function colorFromName(name) {
  if (!name) return null;
  const text = String(name).toLowerCase().replace(/[_/]+/g, ' ');
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/);
  if (hex) {
    const h = hex[1];
    return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
  }
  for (const key of KEYS) {
    const i = wordMatch(text, key);
    if (i < 0) continue;
    let out = BASE[key];
    const prefix = text.slice(Math.max(0, i - 12), i);
    if (!/light|dark|pale|deep/.test(key)) {
      if (/(light|pale|soft)[\s-]*$/.test(prefix)) out = shade(out, 0.35);
      else if (/(dark|deep)[\s-]*$/.test(prefix)) out = shade(out, -0.4);
    }
    return out;
  }
  return null;
}

export function isColorName(name) {
  return colorFromName(name) !== null;
}

/** Rough material family for a colour name, used to pick roughness/metalness. */
export function materialKind(name) {
  const text = String(name || '').toLowerCase();
  for (const [kind, words] of Object.entries(KIND_WORDS)) {
    if (words.some((w) => wordMatch(text, w) >= 0)) return kind;
  }
  return 'fabric';
}
