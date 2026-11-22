import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import type { FilterOption, MemberProject, TeamMember } from "@/data/capstone";
import { ProjectDetailContent } from "@/components/ProjectDetailContent";
import { TransitionLink } from "@/components/TransitionLink";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { isValidHttpUrl } from "@/lib/editorForm";
import {
  findCanonicalProject,
  normalizeProjectTitle,
  type MergedProject,
} from "@/lib/mergedProjects";

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

interface GroupedEntry {
  key: string;
  members: TeamMember[];
  project: MemberProject;
  canonical?: MergedProject;
}

export function SelectedWorkSection({
  members,
  activeFilter,
  onResetFilter,
}: SelectedWorkSectionProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const collected: GroupedEntry[] = [];
  for (const member of members) {
    if (activeFilter !== "All" && member.pillar !== activeFilter) continue;
    let countForMember = 0;
    for (const project of member.projects ?? []) {
      if (project.featured === false) continue;
      const canonical = findCanonicalProject(project.title);
      const normalized = normalizeProjectTitle(project.title);
      const key = canonical
        ? canonical.keys[0]
        : normalized || `${member.id}-${project.title}`;
      const existing = collected.find((entry) => entry.key === key);
      if (existing) {
        if (!existing.members.some((m) => m.id === member.id)) existing.members.push(member);
        if (!existing.project.url && project.url) existing.project.url = project.url;
        if (!existing.project.tag && project.tag) existing.project.tag = project.tag;
      } else {
        collected.push({ key, members: [member], project: { ...project }, canonical });
      }
      countForMember += 1;
      if (activeFilter === "All" && countForMember >= 3) break;
    }
  }

  const entries = collected.map(({ key, members: cardMembers, project, canonical }) => {
    const resolvedProject =
      canonical && cardMembers.length >= 2
        ? {
            ...project,
            title: canonical.title,
            detail: canonical.detail,
            tag: canonical.tag ?? project.tag,
          }
        : project;
    return { key, members: cardMembers, project: resolvedProject };
  });

  return (
    <section
      id="work"
      tabIndex={-1}
      className="@container/work scroll-mt-(--header-h) border-t border-edge bg-page py-[clamp(3.5rem,8dvb,6rem)]"
      aria-labelledby="work-heading"
    >
      <div className="shell grid min-w-0 gap-[clamp(2.25rem,5cqi,3.75rem)]">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid max-w-[54ch] gap-2.5">
            <p className="m-0 type-ui-sm font-semibold text-accent">
              Track record
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
            {entries.map(({ key, members: cardMembers, project }) => {
              const uniformPillar = cardMembers.every((m) => m.pillar === cardMembers[0].pillar)
                ? cardMembers[0].pillar
                : null;
              return (
              <motion.li
                key={key}
                variants={cardReveal}
                className="flex w-[min(82vw,21rem)] shrink-0 snap-start @min-[46rem]/work:w-auto"
              >
                <article
                  data-pillar={uniformPillar ?? undefined}
                  className="member-card ui-card-interactive flex w-full min-w-0 flex-col justify-between gap-4 rounded-card border border-edge bg-surface p-[clamp(1.25rem,2.5cqi,1.6rem)]"
                >
                  <div className="grid gap-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {uniformPillar ? (
                        <PillarBadge pillar={uniformPillar}>{uniformPillar}</PillarBadge>
                      ) : (
                        <span className="type-ui-sm font-semibold text-ink-muted">
                          Team project
                        </span>
                      )}
                      {project.tag ? (
                        <span className="rounded-chip border border-rule bg-surface-muted px-2.5 py-0.5 type-micro font-semibold text-ink-secondary">
                          {project.tag}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="m-0 font-serif type-heading font-semibold text-ink">
                      {project.title}
                    </h3>
                    {project.detail ? (
                      <ProjectDetailContent detail={project.detail} compact />
                    ) : null}
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
                    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      {cardMembers.map((cardMember, index) => (
                        <span key={cardMember.id} className="inline-flex items-baseline gap-1.5">
                          {index > 0 ? (
                            <span aria-hidden="true" className="text-ink-muted">
                              ·
                            </span>
                          ) : null}
                          <TransitionLink
                            to={`/member/${cardMember.slug}`}
                            direction="forward"
                            className="ui-link-underline group/m inline-flex min-h-10 items-center gap-1 type-ui-sm font-semibold text-ink hover:text-(--tone,var(--accent)) pointer-coarse:min-h-11"
                          >
                            <span>{cardMember.name}</span>
                            {index === cardMembers.length - 1 ? (
                              <ArrowRight
                                className="size-3.5 transition-transform duration-150 motion-safe:group-hover/m:translate-x-[0.2em]"
                                aria-hidden="true"
                              />
                            ) : null}
                          </TransitionLink>
                        </span>
                      ))}
                    </span>

                    {project.url && isValidHttpUrl(project.url) ? (
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ui-link-underline inline-flex min-h-10 items-center gap-1 type-ui-sm font-semibold text-(--tone,var(--accent)) pointer-coarse:min-h-11"
                      >
                        <span>View</span>
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </footer>
                </article>
              </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </section>
  );
}
