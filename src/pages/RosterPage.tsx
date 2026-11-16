import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import {
  GROUP_META,
  PILLAR_FILTERS,
  TEAM_MEMBERS,
  type FilterOption,
} from '@/data/capstone'
import { MemberChapter } from '@/components/MemberChapter'
import { TransitionLink } from '@/components/TransitionLink'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useTransitionState } from '@/hooks/useTransitionMember'
import { prefersReducedMotion } from '@/lib/viewTransitions'

const VALID_FILTERS = new Set<FilterOption>(['All', 'CSD', 'EPD', 'ESD'])

const EASE = [0.22, 1, 0.36, 1] as const

const heroStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const heroFadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
}

const rowFadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: EASE },
  },
}

export function RosterPage() {
  useDocumentTitle(`${GROUP_META.title} — Team & Skillsets`)

  const shouldReduceMotion = useReducedMotion()
  const { hash } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawFilter = searchParams.get('pillar') as FilterOption | null
  const activeFilter: FilterOption =
    rawFilter && VALID_FILTERS.has(rawFilter) ? rawFilter : 'All'

  const [activeChapter, setActiveChapter] = useState<string>('01')
  const transitionState = useTransitionState()

  const filteredMembers = useMemo(() => {
    if (activeFilter === 'All') return TEAM_MEMBERS
    return TEAM_MEMBERS.filter((m) => m.pillar === activeFilter)
  }, [activeFilter])

  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    const target = document.getElementById(id)
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      })
    }
  }, [hash])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const chapters = Array.from(document.querySelectorAll<HTMLElement>('.member-chapter'))
    if (chapters.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('chapter-', '')
            if (id) setActiveChapter(id)
          }
        }
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
    )

    for (const el of chapters) {
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const handleFilterChange = (nextFilter: FilterOption) => {
    if (nextFilter === activeFilter) return
    if (nextFilter === 'All') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ pillar: nextFilter }, { replace: true })
    }
  }

  const pillarCounts: Record<FilterOption, number> = {
    All: TEAM_MEMBERS.length,
    CSD: TEAM_MEMBERS.filter((m) => m.pillar === 'CSD').length,
    EPD: TEAM_MEMBERS.filter((m) => m.pillar === 'EPD').length,
    ESD: TEAM_MEMBERS.filter((m) => m.pillar === 'ESD').length,
  }

  return (
    <div className="showcase-page">
      <section className="hero-masthead">
        <motion.div
          className="hero-masthead-inner"
          variants={heroStagger}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
        >
          <motion.p className="masthead-eyebrow" variants={heroFadeUp}>
            <span className="eyebrow-dot" aria-hidden="true" />
            <span>
              {GROUP_META.institution} · {GROUP_META.pillarsLabel}
            </span>
          </motion.p>

          <motion.h1
            id="main-content"
            tabIndex={-1}
            className="masthead-title hero-title"
            variants={heroFadeUp}
          >
            Seven builders, <em>three pillars.</em>
          </motion.h1>

          <motion.p className="masthead-lead" variants={heroFadeUp}>
            {GROUP_META.overview}
          </motion.p>

          <motion.div className="hero-actions" variants={heroFadeUp}>
            <a
              href="#chapter-01"
              className="hero-primary-cue"
              onClick={(e) => {
                e.preventDefault()
                scrollToElement('chapter-01')
              }}
            >
              <span>Meet the 07</span>
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>

            <a
              href="#at-a-glance"
              className="hero-secondary-cue"
              onClick={(e) => {
                e.preventDefault()
                scrollToElement('at-a-glance')
              }}
            >
              <span>Skip to summary</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      <div className="chapters-showcase" aria-label="Team showcase chapters">
        {TEAM_MEMBERS.map((member, idx) => (
          <MemberChapter
            key={member.id}
            member={member}
            layoutVariant={idx % 2 === 0 ? 'split' : 'monumental'}
          />
        ))}

        <div className="chapter-dock-wrap">
          <nav className="chapter-dock" aria-label="Chapter quick navigation">
            <ul>
              {TEAM_MEMBERS.map((member) => {
                const isActive = activeChapter === member.index
                return (
                  <li key={member.id}>
                    <a
                      href={`#chapter-${member.index}`}
                      aria-current={isActive ? 'location' : undefined}
                      aria-label={`Jump to ${member.name} (${member.pillar})`}
                      className="dock-link"
                      onClick={(e) => {
                        e.preventDefault()
                        scrollToElement(`chapter-${member.index}`)
                      }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="chapter-dock-pill"
                          className="dock-active-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="dock-num">{member.index}</span>
                    </a>
                  </li>
                )
              })}
              <li className="dock-divider" aria-hidden="true" />
              <li>
                <a
                  href="#at-a-glance"
                  className="dock-jump-link"
                  onClick={(e) => {
                    e.preventDefault()
                    scrollToElement('at-a-glance')
                  }}
                >
                  All 07
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="page-shell bottom-overview-shell">
        <section
          id="at-a-glance"
          className="roster-section"
          aria-labelledby="team-heading"
        >
          <motion.div
            className="section-bar"
            variants={heroFadeUp}
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <div>
              <h2 id="team-heading" className="section-title">
                Team &amp; Skillsets at a Glance
              </h2>
              <p className="section-subtitle">
                Filter by SUTD pillar or open a member profile.
              </p>
            </div>

            <div
              className="filter-rail"
              role="group"
              aria-label="Filter team members by SUTD pillar"
            >
              {PILLAR_FILTERS.map((filter) => {
                const pressed = activeFilter === filter.id
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => handleFilterChange(filter.id)}
                    className="filter-pill"
                  >
                    {pressed && (
                      <motion.span
                        layoutId="roster-filter-capsule"
                        className="filter-pill-capsule"
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="filter-pill-label">{filter.label}</span>
                    <span className="filter-count">
                      {String(pillarCounts[filter.id]).padStart(2, '0')}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>

          <p className="visually-hidden" aria-live="polite">
            Showing {filteredMembers.length}{' '}
            {activeFilter === 'All' ? 'team members across all pillars' : `${activeFilter} members`}.
          </p>

          <ul className="member-grid">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredMembers.map((member) => {
                const isMorphTarget =
                  transitionState.mode === 'member' &&
                  transitionState.memberSlug === member.slug &&
                  transitionState.source === 'card'

                return (
                  <motion.li
                    key={member.id}
                    layout="position"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="member-grid-cell"
                  >
                    <article
                      className="member-card"
                      style={
                        isMorphTarget
                          ? ({ viewTransitionName: 'member-card' } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <header className="member-card-head">
                        <span
                          className="member-index"
                          style={
                            isMorphTarget
                              ? ({ viewTransitionName: 'member-index' } as React.CSSProperties)
                              : undefined
                          }
                        >
                          {member.index}
                        </span>
                        <span className="pillar-label" data-pillar={member.pillar}>
                          <span className="pillar-dot" aria-hidden="true" />
                          <span>{member.pillar}</span>
                        </span>
                      </header>

                      <hgroup className="member-card-heading">
                        <h3 className="member-name-wrap">
                          <TransitionLink
                            to={`/member/${member.slug}`}
                            direction="forward"
                            memberSlug={member.slug}
                            transitionSource="card"
                            className="card-link"
                            style={
                              isMorphTarget
                                ? ({ viewTransitionName: 'member-name' } as React.CSSProperties)
                                : undefined
                            }
                          >
                            {member.name}
                          </TransitionLink>
                        </h3>
                        <p className="member-role">{member.role}</p>
                      </hgroup>

                      <p className="member-summary">{member.bio}</p>

                      <footer className="member-card-foot">
                        <p className="member-capabilities">{member.skillsets.join(' · ')}</p>

                        <span className="card-cta" aria-hidden="true">
                          <span>Profile</span>
                          <ArrowRight className="size-4" />
                        </span>
                      </footer>
                    </article>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </section>

        <section
          id="interests"
          className="interests-section"
          aria-labelledby="interests-heading"
        >
          <motion.div
            className="section-bar"
            variants={heroFadeUp}
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <div>
              <h2 id="interests-heading" className="section-title">
                Interests
              </h2>
              <p className="section-subtitle">
                What each of us explores inside studio and on our own time.
              </p>
            </div>
          </motion.div>

          <motion.ul
            className="member-interests-list"
            variants={heroStagger}
            initial={shouldReduceMotion ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {TEAM_MEMBERS.map((member) => (
              <motion.li
                key={member.id}
                className="member-interest-row"
                variants={rowFadeUp}
              >
                <div className="interest-row-identity">
                  <span className="member-index">{member.index}</span>
                  <div>
                    <TransitionLink
                      to={`/member/${member.slug}`}
                      direction="forward"
                      className="interest-member-name"
                    >
                      {member.name}
                    </TransitionLink>
                    <p className="interest-member-pillar">
                      {member.pillar} · {member.role}
                    </p>
                  </div>
                </div>

                <p className="interest-row-values">{member.interests.join(' · ')}</p>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      </div>
    </div>
  )
}
