import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  // In development: limit pool to 1 connection so multiple instances
  // (created across hot-reloads) don't exhaust the PostgreSQL connection limit.
  const adapterOptions = { connectionString: process.env.DATABASE_URL };
  if (process.env.NODE_ENV !== 'production') {
    adapterOptions.max = 2;
  }
  const adapter = new PrismaPg(adapterOptions);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

let prisma;

if (process.env.NODE_ENV === 'production') {
  // Production: cache on globalThis to avoid connection pool exhaustion
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  prisma = globalThis.__prisma;
} else {
  // Development: always create a fresh client on module evaluation so that
  // after `prisma generate` (which rewrites src/generated/prisma) the new
  // schema fields are picked up immediately via Turbopack hot-reload —
  // without needing a full server restart.
  prisma = createPrismaClient();
}

export default prisma;
