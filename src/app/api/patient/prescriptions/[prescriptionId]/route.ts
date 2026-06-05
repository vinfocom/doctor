import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getEmrAccessErrorResponse,
  getPatientFinalizedPrescriptionDetail,
  validatePatientFinalPrescriptionAccess,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { prescriptionId: prescriptionIdParam } = await params;
    const prescriptionId = Number(prescriptionIdParam);
    const patientId = session?.patientId ?? session?.userId;

    await validatePatientFinalPrescriptionAccess({
      session,
      patientId,
      prescriptionId,
    });

    const prescription = await getPatientFinalizedPrescriptionDetail({
      patientId: Number(patientId),
      prescriptionId,
    });

    if (!prescription) {
      return NextResponse.json(
        { error: "Prescription not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ prescription }, { status: 200 });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    return NextResponse.json(accessResponse.body, {
      status: accessResponse.status,
    });
  }
}
