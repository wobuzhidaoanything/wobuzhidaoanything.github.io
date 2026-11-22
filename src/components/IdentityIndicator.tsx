import type { MouseEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "cn";
import type { TeamMember } from "@/data/capstone";
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
 * Persistent "whose profile am I reading" marker. Shown only while the
 * member's hero block has scrolled out of view; activating it jumps back
 * to the top of their profile. Rendered as a vertical edge rail on wide
 * screens and a slim bar under the header on smaller ones.
 */
export function IdentityIndicator({ member, targetId, visible }: IdentityIndicatorProps) {
  const active = Boolean(member) && visible;
  const name = member?.name ?? "";
  const pillar = member?.pillar;
  const photoSrc = member ? resolveImageSrc(member.artifacts?.heroImage) : undefined;
  const initials = initialsOf(name);
  const jump = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    scrollToSectionAligned(targetId);
  };
  const label = member ? `Back to the top of ${name}'s profile` : undefined;

  const avatar = (size: string) =>
    photoSrc ? (
      <img
        src={photoSrc}
        alt=""
        className={cn(
          "shrink-0 rounded-full border border-edge object-cover",
          size,
        )}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-full border border-edge bg-surface-alt font-serif font-semibold text-ink",
          size,
        )}
      >
        {initials}
      </span>
    );

  return (
    <>
      {/* Wide screens: vertical rail pinned to the left edge, vertically centered. */}
      <button
        type="button"
        onClick={jump}
        inert={!active}
        tabIndex={active ? 0 : -1}
        aria-hidden={!active}
        aria-label={label}
        title={label}
        className={cn(
          "no-print group fixed left-[max(1rem,env(safe-area-inset-left,0px))] top-1/2 z-30 hidden max-h-[min(70dvb,26rem)] w-14 -translate-y-1/2 flex-col items-center gap-3 rounded-full border border-edge bg-surface/85 px-1 py-3 shadow-float backdrop-blur-[12px] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-(--ease-brand) min-[80rem]:flex",
          active
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-3 opacity-0",
        )}
      >
        {avatar("size-11 type-micro")}
        <span
          aria-hidden="true"
          className="min-h-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans type-micro font-semibold tracking-[0.12em] text-ink [writing-mode:vertical-rl] rotate-180"
        >
          {name}
        </span>
        {pillar ? (
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full bg-current", PILLAR_TEXT[pillar])}
          />
        ) : null}
      </button>

      {/* Narrow screens: slim bar tucked under the sticky header. */}
      <button
        type="button"
        onClick={jump}
        inert={!active}
        tabIndex={active ? 0 : -1}
        aria-hidden={!active}
        aria-label={label}
        className={cn(
          "no-print group fixed left-[max(0.75rem,env(safe-area-inset-left,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-30 flex min-h-12 items-center gap-2.5 rounded-full border border-edge bg-surface/90 py-1.5 pl-1.5 pr-2.5 shadow-float backdrop-blur-[12px] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-(--ease-brand)",
          "top-[calc(var(--header-h,4.5rem)+0.5rem)] min-[80rem]:hidden",
          active
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        {avatar("size-9 type-micro")}
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
    </>
  );
}
