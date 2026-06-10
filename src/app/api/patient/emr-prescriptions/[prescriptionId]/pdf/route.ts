import { NextRequest, NextResponse } from "next/server";
import {
  generatePatientEmrPrescriptionPdf,
  getEmrAccessErrorResponse,
  getPrintablePrescriptionData,
  verifyEmrPatientDocumentToken,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  try {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyEmrPatientDocumentToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prescriptionId: prescriptionIdParam } = await params;
    const prescriptionId = Number(prescriptionIdParam);
    if (
      !Number.isInteger(prescriptionId) ||
      prescriptionId <= 0 ||
      payload.prescriptionId !== prescriptionId
    ) {
      return NextResponse.json({ error: "Invalid prescription id" }, { status: 400 });
    }

    const printable = await getPrintablePrescriptionData({
      prescriptionId,
      doctorId: payload.doctorId,
    });

    if (
      !printable ||
      printable.prescription.patient_id !== payload.patientId ||
      printable.prescription.doctor_id !== payload.doctorId
    ) {
      return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    }

    const pdfBytes = await generatePatientEmrPrescriptionPdf(printable);
    const filename = `prescription_${printable.prescription.prescription_no || printable.prescription.id}.pdf`;
    const asDownload = req.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    return NextResponse.json(accessResponse.body, {
      status: accessResponse.status,
    });
  }
}
