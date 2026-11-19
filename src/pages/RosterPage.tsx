import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { cn } from "cn";
import { GROUP_META, PILLAR_FILTERS, type FilterOption } from "@/data/capstone";
import { useLiveMembers } from "@/hooks/useLiveMembers";
import { getPublicMembers } from "@/lib/membersStore";
import { MemberChapter, type ChapterSurfaceTone } from "@/components/MemberChapter";
import { SelectedWorkSection } from "@/components/SelectedWorkSection";
import { PartnerSection } from "@/components/PartnerSection";
import { BackToTop } from "@/components/BackToTop";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { prefersReducedMotion, runViewTransition } from "@/lib/viewTransitions";

const EASE = [0.22, 1, 0.36, 1] as const;

const splashStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.075,
      delayChildren: 0.02,
    },
  },
};

const splashRise: Variants = {
  hidden: { opacity: 0, y: "12%" },
  visible: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.48, ease: EASE },
  },
};

const mastheadStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.03,
    },
  },
};

const mastheadRise: Variants = {
  hidden: { opacity: 0, y: "14%" },
  visible: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.5, ease: EASE },
  },
};

const figureStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.085,
      delayChildren: 0.05,
    },
  },
};

const figureCardRise: Variants = {
  hidden: { opacity: 0, y: "10%", scale: 0.985 },
  visible: {
    opacity: 1,
    y: "0%",
    scale: 1,
    transition: { duration: 0.48, ease: EASE },
  },
};

const VALID_FILTERS = new Set<FilterOption>(["All", "CSD", "EPD", "ESD"]);

const COUNT_WORDS_TITLE: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
};

const COUNT_WORDS_LOWER: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
};

const primaryCueStyles = cn(
  "ui-press ui-press-primary inline-flex items-center gap-2 min-h-11 px-5.5 py-2.5",
  "rounded-control border border-ink bg-ink text-page type-body-sm font-semibold no-underline cursor-pointer",
);

const secondaryCueStyles = cn(
  "ui-press inline-flex items-center gap-[0.45rem] min-h-11 px-4.5 py-2.5",
  "rounded-control border border-control bg-surface text-ink type-body-sm font-semibold no-underline cursor-pointer",
  "hover:bg-surface-muted/75",
);

function resolveChapterTone(idx: number): ChapterSurfaceTone {
  if (idx % 3 === 2) return "charcoal";
  if (idx % 2 === 1) return "alt";
  return "default";
}

