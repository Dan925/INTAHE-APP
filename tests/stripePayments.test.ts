import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent, retrievePaymentIntent } from '../src/services/stripe/stripePayments';

jest.mock('../src/services/stripe/stripeClient', () => ({
  stripeClient: {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  },
}));

const mockCreate = stripeClient.paymentIntents.create as jest.Mock;
const mockRetrieve = stripeClient.paymentIntents.retrieve as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'pi_test', client_secret: 'secret' });
  mockRetrieve.mockResolvedValue({ id: 'pi_test', client_secret: 'secret' });
});

describe('createPaymentIntent', () => {
  it('creates a direct charge in the connected account context with the application fee', async () => {
    await createPaymentIntent({
      amountCents: 5000,
      currency: 'usd',
      orderId: 'order_1',
      connectedAccountId: 'acct_123',
      applicationFeeCents: 200,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: 'usd', application_fee_amount: 200 }),
      { stripeAccount: 'acct_123' },
    );
  });

  it('creates a plain platform charge with no Connect params when there is no connected account', async () => {
    await createPaymentIntent({ amountCents: 5000, currency: 'usd', orderId: 'order_1' });

    const [params, options] = mockCreate.mock.calls[0];
    expect(params.application_fee_amount).toBeUndefined();
    expect(options.stripeAccount).toBeUndefined();
  });

  it('includes a sanitized statement descriptor suffix when the event name yields one', async () => {
    await createPaymentIntent({
      amountCents: 5000,
      currency: 'usd',
      orderId: 'order_1',
      eventName: 'Soirée Bénéfice',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ statement_descriptor_suffix: 'SOIREE BENEF' }),
      expect.anything(),
    );
  });

  it('omits the statement descriptor suffix when the event name has no usable letters', async () => {
    await createPaymentIntent({ amountCents: 5000, currency: 'usd', orderId: 'order_1', eventName: '2026' });

    const [params] = mockCreate.mock.calls[0];
    expect(params.statement_descriptor_suffix).toBeUndefined();
  });

  it('requests 3D Secure at or above the configured threshold', async () => {
    await createPaymentIntent({ amountCents: 15_000, currency: 'usd', orderId: 'order_1' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_options: { card: { request_three_d_secure: 'any' } },
      }),
      expect.anything(),
    );
  });

  it('leaves 3D Secure to Stripe’s automatic decision below the configured threshold', async () => {
    await createPaymentIntent({ amountCents: 14_999, currency: 'usd', orderId: 'order_1' });

    const [params] = mockCreate.mock.calls[0];
    expect(params.payment_method_options).toBeUndefined();
  });
});

describe('retrievePaymentIntent', () => {
  it('uses the connected account context when one is given', async () => {
    await retrievePaymentIntent('pi_test', 'acct_123');
    expect(mockRetrieve).toHaveBeenCalledWith('pi_test', undefined, { stripeAccount: 'acct_123' });
  });

  it('uses the platform context when no connected account is given', async () => {
    await retrievePaymentIntent('pi_test');
    expect(mockRetrieve).toHaveBeenCalledWith('pi_test', undefined, {});
  });
});
