import { TEAM_MEMBERS, type TeamMember } from "@/data/capstone";
import { membersUrl } from "@/lib/media";

export interface MembersState {
  members: TeamMember[];
  loading: boolean;
  usingFallback: boolean;
  fetchedAt: number | null;
}

let state: MembersState = {
  members: TEAM_MEMBERS,
  loading: true,
  usingFallback: true,
  fetchedAt: null,
};

const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
const FRESH_MS = 30_000;

function set(next: MembersState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeMembers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMembersState(): MembersState {
  return state;
}

function toMemberSlug(name: string, fallbackId: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallbackId;
}

export function normalizeMembers(raw: unknown): TeamMember[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const members: TeamMember[] = [];
  for (const entry of raw as (Omit<TeamMember, "slug"> & { slug?: string })[]) {
    if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    const baseSlug = entry.slug ?? toMemberSlug(entry.name, entry.id);
    const slug = seen.has(baseSlug) ? `${baseSlug}-${entry.index}` : baseSlug;
    seen.add(slug);
    members.push({ ...entry, slug });
  }
  return members.length ? members : null;
}

/**
 * Short display label for compact controls (chapter dock pills, inline links).
 * Keeps two-word given names like "Jin Hng" intact while shortening longer names.
 */
export function memberShortLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Member";
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx >= 0) {
    const after = trimmed.slice(commaIdx + 1).trim();
    if (after) return after;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2 && trimmed.length <= 10) return trimmed;
  return parts[0] ?? trimmed;
}

/**
 * Visible members for public views: excludes hidden members and assigns
 * contiguous display indices ("01", "02", ...) so counts and chapter
 * numbers remain seamless whenever someone is hidden or added.
 */
export function getPublicMembers(members: TeamMember[]): TeamMember[] {
  return members
    .filter((m) => !m.hidden)
    .map((m, i) => ({
      ...m,
      index: String(i + 1).padStart(2, "0"),
    }));
}

export async function refreshMembers(force = false): Promise<void> {
  if (!force && state.fetchedAt && Date.now() - state.fetchedAt < FRESH_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(membersUrl(), {
        cache: force ? "reload" : "default",
      });
      if (!res.ok) throw new Error(`members fetch failed (${res.status})`);
      const normalized = normalizeMembers((await res.json()) as unknown);
      if (normalized) {
        set({ members: normalized, loading: false, usingFallback: false, fetchedAt: Date.now() });
      } else {
        set({ ...state, loading: false });
      }
    } catch {
      set({ ...state, loading: false, usingFallback: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function applyLocalMember(member: TeamMember) {
  const exists = state.members.some((m) => m.id === member.id);
  // Replace, never merge: a save response omits cleared fields (artifacts,
  // minor, tools, projects, links, hidden), and merging would resurrect old values.
  const members = exists
    ? state.members.map((m) => (m.id === member.id ? member : m))
    : [...state.members, member];
  set({ ...state, members });
}

export function replaceMembers(rawMembers: TeamMember[]) {
  const normalized = normalizeMembers(rawMembers);
  if (normalized) {
    set({ ...state, members: normalized, usingFallback: false, fetchedAt: Date.now() });
  }
}