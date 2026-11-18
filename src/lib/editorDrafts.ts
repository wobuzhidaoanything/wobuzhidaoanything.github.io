import type { EditorForm } from "@/lib/editorForm";

export interface StoredDraft {
  form: EditorForm;
  baseVersion: number | null;
  savedAt: number;
}

const PREFIX = "capstone-editor-draft/";

function isEditorForm(value: unknown): value is EditorForm {
  if (!value || typeof value !== "object") return false;
  const form = value as Record<string, unknown>;
  return (
    typeof form.name === "string" &&
    (form.pillar === "CSD" || form.pillar === "EPD" || form.pillar === "ESD") &&
    typeof form.skillsetsText === "string" &&
    typeof form.interestsText === "string" &&
    typeof form.toolsText === "string" &&
    Array.isArray(form.projects)
  );
}

export function readDraft(memberId: string): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + memberId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || !isEditorForm(parsed.form)) return null;
    return {
      form: parsed.form,
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