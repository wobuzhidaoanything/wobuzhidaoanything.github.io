import type { HeroFocus } from "@/data/capstone";
import type { EditorForm } from "@/lib/editorForm";

export interface StoredDraft {
  form: EditorForm;
  baseVersion: number | null;
  savedAt: number;
}

const PREFIX = "capstone-editor-draft/";

function normalizeFocus(value: unknown): HeroFocus {
  return value === "top" || value === "bottom" ? value : "center";
}

function normalizeDraftForm(value: unknown): EditorForm | null {
  if (!value || typeof value !== "object") return null;
  const form = value as Record<string, unknown>;
  if (
    typeof form.name !== "string" ||
    (form.pillar !== "CSD" && form.pillar !== "EPD" && form.pillar !== "ESD") ||
    typeof form.skillsetsText !== "string" ||
    typeof form.interestsText !== "string" ||
    typeof form.toolsText !== "string" ||
    !Array.isArray(form.projects)
  ) {
    return null;
  }

  const rawLinks =
    form.links && typeof form.links === "object"
      ? (form.links as Record<string, unknown>)
      : {};

  return {
    name: form.name,
    pillar: form.pillar,
    minor: typeof form.minor === "string" ? form.minor : "",
    bio: typeof form.bio === "string" ? form.bio : "",
    skillsetsText: form.skillsetsText,
    interestsText: form.interestsText,
    toolsText: form.toolsText,
    projects: form.projects.map((raw) => {
      const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        title: typeof p.title === "string" ? p.title : "",
        detail: typeof p.detail === "string" ? p.detail : "",
        tag: typeof p.tag === "string" ? p.tag : "",
        url: typeof p.url === "string" ? p.url : "",
        featured: p.featured !== false,
      };
    }),
    links: {
      github: typeof rawLinks.github === "string" ? rawLinks.github : "",
      linkedin: typeof rawLinks.linkedin === "string" ? rawLinks.linkedin : "",
      portfolio: typeof rawLinks.portfolio === "string" ? rawLinks.portfolio : "",
      email: typeof rawLinks.email === "string" ? rawLinks.email : "",
    },
    heroFocus: normalizeFocus(form.heroFocus),
    hidden: Boolean(form.hidden),
    caption: typeof form.caption === "string" ? form.caption : "",
    alt: typeof form.alt === "string" ? form.alt : "",
  };
}

export function readDraft(memberId: string): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + memberId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    const form = normalizeDraftForm(parsed?.form);
    if (!parsed || !form) return null;
    return {
      form,
      baseVersion: typeof parsed.baseVersion === "number" ? parsed.baseVersion : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeDraft(memberId: string, draft: StoredDraft) {
  try {
    sessionStorage.setItem(PREFIX + memberId, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode); drafts simply won't persist.
  }
}

export function clearDraft(memberId: string) {
  try {
    sessionStorage.removeItem(PREFIX + memberId);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
