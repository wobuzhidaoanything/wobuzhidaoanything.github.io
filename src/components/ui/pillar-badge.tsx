import type { Pillar } from "@/data/capstone";
import { cn } from "cn";

const accentByPillar: Record<Pillar, string> = {
  CSD: "text-pillar-csd",
  EPD: "text-pillar-epd",
  ESD: "text-pillar-esd",
};

const dotByPillar: Record<Pillar, string> = {
  CSD: "bg-pillar-csd",
  EPD: "bg-pillar-epd",
  ESD: "bg-pillar-esd",
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
        "pillar-label inline-flex items-center gap-[0.45rem]",
        "type-ui-sm font-semibold tracking-[0.04em]",
        "[text-box:trim-both_cap_alphabetic]",
        accentByPillar[pillar],
        className,
      )}
    >
      <span
        className={cn("size-[0.45rem] shrink-0 rounded-full", dotByPillar[pillar])}
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  );
}
