import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { GROUP_META } from "@/data/capstone";
import { TransitionLink } from "@/components/TransitionLink";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle(`Page Not Found | ${GROUP_META.title}`);

  return (
    <div className="shell shell-block">
      <section className="py-[clamp(3rem,8dvb,5.5rem)]">
        <p className="mb-5 type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-secondary">
          404 · Route Not Found
        </p>
        <h1
          id="main-content"
          tabIndex={-1}
          className="m-0 max-w-[16ch] font-serif type-title-1 font-semibold focus:outline-none"
        >
          This page does not exist.
        </h1>
        <p className="mt-6 max-w-[48ch] type-body-lg text-ink-secondary">
          Return to the {GROUP_META.code} roster, skills matrix, or capstone
          brief.
        </p>
        <TransitionLink
          to="/"
          direction="backward"
          className={cn(
            "mt-7 inline-flex items-center gap-[0.45rem] min-h-10 px-5 py-1.5",
            "rounded-control border border-ink bg-ink text-page type-ui font-semibold no-underline",
            "transition-[background-color,border-color,color,scale] duration-150",
            "hover:bg-accent hover:border-accent hover:text-accent-ink active:scale-[0.985]",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Return to Roster</span>
        </TransitionLink>
      </section>
    </div>
  );
}
