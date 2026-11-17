import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { cn } from "cn";
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
import { PillarBadge } from "@/components/ui/pillar-badge";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTransitionState } from "@/hooks/useTransitionMember";
import { prefersReducedMotion } from "@/lib/viewTransitions";

type OverviewTab = "summary" | "interests";

const VALID_FILTERS = new Set<FilterOption>(["All", "CSD", "EPD", "ESD"]);

const CHAPTER_VARIANTS: ChapterLayoutVariant[] = [
  "split",
  "split-reverse",
  "offset",
  "monumental",
  "split-wide",
  "inset",
  "compact-band",
];

const EASE = [0.22, 1, 0.36, 1] as const;

const accentByPillar: Record<Pillar, string> = {
  CSD: "text-pillar-csd",
  EPD: "text-pillar-epd",
  ESD: "text-pillar-esd",
};

const dotByPillar: Record<Pillar, string> = {
  CSD: "bg-pillar-csd",
  EPD: "bg-pillar-epd",
  ESD: "bg-pillar-esd",
};

const primaryCueStyles = cn(
  "inline-flex items-center gap-2 min-h-11 px-5.5 py-2.5",
  "rounded-control border border-ink bg-ink text-page type-body-sm font-semibold no-underline",
  "transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-accent hover:border-accent hover:text-accent-ink active:scale-[0.985]",
);

const secondaryCueStyles = cn(
  "inline-flex items-center gap-[0.45rem] min-h-11 px-4.5 py-2.5",
  "rounded-control border border-control bg-surface text-ink type-body-sm font-semibold no-underline",
  "transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-surface-muted hover:border-ink active:scale-[0.985]",
);

