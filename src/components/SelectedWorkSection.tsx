import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import {
  getMainPageMemberName,
  type FilterOption,
  type MemberProject,
  type Pillar,
  type TeamMember,
} from "@/data/capstone";
import { ProjectDetailContent } from "@/components/ProjectDetailContent";
import { TransitionLink } from "@/components/TransitionLink";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { isValidHttpUrl } from "@/lib/editorForm";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
};

const cardReveal: Variants = {
  hidden: { opacity: 0, y: "4%", scale: 0.99 },
  visible: {
    opacity: 1,
    y: "0%",
    scale: 1,
    transition: { duration: 0.4, ease: EASE },
  },
};

interface SelectedWorkSectionProps {
  members: TeamMember[];
  activeFilter: FilterOption;
  onResetFilter: () => void;
}

interface SharedProjectSpec {
  id: string;
  title: string;
  tag?: string;
  detail: string;
  url?: string;
  contributors: { memberId: string; matchTitles: string[] }[];
}

const SHARED_PROJECTS: SharedProjectSpec[] = [
  {
    id: "shared-guard-damp-it",
    title: "Guard-Damp-It!",
    tag: "Project",
    detail: [
      "Smart weedwhacker safety guard designed to prevent flying-debris injuries and give real-time user feedback.",
      "- Fabricated the safety guard housing via 3D printing (Nicholas).",
      "- Designed the circuit and PCB to support safe grass-cutting feedback (Jayden).",
      "- Ran vibration-threshold testing to detect usage and trigger feedback (Harish).",
    ].join("\n"),
    contributors: [
      { memberId: "nicholas", matchTitles: ["guard-damp-it!", "guard-damp-it"] },
      { memberId: "jayden", matchTitles: ["guard-damp-it", "guard-damp-it!"] },
      { memberId: "harish", matchTitles: ["guard-damp-it!", "guard-damp-it"] },
    ],
  },
  {
    id: "shared-solar-mosquito-trap",
    title: "Solar-Powered Mosquito Trap",
    tag: "Project · 2025",
    detail: [
      "Designing Energy Systems (SUTD, May – Aug 2025). Rebuilt a mains-charged mosquito trap into a self-sustaining solar unit.",
      "- Redesigned the power subsystem with load-profile calculations and panel/battery sizing optimisation (Jin Hng).",
      "- Designed and 3D-printed the enclosure in Autodesk Inventor with clean internal wiring (Soe Khant).",
    ].join("\n"),
    contributors: [
      { memberId: "jin-hng", matchTitles: ["solar-powered mosquito trap"] },
      {
        memberId: "soe-khant",
        matchTitles: ["solar-powered insect trap", "solar-powered mosquito trap"],
      },
    ],
  },
  {
    id: "shared-liquid-metal-flexible-antenna",
    title: "Liquid Metal Flexible Antenna",
    tag: "Project",
    detail: [
      "EGaIn-in-PDMS wearable antenna that measures real-time knee angle through emitted frequency shifts.",
      "- Designed wearable liquid-metal antenna geometry for flexible electronics (Nicholas).",
      "- Iterated designs for optimal frequency and bandwidth and assisted with PDMS/EGaIn fabrication (Harish).",
    ].join("\n"),
    contributors: [
      { memberId: "nicholas", matchTitles: ["liquid metal flexible antenna"] },
      {
        memberId: "harish",
        matchTitles: ["flexible antenna", "liquid metal flexible antenna"],
      },
    ],
  },
];

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

interface FeaturedEntry {
  key: string;
  members: TeamMember[];
  pillars: Pillar[];
  project: MemberProject;
}

