// Private KV store for the capstone site, served only through this Worker.
// KV itself has no public URL: the binding is only reachable from code here.
//
// Storage layout:
//   members:index        -> JSON array of member ids
//   member/<id>          -> one member record { ...fields, slug, version, updatedAt }
//   photo/<id>/<slot>    -> photo bytes, metadata { contentType, version }
//
// Per-member keys mean concurrent saves by different teammates never clobber
// each other. A legacy single "members" blob is migrated on first read.
//
// Routes:
//   GET  /health          -> status
//   GET  /members.json    -> public member list
//   GET  /photos/<key>    -> photo bytes (ETag revalidation, always fresh)
//   POST /                -> JSON { password, verifyOnly?, memberId?, member?, baseVersion? }
//   POST /photos          -> multipart { password, memberId, slot, file }
//   POST /photos/remove   -> JSON { password, memberId, slot }
//
// Secrets in Worker env:
//   FORM_PASSWORD - shared group password, checked server-side
//   GITHUB_TOKEN  - optional, only as fallback seed read for `members`

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, if-none-match",
};

const INDEX_KEY = "members:index";
const LEGACY_KEY = "members";
const ALLOWED_PILLARS = new Set(["CSD", "EPD", "ESD"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MEMBER_ID_RE = /^member-\d{2}$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

const LIMITS = {
  name: 60,
  pillarFull: 80,
  minor: 80,
  role: 80,
  bio: 600,
  listItem: 40,
  listCount: 12,
  projectTitle: 80,
  projectDetail: 300,
  projectCount: 12,
  caption: 160,
  alt: 160,
};

// Best-effort per-isolate throttle on failed password attempts.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_FAILURES = 10;
const failures = new Map();

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

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "local";
}

function rateLimited(ip) {
  const rec = failures.get(ip);
  if (!rec) return 0;
  if (Date.now() > rec.resetAt) {
    failures.delete(ip);
    return 0;
  }
  if (rec.count >= RATE_MAX_FAILURES) return Math.ceil((rec.resetAt - Date.now()) / 1000);
  return 0;
}

function noteFailure(ip) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now > rec.resetAt) failures.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  else rec.count += 1;
  if (failures.size > 5000) {
    for (const [key, value] of failures) if (now > value.resetAt) failures.delete(key);
  }
}

// Returns a Response when the password is rejected, null when accepted.
function checkPassword(request, env, password) {
  const ip = clientIp(request);
  const retryAfter = rateLimited(ip);
  if (retryAfter > 0) {
    return json(
      { ok: false, error: `Too many attempts. Try again in ${retryAfter} seconds.`, retryAfter },
      429,
      { "retry-after": String(retryAfter) },
    );
  }
  if (!timingSafeEqual(password, env.FORM_PASSWORD)) {
    noteFailure(ip);
    return json({ ok: false, error: "Invalid password" }, 401);
  }
  failures.delete(ip);
  return null;
}

function slugFromName(name, fallbackId) {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallbackId;
}

function photoKeyFor(memberId, slot) {
  return `photo/${memberId}/${slot}`;
}

function isValidPhotoKey(key, memberId) {
  return typeof key === "string" && (key === photoKeyFor(memberId, "hero") || key === photoKeyFor(memberId, "secondary"));
}

function memberKey(id) {
  return `member/${id}`;
}

