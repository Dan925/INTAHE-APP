import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { LEGAL_DOCUMENT_VERSIONS } from '../src/legal/registry';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/legal/acceptances', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/v1/legal/acceptances').send({ document_type: 'terms_of_use' });
    expect(res.status).toBe(401);
  });

  it('records an acceptance at the current version, with IP and user agent', async () => {
    const user = await signupTestUser(app);

    const res = await request(app)
      .post('/v1/legal/acceptances')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('User-Agent', 'jest-test-agent')
      .send({ document_type: 'stripe_connected_account_agreement' });

    expect(res.status).toBe(201);
    expect(res.body.document_type).toBe('stripe_connected_account_agreement');
    expect(res.body.document_version).toBe(LEGAL_DOCUMENT_VERSIONS.stripe_connected_account_agreement.version);

    const row = await pool.query(
      `SELECT user_id, document_type, document_version, user_agent, ip_address FROM legal_acceptances WHERE user_id = $1`,
      [user.userId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].document_type).toBe('stripe_connected_account_agreement');
    expect(row.rows[0].user_agent).toBe('jest-test-agent');
    expect(row.rows[0].ip_address).toEqual(expect.any(String));
  });

  it('rejects a document_type not gated by an explicit acceptance action', async () => {
    const user = await signupTestUser(app);

    const res = await request(app)
      .post('/v1/legal/acceptances')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ document_type: 'privacy_policy' });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/legal/acceptances/outstanding', () => {
  it('lists terms_of_use and organizer_terms as outstanding before an organization is ever created', async () => {
    const user = await signupTestUser(app);

    const res = await request(app)
      .get('/v1/legal/acceptances/outstanding')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.outstanding.sort()).toEqual(['organizer_terms', 'terms_of_use']);
  });

  it('is empty once an organization has been created (both accepted together)', async () => {
    const user = await signupTestUser(app);
    await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Events', accept_terms: true, accept_organizer_terms: true });

    const res = await request(app)
      .get('/v1/legal/acceptances/outstanding')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.body.outstanding).toEqual([]);
  });
});
