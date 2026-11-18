import { useEffect, useState } from "react";
import { TEAM_MEMBERS, type TeamMember } from "@/data/capstone";
import { membersUrl } from "@/lib/media";

type TeamMemberInput = Omit<TeamMember, "slug"> & { slug?: string };

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
  for (const entry of raw as TeamMemberInput[]) {
    if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    const baseSlug = entry.slug ?? toMemberSlug(entry.name, entry.id);
    const slug = seen.has(baseSlug) ? `${baseSlug}-${entry.index}` : baseSlug;
    seen.add(slug);
    members.push({ ...entry, slug });
  }
  return members.length ? members : null;
}

export interface LiveMembers {
  members: TeamMember[];
  loading: boolean;
  usingFallback: boolean;
}

/**
 * Bundled members.json remains the first-paint fallback.
 * Live descriptions/photos come from private KV via the Worker.
 */
export function useLiveMembers(): LiveMembers {
  const [members, setMembers] = useState<TeamMember[]>(TEAM_MEMBERS);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(membersUrl(), { cache: "no-store" });
        if (!res.ok) throw new Error(`members fetch failed (${res.status})`);
        const data = (await res.json()) as unknown;
        const normalized = normalizeMembers(data);
        if (!cancelled && normalized) {
          setMembers(normalized);
          setUsingFallback(false);
        }
      } catch {
        // keep bundled fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { members, loading, usingFallback };
}
