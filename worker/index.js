// Relay for the /update_details form.
// POST { password, memberId, member } -> updates src/data/members.json on main
// via the GitHub Contents API, which triggers the existing Pages deploy.
// Secrets live in Worker env (set with `wrangler secret put`):
//   GITHUB_TOKEN  - fine-grained PAT, Contents: write on this repo only
//   FORM_PASSWORD - shared group password, checked server-side
// Non-secret routing lives in wrangler.jsonc vars.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64EncodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const ALLOWED_PILLARS = new Set(["CSD", "EPD", "ESD"]);

function sanitizeMember(input, fallback) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.name !== "string" || !input.name.trim()) return null;
  if (!ALLOWED_PILLARS.has(input.pillar)) return null;
  const list = (v) =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
      : [];
  const projects = Array.isArray(input.projects)
    ? input.projects
        .filter((p) => p && typeof p.title === "string" && p.title.trim())
        .map((p) => ({
          title: String(p.title).trim(),
          detail: typeof p.detail === "string" ? String(p.detail).trim() : "",
        }))
    : undefined;
  const member = {
    id: fallback.id,
    index: fallback.index,
    name: input.name.trim(),
    pillar: input.pillar,
    pillarFull: typeof input.pillarFull === "string" && input.pillarFull.trim()
      ? input.pillarFull.trim()
      : fallback.pillarFull,
    role: typeof input.role === "string" ? input.role.trim() : fallback.role,
    bio: typeof input.bio === "string" ? input.bio.trim() : fallback.bio,
    skillsets: list(input.skillsets),
    interests: list(input.interests),
  };
  if (typeof input.minor === "string" && input.minor.trim()) member.minor = input.minor.trim();
  const tools = list(input.tools);
  if (tools.length) member.tools = tools;
  if (projects && projects.length) member.projects = projects;
  return member;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return json({ ok: true, service: "capstone-update", configured: Boolean(env.GITHUB_TOKEN && env.FORM_PASSWORD) });
    }
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (!env.GITHUB_TOKEN || !env.FORM_PASSWORD)
      return json({ ok: false, error: "Worker is not configured yet (missing secrets)" }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    if (!timingSafeEqual(body.password, env.FORM_PASSWORD))
      return json({ ok: false, error: "Invalid password" }, 401);
    if (body.verifyOnly === true) return json({ ok: true });
    if (!body.memberId || typeof body.memberId !== "string")
      return json({ ok: false, error: "Missing memberId" }, 400);

    const repo = env.GITHUB_REPO || "wobuzhidaoanything/wobuzhidaoanything.github.io";
    const branch = env.GITHUB_BRANCH || "main";
    const filePath = env.GITHUB_PATH || "src/data/members.json";
    const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    const ghHeaders = {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };

    let current;
    try {
      const res = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
      if (!res.ok) return json({ ok: false, error: `GitHub read failed (${res.status})` }, 502);
      current = await res.json();
    } catch {
      return json({ ok: false, error: "GitHub read failed" }, 502);
    }
    if (!current.content || !current.sha) return json({ ok: false, error: "File not found on GitHub" }, 404);

    let members;
    try {
      members = JSON.parse(atob(current.content.replace(/\n/g, "")));
    } catch {
      return json({ ok: false, error: "Existing members.json is not valid JSON" }, 500);
    }
    if (!Array.isArray(members)) return json({ ok: false, error: "members.json must be an array" }, 500);

    const idx = members.findIndex((m) => m.id === body.memberId);
    if (idx === -1) return json({ ok: false, error: "Member not found" }, 404);

    const cleaned = sanitizeMember(body.member, members[idx]);
    if (!cleaned) return json({ ok: false, error: "Invalid member data (name and pillar required)" }, 400);
    members[idx] = cleaned;
    const nextContent = `${JSON.stringify(members, null, 2)}\n`;

    let putRes;
    try {
      putRes = await fetch(apiBase, {
        method: "PUT",
        headers: { ...ghHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          message: `Update ${cleaned.name} via update_details`,
          content: b64EncodeUtf8(nextContent),
          sha: current.sha,
          branch,
        }),
      });
    } catch {
      return json({ ok: false, error: "GitHub write failed" }, 502);
    }
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      return json({ ok: false, error: `GitHub write failed (${putRes.status})${errText ? ": " + errText.slice(0, 200) : ""}` }, 502);
    }
    return json({ ok: true });
  },
};
