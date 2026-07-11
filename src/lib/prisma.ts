import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  buildPrisma: PrismaClient | undefined;
  buildPrismaDisconnectTimer: NodeJS.Timeout | undefined;
};

const isNextBuildProcess =
  process.env.NEXT_PHASE === "phase-production-build" ||
  (process.argv.some((arg) => /(?:^|[\\/])next(?:\.js)?$/i.test(arg)) &&
    process.argv.includes("build"));
const BUILD_DISCONNECT_IDLE_MS = 1_000;

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  const parsed = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false }, // Aiven uses self-signed certs
    connectTimeout: 10_000,
    acquireTimeout: 15_000,
    connectionLimit: 5, // Allow a few connections per warm instance
  });

  return new PrismaClient({ adapter });
}

function clearBuildPrismaDisconnectTimer() {
  if (!globalForPrisma.buildPrismaDisconnectTimer) {
    return;
  }

  clearTimeout(globalForPrisma.buildPrismaDisconnectTimer);
  globalForPrisma.buildPrismaDisconnectTimer = undefined;
}

function scheduleBuildPrismaDisconnect() {
  clearBuildPrismaDisconnectTimer();

  const timer = setTimeout(() => {
    const client = globalForPrisma.buildPrisma;
    globalForPrisma.buildPrisma = undefined;
    globalForPrisma.buildPrismaDisconnectTimer = undefined;
    void client?.$disconnect().catch(() => undefined);
  }, BUILD_DISCONNECT_IDLE_MS);

  timer.unref?.();
  globalForPrisma.buildPrismaDisconnectTimer = timer;
}

export function resetPrismaClient() {
  clearBuildPrismaDisconnectTimer();
  const buildClient = globalForPrisma.buildPrisma;
  globalForPrisma.buildPrisma = undefined;
  const client = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  return Promise.allSettled([
    buildClient?.$disconnect().catch(() => undefined),
    client?.$disconnect().catch(() => undefined),
  ]).then(() => undefined);
}

function createBuildPrismaClient() {
  const client = createPrismaClient();
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } finally {
          scheduleBuildPrismaDisconnect();
        }
      },
    },
  }) as PrismaClient;
}

function getBuildPrismaClient() {
  clearBuildPrismaDisconnectTimer();

  if (!globalForPrisma.buildPrisma) {
    globalForPrisma.buildPrisma = createBuildPrismaClient();
  }

  return globalForPrisma.buildPrisma;
}

function getRuntimePrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

const prisma = isNextBuildProcess
  ? getBuildPrismaClient()
  : getRuntimePrismaClient();

export default prisma;
