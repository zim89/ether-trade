import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { UserRole } from '@app/common/constants';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { users, User } from '../database/schema/users.schema';
import { USERS_ERRORS } from './users.constants';

/**
 * Data access repository for the `users` table via Drizzle ORM.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Finds a user by primary key ID.
   *
   * @param id - User UUID
   * @returns User entity or `null` if not found
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

    return result[0] || null;
  }

  /**
   * Finds a user by normalized wallet address.
   *
   * @param walletAddress - EIP-55 checksum normalized address
   * @returns User entity or `null` if not found
   */
  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.walletAddress, walletAddress))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Inserts a new user record.
   *
   * @param walletAddress - Normalized wallet address
   * @param role - Initial user role (defaults to TRADER)
   * @returns The created user record
   */
  async create(walletAddress: string, role: UserRole = UserRole.TRADER): Promise<User> {
    const result = await this.db
      .insert(users)
      .values({
        walletAddress,
        role,
      })
      .returning();

    return result[0];
  }

  /**
   * Finds an existing user or creates a new record.
   * Handles concurrent first-login race conditions gracefully via fallback query.
   *
   * @param walletAddress - Normalized wallet address
   * @param role - Role to assign if creating a new user
   * @returns Object containing the user entity and `isNew` flag
   */
  async findOrCreateByWalletAddress(
    walletAddress: string,
    role: UserRole = UserRole.TRADER,
  ): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.findByWalletAddress(walletAddress);
    if (existing) {
      return { user: existing, isNew: false };
    }

    try {
      const created = await this.create(walletAddress, role);
      return { user: created, isNew: true };
    } catch {
      // Handle potential race condition on concurrent first login
      const fallback = await this.findByWalletAddress(walletAddress);
      if (fallback) {
        return { user: fallback, isNew: false };
      }
      throw new Error(USERS_ERRORS.userCreateFailed(walletAddress));
    }
  }

  /**
   * Updates the role of an existing user.
   *
   * @param id - User UUID
   * @param role - New role to assign
   * @returns Updated user entity, or `null` if user not found
   */
  async updateRole(id: string, role: UserRole): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return result[0] || null;
  }
}
