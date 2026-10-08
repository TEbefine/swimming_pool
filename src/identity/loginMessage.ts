import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { getAddress } from 'viem';
export const LOGIN_STATEMENT = 'Sign in to Lumen Bay. This does not send a transaction or grant access to funds.';
export function validateLoginMessage(message: string, address: string, origin: string, now: number) {
  const invalid = () => new Error('The sign-in request did not match this identity or website.');
  if (message.length > 2048) throw invalid();
  const parsed = parseSiweMessage(message);
  const url = new URL(origin);
  if (parsed.address?.toLowerCase() !== address || parsed.domain !== url.host || parsed.scheme !== url.protocol.slice(0, -1) ||
    parsed.uri !== origin || parsed.version !== '1' || parsed.chainId !== 80002 || parsed.statement !== LOGIN_STATEMENT ||
    !parsed.nonce || !/^[0-9a-f]{64}$/.test(parsed.nonce) || !parsed.issuedAt || !parsed.expirationTime ||
    parsed.issuedAt.getTime() > now + 30_000 || parsed.expirationTime.getTime() <= now ||
    parsed.expirationTime.getTime() - parsed.issuedAt.getTime() !== 300_000 || parsed.notBefore || parsed.resources?.length || parsed.requestId) throw invalid();
  const expected = createSiweMessage({ address: getAddress(address), domain: url.host, scheme: url.protocol.slice(0, -1), uri: origin,
    version: '1', chainId: 80002, statement: LOGIN_STATEMENT, nonce: parsed.nonce, issuedAt: parsed.issuedAt, expirationTime: parsed.expirationTime });
  if (expected !== message) throw invalid();
}
