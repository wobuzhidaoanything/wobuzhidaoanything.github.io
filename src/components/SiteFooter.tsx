import { GROUP_META } from "@/data/capstone";
import { TransitionLink } from "./TransitionLink";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p className="footer-title">
          {GROUP_META.institution} · {GROUP_META.code} (
          {GROUP_META.pillarsLabel})
        </p>
        <div className="footer-meta-links">
          <span className="footer-note">{GROUP_META.note}</span>
          <TransitionLink
            to="/licenses"
            direction="forward"
            className="footer-license-link"
          >
            Fonts &amp; Licenses
          </TransitionLink>
        </div>
      </div>
    </footer>
  );
}
