import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultPrescriptionLayoutSettings,
} from "@/lib/emr/layoutService";
import { resolveEmrDoctorFeatureScope } from "@/lib/emr/doctorFeatureScope";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { getHmsEmrLayoutSettings } from "@/lib/hms-emr-layout-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hmsSession = await getHmsSessionFromRequest(req);
    if (!hmsSession || hmsSession.hospitalContext.role !== "DOCTOR") {
      return NextResponse.json({ error: "HMS doctor access is required." }, { status: 403 });
    }

    const scope = await resolveEmrDoctorFeatureScope({
      req,
      legacySession: null,
    });

    if (scope.source !== "hms") {
      return NextResponse.json({ error: "HMS doctor access is required." }, { status: 403 });
    }

    const { settings, hmsLayout } = await getHmsEmrLayoutSettings({
      hospitalId: hmsSession.hospitalContext.hospitalId,
      doctorId: scope.doctorId,
    });

    return NextResponse.json(
      {
        settings,
        defaults: getDefaultPrescriptionLayoutSettings({
          doctorId: scope.doctorId,
          clinicId: null,
        }),
        hms_layout: hmsLayout,
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("EMR is disabled") ||
        error.message.includes("Only doctors") ||
        error.message.includes("HMS doctor profile"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Load HMS EMR layout settings error:", error);
    return NextResponse.json({ error: "Unable to load HMS EMR layout settings." }, { status: 500 });
  }
}
