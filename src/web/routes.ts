import path from 'node:path';
import express, { Router } from 'express';
import { resolveLocale, serverStrings } from './i18n';
import { renderPage } from './layout';
import { privacyPolicyHtml } from './privacyContent';
import { refundPolicyHtml } from './refundContent';

const router = Router();

router.use(express.static(path.join(__dirname, '../../public')));

router.get(
  '/discover',
  (req, res) => {
    const locale = resolveLocale(req, res);
    const strings = serverStrings[locale];
    res.type('html').send(
      renderPage({
        title: `${strings.discover.title} — Intahe`,
        scriptSrc: '/discover.js',
        locale,
        currentPath: req.path,
        brand: strings.brand,
        toggleLabel: strings.toggle_label,
        footerPrivacyLabel: strings.footer.privacy_link,
        footerRefundLabel: strings.footer.refund_link,
        bodyHtml: `
    <h1>${strings.discover.title}</h1>
    <p class="text-secondary">${strings.discover.intro}</p>
    <div class="row" style="margin-bottom: 16px;">
      <button id="locate-btn" type="button">${strings.discover.use_location}</button>
    </div>
    <div id="status"></div>
    <div id="results"></div>`,
      }),
    );
  },
);

router.get(
  '/events/:eventId',
  (req, res) => {
    const locale = resolveLocale(req, res);
    const strings = serverStrings[locale];
    res.type('html').send(
      renderPage({
        title: strings.event.title,
        scriptSrc: '/event.js',
        locale,
        currentPath: req.path,
        brand: strings.brand,
        toggleLabel: strings.toggle_label,
        footerPrivacyLabel: strings.footer.privacy_link,
        footerRefundLabel: strings.footer.refund_link,
        bodyHtml: `
    <div id="event-container">
      <div class="loader">${strings.event.loading}</div>
    </div>`,
      }),
    );
  },
);

router.get(
  '/events/:eventId/orders/:orderId/tickets',
  (req, res) => {
    const locale = resolveLocale(req, res);
    const strings = serverStrings[locale];
    res.type('html').send(
      renderPage({
        title: strings.tickets.title,
        scriptSrc: '/tickets.js',
        locale,
        currentPath: req.path,
        brand: strings.brand,
        toggleLabel: strings.toggle_label,
        footerPrivacyLabel: strings.footer.privacy_link,
        footerRefundLabel: strings.footer.refund_link,
        bodyHtml: `
    <div id="tickets-container">
      <div class="loader">${strings.tickets.loading}</div>
    </div>`,
      }),
    );
  },
);

router.get(
  '/privacy',
  (req, res) => {
    const locale = resolveLocale(req, res);
    const strings = serverStrings[locale];
    res.type('html').send(
      renderPage({
        title: strings.privacy.title,
        locale,
        currentPath: req.path,
        brand: strings.brand,
        toggleLabel: strings.toggle_label,
        footerPrivacyLabel: strings.footer.privacy_link,
        footerRefundLabel: strings.footer.refund_link,
        bodyHtml: privacyPolicyHtml(locale),
      }),
    );
  },
);

router.get(
  '/refunds',
  (req, res) => {
    const locale = resolveLocale(req, res);
    const strings = serverStrings[locale];
    res.type('html').send(
      renderPage({
        title: strings.refund.title,
        locale,
        currentPath: req.path,
        brand: strings.brand,
        toggleLabel: strings.toggle_label,
        footerPrivacyLabel: strings.footer.privacy_link,
        footerRefundLabel: strings.footer.refund_link,
        bodyHtml: refundPolicyHtml(locale),
      }),
    );
  },
);

export default router;
