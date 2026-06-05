import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getEmrFeatureErrorResponse } from "@/lib/emrFeatureGate";
import {
  EmrAccessError,
  getEmrAccessErrorResponse,
  validateDoctorEmrAccess,
} from "@/lib/emr/access";
import { listPrescriptionHistory } from "@/lib/emr/prescriptionService";

export const dynamic = "force-dynamic";

async function loadAppointmentForHistory(appointmentId: number) {
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

function groupHistoryByDate(
  items: Awaited<ReturnType<typeof listPrescriptionHistory>>
) {
  const groups = new Map<
    string,
    {
      date: string;
      items: typeof items;
    }
  >();

  items.forEach((item) => {
    const dateKey = item.visit_date.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        date: dateKey,
        items: [],
      });
    }
    groups.get(dateKey)?.items.push(item);
  });

  return Array.from(groups.values());
}

export async function GET(
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

    const appointment = await loadAppointmentForHistory(parsedAppointmentId);
    if (!appointment?.patient_id || !appointment.doctor_id) {
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
      accessMode: "read",
    });

    const history = await listPrescriptionHistory(scope.doctorId, scope.patientId);

    return NextResponse.json(
      {
        history: groupHistoryByDate(history),
      },
      { status: 200 }
    );
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

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load prescription history",
      },
      { status: 500 }
    );
  }
}
