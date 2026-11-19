# Project Agent Rules

- **Always use `modern-web-guidance` (MWG)**: Consult the `modern-web-guidance` skill (`npx -y modern-web-guidance@latest` or `npx --offline modern-web-guidance@latest`) on every frontend, UI, HTML, CSS, layout, typography, scaling, animation, accessibility, and client-side task in this repository before writing or editing code, unless the user explicitly overrides this instruction.
- **Keep scaling proportional and non-hardcoded**: Prefer container queries (`@container`), container/font-relative units (`cqi`, `cqb`, `rem`, `em`), intrinsic CSS grid/flexbox (`minmax()`, `auto-fit`), and percentage-based motion offsets so layouts, typography, and interactions scale cleanly across viewports, browser zoom, and OS text scaling (`<meta name="text-scale" content="scale">`).
- **Always check desktop and mobile aspect rendering**: Make sure to check alignments and animations on all platforms, ensuring that scaling and functionality are working as intended, and that no functionality is compromised.
- **NO em dashes anywhere**: Always phrase things naturally in a proper statement or in sentences, use of em dashes is banned.

---

# Codebase overview

A single-page marketing/roster site for a SUTD capstone team ("Lockheed Summer Internship"). Three routes: a long scroll-driven roster (`/`), a member detail page (`/member/:slug`), and a licenses page (`/licenses`), plus a 404. No backend, no API calls — every string and image path comes from one data module.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint (must pass; CI gates on it)
npm run preview  # serve the production build
```

CI (`.github/workflows/deploy.yml`) runs lint then build on push to `main`, copies `dist/index.html` to `dist/404.html` so GitHub Pages can serve client-side routes, and deploys to Pages. Because routing is `BrowserRouter`, the 404 fallback copy is load-bearing; don't remove it.

## Stack

React 19 + TypeScript 7 (strict-ish: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8, Tailwind CSS 4 (CSS-first config, no `tailwind.config.*`), Motion (`motion/react`), React Router 8, lucide icons, `@base-ui/react` behind the shadcn `base-nova` style, and `@oddbird/popover-polyfill` (lazily loaded in `main.tsx` when `HTMLElement.prototype.popover` is missing).

## Layout

```
src/
  App.tsx                 Router shell: header, <main class="site-main">, footer; popstate → focus heading
  main.tsx                Font imports, CSS import, popover polyfill, root render
  index.css               The whole design system (~2000 lines) — tokens, utilities, then mechanisms
  data/capstone.ts        Single source of truth: members, pillar filters, partner copy, slugs
  pages/                  RosterPage, MemberDetailPage, LicensesPage, NotFoundPage
  components/             SiteHeader, SiteFooter, MemberChapter, ArtifactFrame, PartnerSection, ThemeToggle, TransitionLink
  components/ui/          pillar-badge (used); button.tsx + button-variants.ts are unused shadcn scaffold
  lib/                    viewTransitions, theme, splashBus
  hooks/                  useTransitionMember, useDocumentTitle
