import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getEmrAccessErrorResponse, validateDoctorEmrAccess } from "@/lib/emr/access";
import { recordPrescriptionAudit } from "@/lib/emr/auditService";
import { getPrescriptionRecord, type EmrFollowUpAppointmentSummary } from "@/lib/emr";

function toPositiveInt(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed;
}

function toIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const session = await getSession();
    const { appointmentId: appointmentIdParam } = await params;
    const appointmentId = Number(appointmentIdParam);
    const body = (await request.json()) as {
      prescription_id?: number;
      follow_up_appointment_id?: number;
    };

    const prescriptionId = toPositiveInt(body.prescription_id, "prescription_id");
    const followUpAppointmentId = toPositiveInt(
      body.follow_up_appointment_id,
      "follow_up_appointment_id"
    );

    const prescription = await prisma.$queryRaw<
      Array<{ id: number; doctor_id: number; patient_id: number; appointment_id: number | null; clinic_id: number | null; next_visit_date: Date | null }>
    >`
      SELECT id, doctor_id, patient_id, appointment_id, clinic_id, next_visit_date
      FROM prescriptions
      WHERE id = ${prescriptionId}
        AND is_deleted = 0
      LIMIT 1
    `;

    const basePrescription = prescription[0];
    if (!basePrescription) {
      return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    }

    const scope = await validateDoctorEmrAccess({
      session,
      doctorId: basePrescription.doctor_id,
      patientId: basePrescription.patient_id,
      appointmentId,
      clinicId: basePrescription.clinic_id,
      accessMode: "write",
    });

    if (basePrescription.appointment_id !== scope.appointmentId) {
      return NextResponse.json(
        { error: "Prescription does not belong to the current appointment." },
        { status: 403 }
      );
    }

    const followUpAppointment = await prisma.appointment.findUnique({
      where: { appointment_id: followUpAppointmentId },
      select: {
        appointment_id: true,
        doctor_id: true,
        patient_id: true,
        clinic_id: true,
        appointment_date: true,
        start_time: true,
        status: true,
        clinic: {
          select: {
            clinic_name: true,
          },
        },
      },
    });

    if (!followUpAppointment) {
      return NextResponse.json(
        { error: "Follow-up appointment not found." },
        { status: 404 }
      );
    }

    if (
      followUpAppointment.doctor_id !== scope.doctorId ||
      followUpAppointment.patient_id !== scope.patientId
    ) {
      return NextResponse.json(
        { error: "Follow-up appointment does not belong to this doctor-patient context." },
        { status: 403 }
      );
    }

    if (
      basePrescription.next_visit_date &&
      toIsoDate(basePrescription.next_visit_date) !== toIsoDate(followUpAppointment.appointment_date)
    ) {
      return NextResponse.json(
        { error: "Follow-up appointment date does not match the prescription next visit date." },
        { status: 400 }
      );
    }

    if (followUpAppointment.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cancelled appointments cannot be linked as follow-up appointments." },
        { status: 400 }
      );
    }

    const followUpSummary: EmrFollowUpAppointmentSummary = {
      appointment_id: followUpAppointment.appointment_id,
      date: toIsoDate(followUpAppointment.appointment_date) ?? "",
      slot_time: followUpAppointment.start_time
        ? `${String(followUpAppointment.start_time.getUTCHours()).padStart(2, "0")}:${String(
            followUpAppointment.start_time.getUTCMinutes()
          ).padStart(2, "0")}`
        : "",
      clinic_id: followUpAppointment.clinic_id ?? null,
      clinic_name: followUpAppointment.clinic?.clinic_name ?? null,
    };

    if (!followUpSummary.date || !followUpSummary.slot_time) {
      return NextResponse.json(
        { error: "Follow-up appointment is missing slot details." },
        { status: 400 }
      );
    }

    await recordPrescriptionAudit({
      action: "booked follow-up appointment",
      doctorId: scope.doctorId,
      patientId: scope.patientId,
      prescriptionId,
      entityType: "appointment",
      entityId: followUpSummary.appointment_id,
      newValue: {
        follow_up_appointment_id: followUpSummary.appointment_id,
        follow_up_date: followUpSummary.date,
        slot_time: followUpSummary.slot_time,
        clinic_id: followUpSummary.clinic_id,
        clinic_name: followUpSummary.clinic_name,
      },
    });

    const updatedPrescription = await getPrescriptionRecord(prescriptionId, scope.doctorId);
    return NextResponse.json({
      follow_up_appointment:
        updatedPrescription?.follow_up_appointment ?? followUpSummary,
    });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    return NextResponse.json(accessResponse.body, { status: accessResponse.status });
  }
}
