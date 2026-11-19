import { ArrowUpRight, Briefcase, Code2, Globe, Mail } from "lucide-react";
import { cn } from "cn";
import type { MemberLinks } from "@/data/capstone";
import { isValidHttpUrl } from "@/lib/editorForm";

const linkPillStyles = cn(
  "ui-press group/ext inline-flex items-center gap-1.5 min-h-10 px-3.5 py-1.5 rounded-control",
  "border border-edge bg-surface type-ui-sm font-semibold text-ink no-underline",
  "hover:border-(--tone,var(--accent)) hover:bg-[color-mix(in_oklab,var(--ink)_10%,var(--surface))] hover:text-(--tone,var(--accent)) pointer-coarse:min-h-11",
);

export function MemberLinksRow({
  links,
  className,
}: {
  links?: MemberLinks;
  className?: string;
}) {
  if (!links) return null;

  const entries = [
    links.github && isValidHttpUrl(links.github)
      ? { key: "github", label: "GitHub", href: links.github, icon: Code2, external: true }
      : null,
    links.linkedin && isValidHttpUrl(links.linkedin)
      ? { key: "linkedin", label: "LinkedIn", href: links.linkedin, icon: Briefcase, external: true }
      : null,
    links.portfolio && isValidHttpUrl(links.portfolio)
      ? { key: "portfolio", label: "Portfolio", href: links.portfolio, icon: Globe, external: true }
      : null,
    links.email
      ? { key: "email", label: "Email", href: `mailto:${links.email}`, icon: Mail, external: false }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (entries.length === 0) return null;

  return (
    <ul className={cn("m-0 flex flex-wrap gap-2 p-0", className)} aria-label="External links">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <li key={entry.key}>
            <a
              href={entry.href}
              target={entry.external ? "_blank" : undefined}
              rel={entry.external ? "noreferrer" : undefined}
              className={linkPillStyles}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{entry.label}</span>
              {entry.external ? (
                <ArrowUpRight className="size-3 shrink-0 opacity-70" aria-hidden="true" />
              ) : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
