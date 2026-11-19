import { prefersReducedMotion } from "./viewTransitions";

let cancelPendingCorrection: (() => void) | null = null;

export function getHeaderHeight(): number {
  if (typeof document === "undefined") return 0;
  const header = document.querySelector<HTMLElement>(".site-header");
  if (!header) return 0;
  return Math.ceil(header.getBoundingClientRect().height);
}

/**
 * Scrolls the target element flush to the bottom edge of `.site-header`
 * across all viewport sizes and corrects once after smooth-scroll settle
 * in case image decode or dynamic layout shifted vertical offsets mid-flight.
 */
export function scrollToSectionAligned(id: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  cancelPendingCorrection?.();
  cancelPendingCorrection = null;

  const headerH = getHeaderHeight();
  if (headerH > 0) {
    document.documentElement.style.setProperty("--header-h", `${headerH}px`);
  }

  const targetY = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - headerH));
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  window.scrollTo({ top: targetY, left: 0, behavior });

  if (behavior === "auto") return;

  let finished = false;
  let settleTimer = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      const liveHeaderH = getHeaderHeight();
      const delta = Math.round(target.getBoundingClientRect().top - liveHeaderH);
      if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, left: 0, behavior: "auto" });
      }
    });
  };

  const cleanup = () => {
    window.clearTimeout(settleTimer);
    window.removeEventListener("scrollend", finish);
    if (cancelPendingCorrection === cleanup) {
      cancelPendingCorrection = null;
    }
  };

  cancelPendingCorrection = cleanup;
  if ("onscrollend" in globalThis) {
    window.addEventListener("scrollend", finish, { once: true });
    settleTimer = window.setTimeout(finish, 2400);
  } else {
    settleTimer = window.setTimeout(finish, 900);
  }
}