function withMeta(raw) {
  const slug =
    typeof raw.slug === "string" && raw.slug.trim() ? raw.slug.trim() : slugFromName(raw.name, raw.id);
  return {
    ...raw,
    slug,
    version: Number.isInteger(raw.version) ? raw.version : 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
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

// Returns the id index, migrating a legacy blob or seeding from GitHub once.
async function ensureIndex(env) {
  const store = env.CAPSTONE_STORE;
  const existing = await store.get(INDEX_KEY, "json");
  if (Array.isArray(existing) && existing.length) return existing;

  let seed = await store.get(LEGACY_KEY, "json");
  if (!Array.isArray(seed) || !seed.length) seed = await readMembersFromGitHub(env);
  if (!Array.isArray(seed) || !seed.length) return null;

  const ids = [];
  for (const raw of seed) {
    if (!raw || typeof raw.id !== "string" || !MEMBER_ID_RE.test(raw.id)) continue;
    if (typeof raw.name !== "string" || !raw.name.trim()) continue;
    await store.put(memberKey(raw.id), JSON.stringify(withMeta(raw)));
    ids.push(raw.id);
  }
  if (!ids.length) return null;
  await store.put(INDEX_KEY, JSON.stringify(ids));
  return ids;
}

async function loadMembers(env) {
  const index = await ensureIndex(env);
  if (!index) return { members: null, error: "Members store is empty" };
  const records = await Promise.all(index.map((id) => env.CAPSTONE_STORE.get(memberKey(id), "json")));
  const members = records.filter((m) => m && typeof m.id === "string");
  if (!members.length) return { members: null, error: "Members store is empty" };
  return { members };
}

async function readMember(env, id) {
  await ensureIndex(env);
  return env.CAPSTONE_STORE.get(memberKey(id), "json");
}

async function writeMember(env, member) {
  await env.CAPSTONE_STORE.put(memberKey(member.id), JSON.stringify(member));
}

function capString(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

// Returns { member } on success or { error } with a user-facing reason.
function sanitizeMember(input, fallback) {
  if (!input || typeof input !== "object") return { error: "Invalid member data" };
  const name = capString(input.name, LIMITS.name + 1);
  if (!name) return { error: "Name is required" };
  if (name.length > LIMITS.name) return { error: `Name must be ${LIMITS.name} characters or fewer` };
  if (!ALLOWED_PILLARS.has(input.pillar)) return { error: "Pillar must be CSD, EPD or ESD" };

  const list = (value, label) => {
    if (!Array.isArray(value)) return [];
    const items = value.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (items.length > LIMITS.listCount) return { error: `${label}: keep to ${LIMITS.listCount} items or fewer` };
    if (items.some((x) => x.length > LIMITS.listItem))
      return { error: `${label}: each item must be ${LIMITS.listItem} characters or fewer` };
    return [...new Set(items)];
  };

  const skillsets = list(input.skillsets, "Skillsets");
  if (skillsets.error) return skillsets;
  const interests = list(input.interests, "Interests");
  if (interests.error) return interests;
  const tools = list(input.tools, "Tools");
  if (tools.error) return tools;

  let projects;
  if (Array.isArray(input.projects)) {
    if (input.projects.length > LIMITS.projectCount)
      return { error: `Projects: keep to ${LIMITS.projectCount} or fewer` };
    projects = [];
    for (const p of input.projects) {
      const title = capString(p && p.title, LIMITS.projectTitle + 1);
      if (!title) continue;
      if (title.length > LIMITS.projectTitle)
        return { error: `Project titles must be ${LIMITS.projectTitle} characters or fewer` };
      const detail = capString(p && p.detail, LIMITS.projectDetail + 1);
      if (detail && detail.length > LIMITS.projectDetail)
        return { error: `Project descriptions must be ${LIMITS.projectDetail} characters or fewer` };
      projects.push({ title, detail: detail || "" });
    }
  }

  const pillarFull = capString(input.pillarFull, LIMITS.pillarFull + 1);
  if (pillarFull && pillarFull.length > LIMITS.pillarFull)
    return { error: `Pillar full name must be ${LIMITS.pillarFull} characters or fewer` };
  const minor = capString(input.minor, LIMITS.minor + 1);
  if (minor && minor.length > LIMITS.minor)
    return { error: `Minor must be ${LIMITS.minor} characters or fewer` };
  const role = capString(input.role, LIMITS.role + 1);
  if (role && role.length > LIMITS.role) return { error: `Role must be ${LIMITS.role} characters or fewer` };
  const bio = capString(input.bio, LIMITS.bio + 1);
  if (bio && bio.length > LIMITS.bio) return { error: `Bio must be ${LIMITS.bio} characters or fewer` };

  const member = {
    id: fallback.id,
    index: fallback.index,
    slug: typeof fallback.slug === "string" && fallback.slug ? fallback.slug : slugFromName(name, fallback.id),
    name,
    pillar: input.pillar,
    pillarFull: pillarFull !== null ? pillarFull : fallback.pillarFull || "",
    role: role !== null ? role : fallback.role || "",
    bio: bio !== null ? bio : fallback.bio || "",
    skillsets,
    interests,
  };
  if (minor) member.minor = minor;
  if (tools.length) member.tools = tools;
  if (projects && projects.length) member.projects = projects;

  // Preserve stored photo keys; only accept private KV keys for this member.
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
  const caption = capString(incomingArtifacts.caption, LIMITS.caption + 1);
  if (caption && caption.length > LIMITS.caption)
    return { error: `Caption must be ${LIMITS.caption} characters or fewer` };
  const alt = capString(incomingArtifacts.alt, LIMITS.alt + 1);
  if (alt && alt.length > LIMITS.alt) return { error: `Alt text must be ${LIMITS.alt} characters or fewer` };
  const resolvedCaption = caption !== null ? caption : fallbackArtifacts.caption;
  const resolvedAlt = alt !== null ? alt : fallbackArtifacts.alt;
  if (resolvedCaption) artifacts.caption = resolvedCaption;
  if (resolvedAlt) artifacts.alt = resolvedAlt;
  if (Array.isArray(fallbackArtifacts.lenses) && fallbackArtifacts.lenses.length) artifacts.lenses = fallbackArtifacts.lenses;
  if (Array.isArray(fallbackArtifacts.hotspots) && fallbackArtifacts.hotspots.length) artifacts.hotspots = fallbackArtifacts.hotspots;
  if (Object.keys(artifacts).length) member.artifacts = artifacts;

  return { member };
}

function bumpVersion(member) {
  return {
    ...member,
    version: (Number.isInteger(member.version) ? member.version : 1) + 1,
    updatedAt: new Date().toISOString(),
  };
}

function tooLarge(request) {
  const length = Number(request.headers.get("content-length") || 0);
  return length > MAX_JSON_BYTES;
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
      const { members, error } = await loadMembers(env);
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
      const etag = `"${result.metadata?.version ?? 0}"`;
      const headers = {
        "content-type": result.metadata?.contentType || "image/jpeg",
        // Revalidate on every load so a replaced photo is visible immediately.
        "cache-control": "no-cache",
        etag,
        ...CORS,
      };
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(result.value, { status: 200, headers });
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
      const rejected = checkPassword(request, env, form.get("password"));
      if (rejected) return rejected;
      const memberId = form.get("memberId");
      const slot = form.get("slot");
      const file = form.get("file");
      if (typeof memberId !== "string" || !MEMBER_ID_RE.test(memberId)) {
        return json({ ok: false, error: "Missing or invalid memberId" }, 400);
      }
      if (slot !== "hero" && slot !== "secondary") {
        return json({ ok: false, error: "Slot must be hero or secondary" }, 400);
      }
      if (!(file instanceof File)) return json({ ok: false, error: "Missing image file" }, 400);
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return json({ ok: false, error: "Only JPEG, PNG or WebP images are allowed" }, 400);
      }
      if (file.size > MAX_PHOTO_BYTES) return json({ ok: false, error: "Image is too large (max 5 MB)" }, 413);

      const current = await readMember(env, memberId);
      if (!current) return json({ ok: false, error: "Member not found" }, 404);

      const key = photoKeyFor(memberId, slot);
      try {
        const bytes = await file.arrayBuffer();
        await env.CAPSTONE_STORE.put(key, bytes, {
          metadata: { contentType: file.type, version: Date.now() },
        });
      } catch {
        return json({ ok: false, error: "Photo store write failed" }, 502);
      }

      const field = slot === "hero" ? "heroImage" : "secondaryImage";
      const updated = bumpVersion({
        ...current,
        artifacts: { ...(current.artifacts || {}), [field]: key },
      });
      try {
        await writeMember(env, updated);
      } catch {
        return json({ ok: false, error: "Members store write failed" }, 502);
      }
      return json({ ok: true, key, member: updated });
    }

    // Photo removal: JSON
    if (url.pathname === "/photos/remove") {
      if (tooLarge(request)) return json({ ok: false, error: "Request body is too large" }, 413);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }
      const rejected = checkPassword(request, env, body.password);
      if (rejected) return rejected;
      const memberId = body.memberId;
      const slot = body.slot;
      if (typeof memberId !== "string" || !MEMBER_ID_RE.test(memberId)) {
        return json({ ok: false, error: "Missing or invalid memberId" }, 400);
      }
      if (slot !== "hero" && slot !== "secondary") {
        return json({ ok: false, error: "Slot must be hero or secondary" }, 400);
      }
      const current = await readMember(env, memberId);
      if (!current) return json({ ok: false, error: "Member not found" }, 404);
      const field = slot === "hero" ? "heroImage" : "secondaryImage";
      try {
        await env.CAPSTONE_STORE.delete(photoKeyFor(memberId, slot));
      } catch {
        return json({ ok: false, error: "Photo store delete failed" }, 502);
      }
      const artifacts = { ...(current.artifacts || {}) };
      delete artifacts[field];
      const next = { ...current };
      if (Object.keys(artifacts).length) next.artifacts = artifacts;
      else delete next.artifacts;
      const updated = bumpVersion(next);
      try {
        await writeMember(env, updated);
      } catch {
        return json({ ok: false, error: "Members store write failed" }, 502);
      }
      return json({ ok: true, member: updated });
    }

    // JSON save: descriptions
    if (url.pathname !== "/" && url.pathname !== "/save") {
      return json({ ok: false, error: "Not found" }, 404);
    }
    if (tooLarge(request)) return json({ ok: false, error: "Request body is too large" }, 413);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const rejected = checkPassword(request, env, body.password);
    if (rejected) return rejected;
    if (body.verifyOnly === true) return json({ ok: true });
    if (typeof body.memberId !== "string" || !MEMBER_ID_RE.test(body.memberId)) {
      return json({ ok: false, error: "Missing memberId" }, 400);
    }

    const current = await readMember(env, body.memberId);
    if (!current) return json({ ok: false, error: "Member not found" }, 404);
    if (typeof body.baseVersion === "number" && current.version !== body.baseVersion) {
      return json(
        { ok: false, error: "This profile was saved by someone else while you were editing.", current },
        409,
      );
    }

    const { member: cleaned, error } = sanitizeMember(body.member, current);
    if (!cleaned) return json({ ok: false, error: error || "Invalid member data" }, 400);

    // sanitizeMember strips version; carry the stored one so saves increment.
    const updated = bumpVersion({ ...cleaned, version: current.version });
    try {
      await writeMember(env, updated);
    } catch {
      return json({ ok: false, error: "Members store write failed" }, 502);
    }
    return json({ ok: true, member: updated });
  },
};