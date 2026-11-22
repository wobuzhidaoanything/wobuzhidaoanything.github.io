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
        <p className="mb-5 type-ui-sm font-semibold text-ink-secondary">
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
          Back to home to see the {GROUP_META.code} team, skills matrix,
          and capstone brief.
        </p>
        <TransitionLink
          to="/"
          direction="backward"
          className={cn(
            "ui-press ui-press-primary mt-7 inline-flex items-center gap-[0.45rem] min-h-11 px-5 py-2",
            "rounded-control border border-ink bg-ink text-page type-ui font-semibold no-underline",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Back to home</span>
        </TransitionLink>
      </section>
    </div>
  );
}
