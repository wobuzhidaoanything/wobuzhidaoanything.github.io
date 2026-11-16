import { useParams } from "react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { GROUP_META, TEAM_MEMBERS } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { TransitionLink } from "@/components/TransitionLink";
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
      <div className="page-shell detail-page-shell">
        <section className="not-found-block">
          <p className="masthead-eyebrow">Profile not found</p>
          <h1 id="main-content" tabIndex={-1} className="masthead-title">
            No member matches “{slug}”.
          </h1>
          <p className="masthead-lead">
            Return to About Us to view all seven SUTD members.
          </p>
          <TransitionLink
            to="/"
            direction="backward"
            className="primary-action-link"
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
    transitionState.memberSlug === member.slug;

  return (
    <div className="page-shell detail-page-shell">
      <div className="detail-top-bar">
        <TransitionLink to="/" direction="backward" className="back-link">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>All 07 Members</span>
        </TransitionLink>

        <nav className="member-pager" aria-label="Member pagination">
          <TransitionLink
            to={`/member/${prevMember.slug}`}
            direction="backward"
            className="pager-link"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>
              {prevMember.name} · {prevMember.pillar}
            </span>
          </TransitionLink>

          <span className="pager-status" aria-hidden="true">
            {member.index} / 07
          </span>

          <TransitionLink
            to={`/member/${nextMember.slug}`}
            direction="forward"
            className="pager-link"
          >
            <span>
              {nextMember.name} · {nextMember.pillar}
            </span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </TransitionLink>
        </nav>
      </div>

      <article
        className="detail-profile-card"
        style={
          isMorphTarget
            ? ({ viewTransitionName: "member-card" } as React.CSSProperties)
            : undefined
        }
      >
        <header className="detail-profile-head">
          <span
            className="member-index detail-index"
            style={
              isMorphTarget
                ? ({
                    viewTransitionName: "member-index",
                  } as React.CSSProperties)
                : undefined
            }
          >
            {member.index}
          </span>
          <span className="pillar-label" data-pillar={member.pillar}>
            <span className="pillar-dot" aria-hidden="true" />
            <span>
              {member.pillar} · {member.pillarFull}
            </span>
          </span>
        </header>

        <h1
          id="main-content"
          tabIndex={-1}
          className="detail-name"
          style={
            isMorphTarget
              ? ({ viewTransitionName: "member-name" } as React.CSSProperties)
              : undefined
          }
        >
          {member.name}
        </h1>

        <p className="detail-role">{member.role}</p>
        <p className="detail-bio">{member.bio}</p>

        <ArtifactFrame
          member={member}
          src={member.artifacts?.heroImage}
          aspectRatio="16/9"
          plateLabel={`${member.pillar} · ${member.pillarFull}`}
          className="detail-artifact"
        />

        <motion.div
          key={member.slug}
          className="detail-sections"
          variants={listStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          <section
            className="detail-section-block"
            aria-labelledby="detail-skills-heading"
          >
            <h2 id="detail-skills-heading" className="detail-section-title">
              Skillsets
            </h2>
            <ul className="detail-list">
              {member.skillsets.map((skill, idx) => (
                <motion.li
                  key={skill}
                  className="detail-list-item detail-list-numbered"
                  variants={itemFade}
                >
                  <span className="chapter-skill-num">0{idx + 1}</span>
                  <span>{skill}</span>
                </motion.li>
              ))}
            </ul>
          </section>

          <section
            className="detail-section-block"
            aria-labelledby="detail-interests-heading"
          >
            <h2 id="detail-interests-heading" className="detail-section-title">
              Interests
            </h2>
            <ul className="detail-list">
              {member.interests.map((interest) => (
                <motion.li
                  key={interest}
                  className="detail-list-item"
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
