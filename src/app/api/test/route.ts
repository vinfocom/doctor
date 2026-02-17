export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "DB connection failed" }, { status: 500 });
  }
}