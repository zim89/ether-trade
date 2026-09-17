import { pgEnum, pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { UserRole } from '@app/common/constants';

export const userRoleEnum = pgEnum('user_role', [UserRole.TRADER, UserRole.ADMIN]);

export const users = pgTable('users', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull().unique(),
  role: userRoleEnum('role').notNull().default(UserRole.TRADER),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
