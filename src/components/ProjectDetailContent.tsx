import { cn } from "cn";
import { parseProjectDetail } from "@/lib/projectFormatting";

interface ProjectDetailContentProps {
  detail: string;
  compact?: boolean;
  className?: string;
}

export function ProjectDetailContent({
  detail,
  compact = false,
  className,
}: ProjectDetailContentProps) {
  const { intro, bullets } = parseProjectDetail(detail);
  if (intro.length === 0 && bullets.length === 0) return null;

  const visibleBullets = compact ? bullets.slice(0, 2) : bullets;
  const hiddenBulletCount = compact ? Math.max(0, bullets.length - visibleBullets.length) : 0;

  return (
    <div className={cn("grid min-w-0 gap-2.5", className)}>
      {intro.length > 0 ? (
        <div className="grid gap-1">
          {intro.map((line, idx) => (
            <p
              key={idx}
              className={cn(
                "m-0 type-body-sm text-ink-secondary",
                compact && "line-clamp-2",
              )}
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {visibleBullets.length > 0 ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {visibleBullets.map((bullet, idx) => (
            <li
              key={idx}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5"
            >
              <span
                className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-(--tone,var(--accent))"
                aria-hidden="true"
              />
              <div className="grid min-w-0 gap-0.5">
                {bullet.sublines.length > 0 ? (
                  <>
                    <span
                      className={cn(
                        "type-body-sm font-semibold text-ink",
                        compact && "line-clamp-1",
                      )}
                    >
                      {bullet.text}
                    </span>
                    {bullet.sublines.map((sub, subIdx) => (
                      <p
                        key={subIdx}
                        className={cn(
                          "m-0 type-body-sm text-ink-secondary",
                          compact && "line-clamp-2",
                        )}
                      >
                        {sub}
                      </p>
                    ))}
                  </>
                ) : (
                  <span
                    className={cn(
                      "type-body-sm text-ink-secondary",
                      compact && "line-clamp-2",
                    )}
                  >
                    {bullet.text}
                  </span>
                )}
              </div>
            </li>
          ))}
          {hiddenBulletCount > 0 ? (
            <li className="ps-4 type-micro font-medium text-ink-muted">
              +{hiddenBulletCount} more {hiddenBulletCount === 1 ? "point" : "points"} on profile
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
