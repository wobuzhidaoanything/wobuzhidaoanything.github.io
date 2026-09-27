// AI chat panel. Uses your own OpenRouter key (stored only in this browser).
// The model replies with a short message plus a JSON list of actions, which the
// app applies to the room. This works with almost any model, including free
// ones that don't support native tool calling.

const LS_KEY = 'roomcraft.openrouter.key';
const LS_MODEL = 'roomcraft.openrouter.model';
const LS_CHAT = 'roomcraft.chat.v1';
const FALLBACK_FREE = ['openrouter/auto'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const SYSTEM = (categories) => `You are the furniture modeller inside Roomcraft, a 3D room planner. Your ONLY job is to create accurate 3D furniture models for the user's inventory, and to check and correct existing inventory models. You cannot see or change the user's room, and you never place, move or arrange furniture. The user does that themselves. If asked to change the room, say that you can only create and check models, and they can add the item to the room from the inventory.

Reply with one or two short sentences, then a fenced \`\`\`json block containing {"actions":[...]}. If nothing needs creating or fixing (a question, or a check that found no problems), give no JSON block.

Units: ALL lengths are centimetres. w = width (side to side, facing the item), d = depth (front to back), h = overall height (for beds and sofas this includes the headboard or backrest).
Use the real product's dimensions from what you know (e.g. IKEA KIVIK 3-seat sofa w228 d95 h83; IKEA MALM bed 160x200 mattress is w176 d209 h100). When unsure, use typical sizes for that type and say they are estimates.
Category decides how the model is drawn. Choose the closest one: ${categories}.
Colours: list the real colour/fabric options for the product with realistic hex values, e.g. {"name":"Gunnared dark grey","hex":"#4a4b4d"}. Wood finishes use wood names (oak, walnut, white oak…) so they get a wood texture.
Optional "accent" = legs/frame colour, e.g. {"name":"Black metal","hex":"#1d1d1f"}.

Actions (the only ones that exist):
- {"do":"add_item","name":"...","category":"sofa","w":228,"d":95,"h":83,"colors":[{"name":"...","hex":"#..."}],"accent":{"name":"...","hex":"#..."},"url":"optional product link"}  → creates a new model in the inventory.
- {"do":"update_item","item":"<itemId>","name":..,"category":..,"w":..,"d":..,"h":..,"colors":[...],"accent":{...}}  → corrects an existing model (any subset of fields).
- {"do":"import","url":"https://..."}  → reads a product link into the inventory; the result reports what was found so you can check and correct it.

When asked to check models: compare each inventory item's size, category and colours with the real product, and fix clear mistakes with update_item. Explain briefly what you changed. Use item ids exactly as given.`;

function stateSummary(api) {
  const cm = (m) => Math.round(m * 100);
  // Only the inventory is shared with the model, never the room or placements.
  return JSON.stringify({
    inventory: api.state().inventory.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      w: cm(i.dims?.w || 0),
      d: cm(i.dims?.d || 0),
      h: cm(i.dims?.h || 0),
      colors: (i.colors || []).map((c) => `${c.name} ${c.hex}`),
      accent: i.accent?.hex || undefined,
      url: i.url || undefined,
    })),
  });
}

function extractActions(text) {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  if (!blocks.length) {
    const i = text.indexOf('{"actions"');
    if (i >= 0) blocks.push(text.slice(i, text.lastIndexOf('}') + 1));
  }
  for (const b of blocks) {
    try {
      const j = JSON.parse(b.trim());
      if (Array.isArray(j)) return j;
      if (Array.isArray(j.actions)) return j.actions;
    } catch {}
  }
  return blocks.length ? null : [];
}

/**
 * Apply the model's actions. Only inventory actions exist here: the AI can create
 * and correct item models, but has no way to touch the room or what is placed in it.
 */
