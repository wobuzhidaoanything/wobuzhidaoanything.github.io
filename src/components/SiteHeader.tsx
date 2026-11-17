import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion, useReducedMotion, useScroll } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { GROUP_META } from "@/data/capstone";
import { getSplashState, subscribeSplashState } from "@/lib/splashBus";
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
  "inline-flex w-full items-center min-h-10 px-3.5 py-2 rounded-control",
  "type-ui font-semibold text-ink-secondary transition-colors duration-150",
  "hover:text-ink hover:bg-surface-muted",
  "aria-[current=page]:text-ink aria-[current=page]:font-bold",
  "aria-[current=page]:bg-surface-muted aria-[current=page]:underline",
  "aria-[current=page]:decoration-accent aria-[current=page]:decoration-[2.5px]",
  "aria-[current=page]:underline-offset-[0.38rem]",
  "nav-link",
  "pointer-coarse:min-h-11",
  "group-data-[wide]/header:w-auto",
  "group-data-[wide]/header:aria-[current=page]:bg-transparent",
);

export function SiteHeader() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pastSplash, setPastSplash] = useState<boolean>(getSplashState);
  const lastMeasuredCollapsedWidth = useRef(0);

  useEffect(() => subscribeSplashState(setPastSplash), []);

  // Off the roster route there is no splash section, so the header is
  // always compact: derived during render instead of synced in an effect.
  const headerSplash = pathname === "/" ? pastSplash : true;

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
      const wasWide = header.hasAttribute("data-wide");

      if (
        !forceMeasure &&
        !wasWide &&
        currentWidth <= lastMeasuredCollapsedWidth.current
      ) {
        return;
      }

      const wasPopoverOpen =
        menu.hasAttribute("popover") && isPopoverCurrentlyOpen(menu);

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

  return (
    <header
      ref={headerRef}
      className={cn(
        "site-header group/header @container/site-header sticky top-0 z-40",
        "border-b border-edge",
        "bg-header backdrop-blur-[14px]",
        "transition-[background-color,border-color] duration-300",
        "data-[splash=minimal]:bg-transparent",
        "data-[splash=minimal]:backdrop-blur-none",
        "data-[splash=minimal]:border-transparent",
      )}
      data-splash={headerSplash ? "past" : "minimal"}
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
        className="header-inner shell flex min-h-[var(--header-h)] items-center justify-between gap-[clamp(0.5rem,2dvw,1.25rem)] py-3"
      >
        <TransitionLink
          to="/"
          direction="backward"
          className={cn(
            "site-brand inline-flex min-w-0 min-h-11 flex-col items-start justify-center py-1",
            "gap-[0.15rem] supports-[text-box:trim-start_cap_text]:gap-0.5",
            "text-ink no-underline transition-[opacity,translate] duration-300",
            "group-data-[splash=minimal]/header:pointer-events-none",
            "group-data-[splash=minimal]/header:opacity-0",
            "group-data-[splash=minimal]/header:translate-y-[0.45rem]",
          )}
          onClick={handleTeamClick}
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
              "menu-toggle inline-flex items-center gap-2 min-h-10 px-3.5 py-2",
              "rounded-control border border-control bg-surface text-ink",
              "type-ui font-semibold cursor-pointer",
              "transition-[background-color,border-color,scale] duration-150",
              "hover:bg-surface-muted hover:border-ink active:scale-[0.98]",
              "pointer-coarse:min-h-11",
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
            className="site-menu-panel"
            popover="auto"
          >
            <li>
              <TransitionLink
                to="/"
                direction="backward"
                aria-current={isTeamActive ? "page" : undefined}
                className={navLinkStyles}
                onClick={handleTeamClick}
                onBeforeNavigate={closeCollapsedMenu}
              >
                <span>About Us</span>
              </TransitionLink>
            </li>
            <li>
              <a
                href="/#at-a-glance"
                aria-current={isOverviewActive ? "page" : undefined}
                className={navLinkStyles}
                onClick={(e) => handleAnchorLink(e, "at-a-glance")}
              >
                <span>Summary</span>
              </a>
            </li>
            <li>
              <a
                href="/#partner"
                aria-current={isPartnerActive ? "page" : undefined}
                className={navLinkStyles}
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
