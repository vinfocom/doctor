import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  deletePrescription,
  getPrescriptionDetail,
  getPrescriptionErrorResponse,
  parseRequiredId,
  updatePrescriptionStatus,
} from "@/lib/prescriptions";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const prescriptionId = parseRequiredId(id, "prescription id");
    const patientId = parseRequiredId(searchParams.get("patient_id"), "patient_id");
    const doctorId = parseRequiredId(searchParams.get("doctor_id"), "doctor_id");

    const prescription = await getPrescriptionDetail({
      session,
      prescriptionId,
      patientId,
      doctorId,
    });

    return NextResponse.json({ prescription });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { id } = await context.params;
    const body = await req.json();
    const prescriptionId = parseRequiredId(id, "prescription id");
    const patientId = parseRequiredId(body?.patient_id, "patient_id");
    const doctorId = parseRequiredId(body?.doctor_id, "doctor_id");
    const nextStatus = String(body?.status || "").toUpperCase();

    if (nextStatus !== "ACTIVE" && nextStatus !== "ARCHIVED" && nextStatus !== "DELETED") {
      return NextResponse.json(
        { error: "Invalid status. Allowed: ACTIVE, ARCHIVED, DELETED." },
        { status: 400 }
      );
    }

    const prescription = await updatePrescriptionStatus({
      session,
      prescriptionId,
      patientId,
      doctorId,
      status: nextStatus,
      note: body?.note,
    });

    return NextResponse.json({ prescription });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const prescriptionId = parseRequiredId(id, "prescription id");
    const patientId = parseRequiredId(searchParams.get("patient_id"), "patient_id");
    const doctorId = parseRequiredId(searchParams.get("doctor_id"), "doctor_id");

    const prescription = await deletePrescription({
      session,
      prescriptionId,
      patientId,
      doctorId,
    });

    return NextResponse.json({ prescription });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