export function RosterPage() {
  useDocumentTitle(`${GROUP_META.title} | Team & Work`);
  const shouldReduceMotion = Boolean(useReducedMotion());
  const { members: rawMembers } = useLiveMembers();
  const publicMembers = useMemo(() => getPublicMembers(rawMembers), [rawMembers]);

  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFilter = searchParams.get("pillar") as FilterOption | null;
  const activeFilter: FilterOption =
    rawFilter && VALID_FILTERS.has(rawFilter) ? rawFilter : "All";

  const filteredMembers = useMemo(() => {
    if (activeFilter === "All") return publicMembers;
    return publicMembers.filter((m) => m.pillar === activeFilter);
  }, [activeFilter, publicMembers]);

  const [activeChapterSlug, setActiveChapterSlug] = useState<string>(
    () => filteredMembers[0]?.slug ?? "01",
  );

  // Resolve current and legacy deep-link hashes (#at-a-glance, #interests, #builders, #chapter-01).
  useEffect(() => {
    if (!hash) return;
    const rawId = hash.slice(1);
    let target: HTMLElement | null = document.getElementById(rawId);

    if (!target) {
      if (rawId === "at-a-glance" || rawId === "interests") {
        target = document.getElementById("team");
      } else {
        const legacyMatch = /^chapter-(\d{2})$/.exec(rawId);
        if (legacyMatch) {
          target = document.querySelector<HTMLElement>(
            `[data-chapter-index="${legacyMatch[1]}"]`,
          );
        }
      }
    }

    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      });
    }
  }, [hash, publicMembers]);

  // Lightweight IntersectionObserver for the floating chapter quick-jump dock.
  useEffect(() => {
    const chapters = Array.from(
      document.querySelectorAll<HTMLElement>(".member-chapter"),
    );
    if (chapters.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const slug = entry.target.id.replace(/^chapter-/, "");
            if (slug) setActiveChapterSlug(slug);
          }
        }
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );

    for (const el of chapters) observer.observe(el);
    return () => observer.disconnect();
  }, [filteredMembers]);

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const handleFilterChange = (nextFilter: FilterOption) => {
    if (nextFilter === activeFilter) return;
    runViewTransition({
      types: ["filter"],
      mode: "filter",
      update: () => {
        if (nextFilter === "All") {
          setSearchParams({}, { replace: true });
        } else {
          setSearchParams({ pillar: nextFilter }, { replace: true });
        }
      },
    });
  };

  const pillarCounts: Record<FilterOption, number> = {
    All: publicMembers.length,
    CSD: publicMembers.filter((m) => m.pillar === "CSD").length,
    EPD: publicMembers.filter((m) => m.pillar === "EPD").length,
    ESD: publicMembers.filter((m) => m.pillar === "ESD").length,
  };

  const activePillarCount = useMemo(() => {
    let count = 0;
    for (const pillar of ["CSD", "EPD", "ESD"] as const) {
      if (publicMembers.some((m) => m.pillar === pillar)) count += 1;
    }
    return count;
  }, [publicMembers]);

  const builderWord =
    COUNT_WORDS_TITLE[publicMembers.length] ?? String(publicMembers.length);
  const pillarWordLower =
    COUNT_WORDS_LOWER[activePillarCount] ?? String(activePillarCount);

  return (
    <div className="showcase-page relative">
      {/* Stage 1: Original full-height Lockheed Splash Landing */}
      <section
        id="top"
        className="splash @container/splash border-b border-edge"
      >
        <motion.div
          className="shell grid min-h-[calc(100svb-var(--header-h))] content-center justify-items-start gap-[clamp(1.1rem,2.6cqi,1.85rem)] py-[clamp(2.5rem,6.5dvb,4.5rem)]"
          variants={splashStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          <motion.p
            variants={splashRise}
            className="m-0 type-body font-semibold tracking-[0.08em] uppercase text-ink-secondary"
          >
            {GROUP_META.institution}
          </motion.p>

          <motion.h1
            variants={splashRise}
            id="main-content"
            tabIndex={-1}
            className="m-0 grid justify-items-start gap-[0.1em] font-serif focus:outline-none"
            aria-label="Lockheed Summer Internship"
          >
            <span className="font-serif type-display font-semibold text-wrap-balance text-ink">
              Lockheed
            </span>
            <span className="font-serif type-title-sub italic font-medium text-accent">
              Summer Internship
            </span>
          </motion.h1>

          <motion.p
            variants={splashRise}
            className="m-0 max-w-[44ch] type-body-lg text-ink-secondary"
          >
            One team across product, systems &amp; design, and code. Scroll on
            to find out more about us.
          </motion.p>

          <motion.div variants={splashRise} className="no-print pt-1">
            <button
              type="button"
              className={cn("splash-cue", primaryCueStyles)}
              onClick={() => scrollToElement("builders")}
            >
              <span>Meet the team</span>
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Stage 2: Dedicated Splash Section for Team, Team Composition, and Delivery */}
      <section
        id="builders"
        tabIndex={-1}
        className="hero-masthead @container/hero grid min-h-[min(86svb,48rem)] scroll-mt-20 items-center border-b border-edge bg-surface-alt/45 py-[clamp(5.5rem,12dvb,9rem)]"
        aria-labelledby="builders-masthead-heading"
      >
        <motion.div
          className="shell grid min-w-0 gap-[clamp(2.5rem,5.5dvb,4.25rem)]"
          variants={mastheadStagger}
          initial={shouldReduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: "some" }}
        >
          <div className="grid max-w-[46rem] gap-4">
            <motion.p
              variants={mastheadRise}
              className="m-0 type-ui-sm font-semibold tracking-[0.06em] uppercase text-ink-secondary"
            >
              {GROUP_META.institution} · {GROUP_META.pillarsLabel} · Sep 2027 – Apr 2028
            </motion.p>

            <motion.h2
              variants={mastheadRise}
              id="builders-masthead-heading"
              className="m-0 font-serif type-title-1 font-semibold text-ink [&_em]:font-medium [&_em]:italic [&_em]:text-accent"
            >
              {builderWord} {publicMembers.length === 1 ? "builder" : "builders"},{" "}
              <em>
                {pillarWordLower} {activePillarCount === 1 ? "pillar." : "pillars."}
              </em>
            </motion.h2>
          </div>

          <motion.dl
            variants={figureStagger}
            className="m-0 grid w-full list-none grid-cols-1 gap-[clamp(1.25rem,3cqi,2.25rem)] @min-[44rem]/hero:grid-cols-3"
            aria-label="Capstone key figures"
          >
            <motion.div
              variants={figureCardRise}
              className="ui-card-interactive grid content-between gap-6 rounded-card border border-edge bg-surface p-[clamp(1.75rem,4cqi,2.5rem)] shadow-raised"
            >
              <dt className="type-ui-sm font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Team
              </dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-3">
                <span className="font-serif type-numeral font-semibold tabular leading-none text-ink">
                  {publicMembers.length}
                </span>
                <span className="font-serif type-role italic font-medium text-accent">
                  builders
                </span>
              </dd>
            </motion.div>

            <motion.div
              variants={figureCardRise}
              className="ui-card-interactive grid content-between gap-6 rounded-card border border-edge bg-surface p-[clamp(1.75rem,4cqi,2.5rem)] shadow-raised"
            >
              <dt className="type-ui-sm font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Team composition
              </dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-3">
                <span className="font-serif type-numeral font-semibold tabular leading-none text-ink">
                  {activePillarCount}
                </span>
                <span className="font-serif type-role italic font-medium text-accent">
                  SUTD pillars
                </span>
              </dd>
            </motion.div>

            <motion.div
              variants={figureCardRise}
              className="ui-card-interactive grid content-between gap-6 rounded-card border border-edge bg-surface p-[clamp(1.75rem,4cqi,2.5rem)] shadow-raised"
            >
              <dt className="type-ui-sm font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Delivery
              </dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-3">
                <span className="font-serif type-numeral font-semibold tabular leading-none text-ink">
                  2
                </span>
                <span className="font-serif type-role italic font-medium text-accent">
                  academic terms
                </span>
              </dd>
            </motion.div>
          </motion.dl>

          <motion.div
            variants={mastheadRise}
            className="no-print flex flex-wrap items-center gap-3.5"
          >
            <a
              href="#team"
              className={primaryCueStyles}
              onClick={(e) => {
                e.preventDefault();
                scrollToElement("team");
              }}
            >
              <span>Explore the roster</span>
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>

            <a
              href="#partner"
              className={secondaryCueStyles}
              onClick={(e) => {
                e.preventDefault();
                scrollToElement("partner");
              }}
            >
              <span>Work with us</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      <section
        id="team"
        tabIndex={-1}
        className="relative scroll-mt-20"
        aria-labelledby="team-section-heading"
      >
        <div className="border-b border-edge bg-surface-alt/70 py-[clamp(3rem,6.5dvb,4.5rem)]">
          <div className="shell flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="grid gap-2">
              <p className="m-0 type-ui-sm font-semibold tracking-[0.05em] uppercase text-accent">
                Team Roster
              </p>
              <h2
                id="team-section-heading"
                className="m-0 font-serif type-title-3 font-semibold text-ink"
              >
                The {publicMembers.length} Builders
              </h2>
              <p className="m-0 max-w-[54ch] type-body text-ink-secondary">
                Filter by SUTD pillar or open any member profile for full tools and projects.
              </p>
            </div>

            <div
              className="filter-rail no-print inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-control bg-surface-muted p-1"
              role="group"
              aria-label="Filter team members by SUTD pillar"
            >
              {PILLAR_FILTERS.map((filter) => {
                const pressed = activeFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    data-pillar={filter.id !== "All" ? filter.id : undefined}
                    aria-pressed={pressed}
                    onClick={() => handleFilterChange(filter.id)}
                    className="filter-pill relative inline-flex min-h-10 cursor-pointer items-center gap-[0.45rem] rounded-full border-0 bg-transparent px-[0.95rem] py-[0.4rem] type-ui font-semibold text-ink-secondary aria-[pressed=true]:font-bold aria-[pressed=true]:text-ink pointer-coarse:min-h-11"
                  >
                    {pressed ? (
                      <motion.span
                        layoutId="roster-filter-capsule"
                        className="absolute inset-0 z-0 rounded-full border border-edge bg-surface shadow-chip"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        aria-hidden="true"
                      />
                    ) : null}
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

        {filteredMembers.length === 0 ? (
          <div className="shell py-16">
            <p className="m-0 type-body text-ink-secondary">
              No visible members in the {activeFilter} pillar.{" "}
              <button
                type="button"
                onClick={() => handleFilterChange("All")}
                className="font-semibold text-accent underline underline-offset-4"
              >
                Show all members
              </button>
            </p>
          </div>
        ) : (
          <div className="chapters-showcase relative">
            {filteredMembers.map((member, idx) => (
              <MemberChapter
                key={member.id}
                member={member}
                displayIndex={member.index}
                totalCount={publicMembers.length}
                surfaceTone={resolveChapterTone(idx)}
                pinSide={idx % 2 === 1 ? "right" : "left"}
              />
            ))}

            {filteredMembers.length > 1 ? (
              <div className="no-print pointer-events-none sticky bottom-3 z-20 flex flex-col items-center gap-2 px-4 py-3">
                <nav
                  className="chapter-dock pointer-events-auto max-w-[calc(100dvw-1.5rem)] overflow-x-auto rounded-full border border-edge bg-surface/95 p-[clamp(0.3rem,0.8dvw,0.4rem)] shadow-float backdrop-blur-[14px] [scrollbar-width:none]"
                  aria-label="Chapter quick navigation"
                >
                  <ul className="m-0 flex list-none items-center gap-[clamp(0.125rem,0.4dvw,0.25rem)] p-0">
                    {filteredMembers.map((member) => {
                      const isActive = activeChapterSlug === member.slug;
                      return (
                        <li key={member.id}>
                          <a
                            href={`#chapter-${member.slug}`}
                            aria-current={isActive ? "location" : undefined}
                            aria-label={`Jump to ${member.name} (${member.pillar})`}
                            className="dock-link relative inline-flex min-h-9 min-w-[clamp(2rem,1.7rem+1.2dvw,2.4rem)] items-center justify-center rounded-full px-[clamp(0.45rem,0.3rem+0.6dvw,0.7rem)] type-micro font-semibold tabular text-ink-secondary no-underline transition-colors duration-150 hover:text-ink aria-[current=location]:font-bold aria-[current=location]:text-page pointer-coarse:min-h-11"
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveChapterSlug(member.slug);
                              scrollToElement(`chapter-${member.slug}`);
                            }}
                          >
                            {isActive ? (
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
                            ) : null}
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
                        href="#work"
                        aria-label="Jump to Our Experience & Expertise"
                        className="inline-flex min-h-9 items-center rounded-full px-[clamp(0.6rem,0.45rem+0.8dvw,0.9rem)] type-micro font-semibold whitespace-nowrap text-ink-secondary no-underline transition-colors duration-150 hover:bg-surface-muted hover:text-ink pointer-coarse:min-h-11"
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToElement("work");
                        }}
                      >
                        Experience
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <SelectedWorkSection
        members={publicMembers}
        activeFilter={activeFilter}
        onResetFilter={() => handleFilterChange("All")}
      />

      <PartnerSection />

      <BackToTop />
    </div>
  );
}
