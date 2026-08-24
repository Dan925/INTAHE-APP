import { env } from '../config/env';
import type { Locale, ServerStrings } from './i18n';

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
  scriptSrc?: string | string[];
  locale: Locale;
  currentPath: string;
  strings: ServerStrings;
  /** Renders the organizer nav (Organizations / Profile / logout) and makes session.js redirect to /login when no session is stored. */
  requireAuth?: boolean;
  /** Pulls in session.js (for window.intaheSession) without the auth-guard redirect or the nav bar — for /login and /signup, which need to read/write the session but must never redirect an anonymous visitor away from themselves. */
  needsSession?: boolean;
}): string {
  const otherLocale = options.locale === 'fr' ? 'en' : 'fr';
  const separator = options.currentPath.includes('?') ? '&' : '?';
  const toggleHref = `${options.currentPath}${separator}lang=${otherLocale}`;

  const scriptSrcs = Array.isArray(options.scriptSrc)
    ? options.scriptSrc
    : options.scriptSrc
      ? [options.scriptSrc]
      : [];
  const allScripts = options.requireAuth || options.needsSession ? ['/session.js', ...scriptSrcs] : scriptSrcs;

  const appNavHtml = options.requireAuth
    ? `
  <nav class="app-nav">
    <a href="/organizations">${options.strings.nav.organizations}</a>
    <a href="/profile">${options.strings.nav.profile}</a>
    <button id="logout-btn" type="button" class="ghost small-btn">${options.strings.nav.logout}</button>
  </nav>`
    : '';

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
<body data-stripe-pk="${escapeHtmlAttribute(env.STRIPE_PUBLISHABLE_KEY)}"${options.requireAuth ? ' data-require-auth="true"' : ''}>
  <header class="site-header">
    <a href="/discover" class="brand">${options.strings.brand}</a>
    <div class="header-links">${
      !options.requireAuth && !options.currentPath.startsWith('/login')
        ? `<a href="/login" class="login-link">${options.strings.nav.login_link}</a>`
        : ''
    }
      <a href="${toggleHref}" class="lang-toggle">${options.strings.toggle_label}</a>
    </div>
  </header>${appNavHtml}
  <main class="page">
${options.bodyHtml}
  </main>
  <footer class="site-footer">
    <a href="/privacy">${options.strings.footer.privacy_link}</a>
    <a href="/refunds">${options.strings.footer.refund_link}</a>
  </footer>
${allScripts.map((src) => `  <script src="${src}" defer></script>`).join('\n')}
</body>
</html>`;
}
