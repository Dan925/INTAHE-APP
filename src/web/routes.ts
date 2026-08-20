import path from 'node:path';
import express, { Router } from 'express';
import { renderPage } from './layout';

const router = Router();

router.use(express.static(path.join(__dirname, '../../public')));

router.get(
  '/discover',
  (_req, res) => {
    res.type('html').send(
      renderPage({
        title: 'Découvrir des événements — Intahe',
        scriptSrc: '/discover.js',
        bodyHtml: `
    <h1>Découvrir des événements</h1>
    <p class="text-secondary">Trouve des événements près de chez toi.</p>
    <div class="row" style="margin-bottom: 16px;">
      <button id="locate-btn" type="button">Utiliser ma position</button>
    </div>
    <div id="status"></div>
    <div id="results"></div>`,
      }),
    );
  },
);

router.get(
  '/events/:eventId',
  (_req, res) => {
    res.type('html').send(
      renderPage({
        title: 'Événement — Intahe',
        scriptSrc: '/event.js',
        bodyHtml: `
    <div id="event-container">
      <div class="loader">Chargement…</div>
    </div>`,
      }),
    );
  },
);

router.get(
  '/events/:eventId/orders/:orderId/tickets',
  (_req, res) => {
    res.type('html').send(
      renderPage({
        title: 'Mes billets — Intahe',
        scriptSrc: '/tickets.js',
        bodyHtml: `
    <div id="tickets-container">
      <div class="loader">Chargement…</div>
    </div>`,
      }),
    );
  },
);

export default router;
