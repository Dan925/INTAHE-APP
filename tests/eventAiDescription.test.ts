import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { generateEventDescription } from '../src/services/ai/eventDescriptionService';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';

jest.mock('../src/services/ai/eventDescriptionService');

const mockGenerate = generateEventDescription as jest.MockedFunction<typeof generateEventDescription>;

const app = createApp();

async function createOrg(owner: Awaited<ReturnType<typeof signupTestUser>>) {
  const res = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: 'Acme Events', accept_terms: true, accept_organizer_terms: true });
  return res.body.organization as { id: string };
}

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/organizations/:organizationId/events/ai-description', () => {
  it('generates a description and does not require an existing event', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    mockGenerate.mockResolvedValueOnce('A wonderful evening of music and community.');

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events/ai-description`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ event_name: 'Summer Festival', tone: 'festive', locale: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('A wonderful evening of music and community.');
    expect(mockGenerate).toHaveBeenCalledWith({
      eventName: 'Summer Festival',
      tone: 'festive',
      locale: 'en',
      currentDescription: undefined,
      customInstructions: undefined,
    });
  });

  it('forbids a non-admin (volunteer) from generating a description', async () => {
    const owner = await signupTestUser(app);
    const volunteer = await signupTestUser(app);
    const org = await createOrg(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'volunteer', now())`,
      [org.id, volunteer.userId],
    );

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events/ai-description`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`)
      .send({ event_name: 'Summer Festival', tone: 'festive', locale: 'en' });

    expect(res.status).toBe(403);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('surfaces a 503 when the AI service is not configured, without a raw stack trace', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    const { ApiError } = jest.requireActual('../src/utils/errors');
    mockGenerate.mockRejectedValueOnce(new ApiError(503, 'ai_not_configured', 'AI text generation is not configured on this server yet.', null));

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events/ai-description`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ event_name: 'Summer Festival', tone: 'festive', locale: 'en' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_not_configured');
  });
});

describe('description_ai_generated persists through create/update', () => {
  it('is stored when set on create, and can be updated alongside a new description', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    const createRes = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Summer Festival',
        description: 'AI-written description.',
        description_ai_generated: true,
        start_at: '2026-08-01T18:00:00.000Z',
        end_at: '2026-08-01T23:00:00.000Z',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.event.description_ai_generated).toBe(true);

    const updateRes = await request(app)
      .patch(`/v1/organizations/${org.id}/events/${createRes.body.event.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ description: 'Hand-written now.', description_ai_generated: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.event.description_ai_generated).toBe(false);
  });
});
