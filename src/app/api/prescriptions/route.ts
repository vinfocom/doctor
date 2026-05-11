import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  createPrescriptionWithPages,
  getPrescriptionErrorResponse,
  listPrescriptionsForPatientDoctor,
  parseRequiredId,
} from "@/lib/prescriptions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const { searchParams } = new URL(req.url);
    const patientId = parseRequiredId(searchParams.get("patient_id"), "patient_id");
    const doctorId = parseRequiredId(searchParams.get("doctor_id"), "doctor_id");

    const prescriptions = await listPrescriptionsForPatientDoctor({
      session,
      patientId,
      doctorId,
    });

    return NextResponse.json({ prescriptions });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Prescription creation requires grouped multipart upload. Submit patient, doctor, note, and image pages together.",
        },
        { status: 415 }
      );
    }

    const formData = await req.formData();
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
      return NextResponse.json(
        { error: "No prescription image provided" },
        { status: 400 }
      );
    }

    const prescription = await createPrescriptionWithPages({
      session,
      patientId,
      doctorId,
      clinicId: formData.get("clinic_id"),
      appointmentId: formData.get("appointment_id"),
      note: formData.get("note"),
      files,
    });

    return NextResponse.json({ prescription }, { status: 201 });
  } catch (error) {
    const response = getPrescriptionErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
