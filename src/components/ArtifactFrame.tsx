import type { TeamMember } from "@/data/capstone";

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
  className = "",
  overlay = "full",
}: ArtifactFrameProps) {
  const resolvedAlt =
    alt ?? member.artifacts?.alt ?? `${member.name}: ${member.role}`;
  const resolvedCaption = caption ?? member.artifacts?.caption;

  return (
    <figure
      className={`artifact-frame ${className}`.trim()}
      data-aspect={aspectRatio}
      data-tone={tone}
      data-pillar={member.pillar}
    >
      <div className="artifact-frame-media">
        {src ? (
          <img
            src={src}
            alt={resolvedAlt}
            className="artifact-frame-img"
            loading="lazy"
          />
        ) : (
          <div className="artifact-plate" aria-hidden="true">
            <div className="artifact-plate-top">
              <span className="artifact-plate-tag">
                <span className="artifact-plate-dot" />
                <span>
                  {plateLabel ?? `${member.pillar} · ${member.pillarFull}`}
                </span>
              </span>
            </div>
            <div className="artifact-plate-center">
              {overlay === "full" && (
                <span className="artifact-plate-role">
                  {headline ?? member.role}
                </span>
              )}
              <span className="artifact-plate-numeral">{member.index}</span>
            </div>
            {overlay === "full" && (
              <div className="artifact-plate-bottom">
                <span className="artifact-plate-spec">
                  {subline ?? member.skillsets.slice(0, 3).join(" · ")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {resolvedCaption && (
        <figcaption className="artifact-frame-caption">
          {resolvedCaption}
        </figcaption>
      )}
    </figure>
  );
}
