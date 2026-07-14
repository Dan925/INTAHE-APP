import request from 'supertest';
import type { Express } from 'express';

export interface TestUser {
  accessToken: string;
  userId: string;
  email: string;
}

let counter = 0;

export async function signupTestUser(app: Express, overrides: Partial<{ email: string; full_name: string }> = {}): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${Date.now()}@example.com`;
  const res = await request(app).post('/v1/auth/signup').send({
    email,
    password: 'correcthorsebattery',
    full_name: overrides.full_name ?? 'Test User',
  });
  if (res.status !== 201) {
    throw new Error(`Signup failed in test helper: ${JSON.stringify(res.body)}`);
  }
  return { accessToken: res.body.access_token, userId: res.body.user.id, email };
}
