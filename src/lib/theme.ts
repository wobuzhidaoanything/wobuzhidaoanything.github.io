import { useEffect, useState } from "react";

export type ColorSchemePreference = "light dark" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";

const STORAGE_KEY = "color-scheme";

function getMetaElement(): HTMLMetaElement | null {
  return document.querySelector('meta[name="color-scheme"]');
}

export function readStoredPreference(): ColorSchemePreference {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark") return val;
  } catch {
    // Storage unavailable (private mode or blocked); fall back to system
  }
  return "light dark";
}

export function getSystemScheme(): ResolvedScheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyColorSchemeMeta(pref: ColorSchemePreference) {
  const meta = getMetaElement();
  if (meta) {
    meta.setAttribute("content", pref);
  }
}

/**
 * Implements Modern Web Guidance's two-state color scheme toggle:
 * - Target scheme is the opposite of the currently rendered scheme.
 * - If target differs from the current OS preference, store it literally.
 * - If target matches the current OS preference, remove stored value so the site follows OS again.
 * - Divergence is NEVER retroactively stripped when OS changes later.
 */
export function toggleColorSchemePreference(
  currentPref: ColorSchemePreference,
): ColorSchemePreference {
  const systemScheme = getSystemScheme();
  const rendered: ResolvedScheme =
    currentPref === "light dark" ? systemScheme : currentPref;
  const target: ResolvedScheme = rendered === "dark" ? "light" : "dark";

  let nextPref: ColorSchemePreference = "light dark";
  if (target !== systemScheme) {
    nextPref = target;
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      // Still apply via <meta> even if persistence is blocked
    }
  } else {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failure
    }
  }

  applyColorSchemeMeta(nextPref);
  return nextPref;
}

export function useColorScheme() {
  const [preference, setPreference] = useState<ColorSchemePreference>(() =>
    readStoredPreference(),
  );
  const [systemScheme, setSystemScheme] = useState<ResolvedScheme>(() =>
    getSystemScheme(),
  );

  useEffect(() => {
    applyColorSchemeMeta(preference);
  }, [preference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? "dark" : "light");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = readStoredPreference();
        setPreference(next);
        applyColorSchemeMeta(next);
      }
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedScheme: ResolvedScheme =
    preference === "light dark" ? systemScheme : preference;

  const toggle = () => {
    setPreference((prev) => toggleColorSchemePreference(prev));
  };

  return {
    preference,
    resolvedScheme,
    isSystem: preference === "light dark",
    toggle,
  };
}
