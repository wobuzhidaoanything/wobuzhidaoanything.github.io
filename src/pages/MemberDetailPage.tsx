import { useMemo, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pencil } from "lucide-react";
import { cn } from "cn";
import { GROUP_META } from "@/data/capstone";
import { useLiveMembers } from "@/hooks/useLiveMembers";
import { getPublicMembers } from "@/lib/membersStore";
import { useEditorSession } from "@/lib/editorSession";
import { isValidHttpUrl } from "@/lib/editorForm";
import {
  focusRouteHeading,
  runViewTransition,
} from "@/lib/viewTransitions";
import { scrollToSectionAligned } from "@/lib/scroll";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { MemberLinksRow } from "@/components/MemberLinksRow";
import { ProjectDetailContent } from "@/components/ProjectDetailContent";
import { TransitionLink } from "@/components/TransitionLink";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTransitionState } from "@/hooks/useTransitionMember";

const EASE = [0.22, 1, 0.36, 1] as const;

const listStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.06,
    },
  },
};

const itemFade: Variants = {
  hidden: { opacity: 0, y: "12%" },
  visible: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.34, ease: EASE },
  },
};

const quietLinkStyles = cn(
  "ui-press inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5",
  "rounded-control border border-transparent type-ui font-semibold",
  "text-ink-secondary no-underline",
  "hover:bg-surface-muted/75 hover:border-edge hover:text-ink",
  "pointer-coarse:min-h-11",
);

const sectionTitleStyles =
  "m-0 type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted";

function hasAnyMemberLink(links?: {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  email?: string;
}): boolean {
  if (!links) return false;
  return Boolean(
    (links.github && isValidHttpUrl(links.github)) ||
      (links.linkedin && isValidHttpUrl(links.linkedin)) ||
      (links.portfolio && isValidHttpUrl(links.portfolio)) ||
      links.email,
  );
}

