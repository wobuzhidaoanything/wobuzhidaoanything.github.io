import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { Menu, X } from "lucide-react";
import { GROUP_META, type Pillar } from "@/data/capstone";
import {
  focusRouteHeading,
  prefersReducedMotion,
  runViewTransition,
} from "@/lib/viewTransitions";
import { ThemeToggle } from "./ThemeToggle";
import { TransitionLink } from "./TransitionLink";

export interface ActiveChapterDetail {
  index: string;
  name: string;
  pillar: Pillar;
  visible: boolean;
}

function isPopoverCurrentlyOpen(el: HTMLElement): boolean {
  try {
    return el.matches(":is(:popover-open, .\\:popover-open)");
  } catch {
    return el.classList.contains(":popover-open");
  }
}

export function SiteHeader() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chapterContext, setChapterContext] =
    useState<ActiveChapterDetail | null>(null);
  const lastMeasuredCollapsedWidth = useRef(0);

  useEffect(() => {
    const onChapterChange = (event: Event) => {
      const custom = event as CustomEvent<ActiveChapterDetail>;
      setChapterContext(custom.detail);
    };
    window.addEventListener("capstone:active-chapter", onChapterChange);
    return () => {
      window.removeEventListener("capstone:active-chapter", onChapterChange);
    };
  }, []);

  const closeCollapsedMenu = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (menu.hasAttribute("popover") && isPopoverCurrentlyOpen(menu)) {
      if (typeof menu.hidePopover === "function") {
        try {
          menu.hidePopover();
        } catch {
          // Ignore if already hidden
        }
      }
    }
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !menu) return;

    let rafId = 0;

    const measureLayout = (forceMeasure = false) => {
      const currentWidth = header.clientWidth;
      const wasWide = header.classList.contains("is-wide");

      if (
        !forceMeasure &&
        !wasWide &&
        currentWidth <= lastMeasuredCollapsedWidth.current
      ) {
        return;
      }

      const wasPopoverOpen =
        menu.hasAttribute("popover") && isPopoverCurrentlyOpen(menu);

      header.classList.add("is-measuring");
      header.classList.add("is-wide");
      menu.removeAttribute("popover");

      const fitsInline = inner.scrollWidth <= inner.clientWidth;

      if (fitsInline) {
        header.classList.add("is-wide");
        menu.removeAttribute("popover");
        setMenuOpen(false);
      } else {
        header.classList.remove("is-wide");
        menu.setAttribute("popover", "auto");
        lastMeasuredCollapsedWidth.current = currentWidth;

        if (wasPopoverOpen && typeof menu.showPopover === "function") {
          try {
            menu.showPopover();
          } catch {
            // Ignore if popover cannot be reopened during resize
          }
        }
      }

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        header.classList.remove("is-measuring");
      });
    };

    measureLayout(true);

    const observer = new ResizeObserver(() => {
      measureLayout(false);
    });

    observer.observe(header);
    observer.observe(menu);

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      setMenuOpen(toggleEvent.newState === "open");
    };

    menu.addEventListener("toggle", handleToggle);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      menu.removeEventListener("toggle", handleToggle);
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (pathname === "/") {
      navigate(`/#${sectionId}`, { replace: true });
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior });
      });
      return;
    }

    runViewTransition({
      types: ["backward"],
      update: () => {
        navigate(`/#${sectionId}`);
      },
      onFinished: () => {
        requestAnimationFrame(() => {
          const target = document.getElementById(sectionId);
          if (target) {
            target.scrollIntoView({ behavior });
          } else {
            focusRouteHeading();
          }
        });
      },
    });
  };

  const handleTeamClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (pathname !== "/") return;
    e.preventDefault();
    closeCollapsedMenu();
    navigate("/", { replace: true });
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const handleAnchorLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    closeCollapsedMenu();
    scrollToSection(id);
  };

  const isTeamActive =
    (pathname === "/" &&
      hash !== "#at-a-glance" &&
      hash !== "#interests" &&
      hash !== "#partner") ||
    pathname.startsWith("/member/");
  const isOverviewActive =
    pathname === "/" && (hash === "#at-a-glance" || hash === "#interests");
  const isPartnerActive = pathname === "/" && hash === "#partner";

  const showChapterContext = pathname === "/" && chapterContext?.visible;

  return (
    <header ref={headerRef} className="site-header">
      <motion.div
        className="scroll-progress-bar"
        style={shouldReduceMotion ? undefined : { scaleX: scrollYProgress }}
        aria-hidden="true"
      />
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <div ref={innerRef} className="header-inner">
        <TransitionLink
          to="/"
          direction="backward"
          className="site-brand"
          onClick={handleTeamClick}
          onBeforeNavigate={closeCollapsedMenu}
        >
          <span className="brand-institution">{GROUP_META.institution}</span>
          <span className="brand-subline">{GROUP_META.code}</span>
        </TransitionLink>

        <nav className="site-nav" aria-label="Primary">
          <button
            type="button"
            className="menu-button"
            popoverTarget="site-menu"
            popoverTargetAction="toggle"
            aria-controls="site-menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Menu className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>Menu</span>
          </button>

          <ul id="site-menu" ref={menuRef} className="site-menu" popover="auto">
            <li>
              <TransitionLink
                to="/"
                direction="backward"
                aria-current={isTeamActive ? "page" : undefined}
                className="nav-link"
                onClick={handleTeamClick}
                onBeforeNavigate={closeCollapsedMenu}
              >
                <span>About Us</span>
                <span className="nav-count">07</span>
              </TransitionLink>
            </li>
            <li>
              <a
                href="/#at-a-glance"
                aria-current={isOverviewActive ? "page" : undefined}
                className="nav-link"
                onClick={(e) => handleAnchorLink(e, "at-a-glance")}
              >
                <span>Summary</span>
              </a>
            </li>
            <li>
              <a
                href="/#partner"
                aria-current={isPartnerActive ? "page" : undefined}
                className="nav-link"
                onClick={(e) => handleAnchorLink(e, "partner")}
              >
                <span>Work With Us</span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="header-utility">
          <AnimatePresence>
            {showChapterContext && chapterContext && (
              <motion.div
                key={chapterContext.index}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
                className="header-chapter-context"
                data-pillar={chapterContext.pillar}
                aria-live="polite"
              >
                <span className="header-chapter-dot" aria-hidden="true" />
                <span className="header-chapter-text">
                  {chapterContext.index} / 07 · {chapterContext.name} ·{" "}
                  {chapterContext.pillar}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
