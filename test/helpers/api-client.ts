/**
 * @file api-client.ts
 * @description HTTP API Gateway client for Black-Box E2E testing with SIWE authentication and session token caching.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { ANVIL_TEST_WALLETS, type TestWallet } from './test-wallets';

export interface ApiClientOptions {
  baseUrl?: string;
  defaultWallet?: TestWallet;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  cookies?: string[];
  expiresAt: number;
}

export class ApiClient {
  public readonly baseUrl: string;
  private currentWallet: TestWallet;
  private static readonly sessionCache = new Map<string, AuthSession>();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.API_GATEWAY_URL || 'http://localhost:4000';
    this.currentWallet = options.defaultWallet || ANVIL_TEST_WALLETS.traderAlice;
  }

  /**
   * Sets the active test wallet for subsequent requests.
   */
  setWallet(wallet: TestWallet): this {
    this.currentWallet = wallet;
    return this;
  }

  /**
   * Clears the cached session tokens (useful for testing logout or session expiration).
   */
  static clearSessionCache(): void {
    ApiClient.sessionCache.clear();
  }

  /**
   * Performs SIWE authentication or returns cached session tokens for the current wallet.
   */
  async getAuthSession(wallet: TestWallet = this.currentWallet): Promise<AuthSession> {
    const cached = ApiClient.sessionCache.get(wallet.address.toLowerCase());
    if (cached && Date.now() < cached.expiresAt - 5000) {
      return cached;
    }

    const account = privateKeyToAccount(wallet.privateKey);

    // 1. Fetch SIWE Nonce
    const nonceRes = await fetch(
      `${this.baseUrl}/api/v1/auth/nonce?walletAddress=${account.address}`,
      { method: 'GET' },
    );

    if (!nonceRes.ok) {
      throw new Error(`Failed to get nonce for ${account.address}: ${nonceRes.statusText}`);
    }

    const { nonce } = (await nonceRes.json()) as { nonce: string };

    // 2. Create EIP-4361 SIWE message
    const domain = new URL(this.baseUrl).host;
    const message = createSiweMessage({
      domain,
      address: account.address,
      statement: 'Sign in to Ether-Trade',
      uri: this.baseUrl,
      version: '1',
      chainId: 31337,
      nonce,
      issuedAt: new Date(),
    });

    // 3. Cryptographically sign message
    const signature = await account.signMessage({ message });

    // 4. Verify SIWE on API Gateway
    const verifyRes = await fetch(`${this.baseUrl}/api/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, signature }),
    });

    if (!verifyRes.ok) {
      const errorBody = await verifyRes.text();
      throw new Error(`Failed to verify SIWE: ${verifyRes.status} ${errorBody}`);
    }

    const setCookieHeaders = verifyRes.headers.getSetCookie?.() || [];
    const authData = (await verifyRes.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn?: number;
    };

    const session: AuthSession = {
      accessToken: authData.accessToken,
      refreshToken: authData.refreshToken,
      cookies: setCookieHeaders,
      expiresAt: Date.now() + (authData.expiresIn ? authData.expiresIn * 1000 : 3600 * 1000),
    };

    ApiClient.sessionCache.set(wallet.address.toLowerCase(), session);
    return session;
  }

  /**
   * Helper for authorized HTTP requests to API Gateway.
   */
  async request<T>(
    endpoint: string,
    options: RequestInit & { requireAuth?: boolean; wallet?: TestWallet } = {},
  ): Promise<{ status: number; body: T; headers: Headers }> {
    const {
      requireAuth = true,
      wallet = this.currentWallet,
      headers: customHeaders,
      ...restOptions
    } = options;

    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type') && restOptions.body) {
      headers.set('Content-Type', 'application/json');
    }

    if (requireAuth) {
      const session = await this.getAuthSession(wallet);
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...restOptions,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const body: unknown = contentType.includes('application/json')
      ? await res.json()
      : await res.text();

    return {
      status: res.status,
      body: body as T,
      headers: res.headers,
    };
  }
}
