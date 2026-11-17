import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
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
  pinSide?: "left" | "right";
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

const ruleVariants: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.34, ease: EASE },
  },
};

function ScrollBeat({
  children,
  className = "chapter-beat",
  shouldReduceMotion,
}: {
  children: React.ReactNode;
  className?: string;
  shouldReduceMotion: boolean;
}) {
  const beatRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: beatRef,
    offset: ["start 96%", "start 66%"],
  });
  const beatY = useTransform(scrollYProgress, [0, 1], ["2.5%", "0%"]);
  const beatScale = useTransform(scrollYProgress, [0, 1], [0.98, 1]);

  return (
    <motion.div
      ref={beatRef}
      className={className}
      style={
        shouldReduceMotion ? undefined : { y: beatY, scale: beatScale }
      }
    >
      {children}
    </motion.div>
  );
}

export function MemberChapter({
  member,
  layoutVariant,
  pinSide,
}: MemberChapterProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const transitionState = useTransitionState();
  const sectionRef = useRef<HTMLElement>(null);
  const introSlotRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "end 25%"],
  });
  const pinProgress = useTransform(scrollYProgress, [0.06, 0.88], [0, 1]);

  const isCharcoalBand =
    layoutVariant === "offset" || layoutVariant === "compact-band";
  const resolvedPinSide =
    pinSide ?? (Number(member.index) % 2 === 0 ? "right" : "left");
  const introAlign =
    layoutVariant === "monumental" ? "center" : resolvedPinSide;

  const isMorphTarget =
    transitionState.mode === "member" &&
    transitionState.memberSlug === member.slug &&
    transitionState.source === "chapter";

  useEffect(() => {
    const section = sectionRef.current;
    const slot = introSlotRef.current;
    const identity = identityRef.current;
    const rail = railRef.current;
    const body = bodyRef.current;
    if (!section || !slot || !identity || !rail || !body) return;

    const nameEl = identity.querySelector<HTMLElement>(".chapter-name");
    const roleEl = identity.querySelector<HTMLElement>(".chapter-role");
    const linkEl = identity.querySelector<HTMLElement>(".chapter-profile-link");
    const actionsEl = identity.querySelector<HTMLElement>(".chapter-actions");
    const trackEl = identity.querySelector<HTMLElement>("[data-morph-in]");
    const railNameEl = rail.querySelector<HTMLElement>(".rail-name");
    const railRoleEl = rail.querySelector<HTMLElement>(".chapter-role");
    const railLinkEl = rail.querySelector<HTMLElement>(".chapter-profile-link");
    const fadeEls = [...identity.querySelectorAll<HTMLElement>("[data-morph-fade]")];
    const rowEls = [...identity.children] as HTMLElement[];
    if (
      !nameEl ||
      !roleEl ||
      !linkEl ||
      !actionsEl ||
      !trackEl ||
      !railNameEl ||
      !railRoleEl ||
      !railLinkEl
    )
      return;

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let introH = 0;
    let introPadEnd = 0;
    let introW = 0;
    let offX = 0;
    let offY = 0;
    let railW = 0;
    let gapMax = 0;
    let dockDepth = 315;
    let stickyTop = 0;
    let fsNameI = 0;
    let fsNameR = 0;
    let fsRoleI = 0;
    let fsRoleR = 0;
    let fsLinkI = 0;
    let fsLinkR = 0;
    let fadeBox: { h: number; w: number; mt: number }[] = [];

    const measure = () => {
      identity.style.position = "";
      identity.style.left = "";
      identity.style.top = "";
      identity.style.width = "";
      identity.style.visibility = "";
      identity.style.opacity = "";
      identity.style.gap = "";
      identity.dataset.flight = "0";
      rowEls.forEach((el) => {
        el.style.marginBlockEnd = "";
        el.style.marginBlockStart = "";
      });
      fadeEls.forEach((el) => {
        el.style.opacity = "";
        el.style.height = "";
        el.style.width = "";
        el.style.display = "";
        el.style.overflow = "";
      });
      trackEl.style.opacity = "";
      slot.style.height = "";
      slot.style.paddingBlockEnd = "";
      body.style.setProperty("--rail-w", "0px");
      body.style.setProperty("--rail-gap", "0px");
      rail.style.visibility = "hidden";
      rail.style.opacity = "";
      rail.style.transform = "";
      const cs = getComputedStyle(body);
      const pad =
        parseFloat(cs.paddingInlineStart) + parseFloat(cs.paddingInlineEnd);
      const avail = body.clientWidth - pad;
      gapMax = Math.min(76, Math.max(40, section.clientWidth * 0.05));
      railW = (avail - gapMax) / 4;
      const pinTravel = body.offsetHeight - rail.offsetHeight;
      dockDepth = Math.min(
        window.innerHeight * 0.35,
        Math.max(window.innerHeight * 0.12, pinTravel - 160),
      );
      stickyTop = parseFloat(getComputedStyle(rail).insetBlockStart) || 96;
      introH = slot.offsetHeight;
      introPadEnd = parseFloat(getComputedStyle(slot).paddingBlockEnd) || 0;
      introW = identity.offsetWidth;
      offX = identity.offsetLeft;
      offY = identity.offsetTop;
      fsNameI = parseFloat(getComputedStyle(nameEl).fontSize);
      fsNameR = parseFloat(getComputedStyle(railNameEl).fontSize);
      fsRoleI = parseFloat(getComputedStyle(roleEl).fontSize);
      fsRoleR = parseFloat(getComputedStyle(railRoleEl).fontSize);
      fsLinkI = parseFloat(getComputedStyle(linkEl).fontSize);
      fsLinkR = parseFloat(getComputedStyle(railLinkEl).fontSize);
      fadeBox = fadeEls.map((el) => ({
        h: el.offsetHeight,
        w: el.offsetWidth,
        mt: parseFloat(getComputedStyle(el).marginBlockStart) || 0,
      }));
    };

    const reset = () => {
      identity.dataset.flight = "0";
      identity.style.position = "";
      identity.style.left = "";
      identity.style.top = "";
      identity.style.width = "";
      identity.style.visibility = "";
      identity.style.opacity = "";
      identity.style.gap = "";
      identity.style.setProperty("--flight", "0");
      nameEl.style.fontSize = "";
      nameEl.style.marginBlockStart = "";
      roleEl.style.fontSize = "";
      linkEl.style.fontSize = "";
      actionsEl.style.marginBlockStart = "";
      trackEl.style.opacity = "";
      trackEl.style.marginBlockStart = "";
      rowEls.forEach((el) => {
        el.style.marginBlockEnd = "";
      });
      fadeEls.forEach((el) => {
        el.style.opacity = "";
        el.style.height = "";
        el.style.width = "";
        el.style.display = "";
        el.style.overflow = "";
        el.style.marginBlockStart = "";
      });
      slot.style.height = "";
      slot.style.paddingBlockEnd = "";
      body.style.setProperty("--rail-w", "0px");
      body.style.setProperty("--rail-gap", "0px");
      rail.style.visibility = "hidden";
      rail.style.opacity = "";
      rail.style.transform = "";
    };

    const frame = (foldRaw: number, dockRaw: number) => {
      const docked = getComputedStyle(rail).display !== "none";
      if (!docked) {
        reset();
        return;
      }
      const pf = clamp01(foldRaw);
      const pd = clamp01(dockRaw);
      const mf = pf * pf * (3 - 2 * pf);
      const md = pd * pd * (3 - 2 * pd);

      if (shouldReduceMotion) {
        if (mf > 0.5) {
          identity.style.visibility = "hidden";
          identity.style.opacity = "0";
          slot.style.height = "0px";
          slot.style.paddingBlockEnd = "0px";
        } else {
          identity.style.visibility = "";
          identity.style.opacity = "";
          slot.style.height = "";
          slot.style.paddingBlockEnd = "";
        }
        if (md > 0.5) {
          body.style.setProperty("--rail-w", `${railW}px`);
          body.style.setProperty("--rail-gap", `${gapMax}px`);
          rail.style.visibility = "visible";
          rail.style.opacity = "1";
          rail.style.transform = "none";
        } else {
          body.style.setProperty("--rail-w", "0px");
          body.style.setProperty("--rail-gap", "0px");
          rail.style.visibility = "hidden";
          rail.style.opacity = "0";
        }
        return;
      }

      if (mf <= 0.001 && md <= 0.001) {
        reset();
        return;
      }

      const slotRect = slot.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const finalRailLeft =
        resolvedPinSide === "right" ? railRect.right - railW : railRect.left;
      const x = lerp(slotRect.left + offX, finalRailLeft, mf);
      const y = lerp(slotRect.top + offY, Math.max(railRect.top, stickyTop), mf);
      const w = lerp(introW, railW, mf);

      identity.dataset.flight = "1";
      identity.style.position = "fixed";
      identity.style.left = `${x}px`;
      identity.style.top = `${y}px`;
      identity.style.width = `${w}px`;
      identity.style.visibility = mf >= 0.999 ? "hidden" : "visible";
      identity.style.opacity = String(clamp01(1 - mf * 1.25));
      identity.style.setProperty(
        "--flight",
        String(clamp01(Math.min(mf * 5, (1 - mf) * 5))),
      );
      identity.style.gap = "0px";
      const rowGap = lerp(18, 14, mf);
      rowEls.forEach((el, i) => {
        el.style.marginBlockEnd = i === rowEls.length - 1 ? "0px" : `${rowGap}px`;
      });
      nameEl.style.fontSize = `${lerp(fsNameI, fsNameR, mf)}px`;
      nameEl.style.marginBlockStart = `${4 * (1 - mf)}px`;
      roleEl.style.fontSize = `${lerp(fsRoleI, fsRoleR, mf)}px`;
      linkEl.style.fontSize = `${lerp(fsLinkI, fsLinkR, mf)}px`;
      actionsEl.style.marginBlockStart = `${12 * (1 - mf)}px`;
      trackEl.style.opacity = String(mf);
      trackEl.style.marginBlockStart = `${12 * mf}px`;
      const fade = clamp01(1 - mf * 1.8);
      fadeEls.forEach((el, i) => {
        const box = fadeBox[i];
        el.style.opacity = String(fade);
        el.style.overflow = "hidden";
        el.style.height = `${box.h * fade}px`;
        el.style.width = `${box.w * fade}px`;
        el.style.marginBlockStart = `${box.mt * fade}px`;
        el.style.display = fade <= 0 ? "none" : "";
      });
      slot.style.height = `${introH * (1 - mf)}px`;
      slot.style.paddingBlockEnd = `${introPadEnd * (1 - mf)}px`;
      body.style.setProperty("--rail-w", `${railW * md}px`);
      body.style.setProperty("--rail-gap", `${gapMax * md}px`);
      rail.style.visibility = md > 0.001 ? "visible" : "hidden";
      rail.style.opacity = String(md);
      rail.style.transform =
        md >= 0.999
          ? "none"
          : `translateX(${(1 - md) * (resolvedPinSide === "right" ? 12 : -12)}%)`;
    };

    const liveP = () => {
      const vh = window.innerHeight;
      const top = section.getBoundingClientRect().top;
      return {
        fold: clamp01((vh * 0.7 - top) / (vh * 0.4)),
        dock: clamp01(-top / dockDepth),
      };
    };

    let raf = 0;
    let lastP = -1;
    let mobileSettled = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (getComputedStyle(rail).display === "none") {
        if (!mobileSettled) {
          mobileSettled = true;
          frame(0, 0);
        }
        return;
      }
      mobileSettled = false;
      const { fold, dock } = liveP();
      const mf = fold * fold * (3 - 2 * fold);
      const md = dock * dock * (3 - 2 * dock);
      const active =
        (mf > 0.001 && mf < 0.999) || (md > 0.001 && md < 0.999);
      const key = fold + dock;
      if (active || Math.abs(key - lastP) > 0.0005) {
        lastP = key;
        frame(fold, dock);
      }
    };

    measure();
    {
      const { fold, dock } = liveP();
      frame(fold, dock);
    }
    raf = requestAnimationFrame(tick);
    let lastW = section.clientWidth;
    const ro = new ResizeObserver(() => {
      if (section.clientWidth !== lastW || liveP().fold <= 0.001) {
        lastW = section.clientWidth;
        measure();
      }
      const { fold, dock } = liveP();
      frame(fold, dock);
    });
    ro.observe(section);
    let fontsDone = false;
    document.fonts?.ready.then(() => {
      fontsDone = true;
      measure();
      const { fold, dock } = liveP();
      frame(fold, dock);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (!fontsDone) reset();
    };
  }, [shouldReduceMotion, member.slug, resolvedPinSide]);

  return (
    <section
      ref={sectionRef}
      id={`chapter-${member.index}`}
      className="member-chapter"
      data-variant={layoutVariant}
      data-pin={resolvedPinSide}
      data-surface={isCharcoalBand ? "charcoal" : undefined}
      data-pillar={member.pillar}
      aria-labelledby={`chapter-heading-${member.index}`}
    >
      <div className="chapter-intro" ref={introSlotRef} data-align={introAlign}>
        <motion.div
          ref={identityRef}
          className="chapter-identity"
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
          <motion.div
            className="chapter-accent-rule"
            data-pillar={member.pillar}
            variants={ruleVariants}
            aria-hidden="true"
          />

          <motion.div
            className="chapter-meta"
            data-morph-fade
            variants={riseVariants}
          >
            <span
              className="chapter-index"
              data-morph-fade
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

          {member.fullName && (
            <motion.p
              className="chapter-fullname"
              data-morph-fade
              variants={riseVariants}
            >
              {member.fullName}
            </motion.p>
          )}

          <motion.p className="chapter-role" variants={riseVariants}>
            {member.role}
          </motion.p>

          <motion.p className="chapter-bio" data-morph-fade variants={riseVariants}>
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

          <div className="chapter-pin-track" data-morph-in aria-hidden="true">
            <motion.span
              className="chapter-pin-progress"
              style={shouldReduceMotion ? undefined : { scaleX: pinProgress }}
            />
          </div>
        </motion.div>
      </div>

      <div className="chapter-body" ref={bodyRef}>
        <aside className="chapter-rail" ref={railRef} aria-hidden="true">
          <div
            className="chapter-accent-rule"
            data-pillar={member.pillar}
            aria-hidden="true"
          />
          <span className="pillar-label" data-pillar={member.pillar}>
            <span className="pillar-dot" aria-hidden="true" />
            <span>
              {member.pillar} · {member.pillarFull}
            </span>
          </span>
          <p className="rail-name">{member.name}</p>
          <p className="chapter-role">{member.role}</p>
          <TransitionLink
            to={`/member/${member.slug}`}
            direction="forward"
            memberSlug={member.slug}
            transitionSource="chapter"
            className="chapter-profile-link"
            tabIndex={-1}
          >
            <span>View full profile</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </TransitionLink>
          <div className="chapter-pin-track" aria-hidden="true">
            <motion.span
              className="chapter-pin-progress"
              style={shouldReduceMotion ? undefined : { scaleX: pinProgress }}
            />
          </div>
        </aside>

        <div className="chapter-stage">
          {(layoutVariant === "split" || layoutVariant === "split-wide") && (
            <PopOutSpecStage
              member={member}
              wide={layoutVariant === "split-wide"}
              shouldReduceMotion={shouldReduceMotion}
            />
          )}
          {(layoutVariant === "split-reverse" || layoutVariant === "inset") && (
            <DiptychStage
              member={member}
              scrollYProgress={scrollYProgress}
              shouldReduceMotion={shouldReduceMotion}
            />
          )}
          {isCharcoalBand && (
            <PeekCarouselStage
              member={member}
              shouldReduceMotion={shouldReduceMotion}
            />
          )}
          {layoutVariant === "monumental" && (
            <MonumentalStage
              member={member}
              shouldReduceMotion={shouldReduceMotion}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SkillList({ skills }: { skills: string[] }) {
  return (
    <ul className="chapter-skills-list">
      {skills.map((skill, idx) => (
        <li key={skill} className="chapter-skill-item">
          <span className="chapter-skill-num">0{idx + 1}</span>
          <span className="chapter-skill-name">{skill}</span>
        </li>
      ))}
    </ul>
  );
}

function PopOutSpecStage({
  member,
  wide,
  shouldReduceMotion,
}: {
  member: TeamMember;
  wide: boolean;
  shouldReduceMotion: boolean;
}) {
  const specs = (
    <>
      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <h3 className="chapter-kicker">Skillsets</h3>
        <SkillList skills={member.skillsets} />
      </ScrollBeat>

      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <h3 className="chapter-kicker">Interests</h3>
        <p className="chapter-interests-line">{member.interests.join(" · ")}</p>
      </ScrollBeat>
    </>
  );

  return (
    <div className="pop-spec-stage">
      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <div className="chapter-pop-frame">
          <ArtifactFrame
            member={member}
            src={member.artifacts?.heroImage}
            aspectRatio={wide ? "16/9" : "16/10"}
            plateLabel={`${member.pillar} · ${member.pillarFull}`}
          />
        </div>
      </ScrollBeat>

      {wide ? <div className="chapter-spec-grid">{specs}</div> : specs}
    </div>
  );
}

function DiptychStage({
  member,
  scrollYProgress,
  shouldReduceMotion,
}: {
  member: TeamMember;
  scrollYProgress: MotionValue<number>;
  shouldReduceMotion: boolean;
}) {
  const plateAY = useTransform(scrollYProgress, [0, 1], ["4%", "-4%"]);
  const plateBY = useTransform(scrollYProgress, [0, 1], ["-3%", "5%"]);

  return (
    <div className="diptych-stage">
      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <div className="diptych-collage">
          <motion.div
            className="diptych-plate diptych-plate-primary"
            style={shouldReduceMotion ? undefined : { y: plateAY }}
            initial={
              shouldReduceMotion
                ? false
                : { clipPath: "inset(10% 0% 0% 0%)", opacity: 0 }
            }
            whileInView={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
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
            whileInView={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
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
      </ScrollBeat>

      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <div className="diptych-meta-strip">
          <div>
            <h3 className="chapter-kicker">Skillsets</h3>
            <p className="chapter-inline-specs">
              {member.skillsets.join(" · ")}
            </p>
          </div>
          <div>
            <h3 className="chapter-kicker">Interests</h3>
            <p className="chapter-interests-line">
              {member.interests.join(" · ")}
            </p>
          </div>
        </div>
      </ScrollBeat>
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
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const scrollPaddingRef = useRef(0);
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
    const padding = scrollPaddingRef.current;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    let nearest = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, idx) => {
      const snapLeft = Math.max(
        0,
        Math.min(slide.offsetLeft - baseOffset - padding, maxScroll),
      );
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

    const readScrollPadding = () => {
      scrollPaddingRef.current =
        parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
    };
    readScrollPadding();

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
          const expectedLeft = Math.max(
            0,
            Math.min(
              targetSlide.offsetLeft -
                slides[0].offsetLeft -
                scrollPaddingRef.current,
              maxScroll,
            ),
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
      readScrollPadding();
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
    const targetLeft = Math.max(
      0,
      Math.min(
        slides[clampedIdx].offsetLeft -
          slides[0].offsetLeft -
          scrollPaddingRef.current,
        maxScroll,
      ),
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

    if (targetLeft <= 2 && document.activeElement === prevBtnRef.current) {
      nextBtnRef.current?.focus();
    }
    if (
      !(maxScroll > 2 && targetLeft < maxScroll - 2) &&
      document.activeElement === nextBtnRef.current
    ) {
      prevBtnRef.current?.focus();
    }

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
            ref={prevBtnRef}
            type="button"
            className="peek-nav-btn"
            aria-label="Previous slide"
            disabled={!canScrollPrev}
            onClick={() => handleStep(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            ref={nextBtnRef}
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

interface LensOption {
  id: string;
  label: string;
}

function LensStrip({
  lenses,
  activeLensId,
  onSelect,
  shouldReduceMotion,
  pillPrefix,
  groupLabel,
}: {
  lenses: LensOption[];
  activeLensId: string;
  onSelect: (id: string) => void;
  shouldReduceMotion: boolean;
  pillPrefix: string;
  groupLabel: string;
}) {
  return (
    <div
      className="perspective-lens-strip"
      role="group"
      aria-label={groupLabel}
    >
      {lenses.map((lens) => {
        const active = lens.id === activeLensId;
        return (
          <button
            key={lens.id}
            type="button"
            aria-pressed={active}
            className="perspective-lens-btn"
            onClick={() => onSelect(lens.id)}
          >
            {active && (
              <motion.span
                layoutId={pillPrefix}
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
  );
}

function MonumentalStage({
  member,
  shouldReduceMotion,
}: {
  member: TeamMember;
  shouldReduceMotion: boolean;
}) {
  const lenses = useMemo(() => {
    if (member.artifacts?.lenses && member.artifacts.lenses.length > 0) {
      return member.artifacts.lenses;
    }
    return [
      { id: "craft", label: "Craft", summary: member.bio },
      {
        id: "toolchain",
        label: "Toolchain",
        summary: member.skillsets.join(" · "),
      },
      {
        id: "role",
        label: "Capstone Role",
        summary: `${member.pillarFull} · ${member.role}`,
      },
    ];
  }, [member]);

  const [activeLensId, setActiveLensId] = useState(lenses[0]?.id ?? "craft");
  const currentLens = lenses.find((l) => l.id === activeLensId) ?? lenses[0];

  return (
    <div className="perspective-stage monumental-stage">
      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
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
          <LensStrip
            lenses={lenses}
            activeLensId={activeLensId}
            onSelect={setActiveLensId}
            shouldReduceMotion={shouldReduceMotion}
            pillPrefix={`monumental-lens-${member.id}`}
            groupLabel="Perspective lens"
          />

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
      </ScrollBeat>

      <ScrollBeat shouldReduceMotion={shouldReduceMotion}>
        <div className="chapter-specs-block">
          <h3 className="chapter-kicker">Skillsets</h3>
          <SkillList skills={member.skillsets} />
        </div>

        <div className="chapter-interests-block">
          <h3 className="chapter-kicker">Interests</h3>
          <p className="chapter-interests-line">
            {member.interests.join(" · ")}
          </p>
        </div>
      </ScrollBeat>
    </div>
  );
}