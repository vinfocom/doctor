import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getEmrAccessErrorResponse,
  listPatientFinalizedPrescriptions,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PATIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const patientId = session.patientId ?? session.userId;

    if (!patientId || !Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prescriptions = await listPatientFinalizedPrescriptions(patientId);
    return NextResponse.json(
      {
        prescriptions,
      },
      { status: 200 }
    );
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    return NextResponse.json(accessResponse.body, {
      status: accessResponse.status,
    });
  }
}
