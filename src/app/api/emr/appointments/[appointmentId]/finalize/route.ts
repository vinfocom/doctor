import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getEmrFeatureErrorResponse } from "@/lib/emrFeatureGate";
import {
  getDoctorSafeErrorMessage,
  logEmrOperationalError,
} from "@/lib/emr";
import {
  EmrAccessError,
  getEmrAccessErrorResponse,
  validateDoctorEmrAccess,
} from "@/lib/emr/access";
import {
  computeDraftWarnings,
  finalizePrescription,
  getOrCreateDraftPrescription,
} from "@/lib/emr/prescriptionService";

export const dynamic = "force-dynamic";

async function loadAppointmentForDraft(appointmentId: number) {
  return prisma.appointment.findFirst({
    where: { appointment_id: appointmentId },
    select: {
      appointment_id: true,
      appointment_date: true,
      start_time: true,
      end_time: true,
      status: true,
      patient_id: true,
      doctor_id: true,
      clinic_id: true,
      patient: {
        select: {
          patient_id: true,
          full_name: true,
          phone: true,
          age: true,
          gender: true,
        },
      },
      clinic: {
        select: {
          clinic_id: true,
          clinic_name: true,
        },
      },
      doctor: {
        select: {
          doctor_id: true,
          doctor_name: true,
        },
      },
    },
  });
}

async function resolveDoctorDraftScope(req: NextRequest, appointmentIdParam: string) {
  const session = await getSessionFromRequest(req);
  const appointmentId = Number(appointmentIdParam);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    throw new EmrAccessError(400, "Invalid appointment id");
  }

  const appointment = await loadAppointmentForDraft(appointmentId);
  if (!appointment || !appointment.patient_id || !appointment.doctor_id) {
    throw new EmrAccessError(
      404,
      "Appointment not found in the current doctor context"
    );
  }

  const scope = await validateDoctorEmrAccess({
    session,
    doctorId: appointment.doctor_id,
    patientId: appointment.patient_id,
    appointmentId: appointment.appointment_id,
    clinicId: appointment.clinic_id,
    accessMode: "write",
  });

  return { appointment, scope };
}

function buildFinalizeResponse(
  appointment: NonNullable<Awaited<ReturnType<typeof loadAppointmentForDraft>>>,
  draft: NonNullable<Awaited<ReturnType<typeof finalizePrescription>>>
) {
  return {
    context: {
      emrModule: "doctor-emr-pad",
      imagePrescriptionModule: "doctor-image-prescriptions",
      featureEnabled: true,
      appointment: {
        appointment_id: appointment.appointment_id,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
      },
      patient: appointment.patient
        ? {
            ...appointment.patient,
            allergies: [],
          }
        : null,
      clinic: appointment.clinic,
      doctor: appointment.doctor,
    },
    draft,
    warnings: computeDraftWarnings(draft),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const { appointment, scope } = await resolveDoctorDraftScope(req, appointmentId);

    const draft = await getOrCreateDraftPrescription({
      doctorId: scope.doctorId,
      patientId: scope.patientId,
      appointmentId: scope.appointmentId,
      clinicId: scope.clinicId,
      visitDate: appointment.appointment_date,
      timezone: "Asia/Kolkata",
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to load EMR draft for finalization" },
        { status: 500 }
      );
    }

    const finalizedDraft = await finalizePrescription(draft.id, scope.doctorId);

    return NextResponse.json(buildFinalizeResponse(appointment, finalizedDraft), {
      status: 200,
    });
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

    logEmrOperationalError("emr-finalize", error);

    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to finalize EMR prescription"
        ),
      },
      { status: 500 }
    );
  }
}
