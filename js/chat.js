// Assistant panel: talk to the user's own AI agent, which the local server runs in the
// background (see tools/lib/runner.mjs). Also hands it "model this product link" jobs.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function initChat({ context, openAgents, onJobDone, onReady, local, onLinks }) {
  const panel = $('#chatPanel');
  const log = $('#chatLog');
  const input = $('#chatInput');
  let st = { runners: [], runner: null, busy: false, messages: [] };

  const api = async (path, body) => {
    const r = await fetch(`api/chat${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  const ready = () => st.runners.find((r) => r.id === st.runner && r.ready);

  async function refresh() {
    if (!local) return render();
    try {
      st = await api('');
    } catch {}
    render();
    onReady?.(ready());
  }

  function render() {
    const r = ready();
    $('#chatBusy').hidden = !st.busy;
    const sel = $('#chatRunner');
    const usable = st.runners.filter((x) => x.ready);
    sel.innerHTML = usable.map((x) => `<option value="${x.id}" ${x.id === st.runner ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    sel.hidden = usable.length < 2;
    $('#chatStop').hidden = !st.busy;
    input.disabled = $('#chatSend').disabled = !r;
    if (!st.messages.length || !r) {
      const installed = st.runners.filter((x) => x.available).map((x) => x.name);
      log.innerHTML = `<div class="chat-empty">${
        !local
          ? 'The assistant works when Roomcraft runs on your computer with <code>npm start</code>.'
          : r
            ? `Ask <b>${esc(r.name)}</b> anything about your house: “make the living room 50 cm wider”, “add a sofa from this link”, “what’s the stair rise?”.<br><br>Paste product links and it models them from their photos. It runs in the background; no terminal needed.`
            : `No terminal agent found to chat with.<br>The assistant runs a command-line agent in the background: Claude Code, Codex, Gemini CLI, OpenCode, Cursor CLI or Grok CLI.${installed.length ? '' : '<br><br>Install one of them, then set it up here.'}<br><button class="btn small" id="chatSetup">Set up an agent</button><br><br><span class="hint">Desktop apps (Claude Desktop, VS Code, Windsurf) can use Roomcraft from their own window but can’t be driven from here.</span>`
      }</div>`;
      $('#chatSetup')?.addEventListener('click', openAgents);
      return;
    }
    log.innerHTML = st.messages.map(msgHtml).join('');
    log.scrollTop = log.scrollHeight;
  }

  function msgHtml(m) {
    if (m.role === 'job') {
      const label = { queued: 'Waiting', running: 'Working…', done: 'Done', error: 'Failed', stopped: 'Stopped' }[m.status] || m.status;
      return `<div class="chat-job ${esc(m.status)}" data-id="${m.id}"><span class="st">${label}</span><span>${esc(m.text.replace(/…$/, ''))}</span></div>`;
    }
    const name = m.role === 'agent' ? st.runners.find((r) => r.id === m.runner)?.name || 'Agent' : '';
    const body = m.role === 'agent' && m.streaming && !m.text ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text);
    const tools = m.tools?.length ? `<div class="tools">${[...new Set(m.tools)].map((t) => `<span>${esc(t.replace(/_/g, ' '))}</span>`).join('')}</div>` : '';
    return `<div class="chat-msg ${m.role} ${m.error ? 'error' : ''}" data-id="${m.id}">${name ? `<span class="who">${esc(name)}</span>` : ''}${body}${tools}</div>`;
  }

  /** Server event from the background agent. */
  function handle(ev) {
    if (ev.event === 'message') st.messages.push(ev.message);
    else if (ev.event === 'update') {
      const i = st.messages.findIndex((m) => m.id === ev.message.id);
      if (i >= 0) st.messages[i] = ev.message;
      else st.messages.push(ev.message);
    } else if (ev.event === 'state') st.busy = ev.state.busy || ev.state.queued > 0;
    else if (ev.event === 'cleared') st.messages = [];
    else if (ev.event === 'done') {
      st.busy = false;
      onJobDone?.(ev);
    }
    if (!panel.hidden || ev.event === 'state' || ev.event === 'done') render();
  }

  async function send(text) {
    text = text.trim();
    if (!text) return;
    input.value = '';
    // Every link is treated as a product: it goes through the same modelling job as the link box
    const urls = [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) || [])].map((u) => u.replace(/[).,;!?]+$/, ''));
    if (urls.length && onLinks) {
      await onLinks(urls);
      const rest = urls.reduce((t, u) => t.split(u).join(''), text).trim();
      if (!rest) return; // just links: nothing else to say
      text = `${text}\n\n(Roomcraft has already queued a separate modelling job for each link above; don't model them again here.)`;
    }
    try {
      const r = await api('/send', { text, context: context(), runner: st.runner });
      st.busy = r.busy;
      render();
    } catch (err) {
      input.value = text;
      alertIn(err.message);
    }
  }

  function alertIn(msg) {
    $('#chatHint').textContent = msg;
    setTimeout(() => ($('#chatHint').textContent = 'Enter to send · Shift+Enter for a new line'), 5000);
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    $('#chatBtn').setAttribute('aria-expanded', String(open));
    if (open) {
      refresh();
      setTimeout(() => input.focus(), 0);
    }
  }

  $('#chatBtn').onclick = () => toggle();
  $('#chatClose').onclick = () => toggle(false);
  $('#chatClear').onclick = async () => {
    if (st.busy && !confirm('Stop the current job and start a new conversation?')) return;
    if (st.busy) await api('/stop', {});
    st = await api('/clear', {});
    render();
  };
  $('#chatStop').onclick = async () => {
    st = await api('/stop', {});
    render();
  };
  $('#chatRunner').onchange = async (e) => {
    st = await api('/runner', { runner: e.target.value });
    render();
    onReady?.(ready());
  };
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    send(input.value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    } else if (e.key === 'Escape') toggle(false);
    e.stopPropagation(); // typing here never triggers app shortcuts
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(160, input.scrollHeight) + 'px';
  });

  refresh();

  return {
    handle,
    refresh,
    toggle,
    get ready() {
      return ready();
    },
    /** Ask the agent to model a product from its link (improving the draft item `itemId`). */
    async modelLink(url, item) {
      const r = await api('/model', { url, itemId: item?.id, name: item?.name, runner: st.runner });
      st.busy = r.busy;
      render();
      return r;
    },
  };
}
