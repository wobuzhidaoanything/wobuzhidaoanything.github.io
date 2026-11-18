import { useParams } from "react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "cn";
import { GROUP_META, TEAM_MEMBERS } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { TransitionLink } from "@/components/TransitionLink";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTransitionState } from "@/hooks/useTransitionMember";

const EASE = [0.22, 1, 0.36, 1] as const;

const listStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.08,
    },
  },
};

const itemFade: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: EASE },
  },
};

const quietLinkStyles = cn(
  "inline-flex items-center gap-[0.45rem] min-h-10 px-3.5 py-1.5",
  "rounded-control border border-transparent type-ui font-semibold",
  "text-ink-secondary no-underline transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-surface-muted hover:border-edge hover:text-ink active:scale-[0.985]",
  "pointer-coarse:min-h-11",
);

const primaryLinkStyles = cn(
  "inline-flex items-center gap-[0.45rem] min-h-10 px-5 py-1.5 mt-7",
  "rounded-control border border-ink bg-ink text-page type-ui font-semibold no-underline",
  "transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-accent hover:border-accent hover:text-accent-ink active:scale-[0.985]",
);

const sectionTitleStyles =
  "m-0 font-serif type-heading-xs font-[580] text-wrap-balance";
const listItemStyles =
  "pb-2.5 border-b border-rule type-body-sm text-ink last:border-b-0 last:pb-0";
const numberedItemStyles = "flex items-baseline gap-3.5";

