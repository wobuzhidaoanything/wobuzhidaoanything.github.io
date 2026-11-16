import { ArrowLeft, ArrowUpRight } from "lucide-react";
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

export function LicensesPage() {
  useDocumentTitle(`Fonts & Licenses | ${GROUP_META.title}`);

  return (
    <div className="page-shell detail-page-shell">
      <div className="detail-top-bar">
        <TransitionLink to="/" direction="backward" className="back-link">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Back to About Us</span>
        </TransitionLink>
      </div>

      <article className="detail-profile-card">
        <header className="detail-profile-head">
          <span className="member-index detail-index">Colophon</span>
          <span className="pillar-label">
            Open Source · SIL OFL 1.1 &amp; MIT
          </span>
        </header>

        <h1 id="main-content" tabIndex={-1} className="detail-name">
          Fonts &amp; Licenses
        </h1>

        <p className="detail-bio">
          All typefaces bundled on this website are free, open-source fonts
          licensed under the SIL Open Font License 1.1 (OFL-1.1), allowing free
          public and commercial web use with attribution preserved below.
          Application libraries (React, React Router, Motion, Tailwind CSS,
          Lucide) are MIT-licensed.
        </p>

        <section className="licenses-section" aria-labelledby="fonts-heading">
          <h2 id="fonts-heading" className="detail-section-title">
            Typefaces
          </h2>
          <ul className="licenses-list">
            {FONT_ATTRIBUTIONS.map((font) => (
              <li key={font.name} className="license-row">
                <div>
                  <p className="license-name">{font.name}</p>
                  <p className="license-meta">
                    {font.copyright} · {font.license}
                  </p>
                </div>
                <a
                  href={font.url}
                  target="_blank"
                  rel="noreferrer"
                  className="license-ext-link"
                >
                  <span>Source</span>
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="licenses-section"
          aria-labelledby="ofl-text-heading"
        >
          <h2 id="ofl-text-heading" className="detail-section-title">
            SIL Open Font License 1.1 Notice
          </h2>
          <pre className="license-notice-box">{OFL_NOTICE}</pre>
        </section>
      </article>
    </div>
  );
}
