import { env } from '../config/env';
import type { Locale } from './i18n';

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Every dynamic value shown on these pages (event name, description,
 * ticket type names...) is fetched client-side via JS and written with
 * textContent/DOM APIs, never interpolated into an HTML string server-side
 * — so there's no user-controlled data in these templates to escape. The
 * Stripe publishable key below is server config, not user input, but is
 * escaped anyway since it's cheap to do correctly.
 */
export function renderPage(options: {
  title: string;
  bodyHtml: string;
  scriptSrc?: string;
  locale: Locale;
  currentPath: string;
  brand: string;
  toggleLabel: string;
  footerPrivacyLabel: string;
  footerRefundLabel: string;
}): string {
  const otherLocale = options.locale === 'fr' ? 'en' : 'fr';
  const separator = options.currentPath.includes('?') ? '&' : '?';
  const toggleHref = `${options.currentPath}${separator}lang=${otherLocale}`;

  return `<!doctype html>
<html lang="${options.locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title}</title>
  <link rel="stylesheet" href="/styles.css" />
  <script src="/i18n.js"></script>
  <script src="https://js.stripe.com/v3/"></script>
</head>
<body data-stripe-pk="${escapeHtmlAttribute(env.STRIPE_PUBLISHABLE_KEY)}">
  <header class="site-header">
    <a href="/discover" class="brand">${options.brand}</a>
    <a href="${toggleHref}" class="lang-toggle">${options.toggleLabel}</a>
  </header>
  <main class="page">
${options.bodyHtml}
  </main>
  <footer class="site-footer">
    <a href="/privacy">${options.footerPrivacyLabel}</a>
    <a href="/refunds">${options.footerRefundLabel}</a>
  </footer>
${options.scriptSrc ? `  <script src="${options.scriptSrc}" defer></script>` : ''}
</body>
</html>`;
}
