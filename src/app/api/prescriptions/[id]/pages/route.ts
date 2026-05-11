import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getPrescriptionErrorResponse,
  parseRequiredId,
  uploadPrescriptionPages,
} from "@/lib/prescriptions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { id } = await context.params;
    const formData = await req.formData();
    const prescriptionId = parseRequiredId(id, "prescription id");
    const patientId = parseRequiredId(formData.get("patient_id"), "patient_id");
    const doctorId = parseRequiredId(formData.get("doctor_id"), "doctor_id");

    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    const fallbackFile = formData.get("file");
    if (files.length === 0 && fallbackFile instanceof File) {
      files.push(fallbackFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No prescription image provided" }, { status: 400 });
    }

    const prescription = await uploadPrescriptionPages({
      session,
      prescriptionId,
      patientId,
      doctorId,
      files,
    });

    return NextResponse.json({ prescription });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
