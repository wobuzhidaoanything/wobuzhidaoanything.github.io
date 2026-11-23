import type { MouseEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "cn";
import { getMainPageMemberName, type TeamMember } from "@/data/capstone";
import { resolveImageSrc } from "@/lib/media";
import { scrollToSectionAligned } from "@/lib/scroll";

const PILLAR_TEXT: Record<TeamMember["pillar"], string> = {
  CSD: "text-pillar-csd",
  EPD: "text-pillar-epd",
  ESD: "text-pillar-esd",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface IdentityIndicatorProps {
  member: TeamMember | null;
  /** Element id to scroll back to when the indicator is activated. */
  targetId: string;
  visible: boolean;
}

/**
 * Persistent "whose profile am I reading" marker on narrow screens. Shown once
 * the member's photo and name have scrolled out from under the header;
 * activating it jumps back to the top of their profile. Hidden on desktop
 * viewports where the chapter layout already keeps identity visible.
 */
export function IdentityIndicator({ member, targetId, visible }: IdentityIndicatorProps) {
  const active = Boolean(member) && visible;
  const name = member ? getMainPageMemberName(member) : "";
  const pillar = member?.pillar;
  const photoSrc = member ? resolveImageSrc(member.artifacts?.heroImage) : undefined;
  const initials = initialsOf(name);
  const jump = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    scrollToSectionAligned(targetId);
  };
  const label = member ? `Back to the top of ${name}'s profile` : undefined;

  const avatar = photoSrc ? (
    <img
      src={photoSrc}
      alt=""
      className="size-9 shrink-0 rounded-full border border-edge object-cover"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full border border-edge bg-surface-alt font-serif type-micro font-semibold text-ink"
    >
      {initials}
    </span>
  );

  return (
    <button
      type="button"
      onClick={jump}
      inert={!active}
      tabIndex={active ? 0 : -1}
      aria-hidden={!active}
      aria-label={label}
      className={cn(
        "no-print group fixed left-[max(0.75rem,env(safe-area-inset-left,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-30 flex min-h-12 items-center gap-2.5 rounded-full border border-edge bg-surface/90 py-1.5 pl-1.5 pr-2.5 shadow-float backdrop-blur-[12px] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-(--ease-brand)",
        "top-[calc(var(--header-h,4.5rem)+0.5rem)] min-[54rem]:hidden",
        active
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      {avatar}
      <span className="min-w-0 flex-1 truncate text-left type-ui-sm font-semibold text-ink">
        {name}
      </span>
      {pillar ? (
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 type-ui-sm font-semibold",
            PILLAR_TEXT[pillar],
          )}
        >
          {pillar}
        </span>
      ) : null}
      <ArrowUp className="size-4 shrink-0 text-ink-muted motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:-translate-y-0.5" aria-hidden="true" />
    </button>
  );
}
