import { Resend } from 'resend';
import { env } from '../../config/env';

const PLACEHOLDER_KEY = 're_placeholder';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Order confirmations and password resets fire from many code paths (most
 * of the test suite touches at least one of them indirectly via the
 * checkout webhook). Skipping the real network call whenever
 * RESEND_API_KEY is still the placeholder — checked fresh on every call,
 * not cached — means every one of those call sites, existing and future,
 * gets safe/offline behavior for free instead of needing its own mock.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (env.RESEND_API_KEY === PLACEHOLDER_KEY) {
    console.log(`[email] (RESEND_API_KEY not configured) would send "${input.subject}" to ${input.to}`);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}
