import { Injectable, Logger } from '@nestjs/common';
import { generateSiweNonce } from 'viem/siwe';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { AUTH_LOGS } from './auth.constants';
import { GeneratedNonce } from './auth.types';

/**
 * Service responsible for the generation, caching, and single-use consumption
 * of Sign-In with Ethereum (EIP-4361) nonces to prevent replay attacks.
 */
@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);
  private readonly DEFAULT_NONCE_TTL_SECONDS = 300; // 5 minutes

  constructor(
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Generates a cryptographically secure SIWE nonce with a 5-minute TTL.
   *
   * @param walletAddress - Raw or checksummed EVM address (e.g. `0x5aaeb...`)
   */
  async generateNonce(walletAddress: string): Promise<GeneratedNonce> {
    const normalizedAddress = this.usersService.normalizeAddress(walletAddress);
    const nonce = generateSiweNonce();
    const expiresAt = Math.floor(Date.now() / 1000) + this.DEFAULT_NONCE_TTL_SECONDS;

    await this.redisService.setNonce(normalizedAddress, nonce, this.DEFAULT_NONCE_TTL_SECONDS);

    return { nonce, expiresAt };
  }

  /**
   * Atomically validates and consumes a SIWE nonce via Redis `GETDEL` (Replay Attack protection).
   *
   * @param walletAddress - Raw or checksummed EVM address associated with the nonce
   * @param providedNonce - The 8+ char alphanumeric nonce string from the parsed SIWE message
   * @returns `true` if the nonce matched and was successfully consumed, `false` otherwise
   */
  async consumeNonce(walletAddress: string, providedNonce: string): Promise<boolean> {
    const normalizedAddress = this.usersService.normalizeAddress(walletAddress);
    const storedNonce = await this.redisService.getAndDelNonce(normalizedAddress);

    if (!storedNonce) {
      this.logger.warn(AUTH_LOGS.nonceExpired(normalizedAddress));
      return false;
    }

    if (storedNonce !== providedNonce) {
      this.logger.warn(AUTH_LOGS.nonceMismatch(normalizedAddress, storedNonce, providedNonce));
      return false;
    }

    return true;
  }
}
