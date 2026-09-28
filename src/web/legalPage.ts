import type { LegalDocument } from './legal/types';

/**
 * The one shared renderer every /legal/* route (routes.ts) uses to turn a
 * LegalDocument into a full page body — this is this codebase's
 * "reusable LegalPage component": the web frontend is server-rendered
 * HTML (no client-side component framework outside the Expo mobile app),
 * so a shared template function is the equivalent building block. Every
 * legal document gets the same shape from this one place: title,
 * effective date, a table of contents, and an anchor per section — so a
 * new document (or a new section in an existing one) only ever needs to
 * supply data, never re-implement layout.
 *
 * Content is authored directly in code (src/web/legal/*.ts), same as
 * before this framework existed — never interpolated with user-controlled
 * data, so no HTML-escaping is needed here.
 */
export function renderLegalPage(doc: LegalDocument, draftNoticeText: string, effectiveDateLabel: string): string {
  const toc = doc.sections
    .map((section) => `      <li><a href="#${section.id}">${section.heading}</a></li>`)
    .join('\n');

  const sections = doc.sections
    .map(
      (section) => `    <section id="${section.id}" class="legal-section">
      <h2>${section.heading}</h2>
${section.bodyHtml}
    </section>`,
    )
    .join('\n\n');

  const draftBanner = doc.isDraft
    ? `\n    <p class="legal-draft-banner">${draftNoticeText}</p>`
    : '';
  const intro = doc.introHtml ? `\n${doc.introHtml}` : '';

  return `  <article class="legal-page">
    <h1>${doc.title}</h1>
    <p class="text-secondary small">${effectiveDateLabel}: ${doc.effectiveDate}</p>${draftBanner}${intro}

    <nav class="legal-toc" aria-label="Table of contents">
      <ol>
${toc}
      </ol>
    </nav>

${sections}
  </article>`;
}
