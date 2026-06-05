import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getEmrAccessErrorResponse,
  getPrintablePrescriptionData,
  validateDoctorEmrFeatureAccess,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const doctorScope = await validateDoctorEmrFeatureAccess({ session });
    const { prescriptionId: prescriptionIdParam } = await params;
    const prescriptionId = Number(prescriptionIdParam);

    if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
      return NextResponse.json(
        { error: "Invalid prescription id" },
        { status: 400 }
      );
    }

    const printable = await getPrintablePrescriptionData({
      prescriptionId,
      doctorId: doctorScope.doctorId,
    });

    if (!printable) {
      return NextResponse.json(
        { error: "Final prescription not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        printable,
      },
      { status: 200 }
    );
  } catch (error) {
    const response = getEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
