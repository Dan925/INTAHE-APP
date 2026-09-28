import type { Locale } from '../../types/db';

/**
 * Shared shell for every transactional email, replacing what used to be
 * five separately hand-rolled HTML snippets with no common look. Colors
 * mirror the web/mobile design system exactly (public/styles.css,
 * mobile/src/constants/theme.ts) so an email doesn't look like it came
 * from a different product than the app the recipient just used.
 *
 * Table-based layout with every style inlined, not a <style> block or
 * external stylesheet — required for consistent rendering across email
 * clients (Gmail strips <style>, Outlook uses Word's rendering engine).
 */

const COLORS = {
  pageBackground: '#f3ead9',
  cardBackground: '#fbf6ec',
  border: '#d9c7a6',
  text: '#2a231c',
  textSecondary: '#6b5d4c',
  primary: '#0e5b54',
  primaryStrong: '#08403b',
};

const FOOTER_TEXT: Record<Locale, string> = {
  en: 'This is an automated message from Intahé. Questions? Write to us at support@syncerainc.com.',
  fr: 'Ceci est un message automatisé d’Intahé. Des questions ? Écris-nous à support@syncerainc.com.',
};

/**
 * Dynamic values interpolated into these templates (event names, ticket
 * type names, full names) are organizer/buyer-controlled free text, so
 * they're escaped the same as they would be rendering into any other
 * HTML document — an email client executes the HTML it's given just like
 * a browser does.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:6px;margin-top:4px;">${label}</a>`;
}

export interface RenderEmailLayoutInput {
  locale: Locale;
  bodyHtml: string;
}

export function renderEmailLayout({ locale, bodyHtml }: RenderEmailLayoutInput): string {
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:${COLORS.pageBackground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pageBackground};padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.cardBackground};border:1px solid ${COLORS.border};border-radius:10px;">
            <tr>
              <td style="padding:24px 28px 4px;">
                <span style="font-weight:800;font-size:19px;letter-spacing:0.5px;text-transform:uppercase;color:${COLORS.primaryStrong};">Intahé</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 24px;color:${COLORS.text};font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid ${COLORS.border};color:${COLORS.textSecondary};font-size:12px;line-height:1.5;">
                ${FOOTER_TEXT[locale]}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
