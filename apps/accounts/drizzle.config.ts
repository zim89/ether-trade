import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/accounts/src/database/schema/index.ts',
  out: './apps/accounts/src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/accounts_db',
  },
});
