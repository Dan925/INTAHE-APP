import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /legal/*', () => {
  const pages: Array<{ path: string; heading: string }> = [
    { path: '/legal/terms', heading: 'Terms of Use' },
    { path: '/legal/organizer-terms', heading: 'Organizer Terms' },
    { path: '/legal/refund-policy', heading: 'Refund policy' },
    { path: '/legal/privacy', heading: 'Privacy policy' },
    { path: '/legal/acceptable-use', heading: 'Acceptable Use Policy' },
  ];

  it.each(pages)('renders $path with a title, effective date, table of contents, and anchored sections', async ({ path, heading }) => {
    const res = await request(app).get(path).set('Accept-Language', 'en');

    expect(res.status).toBe(200);
    expect(res.text).toContain(`<h1>${heading}</h1>`);
    expect(res.text).toContain('Effective:');
    expect(res.text).toContain('class="legal-toc"');
    // Every table-of-contents entry must link to a real anchored section.
    const tocLinks = [...res.text.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
    expect(tocLinks.length).toBeGreaterThan(0);
    for (const anchor of tocLinks) {
      expect(res.text).toContain(`id="${anchor}"`);
    }
  });

  it('shows no draft banner on any of the 5 documents (isDraft: false — review is being handled directly by the founder)', async () => {
    for (const { path } of pages) {
      const res = await request(app).get(path);
      expect(res.text).not.toContain('legal-draft-banner');
    }
  });

  it('renders in French by default', async () => {
    const res = await request(app).get('/legal/terms');
    expect(res.text).toContain("Conditions d'utilisation");
  });
});

describe('old legal page paths redirect to /legal/*', () => {
  it.each([
    ['/terms', '/legal/terms'],
    ['/privacy', '/legal/privacy'],
    ['/refunds', '/legal/refund-policy'],
  ])('%s redirects (301) to %s', async (oldPath, newPath) => {
    const res = await request(app).get(oldPath);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(newPath);
  });
});
