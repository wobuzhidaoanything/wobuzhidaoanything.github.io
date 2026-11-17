import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import { GROUP_META } from "@/data/capstone";
import { TransitionLink } from "@/components/TransitionLink";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const FONT_ATTRIBUTIONS = [
  {
    name: "Newsreader",
    license: "SIL Open Font License 1.1",
    copyright: "Copyright 2020 The Newsreader Project Authors",
    url: "https://github.com/productiontype/Newsreader",
  },
  {
    name: "Geist",
    license: "SIL Open Font License 1.1",
    copyright: "Copyright 2024 The Geist Project Authors",
    url: "https://github.com/vercel/geist-font",
  },
  {
    name: "Geist Mono",
    license: "SIL Open Font License 1.1",
    copyright: "Copyright 2024 The Geist Project Authors",
    url: "https://github.com/vercel/geist-font",
  },
];

const OFL_NOTICE = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in Original or Modified Versions, may be sold by itself.
2) Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license.
3) No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted by the corresponding Copyright Holder.
4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font Software shall not be used to promote, endorse or advertise any Modified Version, except to acknowledge the contribution(s) of the Copyright Holder(s) and the Author(s) or with their explicit written permission.
5) The Font Software, modified or unmodified, in part or in whole, must be distributed entirely under this license, and must not be distributed under any other license.

Full text: https://scripts.sil.org/OFL`;

const quietLinkStyles = cn(
  "inline-flex items-center gap-[0.45rem] min-h-10 px-3.5 py-1.5",
  "rounded-control border border-transparent type-ui font-semibold",
  "text-ink-secondary no-underline transition-[background-color,border-color,color,scale] duration-150",
  "hover:bg-surface-muted hover:border-edge hover:text-ink active:scale-[0.985]",
  "pointer-coarse:min-h-11",
);

const sectionTitleStyles =
  "m-0 font-serif type-heading-xs font-[580] text-wrap-balance";
const sectionStyles = "mt-6 grid gap-4 border-t border-edge pt-7";

export function LicensesPage() {
  useDocumentTitle(`Fonts & Licenses | ${GROUP_META.title}`);

  return (
    <div className="detail-page-shell shell shell-block">
      <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
        <TransitionLink to="/" direction="backward" className={quietLinkStyles}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Back to About Us</span>
        </TransitionLink>
      </div>

      <article className="detail-profile-card @container/detail-card grid min-w-0 gap-[1.125rem] rounded-card border border-edge bg-surface p-[clamp(1.375rem,5cqi,3.25rem)]">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <span className="w-fit font-serif type-item font-[560] tabular text-ink-secondary">
            Colophon
          </span>
          <span className="inline-flex items-center type-ui-sm font-semibold tracking-[0.04em] text-ink-secondary">
            Open Source · SIL OFL 1.1 &amp; MIT
          </span>
        </header>

        <h1
          id="main-content"
          tabIndex={-1}
          className="m-0 w-fit font-serif type-title-3 font-semibold focus:outline-none"
        >
          Fonts &amp; Licenses
        </h1>

        <p className="mt-1.5 max-w-[56ch] type-body text-ink-secondary">
          All typefaces bundled on this website are free, open-source fonts
          licensed under the SIL Open Font License 1.1 (OFL-1.1), allowing free
          public and commercial web use with attribution preserved below.
          Application libraries (React, React Router, Motion, Tailwind CSS,
          Lucide) are MIT-licensed.
        </p>

        <section className={sectionStyles} aria-labelledby="fonts-heading">
          <h2 id="fonts-heading" className={sectionTitleStyles}>
            Typefaces
          </h2>
          <ul className="grid list-none p-0">
            {FONT_ATTRIBUTIONS.map((font) => (
              <li
                key={font.name}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="m-0 type-body font-semibold">{font.name}</p>
                  <p className="mt-1 m-0 type-ui text-ink-secondary">
                    {font.copyright} · {font.license}
                  </p>
                </div>
                <a
                  href={font.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 px-2 type-ui font-semibold text-accent no-underline hover:underline hover:underline-offset-4"
                >
                  <span>Source</span>
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className={sectionStyles} aria-labelledby="ofl-text-heading">
          <h2 id="ofl-text-heading" className={sectionTitleStyles}>
            SIL Open Font License 1.1 Notice
          </h2>
          <pre className="license-notice-box m-0 overflow-x-auto rounded-control border border-edge bg-surface-muted p-5 font-mono type-ui-sm leading-[1.6] break-words whitespace-pre-wrap text-ink-secondary">
            {OFL_NOTICE}
          </pre>
        </section>
      </article>
    </div>
  );
}
