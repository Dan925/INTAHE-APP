import path from 'node:path';
import express, { Router } from 'express';
import type { Request, Response } from 'express';
import { resolveLocale, serverStrings, type Locale, type ServerStrings } from './i18n';
import { renderPage } from './layout';
import { privacyPolicyHtml } from './privacyContent';
import { refundPolicyHtml } from './refundContent';

const router = Router();

router.use(express.static(path.join(__dirname, '../../public')));

/**
 * Shared plumbing for every route below: resolve locale, look up its
 * strings, and render the shell. Organizer pages (requireAuth: true) keep
 * bodyHtml to a single container div — all their actual text is rendered
 * client-side via window.intaheT(), same as the mobile app's t(), rather
 * than mixing server- and client-rendered strings. The 5 pre-existing
 * public pages keep their server-rendered static chrome as-is.
 */
function page(
  req: Request,
  res: Response,
  opts: {
    title: (strings: ServerStrings) => string;
    scriptSrc?: string | string[];
    requireAuth?: boolean;
    needsSession?: boolean;
    bodyHtml: (strings: ServerStrings, locale: Locale) => string;
  },
): void {
  const locale = resolveLocale(req, res);
  const strings = serverStrings[locale];
  res.type('html').send(
    renderPage({
      title: opts.title(strings),
      ...(opts.scriptSrc !== undefined ? { scriptSrc: opts.scriptSrc } : {}),
      ...(opts.requireAuth !== undefined ? { requireAuth: opts.requireAuth } : {}),
      ...(opts.needsSession !== undefined ? { needsSession: opts.needsSession } : {}),
      locale,
      currentPath: req.path,
      strings,
      bodyHtml: opts.bodyHtml(strings, locale),
    }),
  );
}

const containerBody = (id: string) => `<div id="${id}"><div class="loader"></div></div>`;

router.get('/discover', (req, res) => {
  page(req, res, {
    title: (s) => `${s.discover.title} — Intahe`,
    scriptSrc: '/discover.js',
    bodyHtml: (s) => `
    <h1>${s.discover.title}</h1>
    <p class="text-secondary">${s.discover.intro}</p>
    <div class="row" style="margin-bottom: 16px;">
      <button id="locate-btn" type="button">${s.discover.use_location}</button>
    </div>
    <div id="status"></div>
    <div id="results"></div>`,
  });
});

router.get('/events/:eventId', (req, res) => {
  page(req, res, {
    title: (s) => s.event.title,
    scriptSrc: '/event.js',
    bodyHtml: (s) => `
    <div id="event-container">
      <div class="loader">${s.event.loading}</div>
    </div>`,
  });
});

router.get('/events/:eventId/orders/:orderId/tickets', (req, res) => {
  page(req, res, {
    title: (s) => s.tickets.title,
    scriptSrc: '/tickets.js',
    bodyHtml: (s) => `
    <div id="tickets-container">
      <div class="loader">${s.tickets.loading}</div>
    </div>`,
  });
});

router.get('/privacy', (req, res) => {
  page(req, res, {
    title: (s) => s.privacy.title,
    bodyHtml: (_s, locale) => privacyPolicyHtml(locale),
  });
});

router.get('/refunds', (req, res) => {
  page(req, res, {
    title: (s) => s.refund.title,
    bodyHtml: (_s, locale) => refundPolicyHtml(locale),
  });
});

// --- Organizer app (authenticated) ---------------------------------------

router.get('/login', (req, res) => {
  page(req, res, {
    title: (s) => s.login.title,
    scriptSrc: '/loginPage.js',
    needsSession: true,
    bodyHtml: () => containerBody('login-container'),
  });
});

router.get('/signup', (req, res) => {
  page(req, res, {
    title: (s) => s.signup.title,
    scriptSrc: '/signupPage.js',
    needsSession: true,
    bodyHtml: () => containerBody('signup-container'),
  });
});

router.get('/organizations', (req, res) => {
  page(req, res, {
    title: (s) => s.organizations_page.title,
    scriptSrc: '/organizationsPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('organizations-container'),
  });
});

router.get('/organizations/:orgId', (req, res) => {
  page(req, res, {
    title: (s) => s.organization_detail.title,
    scriptSrc: '/organizationDetailPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('organization-container'),
  });
});

router.get('/organizations/:orgId/members', (req, res) => {
  page(req, res, {
    title: (s) => s.org_members.title,
    scriptSrc: '/orgMembersPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('members-container'),
  });
});

router.get('/organizations/:orgId/dashboard', (req, res) => {
  page(req, res, {
    title: (s) => s.org_dashboard.title,
    scriptSrc: '/orgDashboardPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('dashboard-container'),
  });
});

router.get('/organizations/:orgId/payouts', (req, res) => {
  page(req, res, {
    title: (s) => s.org_payouts.title,
    scriptSrc: '/orgPayoutsPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('payouts-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId', (req, res) => {
  page(req, res, {
    title: (s) => s.manage_event.title,
    scriptSrc: '/manageEventPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('manage-event-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId/check-in', (req, res) => {
  page(req, res, {
    title: (s) => s.check_in.title,
    scriptSrc: '/checkInPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('check-in-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId/guest-list', (req, res) => {
  page(req, res, {
    title: (s) => s.guest_list.title,
    scriptSrc: '/guestListPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('guest-list-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId/fees', (req, res) => {
  page(req, res, {
    title: (s) => s.event_fees.title,
    scriptSrc: '/eventFeesPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('event-fees-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId/orders', (req, res) => {
  page(req, res, {
    title: (s) => s.org_orders.title,
    scriptSrc: '/orgOrdersPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('orders-container'),
  });
});

router.get('/organizations/:orgId/events/:eventId/tickets/:orderId', (req, res) => {
  page(req, res, {
    title: (s) => s.order_tickets.title,
    scriptSrc: '/orderTicketsPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('order-tickets-container'),
  });
});

// Stripe redirects here after onboarding (return) or when a session link
// expired mid-flow (refresh) — same page either way, since both cases just
// need to get the owner back to their organization's Stripe status. See
// stripeConnectReturnPage.js for how it finds which organization.
router.get('/stripe/connect/return', (req, res) => {
  page(req, res, {
    title: (s) => s.stripe_connect_return.title,
    scriptSrc: '/stripeConnectReturnPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('stripe-connect-return-container'),
  });
});

router.get('/stripe/connect/refresh', (req, res) => {
  page(req, res, {
    title: (s) => s.stripe_connect_return.title,
    scriptSrc: '/stripeConnectReturnPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('stripe-connect-return-container'),
  });
});

// Not linked from the main nav — reachable only by URL, same as several
// other deep pages in this app. The real access control is server-side
// (requirePlatformAdmin on every /v1/admin/* call); a non-admin who
// navigates here just sees this page's own 403 handling.
router.get('/admin/payouts', (req, res) => {
  page(req, res, {
    title: (s) => s.admin_payouts.title,
    scriptSrc: '/adminPayoutsPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('admin-payouts-container'),
  });
});

router.get('/profile', (req, res) => {
  page(req, res, {
    title: (s) => s.profile.title,
    scriptSrc: '/profilePage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('profile-container'),
  });
});

router.get('/profile/delete-account', (req, res) => {
  page(req, res, {
    title: (s) => s.delete_account.title,
    scriptSrc: '/deleteAccountPage.js',
    requireAuth: true,
    bodyHtml: () => containerBody('delete-account-container'),
  });
});

export default router;
