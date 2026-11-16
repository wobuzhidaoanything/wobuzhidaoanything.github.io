import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { TeamMember } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { TransitionLink } from "@/components/TransitionLink";
import { useTransitionState } from "@/hooks/useTransitionMember";

export type ChapterLayoutVariant =
  | "split"
  | "split-reverse"
  | "offset"
  | "monumental"
  | "split-wide"
  | "inset"
  | "compact-band";

interface MemberChapterProps {
  member: TeamMember;
  layoutVariant: ChapterLayoutVariant;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.36, ease: EASE },
  },
};

const skillItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE },
  },
};

const ruleVariants: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.34, ease: EASE },
  },
};

export function MemberChapter({ member, layoutVariant }: MemberChapterProps) {
  const shouldReduceMotion = useReducedMotion();
  const transitionState = useTransitionState();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  /* Proportional scroll travel (%) so motion scales with element size at any viewport or zoom */
  const plateAY = useTransform(scrollYProgress, [0, 1], ["3.5%", "-3.5%"]);
  const plateBY = useTransform(scrollYProgress, [0, 1], ["-3%", "4.5%"]);

  const isMorphTarget =
    transitionState.mode === "member" &&
    transitionState.memberSlug === member.slug &&
    transitionState.source === "chapter";

  const isCharcoalBand =
    layoutVariant === "offset" || layoutVariant === "compact-band";
  const isDiptych =
    layoutVariant === "split-reverse" || layoutVariant === "inset";
  const isCenterpiece = layoutVariant === "monumental";

  return (
    <section
      ref={sectionRef}
      id={`chapter-${member.index}`}
      className="member-chapter"
      data-variant={layoutVariant}
      data-surface={isCharcoalBand ? "charcoal" : undefined}
      data-pillar={member.pillar}
      aria-labelledby={`chapter-heading-${member.index}`}
    >
      <motion.div
        className="chapter-inner"
        variants={containerVariants}
        initial={shouldReduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: "some" }}
        style={
          isMorphTarget
            ? ({ viewTransitionName: "member-card" } as React.CSSProperties)
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
                  ? ({
                      viewTransitionName: "member-index",
                    } as React.CSSProperties)
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
                ? ({ viewTransitionName: "member-name" } as React.CSSProperties)
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
          {isCenterpiece ? (
            <InteractivePerspectiveStage
              member={member}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          ) : isCharcoalBand ? (
            <PeekCarouselStage
              member={member}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          ) : isDiptych ? (
            <DiptychStage
              member={member}
              plateAY={plateAY}
              plateBY={plateBY}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          ) : (
            <PopOutSpecStage
              member={member}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          )}
        </div>
      </motion.div>
    </section>
  );
}

function PopOutSpecStage({
  member,
  shouldReduceMotion,
}: {
  member: TeamMember;
  shouldReduceMotion: boolean;
}) {
  return (
    <div className="pop-spec-stage">
      <motion.div
        className="chapter-pop-frame"
        variants={riseVariants}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: "some" }}
        transition={{ duration: 0.34, ease: EASE }}
      >
        <ArtifactFrame
          member={member}
          src={member.artifacts?.heroImage}
          aspectRatio="16/10"
          plateLabel={`${member.pillar} · ${member.pillarFull}`}
        />
      </motion.div>

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
        <p className="chapter-interests-line">{member.interests.join(" · ")}</p>
      </motion.div>
    </div>
  );
}

