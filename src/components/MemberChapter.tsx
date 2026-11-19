import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import type { Pillar, TeamMember } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { MemberLinksRow } from "@/components/MemberLinksRow";
import { TransitionLink } from "@/components/TransitionLink";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { useTransitionState } from "@/hooks/useTransitionMember";
import { isValidHttpUrl } from "@/lib/editorForm";

export type ChapterSurfaceTone = "default" | "alt" | "charcoal";

interface MemberChapterProps {
  member: TeamMember;
  displayIndex: string;
  totalCount: number;
  surfaceTone?: ChapterSurfaceTone;
  pinSide?: "left" | "right";
}

const EASE = [0.22, 1, 0.36, 1] as const;

const identityStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.02,
    },
  },
};

const stageStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const riseItem: Variants = {
  hidden: { opacity: 0, y: "14%" },
  visible: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.42, ease: EASE },
  },
};

const stageBlock: Variants = {
  hidden: { opacity: 0, y: "3.5%", scale: 0.99 },
  visible: {
    opacity: 1,
    y: "0%",
    scale: 1,
    transition: { duration: 0.46, ease: EASE },
  },
};

const ruleReveal: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.4, ease: EASE },
  },
};

const ruleByPillar: Record<Pillar, string> = {
  CSD: "bg-pillar-csd",
  EPD: "bg-pillar-epd",
  ESD: "bg-pillar-esd",
};

const kickerStyles =
  "m-0 type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted";

function hasAnyMemberLink(links?: TeamMember["links"]): boolean {
  if (!links) return false;
  return Boolean(
    (links.github && isValidHttpUrl(links.github)) ||
      (links.linkedin && isValidHttpUrl(links.linkedin)) ||
      (links.portfolio && isValidHttpUrl(links.portfolio)) ||
      links.email,
  );
}

