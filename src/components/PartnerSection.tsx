import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Mail } from "lucide-react";
import { cn } from "cn";
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

const primaryCtaStyles = cn(
  "inline-flex items-center gap-2 min-h-11 px-5.5 py-2.5",
  "rounded-control border border-ink bg-ink text-page type-body-sm font-semibold no-underline",
  "transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-accent hover:border-accent hover:text-accent-ink active:scale-[0.985]",
);

const secondaryCtaStyles = cn(
  "inline-flex items-center gap-[0.45rem] min-h-11 px-4.5 py-2.5",
  "rounded-control border border-control bg-surface text-ink type-ui font-semibold no-underline",
  "transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-surface-muted hover:border-ink active:scale-[0.985]",
  "pointer-coarse:min-h-11",
);

const benefitItemStyles =
  "grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-4 border-b border-rule py-4 first:border-t";
const benefitNumStyles =
  "pt-0.5 font-serif type-body-sm italic font-[540] tabular text-accent";

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
      className="partner-section @container/partner scroll-mt-20 border-t border-edge bg-surface-alt"
      aria-labelledby="partner-heading"
    >
      <div className="shell grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[clamp(2rem,4.5dvb,3.25rem)] py-[clamp(4rem,9dvb,7rem)]">
        <header className="grid min-w-0 max-w-[56ch] gap-4">
          <p className="m-0 type-ui-sm font-semibold tracking-[0.05em] uppercase text-accent">
            {PARTNER_OUTREACH.kicker}
          </p>
          <h2
            id="partner-heading"
            className="m-0 font-serif type-title-3 font-semibold text-wrap-balance"
          >
            {PARTNER_OUTREACH.heading}
          </h2>
          <p className="mt-1 m-0 type-body-lg text-ink-secondary">
            {PARTNER_OUTREACH.lead}
          </p>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-[clamp(1.25rem,3cqi,2.25rem)] @min-[46rem]/partner:grid-cols-2">
          <div className="partner-card grid min-w-0 grid-rows-[auto_1fr] content-start gap-5 rounded-card border border-edge bg-surface p-[clamp(1.375rem,4.5cqi,2.25rem)]">
            <h3 className="m-0 font-serif type-item font-[580]">
              {PARTNER_OUTREACH.benefitsHeading}
            </h3>
            <ol className="grid min-w-0 list-none p-0 @min-[46rem]/partner:auto-rows-fr">
              {PARTNER_OUTREACH.benefits.map((item) => (
                <li key={item.index} className={benefitItemStyles}>
                  <span className={benefitNumStyles}>{item.index}</span>
                  <div className="grid min-w-0 gap-1">
                    <p className="m-0 type-body font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="m-0 type-body-sm text-ink-secondary">
                      {item.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="partner-card grid min-w-0 grid-rows-[auto_1fr] content-start gap-5 rounded-card border border-edge bg-surface p-[clamp(1.375rem,4.5cqi,2.25rem)]">
            <h3 className="m-0 font-serif type-item font-[580]">
              {PARTNER_OUTREACH.termsHeading}
            </h3>
            <ol className="grid min-w-0 list-none p-0 @min-[46rem]/partner:auto-rows-fr">
              {PARTNER_OUTREACH.terms.map((term) => (
                <li key={term.index} className={benefitItemStyles}>
                  <span className={benefitNumStyles}>{term.index}</span>
                  <div className="grid min-w-0 gap-1">
                    <p className="m-0 type-body font-semibold text-ink">
                      {term.title}
                    </p>
                    <p className="m-0 type-body-sm text-ink-secondary">
                      {term.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-t border-edge pt-[clamp(1.25rem,3cqi,1.75rem)]">
          <div className="grid min-w-0 gap-3.5">
            <p className="m-0 font-serif type-label-lg font-[560] text-ink">
              {PARTNER_OUTREACH.closingNote}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <a href={mailtoHref} className={primaryCtaStyles}>
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                <span>Reach out by email</span>
              </a>

              <div className="copy-email-pill inline-flex max-w-full min-h-11 items-center gap-2 rounded-control border border-control bg-surface py-1 pr-1.5 pl-[0.95rem]">
                <span
                  id="partner-contact-email"
                  className="font-mono type-ui-sm break-all text-ink"
                >
                  {PARTNER_OUTREACH.contactEmail}
                </span>
                <span className="relative inline-flex shrink-0 items-center">
                  <button
                    ref={copyButtonRef}
                    type="button"
                    className={cn(
                      "copy-button inline-flex size-9 items-center justify-center p-1.5",
                      "rounded-control border border-edge bg-surface-muted text-ink cursor-pointer",
                      "transition-[background-color,border-color,color,scale] duration-150",
                      "hover:border-ink active:scale-[0.96]",
                      "pointer-coarse:size-11",
                      "data-[copied]:border-ink data-[copied]:bg-ink data-[copied]:text-page",
                      "data-[failed]:border-accent data-[failed]:text-accent",
                    )}
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
                  <span
                    role="status"
                    className="copy-tip pointer-events-none absolute inset-e-auto end-0 bottom-[calc(100%+0.5rem)] z-5 rounded-control border border-control bg-ink px-2.5 py-1 type-micro font-semibold whitespace-nowrap text-page transition-opacity duration-150 empty:opacity-0"
                  >
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
            className={secondaryCtaStyles}
          >
            <span>{PARTNER_OUTREACH.showcaseLabel}</span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
