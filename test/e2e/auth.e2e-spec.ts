import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { ApiClient, ANVIL_TEST_WALLETS, TestSandbox } from '../helpers';

describe('Authentication Flow (E2E True Black-Box)', () => {
  const baseUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  const apiClient = new ApiClient({ baseUrl });
  const sandbox = new TestSandbox();
  const aliceAccount = privateKeyToAccount(ANVIL_TEST_WALLETS.traderAlice.privateKey);

  beforeEach(() => {
    ApiClient.clearSessionCache();
  });

  afterAll(async () => {
    await sandbox.flushRedis();
  });

  it('should complete SIWE handshake: get nonce -> sign -> verify -> obtain tokens', async () => {
    // 1. Request cryptographic nonce
    const nonceRes = await apiClient.request<{
      nonce: string;
      expiresAt: number;
    }>(`/api/v1/auth/nonce?walletAddress=${aliceAccount.address}`, {
      requireAuth: false,
    });

    expect(nonceRes.status).toBe(200);
    expect(nonceRes.body.nonce).toBeDefined();
    expect(typeof nonceRes.body.nonce).toBe('string');
    expect(nonceRes.body.nonce.length).toBeGreaterThanOrEqual(8);

    const nonce = nonceRes.body.nonce;

    // 2. Build standard EIP-4361 SIWE message
    const domain = new URL(baseUrl).host;
    const message = createSiweMessage({
      domain,
      address: aliceAccount.address,
      statement: 'Sign in to Ether-Trade',
      uri: baseUrl,
      version: '1',
      chainId: 31337,
      nonce,
      issuedAt: new Date(),
    });

    // 3. Cryptographically sign message with Alice private key
    const signature = await aliceAccount.signMessage({ message });

    // 4. Verify SIWE signature on API Gateway
    const verifyRes = await apiClient.request<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        walletAddress: string;
        role: string;
      };
    }>('/api/v1/auth/verify', {
      method: 'POST',
      requireAuth: false,
      body: JSON.stringify({ message, signature }),
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.accessToken).toBeDefined();
    expect(verifyRes.body.user.walletAddress.toLowerCase()).toBe(
      aliceAccount.address.toLowerCase(),
    );

    // 5. Query protected profile /auth/me with the issued access token
    const meRes = await apiClient.request<{
      id: string;
      walletAddress: string;
    }>('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${verifyRes.body.accessToken}`,
      },
      requireAuth: false,
    });

    expect(meRes.status).toBe(200);
    expect(meRes.body.walletAddress.toLowerCase()).toBe(aliceAccount.address.toLowerCase());
  });

  it('should reject invalid or tampered SIWE signatures', async () => {
    // 1. Get fresh nonce
    const nonceRes = await apiClient.request<{ nonce: string }>(
      `/api/v1/auth/nonce?walletAddress=${aliceAccount.address}`,
      { requireAuth: false },
    );
    const nonce = nonceRes.body.nonce;

    // 2. Tampered message
    const message = createSiweMessage({
      domain: new URL(baseUrl).host,
      address: aliceAccount.address,
      statement: 'Tampered statement',
      uri: baseUrl,
      version: '1',
      chainId: 31337,
      nonce,
      issuedAt: new Date(),
    });

    // 3. Invalid signature
    const invalidSignature =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1c';

    const verifyRes = await apiClient.request<{ message?: string }>('/api/v1/auth/verify', {
      method: 'POST',
      requireAuth: false,
      body: JSON.stringify({ message, signature: invalidSignature }),
    });

    expect([400, 401]).toContain(verifyRes.status);
  });

  it('should leverage ApiClient session token caching to avoid repeated SIWE handshakes', async () => {
    // First call triggers full SIWE handshake and caches session
    const session1 = await apiClient.getAuthSession(ANVIL_TEST_WALLETS.traderAlice);
    expect(session1.accessToken).toBeDefined();

    // Second call within TTL returns cached session immediately
    const session2 = await apiClient.getAuthSession(ANVIL_TEST_WALLETS.traderAlice);
    expect(session2.accessToken).toBe(session1.accessToken);
  });
});
