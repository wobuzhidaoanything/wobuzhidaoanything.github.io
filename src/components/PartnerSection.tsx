import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Mail } from "lucide-react";
import { PARTNER_OUTREACH } from "@/data/capstone";

function legacyCopy(text: string): boolean {
  const field = Object.assign(document.createElement("textarea"), {
    value: text,
  });
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

let lastAnnouncement = "";

export function PartnerSection() {
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [copyTip, setCopyTip] = useState("");

  useEffect(() => {
    const showFeedback = (ok: boolean) => {
      window.clearTimeout(timerRef.current);
      setCopyStatus("idle");
      setCopyTip("");

      let message = ok ? "Copied" : "Copy failed";
      if (message === lastAnnouncement) {
        message += "\u00A0";
      }
      lastAnnouncement = message;

      requestAnimationFrame(() => {
        setCopyStatus(ok ? "copied" : "failed");
        setCopyTip(message);
      });

      timerRef.current = window.setTimeout(() => {
        setCopyStatus("idle");
        setCopyTip("");
      }, 2000);
    };

    const executeCopy = async (target: HTMLElement) => {
      const text = target.innerText.trim();
      if (!text) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          showFeedback(true);
          return;
        }
        throw new Error("Clipboard API unavailable");
      } catch {
        if (legacyCopy(text)) {
          showFeedback(true);
        } else {
          showFeedback(false);
        }
      }
    };

    if ("CommandEvent" in window) {
      const onCommand = (event: Event) => {
        const commandEvent = event as Event & {
          command?: string;
          source?: Element | null;
          target?: EventTarget | null;
        };
        if (
          commandEvent.command === "--copy" &&
          commandEvent.source === copyButtonRef.current &&
          commandEvent.target instanceof HTMLElement
        ) {
          void executeCopy(commandEvent.target);
        }
      };

      document.addEventListener("command", onCommand, true);
      return () => {
        window.clearTimeout(timerRef.current);
        document.removeEventListener("command", onCommand, true);
      };
    }

    const onClickFallback = (event: MouseEvent) => {
      const targetEl = event.target;
      if (!(targetEl instanceof Element)) return;
      const button = targetEl.closest('button[command="--copy"]');
      if (!button || button !== copyButtonRef.current) return;
      const commandFor = button.getAttribute("commandfor");
      const sourceEl = commandFor ? document.getElementById(commandFor) : null;
      if (sourceEl) {
        void executeCopy(sourceEl);
      }
    };

    document.addEventListener("click", onClickFallback);
    return () => {
      window.clearTimeout(timerRef.current);
      document.removeEventListener("click", onClickFallback);
    };
  }, []);

  const mailtoHref = `mailto:${PARTNER_OUTREACH.contactEmail}?subject=${encodeURIComponent(PARTNER_OUTREACH.emailSubject)}`;

  return (
    <section
      id="partner"
      className="partner-section"
      aria-labelledby="partner-heading"
    >
      <div className="partner-shell">
        <header className="partner-header">
          <p className="partner-kicker">{PARTNER_OUTREACH.kicker}</p>
          <h2 id="partner-heading" className="partner-title">
            {PARTNER_OUTREACH.heading}
          </h2>
          <p className="partner-lead">{PARTNER_OUTREACH.lead}</p>
        </header>

        <div className="partner-grid">
          <div className="partner-card">
            <h3 className="partner-card-title">
              {PARTNER_OUTREACH.benefitsHeading}
            </h3>
            <ol className="partner-benefits-list">
              {PARTNER_OUTREACH.benefits.map((item) => (
                <li key={item.index} className="partner-benefit-item">
                  <span className="partner-benefit-num">{item.index}</span>
                  <div className="partner-benefit-copy">
                    <p className="partner-benefit-title">{item.title}</p>
                    <p className="partner-benefit-detail">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="partner-card">
            <h3 className="partner-card-title">
              {PARTNER_OUTREACH.termsHeading}
            </h3>
            <ol className="partner-benefits-list">
              {PARTNER_OUTREACH.terms.map((term) => (
                <li key={term.index} className="partner-benefit-item">
                  <span className="partner-benefit-num">{term.index}</span>
                  <div className="partner-benefit-copy">
                    <p className="partner-benefit-title">{term.title}</p>
                    <p className="partner-benefit-detail">{term.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="partner-actions-bar">
          <div className="partner-contact-stack">
            <p className="partner-closing-note">
              {PARTNER_OUTREACH.closingNote}
            </p>
            <div className="partner-cta-row">
              <a href={mailtoHref} className="partner-primary-cta">
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                <span>Reach out by email</span>
              </a>

              <div className="copy-email-pill">
                <span id="partner-contact-email" className="copy-email-address">
                  {PARTNER_OUTREACH.contactEmail}
                </span>
                <span className="copy-trigger-wrap">
                  <button
                    ref={copyButtonRef}
                    type="button"
                    className="copy-button"
                    data-copied={copyStatus === "copied" ? "" : undefined}
                    data-failed={copyStatus === "failed" ? "" : undefined}
                    aria-label={`Copy contact email ${PARTNER_OUTREACH.contactEmail}`}
                    {...({
                      command: "--copy",
                      commandfor: "partner-contact-email",
                    } as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                  >
                    {copyStatus === "copied" ? (
                      <Check className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                  <span className="copy-tip" role="status">
                    {copyTip}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <a
            href={PARTNER_OUTREACH.showcaseUrl}
            target="_blank"
            rel="noreferrer"
            className="partner-showcase-link"
          >
            <span>{PARTNER_OUTREACH.showcaseLabel}</span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
