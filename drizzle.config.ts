import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not load .env.local on its own.
config({ path: '.env.local' });

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
