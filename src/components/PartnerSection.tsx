import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowUpRight, Check, Copy, Mail, Printer } from "lucide-react";
import { cn } from "cn";
import { PARTNER_OUTREACH } from "@/data/capstone";

const EASE = [0.22, 1, 0.36, 1] as const;

const sectionStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.03,
    },
  },
};

const sectionBlock: Variants = {
  hidden: { opacity: 0, y: "4%" },
  visible: {
    opacity: 1,
    y: "0%",
    transition: { duration: 0.44, ease: EASE },
  },
};

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
  "ui-press ui-press-primary inline-flex items-center gap-2 min-h-11 px-5.5 py-2.5",
  "rounded-control border border-ink bg-ink text-page type-body-sm font-semibold no-underline cursor-pointer",
);

const secondaryCtaStyles = cn(
  "ui-press inline-flex items-center gap-[0.45rem] min-h-11 px-4.5 py-2.5",
  "rounded-control border border-control bg-surface text-ink type-ui font-semibold no-underline cursor-pointer",
  "hover:bg-surface-muted/75 pointer-coarse:min-h-11",
);

const benefitItemStyles =
  "grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-4 border-b border-rule py-4.5 first:border-t";
const benefitNumStyles =
  "pt-0.5 font-serif type-body-sm italic font-[540] tabular text-accent";