function DiptychStage({
  member,
  plateAY,
  plateBY,
  shouldReduceMotion,
}: {
  member: TeamMember;
  plateAY: ReturnType<typeof useTransform<number, string>>;
  plateBY: ReturnType<typeof useTransform<number, string>>;
  shouldReduceMotion: boolean;
}) {
  return (
    <div className="diptych-stage">
      <div className="diptych-collage">
        <motion.div
          className="diptych-plate diptych-plate-primary"
          style={shouldReduceMotion ? undefined : { y: plateAY }}
          initial={
            shouldReduceMotion
              ? false
              : { clipPath: "inset(10% 0% 0% 0%)", opacity: 0 }
          }
          whileInView={{
            clipPath: "inset(0% 0% 0% 0%)",
            opacity: 1,
          }}
          viewport={{ once: true, amount: "some" }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <ArtifactFrame
            member={member}
            src={member.artifacts?.heroImage}
            aspectRatio="4/5"
            plateLabel={`${member.pillar} · ${member.pillarFull}`}
          />
        </motion.div>

        <motion.div
          className="diptych-plate diptych-plate-secondary"
          style={shouldReduceMotion ? undefined : { y: plateBY }}
          initial={
            shouldReduceMotion
              ? false
              : { clipPath: "inset(12% 0% 0% 0%)", opacity: 0 }
          }
          whileInView={{
            clipPath: "inset(0% 0% 0% 0%)",
            opacity: 1,
          }}
          viewport={{ once: true, amount: "some" }}
          transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
        >
          <ArtifactFrame
            member={member}
            src={member.artifacts?.secondaryImage}
            aspectRatio="16/10"
            plateLabel={`${member.pillar} · Focus`}
          />
        </motion.div>
      </div>

      <motion.div className="diptych-meta-strip" variants={riseVariants}>
        <div>
          <h3 className="chapter-kicker">Skillsets</h3>
          <p className="chapter-inline-specs">{member.skillsets.join(" · ")}</p>
        </div>
        <div>
          <h3 className="chapter-kicker">Interests</h3>
          <p className="chapter-interests-line">
            {member.interests.join(" · ")}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function PeekCarouselStage({
  member,
  shouldReduceMotion,
}: {
  member: TeamMember;
  shouldReduceMotion: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"skillsets" | "focus">(
    "skillsets",
  );
  const trackRef = useRef<HTMLDivElement>(null);
  const pendingTargetRef = useRef<number | null>(null);
  const lastSettledRef = useRef<number>(0);
  const userScrolledRef = useRef(false);
  const rafRef = useRef<number>(0);
  const settleTimerRef = useRef<number | undefined>(undefined);

  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const [settledAnnouncement, setSettledAnnouncement] = useState("");

  const cards = useMemo(() => {
    if (activeTab === "skillsets") {
      return member.skillsets.map((skill, idx) => ({
        id: `skill-${skill}`,
        tag: `0${idx + 1} · Core Skill`,
        title: skill,
        detail: `${member.pillar} application within ${member.role.toLowerCase()}.`,
      }));
    }
    return member.interests.map((interest, idx) => ({
      id: `interest-${interest}`,
      tag: `0${idx + 1} · Studio & Beyond`,
      title: interest,
      detail: `Explored alongside ${member.skillsets[idx % member.skillsets.length]}.`,
    }));
  }, [activeTab, member]);

  const computeNearestSlide = useCallback((track: HTMLDivElement) => {
    const slides = Array.from(track.children) as HTMLElement[];
    if (slides.length === 0) {
      return { nearest: 0, maxScroll: 0 };
    }
    const baseOffset = slides[0].offsetLeft;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    let nearest = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, idx) => {
      const snapLeft = Math.min(slide.offsetLeft - baseOffset, maxScroll);
      const distance = Math.abs(track.scrollLeft - snapLeft);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = idx;
      }
    });

    return { nearest, maxScroll };
  }, []);

  const syncScrollBounds = useCallback(
    (track: HTMLDivElement) => {
      const { nearest, maxScroll } = computeNearestSlide(track);
      setCanScrollPrev(track.scrollLeft > 2);
      setCanScrollNext(maxScroll > 2 && track.scrollLeft < maxScroll - 2);
      return { nearest, maxScroll };
    },
    [computeNearestSlide],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    pendingTargetRef.current = null;
    lastSettledRef.current = 0;
    userScrolledRef.current = false;
    track.scrollTo({ left: 0, behavior: "auto" });
    setActiveIndex(0);
    setSettledAnnouncement("");
    syncScrollBounds(track);

    const handleSettled = () => {
      const pending = pendingTargetRef.current;
      pendingTargetRef.current = null;
      const { nearest, maxScroll } = syncScrollBounds(track);
      const settled =
        pending !== null && Math.abs(track.scrollLeft - maxScroll) <= 2
          ? pending
          : nearest;
      setActiveIndex(settled);
      if (userScrolledRef.current && settled !== lastSettledRef.current) {
        lastSettledRef.current = settled;
        setSettledAnnouncement(`Slide ${settled + 1} of ${cards.length}`);
      }
    };

    const supportsScrollEnd = "onscrollend" in window;

    const onScroll = () => {
      userScrolledRef.current = true;
      if (pendingTargetRef.current === null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const { nearest } = syncScrollBounds(track);
          setActiveIndex(nearest);
        });
      }
      if (!supportsScrollEnd) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(handleSettled, 140);
      }
    };

    const onScrollEnd = () => {
      if (pendingTargetRef.current !== null) {
        const slides = Array.from(track.children) as HTMLElement[];
        const targetSlide = slides[pendingTargetRef.current];
        if (targetSlide && slides[0]) {
          const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
          const expectedLeft = Math.min(
            targetSlide.offsetLeft - slides[0].offsetLeft,
            maxScroll,
          );
          if (Math.abs(track.scrollLeft - expectedLeft) > 8) {
            return;
          }
        }
      }
      handleSettled();
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) {
      track.addEventListener("scrollend", onScrollEnd);
    }

    const resizeObserver = new ResizeObserver(() => {
      syncScrollBounds(track);
    });
    resizeObserver.observe(track);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(settleTimerRef.current);
      track.removeEventListener("scroll", onScroll);
      if (supportsScrollEnd) {
        track.removeEventListener("scrollend", onScrollEnd);
      }
      resizeObserver.disconnect();
    };
  }, [activeTab, cards.length, syncScrollBounds]);

  const scrollToSlide = (targetIdx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slides = Array.from(track.children) as HTMLElement[];
    if (slides.length === 0) return;

    const clampedIdx = Math.max(0, Math.min(slides.length - 1, targetIdx));
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const targetLeft = Math.min(
      slides[clampedIdx].offsetLeft - slides[0].offsetLeft,
      maxScroll,
    );

    userScrolledRef.current = true;
    pendingTargetRef.current = clampedIdx;
    setActiveIndex(clampedIdx);
    setCanScrollPrev(targetLeft > 2);
    setCanScrollNext(maxScroll > 2 && targetLeft < maxScroll - 2);

    track.scrollTo({
      left: targetLeft,
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });

    if (shouldReduceMotion) {
      pendingTargetRef.current = null;
      if (clampedIdx !== lastSettledRef.current) {
        lastSettledRef.current = clampedIdx;
        setSettledAnnouncement(`Slide ${clampedIdx + 1} of ${cards.length}`);
      }
    }
  };

  const handleStep = (delta: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const baseIndex =
      pendingTargetRef.current ?? computeNearestSlide(track).nearest;
    scrollToSlide(baseIndex + delta);
  };

  return (
    <section
      className="peek-stage"
      aria-roledescription="carousel"
      aria-label={`${member.name} ${activeTab === "skillsets" ? "skillsets" : "interests"}`}
    >
      <div className="peek-header">
        <div
          className="peek-tabs"
          role="tablist"
          aria-label={`${member.name} focus areas`}
        >
          {(["skillsets", "focus"] as const).map((tab) => {
            const isSelected = activeTab === tab;
            const label =
              tab === "skillsets" ? "Skillsets" : "Focus & Interests";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className="peek-tab-btn"
                onClick={() => setActiveTab(tab)}
              >
                {isSelected && (
                  <motion.span
                    layoutId={`peek-tab-${member.id}`}
                    className="peek-tab-pill"
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 36 }
                    }
                    aria-hidden="true"
                  />
                )}
                <span className="peek-tab-label">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="peek-controls">
          <button
            type="button"
            className="peek-nav-btn"
            aria-label="Previous slide"
            disabled={!canScrollPrev}
            onClick={() => handleStep(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="peek-nav-btn"
            aria-label="Next slide"
            disabled={!canScrollNext}
            onClick={() => handleStep(1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="peek-carousel"
        role="group"
        aria-label="Slides"
        tabIndex={0}
      >
        {cards.map((card, idx) => (
          <article
            key={card.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${cards.length}`}
            className="peek-card"
          >
            <span className="peek-card-tag">{card.tag}</span>
            <h3 className="peek-card-title">{card.title}</h3>
            <p className="peek-card-detail">{card.detail}</p>
          </article>
        ))}
      </div>

      <nav className="peek-markers" aria-label="Choose a slide">
        {cards.map((card, idx) => (
          <button
            key={card.id}
            type="button"
            className="peek-marker-btn"
            aria-label={`Go to slide ${idx + 1}: ${card.title}`}
            aria-current={idx === activeIndex ? "true" : undefined}
            onClick={() => scrollToSlide(idx)}
          />
        ))}
      </nav>

      <p className="visually-hidden" role="status" aria-live="polite">
        {settledAnnouncement}
      </p>
    </section>
  );
}

function InteractivePerspectiveStage({
  member,
  shouldReduceMotion,
}: {
  member: TeamMember;
  shouldReduceMotion: boolean;
}) {
  const lenses = useMemo(
    () =>
      member.artifacts?.lenses ?? [
        {
          id: "craft",
          label: "Craft",
          summary: member.bio,
        },
        {
          id: "toolchain",
          label: "Toolchain",
          summary: member.skillsets.join(" · "),
        },
        {
          id: "role",
          label: "Capstone Role",
          summary: `${member.pillarFull} — ${member.role}`,
        },
      ],
    [member],
  );

  const [activeLensId, setActiveLensId] = useState(lenses[0]?.id ?? "craft");

  const currentLens = lenses.find((l) => l.id === activeLensId) ?? lenses[0];

  return (
    <div className="perspective-stage">
      <div className="perspective-canvas">
        <ArtifactFrame
          member={member}
          src={member.artifacts?.heroImage}
          aspectRatio="16/9"
          plateLabel={`${member.pillar} · ${currentLens.label}`}
          className="perspective-artifact"
        />
      </div>

      <div className="perspective-controls">
        <div
          className="perspective-lens-strip"
          role="group"
          aria-label="Perspective lens"
        >
          {lenses.map((lens) => {
            const active = lens.id === activeLensId;
            return (
              <button
                key={lens.id}
                type="button"
                aria-pressed={active}
                className="perspective-lens-btn"
                onClick={() => setActiveLensId(lens.id)}
              >
                {active && (
                  <motion.span
                    layoutId={`perspective-lens-${member.id}`}
                    className="perspective-lens-pill"
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 36 }
                    }
                    aria-hidden="true"
                  />
                )}
                <span className="perspective-lens-label">{lens.label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentLens.id}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="perspective-readout"
          >
            <p className="perspective-lens-summary">
              <strong>{currentLens.label}:</strong> {currentLens.summary}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="chapter-specs-block">
        <h3 className="chapter-kicker">Skillsets</h3>
        <ul className="chapter-skills-list">
          {member.skillsets.map((skill, idx) => (
            <li key={skill} className="chapter-skill-item">
              <span className="chapter-skill-num">0{idx + 1}</span>
              <span className="chapter-skill-name">{skill}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="chapter-interests-block">
        <h3 className="chapter-kicker">Interests</h3>
        <p className="chapter-interests-line">{member.interests.join(" · ")}</p>
      </div>
    </div>
  );
}
