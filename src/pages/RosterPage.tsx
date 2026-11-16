import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import {
  GROUP_META,
  PILLAR_FILTERS,
  TEAM_MEMBERS,
  type FilterOption,
  type Pillar,
} from "@/data/capstone";
import {
  MemberChapter,
  type ChapterLayoutVariant,
} from "@/components/MemberChapter";
import { PartnerSection } from "@/components/PartnerSection";
import { getSplashState, setSplashState } from "@/lib/splashBus";
import { TransitionLink } from "@/components/TransitionLink";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTransitionState } from "@/hooks/useTransitionMember";
import { prefersReducedMotion } from "@/lib/viewTransitions";

type OverviewTab = "summary" | "interests";

const VALID_FILTERS = new Set<FilterOption>(["All", "CSD", "EPD", "ESD"]);

const CHAPTER_VARIANTS: ChapterLayoutVariant[] = [
  "perspective-lens",
  "diptych-collage",
  "charcoal-carousel",
  "editorial-spotlight",
  "perspective-lens",
  "diptych-collage",
  "charcoal-carousel",
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function RosterPage() {
  useDocumentTitle(`${GROUP_META.title} | Team & Skillsets`);

  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFilter = searchParams.get("pillar") as FilterOption | null;
  const activeFilter: FilterOption =
    rawFilter && VALID_FILTERS.has(rawFilter) ? rawFilter : "All";

  const [activeChapter, setActiveChapter] = useState<string>("01");
  const [pastSplash, setPastSplash] = useState<boolean>(getSplashState);
  const [overviewTab, setOverviewTab] = useState<OverviewTab>(() =>
    hash === "#interests" ? "interests" : "summary",
  );
  const [prevHash, setPrevHash] = useState(hash);
  const transitionState = useTransitionState();

  if (hash !== prevHash) {
    setPrevHash(hash);
    if (hash === "#interests") {
      setOverviewTab("interests");
    } else if (hash === "#at-a-glance") {
      setOverviewTab("summary");
    }
  }

  const summaryTabRef = useRef<HTMLButtonElement>(null);
  const interestsTabRef = useRef<HTMLButtonElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const interestsPanelRef = useRef<HTMLDivElement>(null);

  const filteredMembers = useMemo(() => {
    if (activeFilter === "All") return TEAM_MEMBERS;
    return TEAM_MEMBERS.filter((m) => m.pillar === activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    if (!hash) return;
    const targetId = hash === "#interests" ? "at-a-glance" : hash.slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      });
    }
  }, [hash]);

  useLayoutEffect(() => {
    const summaryPanel = summaryPanelRef.current;
    const interestsPanel = interestsPanelRef.current;
    if (summaryPanel) {
      if (overviewTab === "summary") {
        summaryPanel.removeAttribute("hidden");
      } else {
        summaryPanel.setAttribute("hidden", "until-found");
      }
    }
    if (interestsPanel) {
      if (overviewTab === "interests") {
        interestsPanel.removeAttribute("hidden");
      } else {
        interestsPanel.setAttribute("hidden", "until-found");
      }
    }
  }, [overviewTab]);

  useEffect(() => {
    const summaryPanel = summaryPanelRef.current;
    const interestsPanel = interestsPanelRef.current;
    const onSummaryMatch = () => setOverviewTab("summary");
    const onInterestsMatch = () => setOverviewTab("interests");

    summaryPanel?.addEventListener("beforematch", onSummaryMatch);
    interestsPanel?.addEventListener("beforematch", onInterestsMatch);

    return () => {
      summaryPanel?.removeEventListener("beforematch", onSummaryMatch);
      interestsPanel?.removeEventListener("beforematch", onInterestsMatch);
    };
  }, []);

  useEffect(() => {
    const chapters = Array.from(
      document.querySelectorAll<HTMLElement>(".member-chapter"),
    );
    if (chapters.length === 0) return;

    let rafId = 0;

    const syncScrollSpy = () => {
      rafId = 0;
      const triggerY = window.innerHeight * 0.4;
      let matchedId: string | null = null;
      let closestId: string | null = null;
      let closestDist = Number.POSITIVE_INFINITY;

      for (const el of chapters) {
        const rect = el.getBoundingClientRect();
        const id = el.id.replace("chapter-", "");
        if (!id) continue;

        if (rect.top <= triggerY && rect.bottom > triggerY) {
          matchedId = id;
          break;
        }

        const mid = (rect.top + rect.bottom) * 0.5;
        const dist = Math.abs(mid - triggerY);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = id;
        }
      }

      const nextChapter = matchedId ?? closestId;
      if (nextChapter) {
        setActiveChapter((prev) => (prev === nextChapter ? prev : nextChapter));
      }

      const hero = document.getElementById("builders");
      const heroEntered =
        hero != null && hero.getBoundingClientRect().top <= window.innerHeight * 0.72;
      setPastSplash((prev) => (prev === heroEntered ? prev : heroEntered));
    };

    const scheduleSync = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(syncScrollSpy);
    };

    syncScrollSpy();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("hashchange", scheduleSync);

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("hashchange", scheduleSync);
    };
  }, []);

  useEffect(() => {
    setSplashState(pastSplash);
  }, [pastSplash]);

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const handleFilterChange = (nextFilter: FilterOption) => {
    if (nextFilter === activeFilter) return;
    if (nextFilter === "All") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ pillar: nextFilter }, { replace: true });
    }
  };

  const pillarCounts: Record<FilterOption, number> = {
    All: TEAM_MEMBERS.length,
    CSD: TEAM_MEMBERS.filter((m) => m.pillar === "CSD").length,
    EPD: TEAM_MEMBERS.filter((m) => m.pillar === "EPD").length,
    ESD: TEAM_MEMBERS.filter((m) => m.pillar === "ESD").length,
  };

  const pillarSpecs = useMemo(() => {
    const specs: {
      pillar: Pillar;
      fullName: string;
      members: typeof TEAM_MEMBERS;
    }[] = [];
    for (const pillar of ["CSD", "EPD", "ESD"] as const) {
      const members = TEAM_MEMBERS.filter((m) => m.pillar === pillar);
      if (members.length > 0) {
        specs.push({ pillar, fullName: members[0].pillarFull, members });
      }
    }
    return specs;
  }, []);

  const switchOverviewTab = (next: OverviewTab, moveFocus = false) => {
    setOverviewTab(next);
    const tabEl =
      next === "summary" ? summaryTabRef.current : interestsTabRef.current;
    if (tabEl) {
      if (moveFocus) tabEl.focus();
      tabEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const handleOverviewTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      switchOverviewTab(
        overviewTab === "summary" ? "interests" : "summary",
        true,
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      switchOverviewTab("summary", true);
    } else if (e.key === "End") {
      e.preventDefault();
      switchOverviewTab("interests", true);
    }
  };

  return (
    <div className="showcase-page">
      <section className="splash" aria-label="Introduction">
        <div className="splash-inner">
          <p className="splash-eyebrow">{GROUP_META.institution}</p>
          <p className="splash-title" aria-label="Lockheed Summer Internship">
            <span className="splash-title-big">Lockheed</span>
            <span className="splash-title-sub">Summer Internship</span>
          </p>
          <p className="splash-lead">
            One team across product, systems &amp; design, and code. Scroll on
            to find out more about us.
          </p>
          <button
            type="button"
            className="splash-cue"
            onClick={() => scrollToElement("builders")}
          >
            <span>Meet the team</span>
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="hero-masthead" id="builders">
        <div className="hero-masthead-inner">
          <div className="hero-copy">
            <p className="masthead-eyebrow">
              {GROUP_META.institution} · {GROUP_META.pillarsLabel}
            </p>

            <h1
              id="main-content"
              tabIndex={-1}
              className="masthead-title hero-title"
            >
              Seven builders, <em>three pillars.</em>
            </h1>

            <p className="masthead-lead">{GROUP_META.overview}</p>

            <dl className="hero-stat-strip" aria-label="Capstone key figures">
              <div className="hero-stat-item">
                <dt className="hero-stat-label">Team</dt>
                <dd className="hero-stat-value">
                  <span className="hero-stat-num">7</span>
                  <span className="hero-stat-unit">builders</span>
                </dd>
              </div>
              <div className="hero-stat-item">
                <dt className="hero-stat-label">Architecture</dt>
                <dd className="hero-stat-value">
                  <span className="hero-stat-num">3</span>
                  <span className="hero-stat-unit">SUTD pillars</span>
                </dd>
              </div>
              <div className="hero-stat-item">
                <dt className="hero-stat-label">Delivery</dt>
                <dd className="hero-stat-value">
                  <span className="hero-stat-num">2</span>
                  <span className="hero-stat-unit">academic terms</span>
                </dd>
              </div>
            </dl>

            <div className="hero-actions">
              <a
                href="#chapter-01"
                className="hero-primary-cue"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToElement("chapter-01");
                }}
              >
                <span>Meet the 7</span>
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>

              <a
                href="#at-a-glance"
                className="hero-secondary-cue"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToElement("at-a-glance");
                }}
              >
                <span>Skip to summary</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside
            className="hero-spec-panel"
            aria-label="Team discipline architecture"
          >
            <div className="hero-spec-header">
              <span className="hero-spec-kicker">
                {GROUP_META.code} · Sep 2027 – Apr 2028
              </span>
              <h2 className="hero-spec-title">
                Three pillars, <em>one system.</em>
              </h2>
            </div>

            <ul className="hero-spec-list">
              {pillarSpecs.map((spec) => (
                <li key={spec.pillar}>
                  <button
                    type="button"
                    className="hero-spec-row"
                    data-pillar={spec.pillar}
                    onClick={() => {
                      handleFilterChange(spec.pillar);
                      setOverviewTab("summary");
                      scrollToElement("at-a-glance");
                    }}
                  >
                    <span className="hero-spec-count">
                      {spec.members.length}
                    </span>
                    <span className="hero-spec-detail">
                      <span className="hero-spec-full">{spec.fullName}</span>
                      <span className="hero-spec-meta-line">
                        <span className="hero-spec-tag">
                          <span className="pillar-dot" aria-hidden="true" />
                          <span>{spec.pillar}</span>
                        </span>
                        <span className="hero-spec-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="hero-spec-members">
                          {spec.members.map((m) => m.name).join(" · ")}
                        </span>
                      </span>
                    </span>
                    <ArrowRight
                      className="hero-spec-arrow size-4"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>

            <a
              href="#partner"
              className="hero-spec-footer"
              onClick={(e) => {
                e.preventDefault();
                scrollToElement("partner");
              }}
            >
              <span>Ready to collaborate?</span>
              <span className="hero-spec-foot-link">
                <span>Work With Us</span>
                <ArrowRight
                  className="hero-spec-foot-arrow size-3.5"
                  aria-hidden="true"
                />
              </span>
            </a>
          </aside>
        </div>
      </section>

      <div className="chapters-showcase" aria-label="Team member chapters">
        {TEAM_MEMBERS.map((member, idx) => (
          <MemberChapter
            key={member.id}
            member={member}
            layoutVariant={CHAPTER_VARIANTS[idx % CHAPTER_VARIANTS.length]}
            pinSide={idx % 2 === 1 ? "right" : "left"}
          />
        ))}

        <div className="chapter-dock-wrap">
          <nav className="chapter-dock" aria-label="Chapter quick navigation">
            <ul>
              {TEAM_MEMBERS.map((member) => {
                const isActive = activeChapter === member.index;
                return (
                  <li key={member.id}>
                    <a
                      href={`#chapter-${member.index}`}
                      aria-current={isActive ? "location" : undefined}
                      aria-label={`Jump to ${member.name} (${member.pillar})`}
                      className="dock-link"
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToElement(`chapter-${member.index}`);
                      }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="chapter-dock-pill"
                          className="dock-active-pill"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 36,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="dock-num">{member.index}</span>
                    </a>
                  </li>
                );
              })}
              <li className="dock-divider" aria-hidden="true" />
              <li>
                <a
                  href="#at-a-glance"
                  className="dock-jump-link"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToElement("at-a-glance");
                  }}
                >
                  All 7
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
          <div className="section-bar">
            <div>
              <h2 id="team-heading" className="section-title">
                Team at a Glance
              </h2>
              <p className="section-subtitle">
                {overviewTab === "summary"
                  ? "Filter by SUTD pillar or open a member profile."
                  : "What each of us explores inside studio and on our own time."}
              </p>
            </div>

            <div className="overview-controls">
              <div
                className="overview-tablist"
                role="tablist"
                aria-label="Team overview mode"
              >
                <button
                  ref={summaryTabRef}
                  id="overview-tab-summary"
                  type="button"
                  role="tab"
                  aria-selected={overviewTab === "summary"}
                  tabIndex={overviewTab === "summary" ? 0 : -1}
                  className="overview-tab"
                  onClick={() => switchOverviewTab("summary")}
                  onKeyDown={handleOverviewTabKeyDown}
                >
                  Summary
                </button>
                <button
                  ref={interestsTabRef}
                  id="overview-tab-interests"
                  type="button"
                  role="tab"
                  aria-selected={overviewTab === "interests"}
                  tabIndex={overviewTab === "interests" ? 0 : -1}
                  className="overview-tab"
                  onClick={() => switchOverviewTab("interests")}
                  onKeyDown={handleOverviewTabKeyDown}
                >
                  Interests
                </button>
              </div>

              <div
                className="filter-rail"
                role="group"
                aria-label="Filter team members by SUTD pillar"
              >
                {PILLAR_FILTERS.map((filter) => {
                  const pressed = activeFilter === filter.id;
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
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 36,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="filter-pill-label">{filter.label}</span>
                      <span className="filter-count">
                        {pillarCounts[filter.id]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="visually-hidden" aria-live="polite">
            Showing {filteredMembers.length}{" "}
            {activeFilter === "All"
              ? "team members across all pillars"
              : `${activeFilter} members`}
            .
          </p>

          <div className="overview-panels">
            <div
              ref={summaryPanelRef}
              id="overview-panel-summary"
              role="tabpanel"
              aria-labelledby="overview-tab-summary"
              className="overview-panel"
              hidden={overviewTab !== "summary"}
            >
              <div className="overview-panel-inner">
                <ul className="member-grid">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {filteredMembers.map((member) => {
                      const isMorphTarget =
                        transitionState.mode === "member" &&
                        transitionState.memberSlug === member.slug &&
                        transitionState.source === "card";

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
                            data-pillar={member.pillar}
                            style={
                              isMorphTarget
                                ? ({
                                    viewTransitionName: "member-card",
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            <header className="member-card-head">
                              <span
                                className="pillar-label"
                                data-pillar={member.pillar}
                              >
                                <span
                                  className="pillar-dot"
                                  aria-hidden="true"
                                />
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
                                      ? ({
                                          viewTransitionName: "member-name",
                                        } as React.CSSProperties)
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
                              <p className="member-capabilities">
                                {member.skillsets.join(" · ")}
                              </p>

                              <span className="card-cta" aria-hidden="true">
                                <span>Profile</span>
                                <ArrowRight className="size-4" />
                              </span>
                            </footer>
                          </article>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            </div>

            <div
              ref={interestsPanelRef}
              id="overview-panel-interests"
              role="tabpanel"
              aria-labelledby="overview-tab-interests"
              className="overview-panel"
              hidden={overviewTab !== "interests"}
            >
              <div className="overview-panel-inner">
                <ul className="member-interests-list">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {filteredMembers.map((member) => (
                      <motion.li
                        key={member.id}
                        layout="position"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: EASE }}
                        className="member-interest-row"
                      >
                        <div className="interest-row-identity">
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

                        <p className="interest-row-values">
                          {member.interests.join(" · ")}
                        </p>

                        <aside
                          className="interest-row-preview"
                          aria-hidden="true"
                        >
                          <span className="interest-preview-tag">
                            {member.pillar} · Core
                          </span>
                          <span className="interest-preview-note">
                            {member.skillsets.slice(0, 3).join(" · ")}
                          </span>
                        </aside>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>

      <PartnerSection />
    </div>
  );
}
