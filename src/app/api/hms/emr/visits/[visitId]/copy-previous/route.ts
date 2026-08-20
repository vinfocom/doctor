import { NextRequest, NextResponse } from "next/server";
import {
  buildHmsDraftResponse,
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";
import {
  clonePrescriptionAsDraft,
  computeDraftWarnings,
  getPrescriptionRecord,
} from "@/lib/emr/prescriptionService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ visitId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    const scope = await resolveHmsDoctorVisitEmrScope(req, visitId);
    const body = (await req.json()) as { sourcePrescriptionId?: number };
    const sourcePrescriptionId = Number(body.sourcePrescriptionId);

    if (!Number.isInteger(sourcePrescriptionId) || sourcePrescriptionId <= 0) {
      return NextResponse.json({ error: "A valid source prescription id is required." }, { status: 400 });
    }

    const source = await getPrescriptionRecord(sourcePrescriptionId, scope.visit.doctor_id);
    if (!source || source.patient_id !== scope.visit.patient_id || source.status !== "final") {
      return NextResponse.json({ error: "Only finalized prescriptions for this patient can be copied." }, { status: 400 });
    }

    const draft = await clonePrescriptionAsDraft({
      sourcePrescriptionId,
      doctorId: scope.visit.doctor_id,
      patientId: scope.visit.patient_id,
      visitId: scope.visit.visit_id,
      clinicId: null,
      visitDate: scope.visit.visit_date,
      timezone: "Asia/Kolkata",
      copiedFromPrescriptionId: sourcePrescriptionId,
    });

    if (!draft) {
      return NextResponse.json({ error: "Failed to copy the selected prescription." }, { status: 500 });
    }

    return NextResponse.json(
      buildHmsDraftResponse(scope, draft, computeDraftWarnings(draft)),
      { status: 200 }
    );
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
