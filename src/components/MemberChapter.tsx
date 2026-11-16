import { motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import type { TeamMember } from '@/data/capstone'
import { TransitionLink } from '@/components/TransitionLink'
import { useTransitionState } from '@/hooks/useTransitionMember'

interface MemberChapterProps {
  member: TeamMember
  layoutVariant: 'split' | 'monumental'
}

const EASE = [0.22, 1, 0.36, 1] as const

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
}

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
}

const skillItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE },
  },
}

const ruleVariants: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.5, ease: EASE },
  },
}

export function MemberChapter({ member, layoutVariant }: MemberChapterProps) {
  const shouldReduceMotion = useReducedMotion()
  const transitionState = useTransitionState()
  const isMorphTarget =
    transitionState.mode === 'member' &&
    transitionState.memberSlug === member.slug &&
    transitionState.source === 'chapter'

  return (
    <section
      id={`chapter-${member.index}`}
      className="member-chapter"
      data-variant={layoutVariant}
      data-pillar={member.pillar}
      aria-labelledby={`chapter-heading-${member.index}`}
    >
      <div className="chapter-backdrop-num" aria-hidden="true">
        {member.index}
      </div>

      <motion.div
        className="chapter-inner"
        variants={containerVariants}
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        style={
          isMorphTarget
            ? ({ viewTransitionName: 'member-card' } as React.CSSProperties)
            : undefined
        }
      >
        <div className="chapter-identity">
          <motion.div
            className="chapter-accent-rule"
            data-pillar={member.pillar}
            variants={ruleVariants}
            aria-hidden="true"
          />

          <motion.div className="chapter-meta" variants={riseVariants}>
            <span
              className="chapter-index"
              style={
                isMorphTarget
                  ? ({ viewTransitionName: 'member-index' } as React.CSSProperties)
                  : undefined
              }
            >
              {member.index} / 07
            </span>
            <span className="pillar-label" data-pillar={member.pillar}>
              <span className="pillar-dot" aria-hidden="true" />
              <span>
                {member.pillar} · {member.pillarFull}
              </span>
            </span>
          </motion.div>

          <motion.h2
            id={`chapter-heading-${member.index}`}
            className="chapter-name"
            variants={riseVariants}
            style={
              isMorphTarget
                ? ({ viewTransitionName: 'member-name' } as React.CSSProperties)
                : undefined
            }
          >
            {member.name}
          </motion.h2>

          <motion.p className="chapter-role" variants={riseVariants}>
            {member.role}
          </motion.p>

          <motion.p className="chapter-bio" variants={riseVariants}>
            {member.bio}
          </motion.p>

          <motion.div className="chapter-actions" variants={riseVariants}>
            <TransitionLink
              to={`/member/${member.slug}`}
              direction="forward"
              memberSlug={member.slug}
              transitionSource="chapter"
              className="chapter-profile-link"
            >
              <span>View full profile</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </TransitionLink>
          </motion.div>
        </div>

        <div className="chapter-stage">
          <div className="chapter-specs-block">
            <motion.h3 className="chapter-kicker" variants={riseVariants}>
              Skillsets
            </motion.h3>
            <ul className="chapter-skills-list">
              {member.skillsets.map((skill, idx) => (
                <motion.li
                  key={skill}
                  className="chapter-skill-item"
                  variants={skillItemVariants}
                >
                  <span className="chapter-skill-num">0{idx + 1}</span>
                  <span className="chapter-skill-name">{skill}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <motion.div className="chapter-interests-block" variants={riseVariants}>
            <h3 className="chapter-kicker">Interests</h3>
            <p className="chapter-interests-line">{member.interests.join(' · ')}</p>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