export function SelectedWorkSection({
  members,
  activeFilter,
  onResetFilter,
}: SelectedWorkSectionProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const membersById = new Map(members.map((m) => [m.id, m]));
  const consumedKeys = new Set<string>();
  const entries: FeaturedEntry[] = [];

  for (const spec of SHARED_PROJECTS) {
    const resolvedContributors: TeamMember[] = [];
    for (const c of spec.contributors) {
      const member = membersById.get(c.memberId);
      if (!member) continue;
      const matched = (member.projects ?? []).find(
        (p) => p.featured !== false && c.matchTitles.includes(normalizeTitle(p.title)),
      );
      if (!matched) continue;
      resolvedContributors.push(member);
      consumedKeys.add(`${member.id}::${normalizeTitle(matched.title)}`);
    }

    if (resolvedContributors.length === 0) continue;
    const pillars = Array.from(new Set(resolvedContributors.map((m) => m.pillar)));
    if (activeFilter !== "All" && !pillars.includes(activeFilter)) continue;

    entries.push({
      key: spec.id,
      members: resolvedContributors,
      pillars,
      project: {
        title: spec.title,
        tag: spec.tag,
        detail: spec.detail,
        url: spec.url,
      },
    });
  }

  for (const member of members) {
    if (activeFilter !== "All" && member.pillar !== activeFilter) continue;
    let countForMember = 0;
    for (const project of member.projects ?? []) {
      if (project.featured === false) continue;
      if (consumedKeys.has(`${member.id}::${normalizeTitle(project.title)}`)) {
        continue;
      }
      entries.push({
        key: `${member.id}-${project.title}`,
        members: [member],
        pillars: [member.pillar],
        project,
      });
      countForMember += 1;
      if (activeFilter === "All" && countForMember >= 3) break;
    }
  }

  return (
    <section
      id="work"
      tabIndex={-1}
      className="@container/work scroll-mt-(--header-h) border-t border-edge bg-page py-[clamp(5rem,11dvb,8.25rem)]"
      aria-labelledby="work-heading"
    >
      <div className="shell grid min-w-0 gap-[clamp(2.25rem,5cqi,3.75rem)]">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid max-w-[54ch] gap-2.5">
            <p className="m-0 type-ui-sm font-semibold tracking-[0.05em] uppercase text-accent">
              Track Record
            </p>
            <h2 id="work-heading" className="m-0 font-serif type-title-3 font-semibold text-ink">
              Our Experience &amp; Expertise
            </h2>
            <p className="m-0 type-body-lg text-ink-secondary">
              Past builds, research prototypes, and industry internships across the team.
            </p>
          </div>
          {activeFilter !== "All" ? (
            <button
              type="button"
              onClick={onResetFilter}
              className="ui-press inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-control border border-edge bg-surface px-4 py-2 type-ui-sm font-semibold text-ink hover:bg-surface-muted/75 pointer-coarse:min-h-11"
            >
              Showing {activeFilter} · Show all pillars
            </button>
          ) : null}
        </header>

        {entries.length === 0 ? (
          <p className="m-0 border-y border-rule py-8 type-body text-ink-secondary">
            No featured projects listed for {activeFilter === "All" ? "the team" : activeFilter} yet.
          </p>
        ) : (
          <motion.ul
            key={activeFilter}
            variants={gridStagger}
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: "some" }}
            className={cn(
              "work-scroller stagger-list m-0 flex list-none gap-6 overflow-x-auto p-0 pb-2",
              "snap-x snap-mandatory @min-[46rem]/work:grid @min-[46rem]/work:grid-cols-2 @min-[68rem]/work:grid-cols-3 @min-[46rem]/work:overflow-visible @min-[46rem]/work:pb-0",
            )}
          >
            {entries.map(({ key, members: entryMembers, pillars, project }) => (
              <motion.li
                key={key}
                variants={cardReveal}
                className="flex w-[min(82vw,21rem)] shrink-0 snap-start @min-[46rem]/work:w-auto"
              >
                <article
                  data-pillar={pillars[0]}
                  className="member-card ui-card-interactive flex w-full min-w-0 flex-col justify-between gap-5 rounded-card border border-edge bg-surface p-[clamp(1.5rem,3.5cqi,2.15rem)]"
                >
                  <div className="grid gap-3.5">
                    <header className="grid gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pillars.map((pillar) => (
                            <PillarBadge key={pillar} pillar={pillar}>
                              {pillar}
                            </PillarBadge>
                          ))}
                        </div>
                        {project.tag ? (
                          <span className="rounded-chip border border-rule bg-surface-muted px-2.5 py-0.5 font-mono type-micro font-semibold text-ink-secondary">
                            {project.tag}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="m-0 font-serif type-heading font-[580] text-ink">
                        {project.title}
                      </h3>
                    </header>
                    {project.detail ? (
                      <ProjectDetailContent detail={project.detail} compact />
                    ) : null}
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {entryMembers.map((member) => (
                        <TransitionLink
                          key={member.id}
                          to={`/member/${member.slug}`}
                          direction="forward"
                          className="ui-link-underline group/m inline-flex min-h-10 items-center gap-1.5 type-ui-sm font-semibold text-ink hover:text-(--tone) pointer-coarse:min-h-11"
                        >
                          <span>{getMainPageMemberName(member)}</span>
                          <ArrowRight
                            className="size-3.5 transition-transform duration-150 motion-safe:group-hover/m:translate-x-[0.2em]"
                            aria-hidden="true"
                          />
                        </TransitionLink>
                      ))}
                    </div>

                    {project.url && isValidHttpUrl(project.url) ? (
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ui-link-underline inline-flex min-h-10 items-center gap-1 type-ui-sm font-semibold text-(--tone) pointer-coarse:min-h-11"
                      >
                        <span>View</span>
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </footer>
                </article>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </section>
  );
}