export function MemberChapter({
  member,
  displayIndex,
  totalCount,
  surfaceTone = "default",
  pinSide = "left",
}: MemberChapterProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const transitionState = useTransitionState();
  const totalFormatted = String(totalCount).padStart(2, "0");

  const hasSkills = member.skillsets.length > 0;
  const hasTools = Boolean(member.tools && member.tools.length > 0);
  const hasInterests = member.interests.length > 0;
  const projects = member.projects ?? [];
  const hasProjects = projects.length > 0;
  const hasLinks = hasAnyMemberLink(member.links);
  const hasDetails = hasSkills || hasTools || hasInterests || hasProjects;

  const isFilterTransition = transitionState.mode === "filter";
  const isMorphTarget =
    transitionState.mode === "member" &&
    transitionState.memberSlug === member.slug &&
    transitionState.source === "chapter";

  return (
    <section
      id={`chapter-${member.slug}`}
      tabIndex={-1}
      data-pillar={member.pillar}
      data-chapter-index={displayIndex}
      data-surface={surfaceTone === "charcoal" ? "charcoal" : undefined}
      className={cn(
        "member-chapter roster-chapter-item @container/chapter border-b border-edge py-[clamp(4.5rem,10dvb,8.5rem)]",
        surfaceTone === "alt" ? "bg-surface-alt" : "bg-page",
      )}
      style={
        isFilterTransition
          ? ({ viewTransitionName: `chapter-${member.id}` } as React.CSSProperties)
          : undefined
      }
      aria-labelledby={`chapter-heading-${member.slug}`}
    >
      <div
        className={cn(
          "shell grid min-w-0 items-start",
          "grid-cols-[minmax(0,1fr)_clamp(6.5rem,27cqi,13rem)] gap-x-[clamp(1rem,4cqi,2.5rem)] gap-y-[clamp(2rem,5cqi,3.25rem)]",
          "@min-[54rem]/chapter:grid-rows-[auto_1fr] @min-[54rem]/chapter:gap-x-[clamp(2.75rem,6cqi,5.5rem)] @min-[54rem]/chapter:gap-y-[clamp(2.25rem,5cqi,3.5rem)]",
          pinSide === "right"
            ? "@min-[54rem]/chapter:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]"
            : "@min-[54rem]/chapter:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]",
        )}
      >
        <motion.div
          className={cn(
            "col-start-1 row-start-1 grid min-w-0 content-start gap-3.5 @min-[54rem]/chapter:gap-5",
            "@min-[54rem]/chapter:sticky @min-[54rem]/chapter:top-[calc(var(--header-h)+2.5rem)] @min-[54rem]/chapter:row-span-2",
            pinSide === "right" ? "@min-[54rem]/chapter:col-start-2" : "@min-[54rem]/chapter:col-start-1",
          )}
          variants={identityStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: "some" }}
        >
          <motion.div
            variants={ruleReveal}
            className={cn("h-[3px] w-12 origin-left rounded-full", ruleByPillar[member.pillar])}
            aria-hidden="true"
          />

          <motion.div variants={riseItem} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-serif type-body-sm font-[560] tabular text-ink-secondary">
              {displayIndex} / {totalFormatted}
            </span>
            <PillarBadge pillar={member.pillar}>
              {member.pillar} · {member.pillarFull}
            </PillarBadge>
          </motion.div>

          <motion.h3
            variants={riseItem}
            id={`chapter-heading-${member.slug}`}
            className="m-0 w-fit font-serif type-title-2 font-semibold text-ink"
            style={
              isMorphTarget
                ? ({ viewTransitionName: "member-name" } as React.CSSProperties)
                : undefined
            }
          >
            <TransitionLink
              to={`/member/${member.slug}`}
              direction="forward"
              memberSlug={member.slug}
              transitionSource="chapter"
              className="ui-link-underline inline-block text-inherit hover:text-(--tone)"
            >
              {member.name}
            </TransitionLink>
          </motion.h3>

          {member.minor ? (
            <motion.p
              variants={riseItem}
              className="-mt-1 m-0 font-mono type-ui-sm font-medium tracking-[0.05em] uppercase text-ink-secondary"
            >
              Minor in {member.minor}
            </motion.p>
          ) : null}

          {member.role ? (
            <motion.p
              variants={riseItem}
              className="m-0 font-serif type-role italic font-medium text-accent"
            >
              {member.role}
            </motion.p>
          ) : null}

          {member.bio ? (
            <motion.p
              variants={riseItem}
              className="m-0 max-w-[34ch] type-body-lg text-ink-secondary @min-[54rem]/chapter:max-w-[46ch]"
            >
              {member.bio}
            </motion.p>
          ) : null}

          {hasLinks ? (
            <motion.div variants={riseItem}>
              <MemberLinksRow links={member.links} className="pt-1" />
            </motion.div>
          ) : null}

          <motion.div variants={riseItem} className="pt-1 @min-[54rem]/chapter:pt-2">
            <TransitionLink
              to={`/member/${member.slug}`}
              direction="forward"
              memberSlug={member.slug}
              transitionSource="chapter"
              className="ui-press group/link inline-flex min-h-11 items-center gap-2.5 rounded-control border border-control bg-surface px-4.5 py-2.5 type-ui font-semibold text-ink no-underline hover:border-(--tone) hover:bg-[color-mix(in_oklab,var(--tone)_10%,var(--surface))]"
            >
              <span>View full profile</span>
              <ArrowRight
                className="size-4 transition-transform duration-200 motion-safe:group-hover/link:translate-x-[0.22em]"
                aria-hidden="true"
              />
            </TransitionLink>
          </motion.div>
        </motion.div>

        <motion.div
          variants={stageBlock}
          initial={shouldReduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: "some" }}
          className={cn(
            "col-start-2 row-start-1 min-w-0 self-start",
            pinSide === "right" ? "@min-[54rem]/chapter:col-start-1" : "@min-[54rem]/chapter:col-start-2",
          )}
        >
          <ArtifactFrame
            member={member}
            src={member.artifacts?.heroImage}
            alignClassName="justify-items-end @min-[54rem]/chapter:justify-items-center"
            mediaClassName="aspect-[4/5] @min-[54rem]/chapter:aspect-[16/10]"
            photoMaxHeightClassName="max-h-[clamp(9.5rem,36cqi,15.5rem)] @min-[54rem]/chapter:max-h-[clamp(22rem,56dvb,34rem)]"
            plateLabel={`${member.pillar} · ${member.pillarFull}`}
          />
        </motion.div>

        {hasDetails ? (
          <motion.div
            className={cn(
              "@container/chapter-detail col-span-2 row-start-2 grid min-w-0 content-start gap-[clamp(2rem,4.5cqi,3.25rem)]",
              "@min-[54rem]/chapter:col-span-1",
              pinSide === "right" ? "@min-[54rem]/chapter:col-start-1" : "@min-[54rem]/chapter:col-start-2",
            )}
            variants={stageStagger}
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: "some" }}
          >
            {hasSkills ? (
              <motion.div variants={stageBlock} className="grid gap-4">
                <h4 className={kickerStyles}>Skillsets</h4>
                <ul className="m-0 grid list-none grid-cols-1 gap-x-10 gap-y-3.5 p-0 @min-[30rem]/chapter-detail:grid-cols-2">
                  {member.skillsets.map((skill, idx) => (
                    <li
                      key={skill}
                      className="flex items-baseline gap-3.5 type-body text-ink"
                    >
                      <span className="shrink-0 font-serif type-body-sm italic font-[540] tabular text-accent">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 font-medium">{skill}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}

            {hasTools || hasInterests ? (
              <motion.div
                variants={stageBlock}
                className={cn(
                  "grid grid-cols-1 gap-6",
                  hasSkills && "border-t border-rule pt-6",
                  hasTools && hasInterests && "@min-[34rem]/chapter-detail:grid-cols-2",
                )}
              >
                {hasTools ? (
                  <div className="grid content-start gap-3">
                    <h4 className={kickerStyles}>Tools &amp; Software</h4>
                    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {member.tools!.map((tool) => (
                        <li
                          key={tool}
                          className="rounded-control border border-edge bg-surface px-3 py-1 font-mono type-ui-sm font-medium text-ink transition-colors duration-150 hover:border-(--tone)"
                        >
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {hasInterests ? (
                  <div className="grid content-start gap-2.5">
                    <h4 className={kickerStyles}>Interests</h4>
                    <p className="m-0 type-body text-ink-secondary">
                      {member.interests.join(" · ")}
                    </p>
                  </div>
                ) : null}
              </motion.div>
            ) : null}

            {hasProjects ? (
              <motion.div
                variants={stageBlock}
                className={cn(
                  "grid gap-3.5",
                  (hasSkills || hasTools || hasInterests) && "border-t border-rule pt-6",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className={kickerStyles}>Projects &amp; Internships</h4>
                  <TransitionLink
                    to={`/member/${member.slug}`}
                    direction="forward"
                    memberSlug={member.slug}
                    transitionSource="chapter"
                    className="ui-link-underline type-ui-sm font-semibold text-(--tone)"
                  >
                    Read full details
                  </TransitionLink>
                </div>
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[36rem]/chapter-detail:grid-cols-2">
                  {projects.map((project) => (
                    <li
                      key={project.title}
                      className="ui-card-interactive flex flex-wrap items-center justify-between gap-2.5 rounded-card border border-edge bg-surface px-4 py-3.5"
                    >
                      <TransitionLink
                        to={`/member/${member.slug}`}
                        direction="forward"
                        memberSlug={member.slug}
                        transitionSource="chapter"
                        className="ui-link-underline font-serif type-label-lg font-semibold text-ink hover:text-(--tone)"
                      >
                        {project.title}
                      </TransitionLink>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {project.tag ? (
                          <span className="rounded-chip border border-rule bg-surface-muted px-2.5 py-0.5 font-mono type-micro font-semibold text-ink-secondary">
                            {project.tag}
                          </span>
                        ) : null}
                        {project.url && isValidHttpUrl(project.url) ? (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${project.title}`}
                            className="ui-press inline-flex size-9 items-center justify-center rounded-control border border-transparent text-(--tone) hover:bg-surface-muted/80 pointer-coarse:size-11"
                          >
                            <ArrowUpRight className="size-4" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
