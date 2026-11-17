import { GROUP_META } from "@/data/capstone";
import { TransitionLink } from "./TransitionLink";

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-edge bg-page">
      <div className="shell flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-9">
        <p className="m-0 font-serif type-label-lg font-semibold">
          {GROUP_META.institution} · {GROUP_META.code} (
          {GROUP_META.pillarsLabel})
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="m-0 type-ui-sm text-ink-secondary">
            {GROUP_META.note}
          </span>
          <TransitionLink
            to="/licenses"
            direction="forward"
            className="site-license-link inline-flex min-h-9 items-center type-ui-sm font-semibold text-ink underline decoration-edge underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
          >
            Fonts &amp; Licenses
          </TransitionLink>
        </div>
      </div>
    </footer>
  );
}