async function runActions(api, actions) {
  const s = api.state();
  const m = (v) => (v == null || v === '' || !Number.isFinite(+v) || +v <= 0 ? undefined : +v / 100);
  const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  const colors = (list) =>
    Array.isArray(list)
      ? list
          .map((c) => (typeof c === 'string' ? { name: c, hex: api.colorFromName(c) || '#b8b2a7' } : { name: String(c.name || c.hex || ''), hex: hexOk(c.hex) ? c.hex : api.colorFromName(c.name) || '#b8b2a7' }))
          .filter((c) => c.name)
          .slice(0, 24)
      : undefined;
  const accent = (a) => (a && hexOk(a.hex) ? { name: String(a.name || 'Accent'), hex: a.hex } : undefined);
  const results = [];
  let changed = false;
  for (const a of actions) {
    try {
      switch (a.do) {
        case 'add_item': {
          const cat = api.categories.includes(a.category) ? a.category : api.guessCategory(a.name || '');
          const def = api.DEFAULT_DIMS[cat] || [0.6, 0.6, 0.6];
          const item = {
            id: api.uid('i'),
            name: String(a.name || 'New item').slice(0, 140),
            category: cat,
            url: /^https?:\/\//.test(a.url || '') ? a.url : null,
            dims: { w: m(a.w) ?? def[0], d: m(a.d) ?? def[1], h: m(a.h) ?? def[2] },
            colors: colors(a.colors)?.length ? colors(a.colors) : [{ name: 'Default', hex: '#b8b2a7' }],
            accent: accent(a.accent) || null,
            byAI: true,
          };
          s.inventory.unshift(item);
          changed = true;
          results.push(`created ${item.id} "${item.name}" ${Math.round(item.dims.w * 100)}×${Math.round(item.dims.d * 100)}×${Math.round(item.dims.h * 100)} cm`);
          break;
        }
        case 'update_item': {
          const it = s.inventory.find((i) => i.id === a.item);
          if (!it) throw new Error(`unknown item ${a.item}`);
          if (a.name) it.name = String(a.name).slice(0, 140);
          if (a.category && api.categories.includes(a.category)) it.category = a.category;
          it.dims = { w: m(a.w) ?? it.dims.w, d: m(a.d) ?? it.dims.d, h: m(a.h) ?? it.dims.h };
          if (colors(a.colors)?.length) it.colors = colors(a.colors);
          if (accent(a.accent)) it.accent = accent(a.accent);
          // Placed copies keep their spot; only fall back to a valid colour name if theirs vanished.
          for (const p of s.placed) if (p.itemId === it.id && p.color && !p.color.startsWith('#') && !it.colors.some((c) => c.name === p.color)) p.color = it.colors[0].name;
          changed = true;
          results.push(`updated ${it.id} "${it.name}"`);
          break;
        }
        case 'import': {
          const item = await api.importUrl(a.url);
          changed = true;
          results.push(`imported ${item.id} "${item.name}" ${Math.round(item.dims.w * 100)}×${Math.round(item.dims.d * 100)}×${Math.round(item.dims.h * 100)} cm, category ${item.category}, colours: ${item.colors.map((c) => c.name).join(', ')}${item.needsDims ? ' (size guessed, please check)' : ''}`);
          break;
        }
        default:
          throw new Error(`"${a.do}" is not allowed. You can only add_item, update_item or import`);
      }
    } catch (err) {
      results.push(`ERROR in ${a.do}: ${err.message}`);
    }
  }
  if (changed) api.commit();
  return results;
}

