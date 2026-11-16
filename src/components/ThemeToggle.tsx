import { Moon, Sun } from "lucide-react";
import { useColorScheme } from "@/lib/theme";

/**
 * Dual-markup two-state color scheme toggle per Modern Web Guidance (`dark-mode-toggle`).
 * Inactive option is hidden via CSS (`display: none`) driven by `<meta name="color-scheme">`
 * and `@media (prefers-color-scheme: dark)` so the control stays current even without JS.
 */
export function ThemeToggle() {
  const { resolvedScheme, isSystem, toggle } = useColorScheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      data-scheme={resolvedScheme}
      data-system={isSystem ? "true" : "false"}
    >
      <span className="theme-option-to-dark">
        <Moon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Dark<span className="visually-hidden"> theme</span>
        </span>
      </span>
      <span className="theme-option-to-light">
        <Sun className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Light<span className="visually-hidden"> theme</span>
        </span>
      </span>
    </button>
  );
}