const interestRowStyles = cn(
  "member-interest-row group/row relative grid min-w-0 items-center border-b border-rule py-6",
  "grid-cols-[minmax(14rem,1fr)_minmax(0,1.4fr)_auto] gap-x-8 gap-y-4",
  "transition-[background-color,opacity] duration-150",
  "hover:bg-surface-muted/75 focus-within:bg-surface-muted/75",
  "@max-[50rem]/roster:grid-cols-[minmax(12rem,1fr)_minmax(0,1.5fr)]",
  "@max-[36rem]/roster:grid-cols-[minmax(0,1fr)] @max-[36rem]/roster:gap-y-2.5",
);

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
        hero != null &&
        hero.getBoundingClientRect().top <= window.innerHeight * 0.72;
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
      <section className="splash @container/splash border-b border-edge">
        <div className="shell grid min-h-[calc(100svb-6rem)] content-center justify-items-start gap-[clamp(1rem,2.5cqi,1.75rem)] py-[clamp(2rem,6dvb,4rem)]">
          <p className="m-0 type-body font-semibold tracking-[0.08em] uppercase text-ink-secondary">
            {GROUP_META.institution}
          </p>
          <p
            className="m-0 grid justify-items-start gap-[0.1em]"
            aria-label="Lockheed Summer Internship"
          >
            <span className="font-serif type-display font-semibold text-wrap-balance text-ink">
              Lockheed
            </span>
            <span className="font-serif type-title-sub italic font-medium text-accent">
              Summer Internship
            </span>
          </p>
          <p className="m-0 max-w-[44ch] type-body-lg text-ink-secondary">
            One team across product, systems &amp; design, and code. Scroll on
            to find out more about us.
          </p>
          <button
            type="button"
            className={cn("splash-cue", primaryCueStyles)}
            onClick={() => scrollToElement("builders")}
          >
            <span>Meet the team</span>
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section
        className="hero-masthead @container/hero grid scroll-mt-20 grid-cols-1 items-center border-b border-edge py-[clamp(3rem,7.5dvb,5.75rem)] min-h-[min(72dvb,42rem)]"
        id="builders"
      >
        <div className="shell grid min-w-0 grid-cols-1 items-center gap-[clamp(2rem,4cqi,3.75rem)] @min-[52rem]/hero:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0">
            <p className="mt-0 mb-5 type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-secondary">
              {GROUP_META.institution} · {GROUP_META.pillarsLabel}
            </p>

            <h1
              id="main-content"
              tabIndex={-1}
              className="m-0 max-w-[16ch] font-serif type-title-1 font-semibold focus:outline-none [&_em]:font-medium [&_em]:italic [&_em]:text-accent"
            >
              Seven builders, <em>three pillars.</em>
            </h1>

            <p className="mt-6 m-0 max-w-[48ch] type-body-lg text-ink-secondary">
              {GROUP_META.overview}
            </p>

            <dl
              className="mt-7 grid list-none grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-x-6 gap-y-4 border-t border-rule pt-6 @min-[40rem]/hero:grid-cols-3"
              aria-label="Capstone key figures"
            >
              <div className="grid content-start gap-1">
                <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
                  Team
                </dt>
                <dd className="m-0 flex flex-wrap items-baseline gap-[0.4rem]">
                  <span className="font-serif type-figure font-[540] tabular text-ink">
                    7
                  </span>
                  <span className="font-serif type-body-sm italic font-medium text-ink-secondary">
                    builders
                  </span>
                </dd>
              </div>
              <div className="grid content-start gap-1">
                <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
                  Architecture
                </dt>
                <dd className="m-0 flex flex-wrap items-baseline gap-[0.4rem]">
                  <span className="font-serif type-figure font-[540] tabular text-ink">
                    3
                  </span>
                  <span className="font-serif type-body-sm italic font-medium text-ink-secondary">
                    SUTD pillars
                  </span>
                </dd>
              </div>
              <div className="grid content-start gap-1">
                <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
                  Delivery
                </dt>
                <dd className="m-0 flex flex-wrap items-baseline gap-[0.4rem]">
                  <span className="font-serif type-figure font-[540] tabular text-ink">
                    2
                  </span>
                  <span className="font-serif type-body-sm italic font-medium text-ink-secondary">
                    academic terms
                  </span>
                </dd>
              </div>
            </dl>

            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3.5">
              <a
                href="#chapter-01"
                className={primaryCueStyles}
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
                className={secondaryCueStyles}
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
            className="hero-spec-panel grid min-w-0 rounded-card border border-edge bg-surface shadow-panel"
            aria-label="Team discipline architecture"
          >
            <div className="grid gap-[0.3rem] border-b border-rule px-[clamp(1.25rem,3cqi,1.75rem)] pt-[clamp(1.125rem,2.5cqi,1.5rem)] pb-[clamp(0.875rem,2cqi,1.125rem)]">
              <span className="type-micro font-semibold tabular tracking-[0.05em] uppercase text-ink-muted">
                {GROUP_META.code} · Sep 2027 – Apr 2028
              </span>
              <h2 className="m-0 font-serif type-heading font-[560] text-ink [&_em]:font-medium [&_em]:italic [&_em]:text-accent">
                Three pillars, <em>one system.</em>
              </h2>
            </div>

            <ul className="grid list-none p-0">
              {pillarSpecs.map((spec) => (
                <li key={spec.pillar}>
                  <button
                    type="button"
                    className={cn(
                      "hero-spec-row group/spec-row grid w-full cursor-pointer items-center border-0 border-b border-rule",
                      "grid-cols-[clamp(2.35rem,3.8cqi,3rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-3",
                      "bg-transparent px-[clamp(1.25rem,3cqi,1.75rem)] py-[clamp(0.95rem,2.2cqi,1.3rem)]",
                      "text-start text-ink transition-[background-color,scale] duration-150",
                      "hover:bg-surface-muted active:scale-[0.992]",
                    )}
                    data-pillar={spec.pillar}
                    onClick={() => {
                      handleFilterChange(spec.pillar);
                      setOverviewTab("summary");
                      scrollToElement("at-a-glance");
                    }}
                  >
                    <span className="font-serif type-figure font-medium tabular leading-none tracking-[-0.03em] text-ink transition-colors duration-150 group-hover/spec-row:text-accent">
                      {spec.members.length}
                    </span>
                    <span className="grid min-w-0 gap-[0.3rem]">
                      <span className="font-serif type-role font-[560] text-ink">
                        {spec.fullName}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-[0.35rem]">
                        <span
                          className={cn(
                            "inline-flex items-center gap-[0.35rem] type-ui-sm font-semibold tracking-[0.04em]",
                            accentByPillar[spec.pillar],
                          )}
                        >
                          <span
                            className={cn(
                              "size-[0.45rem] rounded-full",
                              dotByPillar[spec.pillar],
                            )}
                            aria-hidden="true"
                          />
                          <span>{spec.pillar}</span>
                        </span>
                        <span className="text-ink-muted" aria-hidden="true">
                          ·
                        </span>
                        <span className="type-ui-sm text-ink-secondary">
                          {spec.members.map((m) => m.name).join(" · ")}
                        </span>
                      </span>
                    </span>
                    <ArrowRight
                      className={cn(
                        "size-4 text-ink-muted transition-[color,translate] duration-150",
                        "group-hover/spec-row:text-accent",
                        "motion-safe:group-hover/spec-row:translate-x-[0.2em]",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>

            <a
              href="#partner"
              className="hero-spec-footer group/footer-link flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-ee-card rounded-es-card border-t border-rule px-[clamp(1.25rem,3cqi,1.75rem)] py-[clamp(0.875rem,2cqi,1.125rem)] type-ui-sm font-medium text-ink-secondary no-underline transition-[background-color,color,scale] duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.992]"
              onClick={(e) => {
                e.preventDefault();
                scrollToElement("partner");
              }}
            >
              <span>Ready to collaborate?</span>
              <span className="inline-flex items-center gap-[0.35rem] font-semibold text-accent">
                <span className="group-hover/footer-link:underline group-hover/footer-link:underline-offset-4">
                  Work With Us
                </span>
                <ArrowRight
                  className="size-3.5 transition-transform duration-200 group-hover/footer-link:translate-x-[0.2em]"
                  aria-hidden="true"
                />
              </span>
            </a>
          </aside>
        </div>
      </section>

      <div className="chapters-showcase relative" aria-label="Team member chapters">
        {TEAM_MEMBERS.map((member, idx) => (
          <MemberChapter
            key={member.id}
            member={member}
            layoutVariant={CHAPTER_VARIANTS[idx % CHAPTER_VARIANTS.length]}
            pinSide={idx % 2 === 1 ? "right" : "left"}
          />
        ))}

        <div className="pointer-events-none sticky bottom-3 z-30 flex flex-col items-center gap-2 px-4 py-2">
          <nav
            className="chapter-dock pointer-events-auto max-w-[calc(100dvw-1.5rem)] overflow-x-auto rounded-full border border-edge bg-surface/95 p-[clamp(0.3rem,0.8dvw,0.4rem)] shadow-float backdrop-blur-[14px] [scrollbar-width:none]"
            aria-label="Chapter quick navigation"
          >
            <ul className="flex list-none items-center gap-[clamp(0.125rem,0.4dvw,0.25rem)] p-0">
              {TEAM_MEMBERS.map((member) => {
                const isActive = activeChapter === member.index;
                return (
                  <li key={member.id}>
                    <a
                      href={`#chapter-${member.index}`}
                      aria-current={isActive ? "location" : undefined}
                      aria-label={`Jump to ${member.name} (${member.pillar})`}
                      className="dock-link relative inline-flex min-w-[clamp(1.95rem,1.65rem+1.2dvw,2.35rem)] min-h-9 items-center justify-center rounded-full px-[clamp(0.4rem,0.3rem+0.6dvw,0.65rem)] type-micro font-semibold tabular text-ink-secondary no-underline transition-colors duration-150 hover:text-ink aria-[current=location]:font-bold aria-[current=location]:text-page"
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToElement(`chapter-${member.index}`);
                      }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="chapter-dock-pill"
                          className="absolute inset-0 z-0 rounded-full bg-ink"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 36,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-1">{member.index}</span>
                    </a>
                  </li>
                );
              })}
              <li
                className="mx-1 h-[1.125rem] w-px shrink-0 bg-edge"
                aria-hidden="true"
              />
              <li>
                <a
                  href="#at-a-glance"
                  className="inline-flex min-h-9 items-center rounded-full px-[clamp(0.6rem,0.45rem+0.8dvw,0.9rem)] type-micro font-semibold whitespace-nowrap text-ink-secondary no-underline transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
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

      <div className="bottom-overview-shell shell pt-[clamp(3.5rem,8dvb,6rem)] pb-[clamp(4.5rem,9dvb,7.5rem)]">
        <section
          id="at-a-glance"
          className="roster-section @container/roster scroll-mt-20 pt-[clamp(2rem,5dvb,3.5rem)]"
          aria-labelledby="team-heading"
        >
          <div className="mb-[clamp(1.75rem,3.5dvb,2.5rem)] grid gap-[clamp(1.25rem,3dvb,1.75rem)]">
            <div>
              <h2
                id="team-heading"
                className="m-0 font-serif type-heading-lg font-semibold"
              >
                Team at a Glance
              </h2>
              <p className="mt-2 m-0 max-w-[52ch] type-body-sm text-ink-secondary">
                {overviewTab === "summary"
                  ? "Filter by SUTD pillar or open a member profile."
                  : "What each of us explores inside studio and on our own time."}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-4">
              <div
                className="overview-tablist relative inline-flex max-w-full items-center gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none]"
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
                  className="overview-tab relative inline-flex min-h-10 flex-none cursor-pointer items-center justify-center border-0 bg-transparent px-4 py-2 type-body-sm font-semibold whitespace-nowrap text-ink-secondary transition-colors duration-150 hover:text-ink aria-[selected=true]:text-ink pointer-coarse:min-h-11"
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
                  className="overview-tab relative inline-flex min-h-10 flex-none cursor-pointer items-center justify-center border-0 bg-transparent px-4 py-2 type-body-sm font-semibold whitespace-nowrap text-ink-secondary transition-colors duration-150 hover:text-ink aria-[selected=true]:text-ink pointer-coarse:min-h-11"
                  onClick={() => switchOverviewTab("interests")}
                  onKeyDown={handleOverviewTabKeyDown}
                >
                  Interests
                </button>
              </div>

              <div
                className="filter-rail inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-control bg-surface-muted p-1"
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
                      className="filter-pill relative inline-flex min-h-[2.375rem] cursor-pointer items-center gap-[0.45rem] rounded-full border-0 bg-transparent px-[0.9rem] py-[0.35rem] type-ui font-semibold text-ink-secondary transition-colors duration-150 hover:text-ink aria-[pressed=true]:font-bold aria-[pressed=true]:text-ink pointer-coarse:min-h-11"
                    >
                      {pressed && (
                        <motion.span
                          layoutId="roster-filter-capsule"
                          className="absolute inset-0 z-0 rounded-full border border-edge bg-surface shadow-chip"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 36,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-1">{filter.label}</span>
                      <span className="relative z-1 type-micro font-bold tabular text-ink-secondary">
                        {pillarCounts[filter.id]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            Showing {filteredMembers.length}{" "}
            {activeFilter === "All"
              ? "team members across all pillars"
              : `${activeFilter} members`}
            .
          </p>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
            <div
              ref={summaryPanelRef}
              id="overview-panel-summary"
              role="tabpanel"
              aria-labelledby="overview-tab-summary"
              className="col-start-1 row-start-1 min-w-0"
              hidden={overviewTab !== "summary"}
            >
              <div className="pt-1">
                <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-[clamp(1.25rem,2.5dvw,2.25rem)] p-0 pt-3">
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
                          className="flex min-w-0"
                        >
                          <article
                            className={cn(
                              "member-card group/card @container/member-card relative grid h-full w-full min-w-0",
                              "grid-rows-[auto_auto_1fr_auto] gap-y-[clamp(0.875rem,3cqi,1.125rem)]",
                              "rounded-card border border-edge bg-surface p-[clamp(1.375rem,5.5cqi,2.35rem)]",
                              "transition-[background-color,border-color,box-shadow,translate] duration-200",
                              "has-[a.card-link:hover]:border-ink has-[a.card-link:hover]:shadow-raised",
                              "motion-safe:has-[a.card-link:hover]:-translate-y-[0.15em]",
                              "has-[a.card-link:focus-visible]:outline has-[a.card-link:focus-visible]:outline-[3px]",
                              "has-[a.card-link:focus-visible]:outline-accent has-[a.card-link:focus-visible]:outline-offset-[3px]",
                            )}
                            data-pillar={member.pillar}
                            style={
                              isMorphTarget
                                ? ({
                                    viewTransitionName: "member-card",
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            <header className="flex items-center justify-between gap-4">
                              <PillarBadge pillar={member.pillar}>
                                {member.pillar}
                              </PillarBadge>
                            </header>

                            <hgroup className="grid gap-[0.35rem]">
                              <h3 className="m-0 w-fit font-serif type-name font-[580]">
                                <TransitionLink
                                  to={`/member/${member.slug}`}
                                  direction="forward"
                                  memberSlug={member.slug}
                                  transitionSource="card"
                                  className="card-link text-inherit no-underline after:absolute after:inset-0 focus-visible:outline-none"
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
                              <p className="m-0 font-serif type-role italic font-medium text-ink">
                                {member.role}
                              </p>
                            </hgroup>

                            <p className="m-0 type-body text-ink-secondary">
                              {member.bio}
                            </p>

                            <footer className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-3 border-t border-rule pt-5 @max-[20rem]/member-card:flex-col @max-[20rem]/member-card:items-start">
                              <p className="m-0 type-body-sm text-ink-secondary">
                                {member.skillsets.join(" · ")}
                              </p>

                              <span
                                className="ms-auto inline-flex items-center gap-[0.35rem] type-ui font-semibold text-ink transition-colors duration-150 group-has-[a.card-link:hover]/card:text-accent @max-[20rem]/member-card:ms-0"
                                aria-hidden="true"
                              >
                                <span>Profile</span>
                                <ArrowRight className="size-4 transition-transform duration-200 group-has-[a.card-link:hover]/card:translate-x-[0.22em]" />
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
              className="col-start-1 row-start-1 min-w-0"
              hidden={overviewTab !== "interests"}
            >
              <div className="pt-1">
                <ul className="member-interests-list min-w-0 list-none border-t border-edge p-0">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {filteredMembers.map((member) => (
                      <motion.li
                        key={member.id}
                        layout="position"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: EASE }}
                        className={interestRowStyles}
                      >
                        <div className="flex min-w-0 items-baseline gap-3.5 [&>div]:min-w-0">
                          <div>
                            <TransitionLink
                              to={`/member/${member.slug}`}
                              direction="forward"
                              className="font-serif type-name-sm font-[580] text-ink no-underline hover:text-accent hover:underline hover:underline-offset-4"
                            >
                              {member.name}
                            </TransitionLink>
                            <p className="mt-[0.2rem] m-0 type-ui text-ink-secondary">
                              {member.pillar} · {member.role}
                            </p>
                          </div>
                        </div>

                        <p className="m-0 type-body text-ink-secondary">
                          {member.interests.join(" · ")}
                        </p>

                        <aside
                          className={cn(
                            "interest-row-preview grid justify-items-end gap-[0.2rem] rounded-control border border-edge bg-surface",
                            "px-[0.85rem] py-[0.55rem] text-end",
                            "pointer-events-none opacity-0 translate-x-[0.4em]",
                            "transition-[opacity,translate] duration-200",
                            "group-hover/row:translate-x-0 group-hover/row:opacity-100",
                            "group-focus-within/row:translate-x-0 group-focus-within/row:opacity-100",
                            "@max-[50rem]/roster:hidden",
                          )}
                          aria-hidden="true"
                        >
                          <span className="type-micro font-semibold tracking-[0.04em] uppercase text-accent">
                            {member.pillar} · Core
                          </span>
                          <span className="type-micro whitespace-nowrap text-ink-secondary">
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
