// Shared canonicalisation for projects that several members shipped together.
// The home "Experience & Expertise" grid merges matching entries into a single
// card that credits every contributor, instead of repeating the same project
// once per member. Each member keeps their own copy in their profile data;
// this only affects how the grid renders.

export interface MergedProject {
  /** Canonical title shown on the merged card. */
  title: string;
  /** Combined write-up covering every member's contribution. */
  detail: string;
  tag?: string;
  /** Every normalized alias that resolves to this entry. */
  keys: string[];
}

const MERGED_PROJECTS: MergedProject[] = [
  {
    title: "Guard-Damp-It!",
    detail:
      "Smart weedwacker safety guard that reduces the risk of flying projectiles and debris while encouraging safe cutting behavior.\n" +
      "- Circuit and PCB design for impact sensing and operator feedback\n" +
      "- Vibration-threshold testing to set feedback triggers and measure cutting behavior\n" +
      "- 3D-printed guard fabrication for injury prevention in landscaping work",
    keys: ["guarddampit", "modificationofweedwacker"],
  },
  {
    title: "Liquid Metal Flexible Antenna",
    detail:
      "EGaIn-in-PDMS flexible antenna that tracks knee flexion in real time through frequency shifts.\n" +
      "- Multiple design iterations to optimize operating frequency and bandwidth\n" +
      "- PDMS and EGaIn encapsulation and fabrication\n" +
      "- Built for wearable, flexible-electronics applications",
    keys: ["liquidmetalflexibleantenna", "flexibleantenna"],
  },
  {
    title: "Solar-Powered Mosquito Trap",
    tag: "Project · 2025",
    detail:
      "Rebuilt a battery-powered insect trap as a fully solar-powered unit that never needs charging.\n" +
      "- Load-profile analysis and panel-to-battery sizing; power subsystem redesigned from mains-charged battery to self-sustaining solar\n" +
      "- Completed as part of SUTD Designing Energy Systems (May-Aug 2025)\n" +
      "- Casing modeled in Autodesk Inventor and 3D printed to fit every component with clean wiring",
    keys: ["solarpoweredmosquitotrap", "solarpoweredinsecttrap"],
  },
];

export function normalizeProjectTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const CANONICAL_BY_KEY = new Map<string, MergedProject>();
for (const entry of MERGED_PROJECTS) {
  for (const key of entry.keys) CANONICAL_BY_KEY.set(key, entry);
}

/** Look up the canonical merged entry for a project title, if one exists. */
export function findCanonicalProject(title: string): MergedProject | undefined {
  return CANONICAL_BY_KEY.get(normalizeProjectTitle(title));
}