export function PartnerSection() {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const faqSectionRef = useRef<HTMLElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [copyTip, setCopyTip] = useState("");
  const [allFaqsOpen, setAllFaqsOpen] = useState(false);

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

  useEffect(() => {
    const section = faqSectionRef.current;
    if (!section) return;

    const syncExpanded = () => {
      const items = Array.from(section.querySelectorAll<HTMLDetailsElement>(":scope > details"));
      setAllFaqsOpen(items.length > 0 && items.every((el) => el.open));
    };

    const onCommand = (event: Event) => {
      const commandEvent = event as Event & { command?: string };
      if (commandEvent.command !== "--toggle-all") return;
      const items = Array.from(section.querySelectorAll<HTMLDetailsElement>(":scope > details"));
      const expand = !items.every((el) => el.open);
      for (const details of items) details.open = expand;
      syncExpanded();
    };

    section.addEventListener("command", onCommand, true);
    section.addEventListener("toggle", syncExpanded, true);
    return () => {
      section.removeEventListener("command", onCommand, true);
      section.removeEventListener("toggle", syncExpanded, true);
    };
  }, []);

  const handleToggleAllClickFallback = () => {
    if ("commandForElement" in HTMLButtonElement.prototype) return;
    const section = faqSectionRef.current;
    if (!section) return;
    const items = Array.from(section.querySelectorAll<HTMLDetailsElement>(":scope > details"));
    const expand = !items.every((el) => el.open);
    for (const details of items) details.open = expand;
    setAllFaqsOpen(expand);
  };

  const mailtoHref = `mailto:${PARTNER_OUTREACH.contactEmail}?subject=${encodeURIComponent(PARTNER_OUTREACH.emailSubject)}`;

  return (
    <section
      id="partner"
      tabIndex={-1}
      className="partner-section @container/partner scroll-mt-(--header-h) border-t border-edge bg-surface-alt"
      aria-labelledby="partner-heading"
    >
      <motion.div
        className="shell grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[clamp(2.75rem,6dvb,4.5rem)] py-[clamp(5.5rem,11dvb,8.5rem)]"
        variants={sectionStagger}
        initial={shouldReduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: "some" }}
      >
        <motion.div
          variants={sectionBlock}
          className="grid min-w-0 grid-cols-1 items-start gap-x-[clamp(2rem,5cqi,4.5rem)] gap-y-7 @min-[54rem]/partner:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
        >
          <header className="grid min-w-0 max-w-[54ch] gap-4">
            <p className="m-0 type-ui-sm font-semibold tracking-[0.05em] uppercase text-accent">
              {PARTNER_OUTREACH.kicker}
            </p>
            <h2 id="partner-heading" className="m-0 font-serif type-title-3 font-semibold text-wrap-balance">
              {PARTNER_OUTREACH.heading}
            </h2>
            <p className="m-0 type-body-lg text-ink-secondary">{PARTNER_OUTREACH.lead}</p>
          </header>

          <div className="partner-card grid min-w-0 content-start gap-4 rounded-card border border-edge bg-surface p-[clamp(1.35rem,3.5cqi,2rem)] shadow-raised">
            <p className="m-0 font-serif type-label-lg font-[560] text-ink">
              {PARTNER_OUTREACH.closingNote}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <a href={mailtoHref} className={primaryCtaStyles}>
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                <span>Reach out by email</span>
              </a>

              <div className="copy-email-pill inline-flex max-w-full min-h-11 items-center gap-2 rounded-control border border-control bg-surface-alt py-1 pr-1.5 pl-[0.95rem]">
                <span id="partner-contact-email" className="font-mono type-ui-sm break-all text-ink">
                  {PARTNER_OUTREACH.contactEmail}
                </span>
                <span className="relative inline-flex shrink-0 items-center">
                  <button
                    ref={copyButtonRef}
                    type="button"
                    className={cn(
                      "copy-button ui-press inline-flex size-10 items-center justify-center p-1.5",
                      "rounded-control border border-edge bg-surface text-ink cursor-pointer",
                      "pointer-coarse:size-11",
                      "data-[copied]:border-success data-[copied]:bg-success-surface data-[copied]:text-success",
                      "data-[failed]:border-danger data-[failed]:text-danger",
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
                    className="copy-tip pointer-events-none absolute end-0 top-[calc(100%+0.45rem)] z-10 rounded-control border border-success/40 bg-success-surface px-2.5 py-1 type-micro font-semibold whitespace-nowrap text-success shadow-chip transition-opacity duration-150 empty:opacity-0"
                  >
                    {copyTip}
                  </span>
                </span>
              </div>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2.5 border-t border-rule pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className={secondaryCtaStyles}
              >
                <Printer className="size-4 shrink-0" aria-hidden="true" />
                <span>Print brief</span>
              </button>
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
        </motion.div>

        <motion.dl
          variants={sectionBlock}
          className="grid list-none grid-cols-1 gap-x-8 gap-y-5 rounded-card border border-edge bg-surface p-[clamp(1.5rem,3.5cqi,2.25rem)] @min-[48rem]/partner:grid-cols-3"
          aria-label="Partnership highlights"
        >
          <div className="grid gap-1.5">
            <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
              Delivery window
            </dt>
            <dd className="m-0 font-serif type-heading font-[560] tabular text-ink">
              Sep 2027 – Apr 2028
            </dd>
          </div>
          <div className="grid gap-1.5">
            <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
              Intellectual property
            </dt>
            <dd className="m-0 font-serif type-heading font-[560] text-ink">
              100% Partner IP Ownership
            </dd>
          </div>
          <div className="grid gap-1.5">
            <dt className="type-micro font-semibold tracking-[0.05em] uppercase text-ink-muted">
              Materials funding
            </dt>
            <dd className="m-0 font-serif type-heading font-[560] tabular text-ink">
              Up to S$4,000 via SUTD
            </dd>
          </div>
        </motion.dl>

        <motion.div
          variants={sectionBlock}
          className="grid min-w-0 grid-cols-1 gap-[clamp(1.75rem,3.5cqi,2.75rem)] @min-[46rem]/partner:grid-cols-2"
        >
          <div className="partner-card ui-card-interactive grid min-w-0 content-start gap-5 rounded-card border border-edge bg-surface p-[clamp(1.65rem,4.5cqi,2.5rem)]">
            <h3 className="m-0 font-serif type-item font-[580]">{PARTNER_OUTREACH.benefitsHeading}</h3>
            <ol className="m-0 grid min-w-0 list-none p-0">
              {PARTNER_OUTREACH.benefits.map((item) => (
                <li key={item.index} className={benefitItemStyles}>
                  <span className={benefitNumStyles}>{item.index}</span>
                  <div className="grid min-w-0 gap-1.5">
                    <p className="m-0 type-body font-semibold text-ink">{item.title}</p>
                    <p className="m-0 type-body-sm text-ink-secondary">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="partner-card ui-card-interactive grid min-w-0 content-start gap-5 rounded-card border border-edge bg-surface p-[clamp(1.65rem,4.5cqi,2.5rem)]">
            <h3 className="m-0 font-serif type-item font-[580]">{PARTNER_OUTREACH.termsHeading}</h3>
            <ol className="m-0 grid min-w-0 list-none p-0">
              {PARTNER_OUTREACH.terms.map((term) => (
                <li key={term.index} className={benefitItemStyles}>
                  <span className={benefitNumStyles}>{term.index}</span>
                  <div className="grid min-w-0 gap-1.5">
                    <p className="m-0 type-body font-semibold text-ink">{term.title}</p>
                    <p className="m-0 type-body-sm text-ink-secondary">{term.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </motion.div>

        <motion.section
          ref={faqSectionRef}
          variants={sectionBlock}
          id="partner-faq"
          className="no-print grid min-w-0 gap-3 border-t border-rule pt-7"
          aria-labelledby="partner-faq-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="partner-faq-heading" className="m-0 font-serif type-heading-xs font-[580] text-ink">
              Partnership details &amp; FAQ
            </h3>
            <button
              type="button"
              onClick={handleToggleAllClickFallback}
              aria-expanded={allFaqsOpen}
              {...({
                commandfor: "partner-faq",
                command: "--toggle-all",
              } as Record<string, unknown>)}
              className="ui-press inline-flex min-h-11 cursor-pointer items-center rounded-control border border-edge bg-surface px-3.5 py-2 type-ui-sm font-semibold text-ink hover:bg-surface-muted/75"
            >
              <span className="faq-expand-label">Expand all</span>
              <span className="faq-collapse-label">Collapse all</span>
            </button>
          </div>

          {PARTNER_OUTREACH.faqs.map((faq) => (
            <details
              key={faq.id}
              className="editorial-details rounded-card border border-edge bg-surface px-5 py-3.5"
            >
              <summary className="min-h-9 type-body font-semibold text-ink">
                <span>{faq.question}</span>
              </summary>
              <p className="m-0 pt-2.5 pl-[1.65rem] type-body-sm text-ink-secondary">
                {faq.answer}
              </p>
            </details>
          ))}
        </motion.section>
      </motion.div>
    </section>
  );
}
