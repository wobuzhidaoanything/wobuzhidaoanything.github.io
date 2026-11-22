import { GROUP_META } from "@/data/capstone";
import { TransitionLink } from "./TransitionLink";

export function SiteFooter() {
  return (
    <footer className="site-footer no-print border-t border-edge bg-page">
      <div className="shell flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-8">
        <p className="m-0 font-serif type-label-lg font-semibold">
          {GROUP_META.institution} · {GROUP_META.code} ({GROUP_META.pillarsLabel})
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="m-0 type-ui-sm text-ink-secondary">{GROUP_META.note}</span>
          <TransitionLink
            to="/update_details"
            direction="forward"
            className="site-license-link ui-link-underline inline-flex min-h-9 items-center type-ui-sm font-semibold text-ink hover:text-accent"
          >
            Team settings
          </TransitionLink>
          <TransitionLink
            to="/licenses"
            direction="forward"
            className="site-license-link ui-link-underline inline-flex min-h-9 items-center type-ui-sm font-semibold text-ink hover:text-accent"
          >
            Fonts &amp; Licenses
          </TransitionLink>
        </div>
      </div>
    </footer>
  );
}