export function initChat(api) {
  const panel = $('#chatPanel');
  const log = $('#chatLog');
  const input = $('#chatInput');
  const keyInput = $('#orKey');
  const modelSel = $('#orModel');
  let history = [];
  try {
    history = JSON.parse(ls.get(LS_CHAT) || '[]');
  } catch {}
  let busy = false;

  const saveHistory = () => ls.set(LS_CHAT, JSON.stringify(history.slice(-40)));

  function render() {
    const needsKey = !ls.get(LS_KEY);
    $('#chatSetup').hidden = !needsKey && !$('#chatSetup').dataset.forced;
    log.innerHTML =
      (history.length
        ? ''
        : `<div class="chat-empty">Describe what you want, for example:<br>
          <button class="chip">Make an IKEA KIVIK 3-seat sofa with all its colours</button>
          <button class="chip">Create a Hay Mags 2.5-seater and a round walnut coffee table</button>
          <button class="chip">Check my inventory sizes against the real products</button>
          <span>The AI only creates and checks models in your inventory; it never changes your room.</span></div>`) +
      history
        .filter((m) => m.role !== 'system' && !m.hidden)
        .map((m) => {
          const text = m.role === 'assistant' ? m.content.replace(/```[\s\S]*?```/g, '').replace(/\{"actions"[\s\S]*$/, '').trim() || 'Done.' : m.content;
          return `<div class="msg ${m.role}"><div class="bubble">${esc(text).replace(/\n/g, '<br>')}</div>${m.results ? `<div class="res">${m.results.map((r) => `<span class="${r.startsWith('ERROR') ? 'err' : ''}">${esc(r)}</span>`).join('')}</div>` : ''}</div>`;
        })
        .join('') +
      (busy ? '<div class="msg assistant"><div class="bubble typing"><span></span><span></span><span></span></div></div>' : '');
    log.scrollTop = log.scrollHeight;
    log.querySelectorAll('.chip').forEach((c) => (c.onclick = () => ((input.value = c.textContent), input.focus())));
    $('#chatSend').disabled = busy;
  }

  async function loadModels() {
    const current = ls.get(LS_MODEL);
    let models = [];
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      const j = await r.json();
      models = (j.data || [])
        .filter((m) => m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0)
        .filter((m) => (m.architecture?.output_modalities || ['text']).includes('text'))
        .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
        .map((m) => ({ id: m.id, name: m.name }));
    } catch {}
    if (!models.length) models = FALLBACK_FREE.map((id) => ({ id, name: id }));
    modelSel.innerHTML =
      models.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('') + '<option value="__custom">Other model (type an id)…</option>';
    if (current && !models.some((m) => m.id === current)) modelSel.insertAdjacentHTML('afterbegin', `<option value="${esc(current)}">${esc(current)}</option>`);
    modelSel.value = current || models[0].id;
    ls.set(LS_MODEL, modelSel.value);
  }

  async function callModel(messages) {
    const key = ls.get(LS_KEY);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Roomcraft',
      },
      body: JSON.stringify({ model: ls.get(LS_MODEL), messages, temperature: 0.3 }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      const msg = j.error?.message || `HTTP ${res.status}`;
      if (res.status === 429) throw new Error(`${msg} Free models are rate-limited; wait a minute or pick another model.`);
      if (res.status === 401) throw new Error('OpenRouter rejected the key. Check it in chat settings.');
      throw new Error(msg);
    }
    return j.choices?.[0]?.message?.content || '';
  }

  async function send(text) {
    if (!text.trim() || busy) return;
    if (!ls.get(LS_KEY)) {
      $('#chatSetup').hidden = false;
      keyInput.focus();
      return;
    }
    history.push({ role: 'user', content: text });
    busy = true;
    render();
    try {
      // Up to 3 rounds: if actions fail or JSON is malformed, the results go back to the model to fix.
      for (let round = 0; round < 3; round++) {
        const messages = [
          { role: 'system', content: SYSTEM(api.categories.join(', ')) + '\n\nCURRENT STATE (cm):\n' + stateSummary(api) },
          ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
        ];
        const reply = await callModel(messages);
        const actions = extractActions(reply);
        const msg = { role: 'assistant', content: reply || '(empty reply)' };
        history.push(msg);
        if (actions === null) {
          history.push({ role: 'user', hidden: true, content: 'Your JSON block could not be parsed. Reply again with valid JSON: {"actions":[...]}' });
          continue;
        }
        if (!actions.length) break;
        msg.results = await runActions(api, actions);
        const errors = msg.results.filter((r) => r.startsWith('ERROR'));
        if (!errors.length) break;
        history.push({ role: 'user', hidden: true, content: 'Some actions failed:\n' + errors.join('\n') + '\nFix them using the updated state.' });
      }
    } catch (err) {
      history.push({ role: 'assistant', content: `⚠ ${err.message}` });
    }
    busy = false;
    saveHistory();
    render();
  }

  // Wiring
  $('#chatToggle').onclick = () => {
    panel.hidden = !panel.hidden;
    $('#chatToggle').classList.toggle('on', !panel.hidden);
    if (!panel.hidden) {
      render();
      if (!modelSel.options.length) loadModels();
      (ls.get(LS_KEY) ? input : keyInput).focus();
    }
  };
  $('#chatClose').onclick = () => $('#chatToggle').click();
  $('#chatSettingsBtn').onclick = () => {
    const s = $('#chatSetup');
    s.hidden = !s.hidden;
    s.dataset.forced = s.hidden ? '' : '1';
  };
  $('#chatClear').onclick = () => {
    history = [];
    saveHistory();
    render();
  };
  keyInput.value = ls.get(LS_KEY) || '';
  keyInput.onchange = () => {
    ls.set(LS_KEY, keyInput.value.trim());
    if (keyInput.value.trim()) {
      $('#chatSetup').dataset.forced = '';
      render();
      input.focus();
    }
  };
  modelSel.onchange = () => {
    if (modelSel.value === '__custom') {
      const id = prompt('OpenRouter model id (e.g. vendor/model:free)');
      if (id) {
        modelSel.insertAdjacentHTML('afterbegin', `<option value="${esc(id)}">${esc(id)}</option>`);
        modelSel.value = id;
      } else modelSel.value = ls.get(LS_MODEL) || modelSel.options[0].value;
    }
    ls.set(LS_MODEL, modelSel.value);
  };
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    send(t);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });
  render();
  return { send, runActions: (a) => runActions(api, a) };
}
