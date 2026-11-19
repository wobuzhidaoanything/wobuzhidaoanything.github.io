import { cn } from "cn";
import type { Pillar, TeamMember } from "@/data/capstone";
import { resolveImageSrc } from "@/lib/media";

interface ArtifactFrameProps {
  member: TeamMember;
  src?: string;
  alt?: string;
  caption?: string;
  aspectRatio?: "4/5" | "16/10" | "16/9" | "1/1";
  mediaClassName?: string;
  photoMaxHeightClassName?: string;
  alignClassName?: string;
  plateLabel?: string;
  headline?: string;
  priority?: "high" | "low";
  showPlaceholder?: boolean;
  className?: string;
}

const tagColorByPillar: Record<Pillar, string> = {
  CSD: "text-pillar-csd",
  EPD: "text-pillar-epd",
  ESD: "text-pillar-esd",
};

const aspectClasses: Record<NonNullable<ArtifactFrameProps["aspectRatio"]>, string> = {
  "4/5": "aspect-[4/5]",
  "16/10": "aspect-[16/10]",
  "16/9": "aspect-[16/9]",
  "1/1": "aspect-square",
};

export function ArtifactFrame({
  member,
  src,
  alt,
  caption,
  aspectRatio = "4/5",
  mediaClassName,
  photoMaxHeightClassName = "max-h-[clamp(18rem,56dvb,34rem)]",
  alignClassName = "justify-items-center",
  plateLabel,
  headline,
  priority,
  showPlaceholder = true,
  className,
}: ArtifactFrameProps) {
  const resolvedAlt = alt ?? member.artifacts?.alt ?? `${member.name}: ${member.role}`;
  const resolvedCaption = caption ?? member.artifacts?.caption;
  const resolvedSrc = resolveImageSrc(src ?? member.artifacts?.heroImage);

  if (!resolvedSrc && !showPlaceholder) {
    return null;
  }

  const imgPriorityProps =
    priority === "high"
      ? ({ fetchPriority: "high" } as Record<string, unknown>)
      : priority === "low"
        ? ({ fetchPriority: "low", loading: "lazy" } as Record<string, unknown>)
        : ({ loading: "lazy" } as Record<string, unknown>);

  return (
    <figure
      className={cn(
        "artifact-frame group/artifact m-0 grid min-w-0 gap-3",
        alignClassName,
        className,
      )}
    >
      {resolvedSrc ? (
        <img
          key={member.version ?? 0}
          src={resolvedSrc}
          alt={resolvedAlt}
          className={cn(
            "artifact-frame-media block h-auto w-auto max-w-full rounded-frame border border-edge bg-surface-muted",
            "transition-[border-color,box-shadow,transform] duration-300 ease-(--ease-brand)",
            "group-hover/artifact:border-[color-mix(in_oklab,var(--tone,var(--accent))_48%,var(--edge))] group-hover/artifact:shadow-raised motion-safe:group-hover/artifact:-translate-y-0.5",
            photoMaxHeightClassName,
          )}
          {...imgPriorityProps}
        />
      ) : (
        <div
          className={cn(
            "artifact-frame-media relative isolate w-full overflow-hidden",
            "rounded-frame border border-edge bg-surface-muted",
            "transition-[border-color,box-shadow] duration-300 ease-(--ease-brand)",
            "group-hover/artifact:border-[color-mix(in_oklab,var(--tone,var(--accent))_48%,var(--edge))] group-hover/artifact:shadow-raised",
            mediaClassName ?? aspectClasses[aspectRatio],
          )}
        >
          <div
            className="flex size-full flex-col justify-between p-[clamp(1.35rem,4.5cqi,2.5rem)] text-ink transition-transform duration-500 ease-(--ease-brand) motion-safe:group-hover/artifact:scale-[1.012]"
            style={{
              background:
                "radial-gradient(120% 100% at 100% 0%, color-mix(in oklab, var(--tone, var(--accent)) 14%, transparent) 0%, transparent 70%), linear-gradient(155deg, var(--surface) 0%, var(--surface-muted) 100%)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={cn(
                  "font-mono type-micro font-semibold tracking-[0.06em] uppercase",
                  tagColorByPillar[member.pillar],
                )}
              >
                {plateLabel ?? `${member.pillar} · ${member.pillarFull}`}
              </span>
              <span className="font-mono type-micro font-medium text-ink-muted">
                {member.role || "Capstone Builder"}
              </span>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="m-0 max-w-[26ch] font-serif type-title-4 font-[560] text-ink">
                {headline ?? (member.role || member.name)}
              </p>
              <span
                className="font-serif type-numeral font-semibold tabular leading-none text-ink/20 select-none"
                aria-hidden="true"
              >
                {member.index}
              </span>
            </div>
          </div>
        </div>
      )}

      {resolvedCaption ? (
        <figcaption className="type-ui-sm text-ink-muted">{resolvedCaption}</figcaption>
      ) : null}
    </figure>
  );
}
