import { Moon, Sun } from "lucide-react";
import { cn } from "cn";
import { useColorScheme } from "@/lib/theme";

/**
 * Two-state colour scheme toggle. The label names the theme you'll get, which
 * is the only reading that makes sense for a control that cannot show state.
 * Previously this rendered both options and relied on media queries to hide
 * one; that markup only worked without JS, and the button is inert without JS.
 */
export function ThemeToggle() {
  const { resolvedScheme, toggle } = useColorScheme();
  const nextScheme = resolvedScheme === "dark" ? "light" : "dark";
  const Icon = resolvedScheme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${nextScheme} theme`}
      className={cn(
        "theme-toggle ui-press group/theme inline-flex items-center justify-center gap-2",
        "min-h-10 min-w-10 px-3 py-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        "rounded-control border border-control bg-surface text-ink",
        "type-ui-sm font-semibold cursor-pointer",
        "hover:bg-surface-muted/75 hover:text-accent",
      )}
    >
      <Icon className="size-4 shrink-0 transition-transform duration-200 motion-safe:group-hover/theme:rotate-12" aria-hidden="true" />
      <span className="@max-[26rem]/site-header:sr-only">
        {nextScheme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
