import { env } from '../src/config/env';
import { sendEmail } from '../src/services/email/emailClient';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('sendEmail', () => {
  const originalKey = env.RESEND_API_KEY;

  afterEach(() => {
    env.RESEND_API_KEY = originalKey;
    mockSend.mockReset();
  });

  it('skips the real Resend API call when RESEND_API_KEY is the placeholder', async () => {
    env.RESEND_API_KEY = 're_placeholder';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendEmail({ to: 'a@example.com', subject: 'Hello', html: '<p>hi</p>' });

    expect(mockSend).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Hello'));
    logSpy.mockRestore();
  });

  it('calls the real Resend API once a key is configured', async () => {
    env.RESEND_API_KEY = 're_test_configured_key';
    mockSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

    await sendEmail({ to: 'a@example.com', subject: 'Hello', html: '<p>hi</p>' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', subject: 'Hello', html: '<p>hi</p>' }),
    );
  });

  it('throws when the Resend API responds with an error', async () => {
    env.RESEND_API_KEY = 're_test_configured_key';
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid domain' } });

    await expect(sendEmail({ to: 'a@example.com', subject: 'Hello', html: '<p>hi</p>' })).rejects.toThrow(
      'invalid domain',
    );
  });
});
