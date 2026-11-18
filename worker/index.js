// Private KV store for the capstone site, served only through this Worker.
// KV itself has no public URL: the binding is only reachable from code here.
// Public reads (members JSON, photos) are proxied by this Worker so the
// bucket is never exposed.
//
// Routes:
//   GET  /health          -> status
//   GET  /members.json    -> public member list (descriptions)
//   GET  /photos/<key>    -> public photo bytes (kept in private KV)
//   POST /                -> JSON save { password, verifyOnly?, memberId?, member? }
//   POST /photos          -> multipart { password, memberId, slot, file }
//
// Secrets in Worker env:
//   FORM_PASSWORD - shared group password, checked server-side
//   GITHUB_TOKEN  - optional, only as fallback seed read for `members`
//
// Non-secret routing lives in wrangler.jsonc vars + kv_namespaces binding.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const MEMBERS_KEY = "members";
const ALLOWED_PILLARS = new Set(["CSD", "EPD", "ESD"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MEMBER_ID_RE = /^member-\d{2}$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function photoKeyFor(memberId, slot) {
  return `photo/${memberId}/${slot}`;
}

function isValidPhotoKey(key, memberId) {
  if (typeof key !== "string") return false;
  return key === photoKeyFor(memberId, "hero") || key === photoKeyFor(memberId, "secondary");
}

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
    pillarFull:
      typeof input.pillarFull === "string" && input.pillarFull.trim()
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

  // Preserve artifacts, only accepting private KV keys for this member.
  const fallbackArtifacts = fallback.artifacts && typeof fallback.artifacts === "object" ? fallback.artifacts : {};
  const incomingArtifacts = input.artifacts && typeof input.artifacts === "object" ? input.artifacts : {};
  const artifacts = {};
  const heroImage = isValidPhotoKey(incomingArtifacts.heroImage, fallback.id)
    ? incomingArtifacts.heroImage
    : isValidPhotoKey(fallbackArtifacts.heroImage, fallback.id)
      ? fallbackArtifacts.heroImage
      : undefined;
  const secondaryImage = isValidPhotoKey(incomingArtifacts.secondaryImage, fallback.id)
    ? incomingArtifacts.secondaryImage
    : isValidPhotoKey(fallbackArtifacts.secondaryImage, fallback.id)
      ? fallbackArtifacts.secondaryImage
      : undefined;
  if (heroImage) artifacts.heroImage = heroImage;
  if (secondaryImage) artifacts.secondaryImage = secondaryImage;
  const caption = typeof incomingArtifacts.caption === "string" ? incomingArtifacts.caption.trim() : fallbackArtifacts.caption;
  const alt = typeof incomingArtifacts.alt === "string" ? incomingArtifacts.alt.trim() : fallbackArtifacts.alt;
  if (caption) artifacts.caption = caption;
  if (alt) artifacts.alt = alt;
  if (Array.isArray(fallbackArtifacts.lenses) && fallbackArtifacts.lenses.length) artifacts.lenses = fallbackArtifacts.lenses;
  if (Array.isArray(fallbackArtifacts.hotspots) && fallbackArtifacts.hotspots.length) artifacts.hotspots = fallbackArtifacts.hotspots;
  if (Object.keys(artifacts).length) member.artifacts = artifacts;

  return member;
}

async function readMembersFromGitHub(env) {
  if (!env.GITHUB_TOKEN) return null;
  const repo = env.GITHUB_REPO || "wobuzhidaoanything/wobuzhidaoanything.github.io";
  const branch = env.GITHUB_BRANCH || "main";
  const filePath = env.GITHUB_PATH || "src/data/members.json";
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const ghHeaders = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  try {
    const res = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    if (!res.ok) return null;
    const current = await res.json();
    if (!current.content) return null;
    const parsed = JSON.parse(atob(current.content.replace(/\n/g, "")));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getMembers(env) {
  const store = env.CAPSTONE_STORE;
  if (!store) return { members: null, error: "KV store is not configured" };
  const cached = await store.get(MEMBERS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return { members: parsed };
    } catch {
      return { members: null, error: "Stored members data is not valid JSON" };
    }
  }
  const fallback = await readMembersFromGitHub(env);
  if (fallback) return { members: fallback };
  return { members: null, error: "Members store is empty" };
}

async function saveMembers(env, members) {
  await env.CAPSTONE_STORE.put(MEMBERS_KEY, JSON.stringify(members));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "capstone-update",
        configured: Boolean(env.FORM_PASSWORD && env.CAPSTONE_STORE),
        store: env.CAPSTONE_STORE ? "kv-private" : "missing",
      });
    }

    if (request.method === "GET" && url.pathname === "/members.json") {
      if (!env.CAPSTONE_STORE) return json({ ok: false, error: "KV store is not configured" }, 500);
      const { members, error } = await getMembers(env);
      if (!members) return json({ ok: false, error: error || "Members not found" }, 404);
      return new Response(JSON.stringify(members), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=60",
          ...CORS,
        },
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/photos/")) {
      if (!env.CAPSTONE_STORE) return json({ ok: false, error: "KV store is not configured" }, 500);
      const key = decodeURIComponent(url.pathname.slice("/photos/".length));
      if (!/^photo\/member-\d{2}\/(hero|secondary)$/.test(key)) {
        return json({ ok: false, error: "Photo not found" }, 404);
      }
      const result = await env.CAPSTONE_STORE.getWithMetadata(key, "arrayBuffer");
      if (!result.value) return json({ ok: false, error: "Photo not found" }, 404);
      const contentType = result.metadata?.contentType || "image/jpeg";
      return new Response(result.value, {
        status: 200,
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=86400",
          ...CORS,
        },
      });
    }

    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (!env.CAPSTONE_STORE || !env.FORM_PASSWORD) {
      return json({ ok: false, error: "Worker is not configured yet (missing secrets or KV)" }, 500);
    }

    // Photo upload: multipart/form-data
    if (url.pathname === "/photos") {
      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ ok: false, error: "Invalid form data" }, 400);
      }
      const password = form.get("password");
      if (!timingSafeEqual(password, env.FORM_PASSWORD)) {
        return json({ ok: false, error: "Invalid password" }, 401);
      }
      const memberId = form.get("memberId");
      const slot = form.get("slot");
      const file = form.get("file");
      if (typeof memberId !== "string" || !MEMBER_ID_RE.test(memberId)) {
        return json({ ok: false, error: "Missing or invalid memberId" }, 400);
      }
      if (slot !== "hero" && slot !== "secondary") {
        return json({ ok: false, error: "Slot must be hero or secondary" }, 400);
      }
      if (!(file instanceof File)) {
        return json({ ok: false, error: "Missing image file" }, 400);
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return json({ ok: false, error: "Only JPEG, PNG or WebP images are allowed" }, 400);
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return json({ ok: false, error: "Image is too large (max 5 MB)" }, 400);
      }
      const { members, error } = await getMembers(env);
      if (!members) return json({ ok: false, error: error || "Members not found" }, 404);
      const idx = members.findIndex((m) => m.id === memberId);
      if (idx === -1) return json({ ok: false, error: "Member not found" }, 404);

      const key = photoKeyFor(memberId, slot);
      try {
        const bytes = await file.arrayBuffer();
        await env.CAPSTONE_STORE.put(key, bytes, { metadata: { contentType: file.type } });
      } catch {
        return json({ ok: false, error: "Photo store write failed" }, 502);
      }

      const current = members[idx];
      const field = slot === "hero" ? "heroImage" : "secondaryImage";
      members[idx] = {
        ...current,
        artifacts: { ...(current.artifacts || {}), [field]: key },
      };
      try {
        await saveMembers(env, members);
      } catch {
        return json({ ok: false, error: "Members store write failed" }, 502);
      }
      return json({ ok: true, key });
    }

    // JSON save: descriptions
    if (url.pathname !== "/" && url.pathname !== "/save") {
      return json({ ok: false, error: "Not found" }, 404);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    if (!timingSafeEqual(body.password, env.FORM_PASSWORD)) {
      return json({ ok: false, error: "Invalid password" }, 401);
    }
    if (body.verifyOnly === true) return json({ ok: true });
    if (!body.memberId || typeof body.memberId !== "string" || !MEMBER_ID_RE.test(body.memberId)) {
      return json({ ok: false, error: "Missing memberId" }, 400);
    }

    const { members, error } = await getMembers(env);
    if (!members) return json({ ok: false, error: error || "Members not found" }, 404);
    const idx = members.findIndex((m) => m.id === body.memberId);
    if (idx === -1) return json({ ok: false, error: "Member not found" }, 404);

    const cleaned = sanitizeMember(body.member, members[idx]);
    if (!cleaned) return json({ ok: false, error: "Invalid member data (name and pillar required)" }, 400);
    // Preserve stored photo keys when the form does not send artifacts.
    const existingArtifacts = members[idx].artifacts || {};
    if (!body.member?.artifacts?.heroImage && existingArtifacts.heroImage && !cleaned.artifacts) {
      cleaned.artifacts = { heroImage: existingArtifacts.heroImage };
    } else if (!body.member?.artifacts?.heroImage && existingArtifacts.heroImage && cleaned.artifacts && !cleaned.artifacts.heroImage) {
      cleaned.artifacts.heroImage = existingArtifacts.heroImage;
    }
    if (!body.member?.artifacts?.secondaryImage && existingArtifacts.secondaryImage) {
      if (!cleaned.artifacts) cleaned.artifacts = {};
      if (!cleaned.artifacts.secondaryImage) cleaned.artifacts.secondaryImage = existingArtifacts.secondaryImage;
    }

    members[idx] = cleaned;
    try {
      await saveMembers(env, members);
    } catch {
      return json({ ok: false, error: "Members store write failed" }, 502);
    }
    return json({ ok: true });
  },
};
