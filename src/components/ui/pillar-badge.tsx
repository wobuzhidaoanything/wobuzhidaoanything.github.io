import type { Pillar } from "@/data/capstone";
import { cn } from "cn";

const accentByPillar: Record<Pillar, string> = {
  CSD: "text-pillar-csd",
  EPD: "text-pillar-epd",
  ESD: "text-pillar-esd",
};

/**
 * The small "EPD · Engineering Product Development" lockup. Extracted because
 * five separate rulesets used to spell it out with slightly different sizes.
 */
export function PillarBadge({
  pillar,
  children,
  className,
}: {
  pillar: Pillar;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pillar-label inline-flex items-center",
        "type-ui-sm font-semibold tracking-[0.04em]",
        "[text-box:trim-both_cap_alphabetic]",
        accentByPillar[pillar],
        className,
      )}
    >
      <span>{children}</span>
    </span>
  );
}
