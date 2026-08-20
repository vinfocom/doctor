import { NextRequest, NextResponse } from "next/server";
import {
  buildHmsDraftResponse,
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";
import {
  computeDraftWarnings,
  createPrescriptionRevisionDraft,
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
    const body = (await req.json()) as {
      sourcePrescriptionId?: number;
      editReason?: string | null;
    };
    const sourcePrescriptionId = Number(body.sourcePrescriptionId);
    const editReason = body.editReason?.trim() ?? "";

    if (!Number.isInteger(sourcePrescriptionId) || sourcePrescriptionId <= 0) {
      return NextResponse.json({ error: "A valid source prescription id is required." }, { status: 400 });
    }
    if (!editReason) {
      return NextResponse.json({ error: "Edit reason is required." }, { status: 400 });
    }

    const source = await getPrescriptionRecord(sourcePrescriptionId, scope.visit.doctor_id);
    if (!source || source.patient_id !== scope.visit.patient_id || source.status !== "final") {
      return NextResponse.json({ error: "Only finalized prescriptions for this patient can be revised." }, { status: 400 });
    }

    const draft = await createPrescriptionRevisionDraft({
      sourcePrescriptionId,
      doctorId: scope.visit.doctor_id,
      patientId: scope.visit.patient_id,
      visitId: scope.visit.visit_id,
      clinicId: null,
      visitDate: scope.visit.visit_date,
      timezone: "Asia/Kolkata",
      editReason,
    });

    if (!draft) {
      return NextResponse.json({ error: "Failed to create revision draft." }, { status: 500 });
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
