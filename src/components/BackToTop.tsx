import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "cn";
import { prefersReducedMotion } from "@/lib/viewTransitions";

export function BackToTop() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supportsScrollState =
      typeof window !== "undefined" &&
      window.CSS?.supports?.("container-type", "scroll-state");
    if (supportsScrollState) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        document.documentElement.classList.toggle("is-scrolled", !entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("is-scrolled");
    };
  }, []);

  const handleClick = () => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    const heading = document.getElementById("main-content");
    if (heading instanceof HTMLElement) {
      heading.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-[18rem] w-px"
      />
      <div className="back-to-top-dock no-print">
        <button
          type="button"
          onClick={handleClick}
          aria-label="Back to top"
          className={cn(
            "back-to-top ui-press ui-press-primary inline-flex min-h-11 items-center gap-2 rounded-full",
            "border border-control bg-surface/95 px-4 py-2 type-ui-sm font-semibold text-ink shadow-float backdrop-blur-md",
            "cursor-pointer",
          )}
        >
          <ArrowUp className="size-4 shrink-0" aria-hidden="true" />
          <span className="max-sm:sr-only">Top</span>
        </button>
      </div>
    </>
  );
}
