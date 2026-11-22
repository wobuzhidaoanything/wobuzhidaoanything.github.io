import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion, useReducedMotion, useScroll } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { GROUP_META } from "@/data/capstone";
import {
  focusRouteHeading,
  prefersReducedMotion,
  runViewTransition,
} from "@/lib/viewTransitions";
import { getHeaderHeight, scrollToSectionAligned } from "@/lib/scroll";
import { ThemeToggle } from "./ThemeToggle";
import { TransitionLink } from "./TransitionLink";

function isPopoverCurrentlyOpen(el: HTMLElement): boolean {
  try {
    return el.matches(":is(:popover-open, .\\:popover-open)");
  } catch {
    return el.classList.contains(":popover-open");
  }
}

const navLinkStyles = cn(
  "nav-link inline-flex w-full items-center min-h-10 px-3.5 py-2 rounded-control",
  "type-ui font-semibold text-ink-secondary no-underline",
  "pointer-coarse:min-h-11",
  "group-data-[wide]/header:w-auto",
);

const SPY_SECTION_IDS = ["partner", "work", "team"] as const;

export function SiteHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const lastMeasuredCollapsedWidth = useRef(0);

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

  // Deterministic scrollspy aligned to the live header bottom edge.
  useEffect(() => {
    if (pathname !== "/") return;

    let rafId = 0;

    const updateActiveSection = () => {
      rafId = 0;
      const headerH = getHeaderHeight();
      const triggerY = headerH + 32;
      let matched: string | null = null;
      for (const id of SPY_SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= triggerY) {
          matched = id;
          break;
        }
      }
      setActiveSection(matched);
    };

    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [pathname]);

  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !menu) return;

    let rafId = 0;
    let lastSyncedH = 0;

    const syncHeaderHeight = () => {
      const h = Math.ceil(header.getBoundingClientRect().height);
      if (h > 0 && h !== lastSyncedH) {
        lastSyncedH = h;
        document.documentElement.style.setProperty("--header-h", `${h}px`);
      }
    };

    const measureLayout = (forceMeasure = false) => {
      const currentWidth = header.clientWidth;
      const wasWide = header.hasAttribute("data-wide");

      if (!forceMeasure && !wasWide && currentWidth <= lastMeasuredCollapsedWidth.current) {
        syncHeaderHeight();
        return;
      }

      const wasPopoverOpen = menu.hasAttribute("popover") && isPopoverCurrentlyOpen(menu);

      header.setAttribute("data-measuring", "");
      header.setAttribute("data-wide", "");
      menu.removeAttribute("popover");

      const fitsInline = inner.scrollWidth <= inner.clientWidth;

      if (fitsInline) {
        header.setAttribute("data-wide", "");
        menu.removeAttribute("popover");
        setMenuOpen(false);
      } else {
        header.removeAttribute("data-wide");
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
        header.removeAttribute("data-measuring");
        syncHeaderHeight();
      });
    };

    measureLayout(true);

    let resizeRaf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        measureLayout(false);
      });
    });

    observer.observe(header);
    observer.observe(menu);

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      setMenuOpen(toggleEvent.newState === "open");
    };

    menu.addEventListener("toggle", handleToggle);

    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measureLayout(true);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(resizeRaf);
      observer.disconnect();
      menu.removeEventListener("toggle", handleToggle);
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    if (pathname === "/") {
      navigate(`/#${sectionId}`, { replace: true });
      requestAnimationFrame(() => {
        scrollToSectionAligned(sectionId);
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
          if (document.getElementById(sectionId)) {
            scrollToSectionAligned(sectionId);
          } else {
            focusRouteHeading();
          }
        });
      },
    });
  };

  const handleBrandClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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

  const handleAnchorLink = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    closeCollapsedMenu();
    scrollToSection(id);
  };

  const effectiveActiveSection = pathname === "/" ? activeSection : null;
  const isTeamActive =
    (pathname === "/" && effectiveActiveSection === "team") || pathname.startsWith("/member/");
  const isWorkActive = pathname === "/" && effectiveActiveSection === "work";
  const isPartnerActive = pathname === "/" && effectiveActiveSection === "partner";

  return (
    <header
      ref={headerRef}
      className={cn(
        "site-header no-print group/header @container/site-header sticky top-0 z-40",
        "border-b border-edge bg-header backdrop-blur-[14px]",
      )}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] origin-left bg-accent"
        style={shouldReduceMotion ? undefined : { scaleX: scrollYProgress }}
        aria-hidden="true"
      />
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100",
          "focus:rounded-control focus:bg-ink focus:px-4 focus:py-2.5",
          "focus:type-ui focus:font-medium focus:text-page focus:no-underline",
        )}
      >
        Skip to main content
      </a>

      <div
        ref={innerRef}
        className="header-inner shell flex min-h-[4.25rem] items-center justify-between gap-[clamp(0.5rem,2dvw,1.25rem)] py-2.5"
      >
        <TransitionLink
          to="/"
          direction="backward"
          className={cn(
            "site-brand inline-flex min-w-0 min-h-11 flex-col items-start justify-center py-0.5",
            "gap-[0.12rem] supports-[text-box:trim-start_cap_text]:gap-0.5",
            "text-ink no-underline transition-opacity duration-150 hover:opacity-80",
          )}
          onClick={handleBrandClick}
          onBeforeNavigate={closeCollapsedMenu}
        >
          <span className="font-serif type-brand font-semibold [text-box:trim-start_cap_text]">
            {GROUP_META.code}
          </span>
          <span className="font-sans type-brand-sub font-semibold text-ink-muted">
            {GROUP_META.institution}
          </span>
        </TransitionLink>

        <nav className="ms-auto" aria-label="Primary">
          <button
            type="button"
            className={cn(
              "menu-toggle ui-press inline-flex items-center gap-2 min-h-11 px-3.5 py-2",
              "rounded-control border border-control bg-surface text-ink",
              "type-ui font-semibold cursor-pointer",
              "hover:bg-surface-muted/75",
              "[anchor-name:--menu-button]",
              "group-data-[wide]/header:hidden",
            )}
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

          <ul
            id="site-menu"
            ref={menuRef}
            className="site-menu-panel site-nav-links"
            popover="auto"
          >
            <li>
              <a
                href={pathname === "/" ? "#team" : "/#team"}
                aria-current={isTeamActive ? "true" : undefined}
                className={cn(navLinkStyles, isTeamActive && "target-current")}
                onClick={(e) => handleAnchorLink(e, "team")}
              >
                <span>Team</span>
              </a>
            </li>
            <li>
              <a
                href={pathname === "/" ? "#work" : "/#work"}
                aria-current={isWorkActive ? "true" : undefined}
                className={cn(navLinkStyles, isWorkActive && "target-current")}
                onClick={(e) => handleAnchorLink(e, "work")}
              >
                <span>Experience &amp; Expertise</span>
              </a>
            </li>
            <li>
              <a
                href={pathname === "/" ? "#partner" : "/#partner"}
                aria-current={isPartnerActive ? "true" : undefined}
                className={cn(navLinkStyles, isPartnerActive && "target-current")}
                onClick={(e) => handleAnchorLink(e, "partner")}
              >
                <span>Work With Us</span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
