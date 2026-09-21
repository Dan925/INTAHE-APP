import { getReaderConnectionTokenSecret } from '@/lib/quickSales';

/**
 * StripeTerminalProvider's tokenProvider is a single global function with
 * no per-call arguments — it has no way to know which organization a
 * connection token should be scoped to. The Quick Sale reader screen sets
 * this before it does anything that might trigger a (re)connection
 * (discoverReaders, connectReader, or the SDK's own automatic reconnect),
 * and clears it on unmount so a stale organization/token never leaks into a
 * later screen.
 */
const terminalSession: { token: string | null; organizationId: string | null } = {
  token: null,
  organizationId: null,
};

export function setTerminalSession(token: string | null, organizationId: string | null): void {
  terminalSession.token = token;
  terminalSession.organizationId = organizationId;
}

export async function terminalTokenProvider(): Promise<string> {
  if (!terminalSession.token || !terminalSession.organizationId) {
    throw new Error('No organization is set up to take a Quick Sale reader payment right now.');
  }
  const result = await getReaderConnectionTokenSecret(terminalSession.token, terminalSession.organizationId);
  return result.secret;
}
