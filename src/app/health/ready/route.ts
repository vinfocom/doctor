import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATABASE_TIMEOUT_MS = 3_000;
const SLOW_CHECK_MS = 1_000;

export async function GET() {
  const start = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const query = prisma.$queryRaw`SELECT 1`;
    await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Database check timed out after ${DATABASE_TIMEOUT_MS} ms`)),
          DATABASE_TIMEOUT_MS
        );
      }),
    ]);

    const dbMs = Date.now() - start;
    if (dbMs > SLOW_CHECK_MS) {
      console.warn(
        `${new Date().toISOString()} Health readiness check took ${dbMs} ms: exceeded ${SLOW_CHECK_MS} ms`
      );
    }

    return NextResponse.json(
      { status: "ok", dbMs },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const dbMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `${new Date().toISOString()} Health readiness check failed after ${dbMs} ms: ${message}`
    );

    return NextResponse.json(
      { status: "error", dbMs },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
