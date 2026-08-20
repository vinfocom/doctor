export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import {
  buildHmsEmrLayoutScope,
  getHmsEmrLayoutSettings,
  saveHmsEmrLayoutSettings,
} from "@/lib/hms-emr-layout-settings";

function normalizeId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireHospitalAdmin(req: Request) {
  const session = await getHmsSessionFromRequest(req);
  if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
  return session.hospitalContext;
}

export async function GET(req: Request) {
  try {
    const hospital = await requireHospitalAdmin(req);
    if (!hospital) {
      return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
    }

    const url = new URL(req.url);
    const doctorId = normalizeId(url.searchParams.get("doctorId"));
    const [{ settings, defaults, hmsLayout }, scope] = await Promise.all([
      getHmsEmrLayoutSettings({ hospitalId: hospital.hospitalId, doctorId }),
      buildHmsEmrLayoutScope(hospital.hospitalId, doctorId),
    ]);

    return NextResponse.json({ settings, defaults, scope, hms_layout: hmsLayout });
  } catch (error) {
    console.error("Load HMS full EMR layout settings error:", error);
    return NextResponse.json({ error: "Unable to load EMR layout settings." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const hospital = await requireHospitalAdmin(req);
    if (!hospital) {
      return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
    }

    const body = await req.json();
    const saved = await saveHmsEmrLayoutSettings({
      hospitalId: hospital.hospitalId,
      userId: hospital.userId,
      body,
    });

    if (Object.keys(saved.fieldErrors).length > 0) {
      return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors: saved.fieldErrors }, { status: 400 });
    }

    return NextResponse.json({ settings: saved.settings, result: saved.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save EMR layout settings.";
    const status = message.includes("already") || message.includes("selected doctors") ? 409 : 500;
    console.error("Save HMS full EMR layout settings error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
