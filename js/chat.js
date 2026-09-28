// Assistant: talk to the user's own AI agent, which the local server runs in the background
// (see tools/lib/runner.mjs). Also hands it "model this product link" jobs. This is the state
// and the server calls; js/ui/Chat.jsx draws the panel.
export function createChat({ context, onJobDone, onReady, local, onLinks, onChange }) {
  let st = { runners: [], runner: null, busy: false, messages: [] };
  // Changes the agent made to the house, shown as cards with Undo (kept in this window only)
  const changes = [];
  let open = false;
  let hint = '';
  let hintTimer;

  const api = async (path, body) => {
    const r = await fetch(`api/chat${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  const ready = () => st.runners.find((r) => r.id === st.runner && r.ready);
  const changed = () => onChange?.();

  const chat = {
    local,
    get state() {
      return st;
    },
    get changes() {
      return changes;
    },
    get open() {
      return open;
    },
    get busy() {
      return st.busy;
    },
    get hint() {
      return hint;
    },
    get ready() {
      return ready();
    },
    async refresh() {
      if (local) {
        try {
          st = await api('');
        } catch {}
      }
      changed();
      onReady?.(ready());
    },
    toggle(o = !open) {
      open = o;
      changed();
      if (open) chat.refresh();
    },
    /** Server event from the background agent. */
    handle(ev) {
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
      changed();
    },
    say(msg) {
      hint = msg;
      changed();
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => ((hint = ''), changed()), 5000);
    },
    /** Send a message. Returns false if it couldn't be sent (keep the text). */
    async send(text) {
      text = text.trim();
      if (!text) return true;
      // Every link is treated as a product: it goes through the same modelling job as the link box
      const urls = [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) || [])].map((u) => u.replace(/[).,;!?]+$/, ''));
      if (urls.length && onLinks) {
        await onLinks(urls);
        const rest = urls.reduce((t, u) => t.split(u).join(''), text).trim();
        if (!rest) return true; // just links: nothing else to say
        text = `${text}\n\n(Roomcraft has already queued a separate modelling job for each link above; don't model them again here.)`;
      }
      try {
        const r = await api('/send', { text, context: context(), runner: st.runner });
        st.busy = r.busy;
        changed();
        return true;
      } catch (err) {
        chat.say(err.message);
        return false;
      }
    },
    async clear() {
      if (st.busy && !confirm('Stop the current job and start a new conversation?')) return;
      if (st.busy) await api('/stop', {});
      st = await api('/clear', {});
      changed();
    },
    async stop() {
      st = await api('/stop', {});
      changed();
    },
    async setRunner(id) {
      st = await api('/runner', { runner: id });
      changed();
      onReady?.(ready());
    },
    /** Ask the agent to model a product from its link (improving the draft item `itemId`). */
    async modelLink(url, item) {
      const r = await api('/model', { url, itemId: item?.id, name: item?.name, runner: st.runner });
      st.busy = r.busy;
      changed();
      return r;
    },
    /** Show a card for a change the agent made, with Undo/Redo. */
    addChange({ lines, undo, redo }) {
      const c = { id: Math.random().toString(36).slice(2), lines, undo, redo, after: st.messages.at(-1)?.id || null, undone: false };
      changes.push(c);
      if (changes.length > 30) changes.shift();
      changed();
      return c;
    },
    undoChange(c) {
      c.undo();
      c.undone = true;
      changed();
    },
    redoChange(c) {
      c.redo();
      c.undone = false;
      changed();
    },
  };
  chat.refresh();
  return chat;
}