```

Imports use the `@/*` → `./src/*` alias. Class names are merged with `cn` imported from the **`cn` package** (not `clsx`/`tailwind-merge`).

## Data

`src/data/capstone.ts` holds `TEAM_MEMBERS` (typed `TeamMember`), `PILLAR_FILTERS`, `GROUP_META`, and `PARTNER_OUTREACH`. Slugs are derived from names at module load and de-duplicated with the member index. Editing copy, bios, or contact details means editing this file, not the components. Several members are placeholders — `GROUP_META.note` says so.

## Styling system (read `src/index.css` before touching styles)

Three tiers, in order:

1. **Palette** (`@theme`): literal `--palette-*-light` / `--palette-*-dark` pairs. Never used by utilities directly.
2. **Semantic tokens** (`:root`, unlayered): `--bg`, `--surface`, `--ink`, `--accent`, `--pillar-csd|epd|esd`, etc., each composed with `light-dark()`. Unlayered on purpose so charcoal chapter bands can override them for a subtree.
3. **Utility aliases** (`@theme inline`): `--color-page`, `--color-ink`, `--color-surface`, … which is why classes read `bg-surface`, `text-ink-muted`, `border-edge`.

Rules that follow from this:

- **No `dark:` variants.** Theming is entirely `color-scheme` + `light-dark()`. Adding a `dark:` utility will be dead code (the `dark:` strings left in `button-variants.ts` are stock shadcn and unused).
- **Never hardcode colors, sizes, or radii.** Use the semantic tokens and `--radius-*`, `--shadow-*`, `--ease-brand`.
- **Typography uses the `type-*` utilities only** (`type-display`, `type-title-1`…`type-title-4`, `type-heading`, `type-body`, `type-ui`, `type-micro`, …). The stock Tailwind text scale is removed (`--text-*: initial`); each role bundles its own line-height and tracking. Don't pair `text-xl` with your own `leading-*`.
- Layout helpers: `shell` / `shell-block` for page width and vertical rhythm; `tabular` for numbers.
- Spacing and type scale fluidly with `clamp(...cqi...)` against `@container` contexts (`@container chapter (inline-size …)`). Keep new sizes in that idiom rather than fixed `px`.
- The bottom of `index.css` is a `@layer components` block holding only **mechanisms** — things a utility genuinely cannot express: the measured header state, the anchored popover panel, the chapter pin/rail, the peeking carousel mask, anchor-positioned tab indicator, view transitions, and the mode overrides. Prefer a utility; add here only when the thing is stateful or keyframe-driven.
- A few classes are plain **hooks** (`.member-card`, `.filter-rail`, `.copy-button`, `.menu-toggle`, …): no styling of their own, they exist only so the mode-override block has a stable target.

## Theming

`src/index.css` ships `color-scheme: light dark`, and `index.html` has an inline pre-hydration script that reads `localStorage["color-scheme"]` and rewrites `<meta name="color-scheme">` before first paint. `src/lib/theme.ts` owns the rest: `useColorScheme()` returns `preference` (`"light dark" | "light" | "dark"`), `resolvedScheme`, `isSystem`, `toggle`. Toggling stores a literal scheme only when it diverges from the OS preference, and clears storage when it agrees again so the site follows the OS. `ThemeToggle` is the only consumer.

## Motion and navigation

- All page transitions go through `TransitionLink` → `runViewTransition()` (`src/lib/viewTransitions.ts`). It wraps updates in `document.startViewTransition`, passes `types` (`forward`, `backward`, `filter`, `tab`), sets the `TransitionState` store (mode `idle` / `filter` / `member` plus `memberSlug` and `source`), and falls back to a plain update when View Transitions or `types` are unsupported, or when the user prefers reduced motion.
- Member chapter → detail transitions use `view-transition-name: page-main` on `<main>`; the store's `mode` decides when that name is applied, so don't move it into CSS.
- `splashBus.ts` is a module singleton (not a window event) sharing "past the splash" scroll state between `RosterPage` and `SiteHeader`; the header depends on reading the current value on subscribe.
- Motion components read `MotionConfig reducedMotion="user"` from `App` and/or `useReducedMotion()`. New animations must respect both.
- Navigation focus: after a transition, `focusRouteHeading()` focuses the element with `id="main-content"` using `preventScroll`. That id is set by each page (on its `<h1>`/header block) and referenced by the header's skip link — every page must provide exactly one.

## Conventions

- Function components with named exports; page files export `XxxPage`. Props interfaces are local, not exported, unless reused.
- `import type` for type-only imports (`verbatimModuleSyntax` forbids value-form type imports).
- Shared easing is `const EASE = [0.22, 1, 0.36, 1] as const`, matching `--ease-brand`.
- Interactive elements keep `min-h-11`/`min-h-10` plus `pointer-coarse:min-h-11` so touch targets survive; `:focus-visible` gets a 3px `--accent` outline from base CSS.
- `useDocumentTitle(title)` per page; `<html lang="en">` and the meta description live in `index.html`.
- `AUDIT_BUGS.md` is gitignored local scratch — don't treat it as project documentation.
