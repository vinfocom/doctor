import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getEmrFeatureErrorResponse } from "@/lib/emrFeatureGate";
import {
  EmrAccessError,
  cancelDraftPrescription,
  getDoctorSafeErrorMessage,
  getEmrAccessErrorResponse,
  logEmrOperationalError,
  validateDoctorEmrAccess,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

async function loadAppointmentForCancel(appointmentId: number) {
  return prisma.appointment.findFirst({
    where: { appointment_id: appointmentId },
    select: {
      appointment_id: true,
      patient_id: true,
      doctor_id: true,
      clinic_id: true,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const session = await getSessionFromRequest(req);
    const parsedAppointmentId = Number(appointmentId);

    if (!Number.isInteger(parsedAppointmentId) || parsedAppointmentId <= 0) {
      throw new EmrAccessError(400, "Invalid appointment id");
    }

    const appointment = await loadAppointmentForCancel(parsedAppointmentId);
    if (!appointment?.patient_id || !appointment.doctor_id) {
      throw new EmrAccessError(404, "Appointment not found");
    }

    const scope = await validateDoctorEmrAccess({
      session,
      doctorId: appointment.doctor_id,
      patientId: appointment.patient_id,
      appointmentId: appointment.appointment_id,
      clinicId: appointment.clinic_id,
      accessMode: "write",
    });

    const body = (await req.json()) as { prescriptionId?: number; reason?: string | null };
    const prescriptionId = Number(body.prescriptionId);
    if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
      throw new EmrAccessError(400, "A valid prescription id is required");
    }

    const cancelled = await cancelDraftPrescription(
      prescriptionId,
      scope.doctorId,
      body.reason ?? null
    );

    return NextResponse.json({ prescription: cancelled }, { status: 200 });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    const featureResponse = getEmrFeatureErrorResponse(error);
    if (featureResponse.status !== 500) {
      return NextResponse.json(featureResponse.body, {
        status: featureResponse.status,
      });
    }

    logEmrOperationalError("emr-cancel-draft", error);
    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to cancel prescription draft."
        ),
      },
      { status: 500 }
    );
  }
}
