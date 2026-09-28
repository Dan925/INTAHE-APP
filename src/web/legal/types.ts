export interface LegalSection {
  id: string;
  heading: string;
  /** Inner HTML for this section's body — the template supplies the <h2> and the anchor, so this is <p>/<ul> content only. */
  bodyHtml: string;
}

export interface LegalDocument {
  title: string;
  /** Localized, human-readable effective date — see src/legal/registry.ts. */
  effectiveDate: string;
  /** True while the document still needs a lawyer's review — renders a visible draft banner (see legalPage.ts). Privacy policy is the only document reviewed so far. */
  isDraft: boolean;
  /** Optional short paragraph shown above the table of contents, before any numbered section — e.g. the privacy policy's "this document has been reviewed by counsel" framing. */
  introHtml?: string | undefined;
  sections: LegalSection[];
}
