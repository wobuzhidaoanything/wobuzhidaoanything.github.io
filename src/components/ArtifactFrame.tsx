import { cn } from "cn";
import type { Pillar, TeamMember } from "@/data/capstone";
import { resolveImageSrc } from "@/lib/media";

interface ArtifactFrameProps {
  member: TeamMember;
  src?: string;
  alt?: string;
  caption?: string;
  aspectRatio?: "4/5" | "16/10" | "16/9" | "1/1";
  plateLabel?: string;
  headline?: string;
  subline?: string;
  tone?: "default" | "charcoal";
  className?: string;
  /**
   * "minimal" renders only the tag row and index numeral, so chapters can
   * keep role / skillset / interest copy in a single canonical home instead
   * of repeating it on every plate.
   */
  overlay?: "full" | "minimal";
}

const plateAccentByPillar: Record<Pillar, string> = {
  CSD: "[--plate-accent:var(--pillar-csd)]",
  EPD: "[--plate-accent:var(--pillar-epd)]",
  ESD: "[--plate-accent:var(--pillar-esd)]",
};

const tagColorByPillar: Record<Pillar, string> = {
  CSD: "group-data-[pillar=CSD]/artifact:text-pillar-csd",
  EPD: "group-data-[pillar=EPD]/artifact:text-pillar-epd",
  ESD: "group-data-[pillar=ESD]/artifact:text-pillar-esd",
};

/** Attribute-safe slugs: a slash or quote in the value breaks the variant. */
const aspectSlugs = {
  "4/5": "4x5",
  "16/10": "16x10",
  "16/9": "16x9",
  "1/1": "1x1",
} as const;

const aspectClasses: Record<NonNullable<ArtifactFrameProps["aspectRatio"]>, string> = {
  "4/5": "aspect-[4/5]",
  "16/10": "group-data-[aspect=16x10]/artifact:aspect-[16/10]",
  "16/9": "group-data-[aspect=16x9]/artifact:aspect-[16/9]",
  "1/1": "group-data-[aspect=1x1]/artifact:aspect-square",
};

export function ArtifactFrame({
  member,
  src,
  alt,
  caption,
  aspectRatio = "4/5",
  plateLabel,
  headline,
  subline,
  tone = "default",
  className,
  overlay = "full",
}: ArtifactFrameProps) {
  const resolvedAlt =
    alt ?? member.artifacts?.alt ?? `${member.name}: ${member.role}`;
  const resolvedCaption = caption ?? member.artifacts?.caption;
  const resolvedSrc = resolveImageSrc(src ?? member.artifacts?.heroImage);

  return (
    <figure
      className={cn(
        "artifact-frame group/artifact @container/artifact m-0 grid min-w-0",
        "grid-cols-[minmax(0,1fr)] gap-2.5",
        plateAccentByPillar[member.pillar],
        className,
      )}
      data-aspect={aspectSlugs[aspectRatio]}
      data-tone={tone}
      data-pillar={member.pillar}
    >
      <div
        className={cn(
          "artifact-frame-media relative isolate overflow-hidden",
          "rounded-frame border border-edge bg-surface-muted",
          aspectClasses[aspectRatio],
        )}
      >
        {resolvedSrc ? (
          <img
            key={member.version ?? 0}
            src={resolvedSrc}
            alt={resolvedAlt}
            className="block size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="artifact-plate pointer-events-none flex size-full flex-col justify-between p-[clamp(1rem,5cqi,2rem)] text-ink"
            style={{
              background:
                "linear-gradient(155deg, var(--surface) 0%, var(--surface-muted) 100%)",
            }}
            aria-hidden="true"
          >
            <div className="artifact-plate-top relative z-1 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1">
              <span
                className={cn(
                  "artifact-plate-tag inline-flex min-w-0 items-center gap-[0.45rem]",
                  "type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-secondary",
                  tagColorByPillar[member.pillar],
                )}
              >
                <span className="artifact-plate-dot size-[0.45rem] shrink-0 rounded-full bg-[var(--plate-accent,var(--ink-secondary))]" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {plateLabel ?? `${member.pillar} · ${member.pillarFull}`}
                </span>
              </span>
            </div>
            <div className="relative z-1 grid content-center gap-1">
              {overlay === "full" && (
                <span className="font-serif type-role italic font-medium text-ink">
                  {headline ?? member.role}
                </span>
              )}
              <span className="font-serif type-numeral font-medium leading-[0.88] tracking-[-0.04em] text-ink opacity-[0.18]">
                {member.index}
              </span>
            </div>
            {overlay === "full" && (
              <div className="relative z-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="type-ui-sm font-semibold tabular tracking-[0.02em] text-ink-secondary">
                  {subline ?? member.skillsets.slice(0, 3).join(" · ")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {resolvedCaption && (
        <figcaption className="type-ui-sm text-ink-secondary">
          {resolvedCaption}
        </figcaption>
      )}
    </figure>
  );
}
