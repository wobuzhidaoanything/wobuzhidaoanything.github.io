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

const SECTION_IDS = ["top", "team", "work", "partner"] as const;

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

  // Scroll-direction auto-hide fallback for browsers without CSS scroll-state queries.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    if (typeof window === "undefined" || window.CSS?.supports?.("container-type", "scroll-state")) {
      return;
    }
    let lastY = window.scrollY;
    const onScroll = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maxScroll));
      if (y === lastY) return;
      header.classList.toggle("is-hidden", y > lastY && y > header.offsetHeight + 24);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      header.classList.remove("is-hidden");
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Scrollspy sync (native scroll-target-group on supporting browsers, IntersectionObserver elsewhere).
  useEffect(() => {
    if (pathname !== "/") return;

    if (typeof window !== "undefined" && window.CSS?.supports?.("scroll-target-group", "auto")) {
      const syncFromNative = () => {
        try {
          const activeLink = document.querySelector<HTMLAnchorElement>(".site-nav-links a:target-current");
          const href = activeLink?.getAttribute("href");
          const matched = href ? href.replace(/^\/?#/, "") : null;
          setActiveSection(matched);
        } catch {
          // Fallback silently if selector unsupported
        }
      };
      syncFromNative();
      document.addEventListener("scrollend", syncFromNative);
      return () => document.removeEventListener("scrollend", syncFromNative);
    }

    const targets = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id === "top" ? null : entry.target.id);
          }
        }
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !menu) return;

    let rafId = 0;

    const measureLayout = (forceMeasure = false) => {
      const currentWidth = header.clientWidth;
      const wasWide = header.hasAttribute("data-wide");

      if (!forceMeasure && !wasWide && currentWidth <= lastMeasuredCollapsedWidth.current) {
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
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (pathname === "/") {
      navigate(`/#${sectionId}`, { replace: true });
      requestAnimationFrame(() => {
        const target = document.getElementById(sectionId);
        target?.scrollIntoView({ behavior });
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
        className="header-inner shell flex min-h-[var(--header-h)] items-center justify-between gap-[clamp(0.5rem,2dvw,1.25rem)] py-2.5"
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
          <span className="font-sans type-brand-sub font-semibold uppercase text-ink-secondary [text-box:trim-both_cap_alphabetic]">
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
