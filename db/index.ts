import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Database = NeonHttpDatabase<typeof schema>;

/**
 * `neon('')` throws synchronously, so a well-formed placeholder keeps the
 * driver inert when DATABASE_URL is unset (`next build`, tests). Nothing ever
 * queries it: every caller gates on `dbConfigured()` from lib/env.ts first.
 */
const PLACEHOLDER_URL = 'postgresql://placeholder@localhost/no_database_configured';

let instance: Database | null = null;

function connect(): Database {
  if (!instance) {
    // Read at first use, not at import time: the URL is a secret and Next.js
    // evaluates modules during the build, where no database exists.
    instance = drizzle(neon(process.env.DATABASE_URL?.trim() || PLACEHOLDER_URL), { schema });
  }
  return instance;
}

/**
 * The Drizzle client. Constructed lazily on first property access and cached
 * for the life of the process; the driver itself only opens a connection when
 * a query runs.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = connect();
    const value: unknown = Reflect.get(real, property, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, property) {
    return property in connect();
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(connect()) as object | null;
  },
});

export { schema };

/**
 * Postgres SQLSTATE of a failure, unwrapped from drizzle-orm's
 * `DrizzleQueryError` (`cause`) or read directly off a driver error.
 */
export function pgErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** True for a `unique_violation` (23505): a duplicate reference, provider ref or notification key. */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505';
}