export function MemberDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { members: rawMembers } = useLiveMembers();
  const session = useEditorSession();
  const shouldReduceMotion = useReducedMotion();
  const transitionState = useTransitionState();

  const publicMembers = useMemo(() => getPublicMembers(rawMembers), [rawMembers]);

  const { member, navList, memberIndex } = useMemo(() => {
    const pubIdx = publicMembers.findIndex((m) => m.slug === slug || m.id === slug);
    if (pubIdx >= 0) {
      return { member: publicMembers[pubIdx], navList: publicMembers, memberIndex: pubIdx };
    }
    if (session.unlocked) {
      const rawIdx = rawMembers.findIndex((m) => m.slug === slug || m.id === slug);
      if (rawIdx >= 0) {
        return { member: rawMembers[rawIdx], navList: rawMembers, memberIndex: rawIdx };
      }
    }
    return { member: null, navList: publicMembers, memberIndex: -1 };
  }, [publicMembers, rawMembers, session.unlocked, slug]);

  useDocumentTitle(
    member
      ? `${member.name} (${member.pillar}) | ${GROUP_META.title}`
      : `Member Not Found | ${GROUP_META.title}`,
  );

  const handleBreadcrumbToTeam = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    runViewTransition({
      types: ["backward"],
      update: () => {
        navigate(to);
      },
      onFinished: () => {
        requestAnimationFrame(() => {
          const target = document.getElementById("team");
          if (target) {
            scrollToSectionAligned("team");
          } else {
            focusRouteHeading();
          }
        });
      },
    });
  };

  if (!member) {
    return (
      <div className="shell shell-block">
        <section className="py-[clamp(3rem,8dvb,5.5rem)]">
          <p className="mb-5 type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-secondary">
            Profile not found
          </p>
          <h1
            id="main-content"
            tabIndex={-1}
            className="m-0 font-serif type-title-1 font-semibold text-wrap-balance focus:outline-none"
          >
            No member matches “{slug}”.
          </h1>
          <p className="mt-6 max-w-[48ch] type-body-lg text-ink-secondary">
            Back to home to view all team builders.
          </p>
          <TransitionLink
            to="/"
            direction="backward"
            className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-control border border-ink bg-ink px-5 py-2 type-ui font-semibold text-page no-underline transition-[background-color,border-color,color] duration-150 hover:border-accent hover:bg-accent hover:text-accent-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to Team</span>
          </TransitionLink>
        </section>
      </div>
    );
  }

  const prevMember = navList[(memberIndex - 1 + navList.length) % navList.length];
  const nextMember = navList[(memberIndex + 1) % navList.length];

  const hasHero = Boolean(member.artifacts?.heroImage);
  const hasSecondary = Boolean(member.artifacts?.secondaryImage);
  const hasLinks = hasAnyMemberLink(member.links);
  const isMorphTarget =
    transitionState.mode === "member" && transitionState.memberSlug === member.slug;

  return (
    <div className="shell shell-block @container/detail" data-pillar={member.pillar}>
      <div className="mb-[clamp(2.25rem,5dvb,3.25rem)] flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="m-0 flex flex-wrap items-center gap-1.5 p-0 type-ui font-semibold text-ink-secondary">
            <li>
              <Link
                to="/#team"
                onClick={(e) => handleBreadcrumbToTeam(e, "/#team")}
                className="ui-link-underline inline-flex min-h-10 items-center py-0.5 text-ink-secondary hover:text-ink pointer-coarse:min-h-11"
              >
                Team
              </Link>
            </li>
            <li aria-hidden="true" className="text-ink-muted">
              /
            </li>
            <li>
              <Link
                to={`/?pillar=${member.pillar}#team`}
                onClick={(e) => handleBreadcrumbToTeam(e, `/?pillar=${member.pillar}#team`)}
                className="ui-link-underline inline-flex min-h-10 items-center py-0.5 text-ink-secondary hover:text-(--tone) pointer-coarse:min-h-11"
              >
                {member.pillar}
              </Link>
            </li>
            <li aria-hidden="true" className="text-ink-muted">
              /
            </li>
            <li>
              <span aria-current="page" className="text-ink">
                {member.name}
              </span>
            </li>
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {session.unlocked ? (
            <TransitionLink
              to={`/update_details?member=${member.id}`}
              direction="forward"
              className="ui-press inline-flex min-h-10 items-center gap-1.5 rounded-control border border-edge bg-surface px-3.5 py-1.5 type-ui-sm font-semibold text-ink no-underline hover:bg-surface-muted/75 pointer-coarse:min-h-11"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              <span>Edit profile</span>
            </TransitionLink>
          ) : null}

          {navList.length > 1 ? (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Member pagination">
              <TransitionLink
                to={`/member/${prevMember.slug}`}
                direction="backward"
                className={quietLinkStyles}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span>{prevMember.name}</span>
              </TransitionLink>

              <TransitionLink
                to={`/member/${nextMember.slug}`}
                direction="forward"
                className={quietLinkStyles}
              >
                <span>{nextMember.name}</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </TransitionLink>
            </nav>
          ) : null}
        </div>
      </div>

      <article className="detail-profile-card grid min-w-0 items-start grid-cols-[minmax(0,1fr)_clamp(6.5rem,27cqi,13rem)] gap-x-[clamp(1rem,4cqi,2.5rem)] gap-y-[clamp(2rem,5cqi,3.25rem)] rounded-card border border-edge bg-surface p-[clamp(1.5rem,4.5cqi,3.5rem)] shadow-raised @min-[54rem]/detail:grid-cols-[minmax(16.5rem,0.78fr)_minmax(0,1.22fr)] @min-[54rem]/detail:grid-rows-[auto_1fr] @min-[54rem]/detail:gap-x-[clamp(2.5rem,5.5cqi,4.75rem)] @min-[54rem]/detail:gap-y-[clamp(2.25rem,5cqi,3.5rem)]">
        <motion.aside
          key={`${member.slug}-aside`}
          initial={shouldReduceMotion ? false : { opacity: 0, y: "3%" }}
          animate={{ opacity: 1, y: "0%" }}
          transition={{ duration: 0.38, ease: EASE }}
          className="col-start-1 row-start-1 grid min-w-0 content-start gap-4 @min-[54rem]/detail:sticky @min-[54rem]/detail:top-[calc(var(--header-h)+2.25rem)] @min-[54rem]/detail:row-span-2 @min-[54rem]/detail:gap-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <PillarBadge pillar={member.pillar}>
              {member.pillar} · {member.pillarFull}
            </PillarBadge>
            {member.hidden ? (
              <span className="rounded-chip border border-warning/40 bg-warning-surface px-2 py-0.5 type-micro font-semibold text-warning">
                Hidden
              </span>
            ) : null}
          </div>

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

          {member.minor ? (
            <p className="-mt-2 m-0 font-mono type-ui-sm font-medium tracking-[0.06em] uppercase text-ink-secondary">
              Minor in {member.minor}
            </p>
          ) : null}

          {member.role ? (
            <p className="m-0 font-serif type-role italic font-medium text-accent">
              {member.role}
            </p>
          ) : null}

          {hasLinks ? <MemberLinksRow links={member.links} className="pt-1" /> : null}
        </motion.aside>

        <motion.div
          key={`${member.slug}-media`}
          initial={shouldReduceMotion ? false : { opacity: 0, y: "3%" }}
          animate={{ opacity: 1, y: "0%" }}
          transition={{ duration: 0.4, ease: EASE }}
          className="col-start-2 row-start-1 min-w-0 self-start"
        >
          {hasHero || hasSecondary ? (
            <div
              className={cn(
                "grid items-start gap-4",
                hasHero && hasSecondary
                  ? "grid-cols-1 @min-[54rem]/detail:grid-cols-2"
                  : "grid-cols-1",
              )}
            >
              {hasHero ? (
                <ArtifactFrame
                  member={member}
                  src={member.artifacts?.heroImage}
                  alignClassName="justify-items-end @min-[54rem]/detail:justify-items-center"
                  photoMaxHeightClassName="max-h-[clamp(9.5rem,36cqi,15.5rem)] @min-[54rem]/detail:max-h-[clamp(22rem,58dvb,34rem)]"
                  priority="high"
                  showPlaceholder={false}
                />
              ) : null}
              {hasSecondary ? (
                <ArtifactFrame
                  member={member}
                  src={member.artifacts?.secondaryImage}
                  alt={`${member.name} secondary artifact`}
                  caption=""
                  alignClassName="justify-items-end @min-[54rem]/detail:justify-items-center"
                  photoMaxHeightClassName="max-h-[clamp(9.5rem,36cqi,15.5rem)] @min-[54rem]/detail:max-h-[clamp(22rem,58dvb,34rem)]"
                  showPlaceholder={false}
                />
              ) : null}
            </div>
          ) : (
            <ArtifactFrame
              member={member}
              mediaClassName="aspect-[4/5] @min-[54rem]/detail:aspect-[16/10]"
              plateLabel={`${member.pillar} · ${member.pillarFull}`}
            />
          )}
        </motion.div>

        <motion.div
          key={member.slug}
          className="@container/detail-body col-span-2 row-start-2 grid min-w-0 content-start gap-[clamp(2rem,4.5cqi,3.25rem)] @min-[54rem]/detail:col-span-1 @min-[54rem]/detail:col-start-2"
          variants={listStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >

          {member.skillsets.length > 0 ? (
            <section
              className="grid content-start gap-4 border-t border-rule pt-7"
              aria-labelledby="detail-skills-heading"
            >
              <h2 id="detail-skills-heading" className={sectionTitleStyles}>
                Skillsets
              </h2>
              <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-3.5 p-0 @min-[30rem]/detail-body:grid-cols-2">
                {member.skillsets.map((skill, idx) => (
                  <motion.li
                    key={skill}
                    className="flex items-baseline gap-3.5 type-body text-ink"
                    variants={itemFade}
                  >
                    <span className="shrink-0 font-serif type-body-sm italic font-[540] tabular text-accent">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{skill}</span>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}

          {member.tools && member.tools.length > 0 ? (
            <section
              className="grid content-start gap-4 border-t border-rule pt-7"
              aria-labelledby="detail-tools-heading"
            >
              <h2 id="detail-tools-heading" className={sectionTitleStyles}>
                Tools &amp; Software
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
                {member.tools.map((tool) => (
                  <motion.li
                    key={tool}
                    className="rounded-control border border-edge bg-surface-alt px-3.5 py-1.5 font-mono type-ui-sm font-semibold tracking-[0.02em] text-ink"
                    variants={itemFade}
                  >
                    {tool}
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}

          {member.projects && member.projects.length > 0 ? (
            <section
              className="grid content-start gap-4 border-t border-rule pt-7"
              aria-labelledby="detail-projects-heading"
            >
              <h2 id="detail-projects-heading" className={sectionTitleStyles}>
                Projects &amp; Internships
              </h2>
              <ul className="m-0 grid list-none gap-4 p-0">
                {member.projects.map((project, idx) => (
                  <motion.li
                    key={project.title}
                    className="flex items-baseline gap-4 rounded-card border border-rule bg-page/60 p-4"
                    variants={itemFade}
                  >
                    <span className="shrink-0 font-serif type-body-sm italic font-[540] tabular text-accent">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="m-0 font-serif type-label-lg font-semibold text-ink">
                          {project.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          {project.tag ? (
                            <span className="rounded-chip border border-rule bg-surface px-2.5 py-0.5 font-mono type-micro font-semibold text-ink-secondary">
                              {project.tag}
                            </span>
                          ) : null}
                          {project.url && isValidHttpUrl(project.url) ? (
                            <a
                              href={project.url}
                              target="_blank"
                              rel="noreferrer"
                              className="ui-link-underline inline-flex min-h-9 items-center gap-1 type-ui-sm font-semibold text-(--tone) pointer-coarse:min-h-11"
                            >
                              <span>Open</span>
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {project.detail ? (
                        <ProjectDetailContent detail={project.detail} />
                      ) : null}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}

          {member.interests.length > 0 ? (
            <section
              className="grid content-start gap-4 border-t border-rule pt-7"
              aria-labelledby="detail-interests-heading"
            >
              <h2 id="detail-interests-heading" className={sectionTitleStyles}>
                Interests
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
                {member.interests.map((interest) => (
                  <motion.li
                    key={interest}
                    className="rounded-control border border-rule bg-surface-alt px-3.5 py-1.5 type-ui font-medium text-ink"
                    variants={itemFade}
                  >
                    {interest}
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}
        </motion.div>
      </article>
    </div>
  );
}