export function MemberDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const shouldReduceMotion = useReducedMotion();
  const memberIndex = TEAM_MEMBERS.findIndex(
    (m) => m.slug === slug || m.id === slug,
  );
  const member = memberIndex >= 0 ? TEAM_MEMBERS[memberIndex] : null;
  const transitionState = useTransitionState();

  useDocumentTitle(
    member
      ? `${member.name} (${member.pillar}) | ${GROUP_META.title}`
      : `Member Not Found | ${GROUP_META.title}`,
  );

  if (!member) {
    return (
      <div className="detail-page-shell shell shell-block">
        <section className="py-[clamp(3rem,8dvb,5.5rem)]">
          <p className="mb-5 type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-secondary">
            Profile not found
          </p>
          <h1
            id="main-content"
            tabIndex={-1}
            className="m-0 font-serif type-title-1 font-semibold text-wrap-balance"
          >
            No member matches “{slug}”.
          </h1>
          <p className="mt-6 max-w-[48ch] type-body-lg text-ink-secondary">
            Return to About Us to view all seven SUTD members.
          </p>
          <TransitionLink
            to="/"
            direction="backward"
            className={primaryLinkStyles}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to About Us</span>
          </TransitionLink>
        </section>
      </div>
    );
  }

  const prevMember =
    TEAM_MEMBERS[(memberIndex - 1 + TEAM_MEMBERS.length) % TEAM_MEMBERS.length];
  const nextMember = TEAM_MEMBERS[(memberIndex + 1) % TEAM_MEMBERS.length];
  const isMorphTarget =
    transitionState.mode === "member" &&
    transitionState.memberSlug === member.slug &&
    transitionState.source === "card";

  return (
    <div className="detail-page-shell shell shell-block">
      <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
        <TransitionLink to="/" direction="backward" className={quietLinkStyles}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>All 7 Members</span>
        </TransitionLink>

        <nav className="flex flex-wrap items-center gap-1" aria-label="Member pagination">
          <TransitionLink
            to={`/member/${prevMember.slug}`}
            direction="backward"
            className={quietLinkStyles}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>
              {prevMember.name} · {prevMember.pillar}
            </span>
          </TransitionLink>

          <TransitionLink
            to={`/member/${nextMember.slug}`}
            direction="forward"
            className={quietLinkStyles}
          >
            <span>
              {nextMember.name} · {nextMember.pillar}
            </span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </TransitionLink>
        </nav>
      </div>

      <article
        className="detail-profile-card @container/detail-card grid min-w-0 gap-[1.125rem] rounded-card border border-edge bg-surface p-[clamp(1.375rem,5cqi,3.25rem)]"
        style={
          isMorphTarget
            ? ({ viewTransitionName: "member-card" } as React.CSSProperties)
            : undefined
        }
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <PillarBadge pillar={member.pillar}>
            {member.pillar} · {member.pillarFull}
          </PillarBadge>
        </header>

        <h1
          id="main-content"
          tabIndex={-1}
          className="m-0 w-fit font-serif type-title-3 font-semibold focus:outline-none"
          style={
            isMorphTarget
              ? ({ viewTransitionName: "member-name" } as React.CSSProperties)
              : undefined
          }
        >
          {member.name}
        </h1>

        {member.minor && (
          <p className="-mt-2 m-0 font-mono type-ui-sm font-medium tracking-[0.06em] uppercase text-ink-secondary">
            Minor in {member.minor}
          </p>
        )}

        <p className="m-0 font-serif type-role italic font-medium text-accent">
          {member.role}
        </p>
        <p className="mt-1.5 max-w-[56ch] type-body text-ink-secondary">
          {member.bio}
        </p>

        <ArtifactFrame
          member={member}
          src={member.artifacts?.heroImage}
          aspectRatio="16/9"
          plateLabel={`${member.pillar} · ${member.pillarFull}`}
          className="mt-2"
        />

        <motion.div
          key={member.slug}
          className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-[clamp(1.5rem,4cqi,2.75rem)] border-t border-edge pt-8"
          variants={listStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          <section
            className="grid content-start gap-4"
            aria-labelledby="detail-skills-heading"
          >
            <h2 id="detail-skills-heading" className={sectionTitleStyles}>
              Skillsets
            </h2>
            <ul className="grid list-none gap-2.5 p-0">
              {member.skillsets.map((skill, idx) => (
                <motion.li
                  key={skill}
                  className={cn(listItemStyles, numberedItemStyles)}
                  variants={itemFade}
                >
                  <span className="shrink-0 font-serif type-body-sm italic font-[540] tabular text-accent">
                    0{idx + 1}
                  </span>
                  <span>{skill}</span>
                </motion.li>
              ))}
            </ul>
          </section>

          {member.tools && member.tools.length > 0 && (
            <section
              className="grid content-start gap-4"
              aria-labelledby="detail-tools-heading"
            >
              <h2 id="detail-tools-heading" className={sectionTitleStyles}>
                Tools &amp; Software
              </h2>
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {member.tools.map((tool) => (
                  <motion.li
                    key={tool}
                    className="rounded-control border border-edge bg-surface-muted px-3.5 py-1.5 font-mono type-ui-sm font-semibold tracking-[0.02em] text-ink"
                    variants={itemFade}
                  >
                    {tool}
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          {member.projects && member.projects.length > 0 && (
            <section
              className="grid content-start gap-4"
              aria-labelledby="detail-projects-heading"
            >
              <h2 id="detail-projects-heading" className={sectionTitleStyles}>
                Projects &amp; Internships
              </h2>
              <ul className="grid list-none gap-2.5 p-0">
                {member.projects.map((project, idx) => (
                  <motion.li
                    key={project.title}
                    className={cn(listItemStyles, numberedItemStyles)}
                    variants={itemFade}
                  >
                    <span className="shrink-0 font-serif type-body-sm italic font-[540] tabular text-accent">
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="m-0 font-serif type-label-lg font-semibold">
                        {project.title}
                      </h3>
                      <p className="mt-1 type-body-sm text-ink-secondary">
                        {project.detail}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          <section
            className="grid content-start gap-4"
            aria-labelledby="detail-interests-heading"
          >
            <h2 id="detail-interests-heading" className={sectionTitleStyles}>
              Interests
            </h2>
            <ul className="grid list-none gap-2.5 p-0">
              {member.interests.map((interest) => (
                <motion.li
                  key={interest}
                  className={listItemStyles}
                  variants={itemFade}
                >
                  {interest}
                </motion.li>
              ))}
            </ul>
          </section>
        </motion.div>
      </article>
    </div>
  );
}
