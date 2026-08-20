import { NextRequest, NextResponse } from "next/server";
import {
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";
import { cancelDraftPrescription } from "@/lib/emr/prescriptionService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ visitId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    const scope = await resolveHmsDoctorVisitEmrScope(req, visitId);
    const body = (await req.json()) as { prescriptionId?: number; reason?: string | null };
    const prescriptionId = Number(body.prescriptionId);

    if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
      return NextResponse.json({ error: "A valid prescription id is required." }, { status: 400 });
    }

    const cancelled = await cancelDraftPrescription(
      prescriptionId,
      scope.visit.doctor_id,
      body.reason ?? null
    );

    return NextResponse.json({ prescription: cancelled }, { status: 200 });
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
