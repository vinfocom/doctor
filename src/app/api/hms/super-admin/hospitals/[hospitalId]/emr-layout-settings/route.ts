export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import prisma from "@/lib/prisma";
import {
  buildHmsEmrLayoutScope,
  getHmsEmrLayoutSettings,
  saveHmsEmrLayoutSettings,
} from "@/lib/hms-emr-layout-settings";

type RouteContext = {
  params: Promise<{ hospitalId: string }>;
};

function normalizeId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireSuperAdminHospital(req: Request, hospitalIdParam: string) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") return null;

  const hospitalId = normalizeId(hospitalIdParam);
  if (!hospitalId) throw new Error("Valid hospital id is required.");

  const rows = await prisma.$queryRawUnsafe<Array<{ hospital_id: number }>>(
    `
    SELECT hospital_id
    FROM hospitals
    WHERE hospital_id = ?
    LIMIT 1
    `,
    hospitalId
  );

  if (!rows[0]) throw new Error("Hospital was not found.");
  return { session, hospitalId: Number(rows[0].hospital_id) };
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { hospitalId } = await context.params;
    const scope = await requireSuperAdminHospital(req, hospitalId);
    if (!scope) {
      return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
    }

    const url = new URL(req.url);
    const doctorId = normalizeId(url.searchParams.get("doctorId"));
    const [{ settings, defaults, hmsLayout }, layoutScope] = await Promise.all([
      getHmsEmrLayoutSettings({ hospitalId: scope.hospitalId, doctorId }),
      buildHmsEmrLayoutScope(scope.hospitalId, doctorId),
    ]);

    return NextResponse.json({ settings, defaults, scope: layoutScope, hms_layout: hmsLayout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load EMR layout settings.";
    const status = message.includes("not found") ? 404 : message.includes("hospital id") ? 400 : 500;
    console.error("Load HMS Super Admin full EMR layout settings error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const { hospitalId } = await context.params;
    const scope = await requireSuperAdminHospital(req, hospitalId);
    if (!scope) {
      return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
    }

    const body = await req.json();
    const saved = await saveHmsEmrLayoutSettings({
      hospitalId: scope.hospitalId,
      userId: scope.session.userId,
      body,
    });

    if (Object.keys(saved.fieldErrors).length > 0) {
      return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors: saved.fieldErrors }, { status: 400 });
    }

    return NextResponse.json({ settings: saved.settings, result: saved.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save EMR layout settings.";
    const status = message.includes("already") || message.includes("selected doctors") ? 409 : 500;
    console.error("Save HMS Super Admin full EMR layout settings error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
