import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "cn";
import { TransitionLink } from "@/components/TransitionLink";
import { dismissToast, getToasts, subscribeToasts, type ToastItem, type ToastTone } from "@/lib/toastBus";

const toneClasses: Record<ToastTone, string> = {
  success: "border-success/40 bg-surface text-ink",
  info: "border-edge bg-surface text-ink",
  warning: "border-warning/45 bg-surface text-ink",
  danger: "border-danger/45 bg-surface text-ink",
};

const toneAccent: Record<ToastTone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
};

const toneIcon: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  danger: TriangleAlert,
};

function isAnyModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("dialog:modal[open]"));
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const Icon = toneIcon[toast.tone];

  useEffect(() => {
    if (paused) return;
    const durationMs = toast.tone === "danger" ? 10_000 : 5200;
    const timer = window.setTimeout(() => {
      dismissToast(toast.id);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.tone]);

  return (
    <div
      className={cn(
        "toast-item flex items-start gap-2.5 rounded-card border px-3.5 py-3 type-ui",
        toneClasses[toast.tone],
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", toneAccent[toast.tone])} aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="text-ink">{toast.text}</span>
        {toast.link ? (
          <TransitionLink
            to={toast.link.to}
            direction="forward"
            onClick={() => dismissToast(toast.id)}
            className="w-fit type-ui-sm font-semibold text-accent underline underline-offset-4 hover:text-ink"
          >
            {toast.link.label}
          </TransitionLink>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink pointer-coarse:size-11"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastRegion() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const announcedRef = useRef<Set<string>>(new Set());
  const liveRegionRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const syncModal = () => setModalOpen(isAnyModalOpen());
    syncModal();
    const mo = new MutationObserver(syncModal);
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["open"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const activeIds = new Set(toasts.map((t) => t.id));
    for (const id of announcedRef.current) {
      if (!activeIds.has(id)) {
        announcedRef.current.delete(id);
      }
    }

    const docWithNotify = document as unknown as { ariaNotify?: (msg: string) => void };
    const hasAriaNotify = typeof docWithNotify.ariaNotify === "function";
    for (const toast of toasts) {
      if (announcedRef.current.has(toast.id)) continue;
      announcedRef.current.add(toast.id);
      const message = toast.link ? `${toast.text}. Actions available` : toast.text;
      if (hasAriaNotify) {
        docWithNotify.ariaNotify!(message);
      } else if (liveRegionRef.current) {
        liveRegionRef.current.textContent = message;
      }
    }
    if (toasts.length === 0 && liveRegionRef.current) {
      liveRegionRef.current.textContent = "";
    }
  }, [toasts]);

  const shouldShow = toasts.length > 0 && !modalOpen;

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    if (shouldShow) {
      try {
        if (!el.matches(":is(:popover-open, .\\:popover-open)")) {
          el.showPopover?.();
        }
      } catch {
        // Ignore if popover not yet ready
      }
    } else {
      try {
        if (el.matches(":is(:popover-open, .\\:popover-open)")) {
          el.hidePopover?.();
        }
      } catch {
        // Ignore if already closed
      }
    }
  }, [shouldShow]);

  return (
    <>
      <p ref={liveRegionRef} className="sr-only" role="status" aria-live="polite" />
      <div
        ref={stackRef}
        role="region"
        aria-label="Notifications"
        className="toast-stack no-print"
        {...({ popover: "manual" } as Record<string, unknown>)}
      >
        {shouldShow ? toasts.map((t) => <ToastCard key={t.id} toast={t} />) : null}
      </div>
    </>
  );
}
