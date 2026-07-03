import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getEmrAccessErrorResponse,
  getPrintableComplaints,
  listPatientFinalizedPrescriptionsForDoctor,
  signEmrPatientDocumentToken,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

function resolvePublicOrigin(req: NextRequest) {
  const envOrigin =
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();

  if (envOrigin) {
    return envOrigin.replace(/\/+$/, "");
  }

  const forwardedProto = req.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  const host = req.headers.get("host")?.trim();
  if (host) {
    const protocol = req.nextUrl.protocol.replace(/:$/, "") || "https";
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  return req.nextUrl.origin.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PATIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const patientId = session.patientId ?? session.userId;
    const doctorId = Number(req.nextUrl.searchParams.get("doctor_id") || 0);

    if (!patientId || !Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
    }

    const history = await listPatientFinalizedPrescriptionsForDoctor({
      patientId,
      doctorId,
    });

    const publicOrigin = resolvePublicOrigin(req);

    const prescriptions = history.map((item) => {
      const token = signEmrPatientDocumentToken({
        patientId,
        doctorId: item.doctor_id,
        prescriptionId: item.prescription_id,
      });

      const baseUrl = `${publicOrigin}/api/patient/emr-prescriptions/${item.prescription_id}/pdf?token=${encodeURIComponent(token)}`;

      return {
        ...item,
        complaint_summary: getPrintableComplaints(item.complaints).join(", "),
        diagnosis_summary: item.diagnosis.map((entry) => entry.name).filter(Boolean).join(", "),
        view_url: baseUrl,
        download_url: `${baseUrl}&download=1`,
      };
    });

    return NextResponse.json({ prescriptions }, { status: 200 });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    return NextResponse.json(accessResponse.body, {
      status: accessResponse.status,
    });
  }
}
