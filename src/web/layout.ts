import { env } from '../config/env';

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
export function renderPage(options: { title: string; bodyHtml: string; scriptSrc?: string }): string {
  return `<!doctype html>
<html lang="fr-CA">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title}</title>
  <link rel="stylesheet" href="/styles.css" />
  <script src="https://js.stripe.com/v3/"></script>
</head>
<body data-stripe-pk="${escapeHtmlAttribute(env.STRIPE_PUBLISHABLE_KEY)}">
  <header class="site-header">
    <a href="/discover">Intahe</a>
  </header>
  <main class="page">
${options.bodyHtml}
  </main>
${options.scriptSrc ? `  <script src="${options.scriptSrc}" defer></script>` : ''}
</body>
</html>`;
}
