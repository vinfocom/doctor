import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getEmrFeatureErrorResponse } from "@/lib/emrFeatureGate";
import { getEmrAccessErrorResponse, validateDoctorEmrAccess } from "@/lib/emr/access";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const { appointmentId: appointmentIdParam } = await params;
    const appointment = await prisma.appointment.findFirst({
      where: {
        appointment_id: Number(appointmentIdParam),
      },
      select: {
        appointment_id: true,
        appointment_date: true,
        start_time: true,
        end_time: true,
        status: true,
        booked_for: true,
        doctor_id: true,
        patient_id: true,
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
      },
    });

    if (!appointment || !appointment.patient_id || !appointment.patient) {
      return NextResponse.json(
        { error: "Appointment not found in the current doctor context" },
        { status: 404 }
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

    const doctor = await prisma.doctors.findUnique({
      where: { doctor_id: scope.doctorId },
      select: {
        doctor_id: true,
        doctor_name: true,
      },
    });

    if (!doctor) {
      return NextResponse.json(
        { error: "Doctor profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      emrModule: "doctor-emr-pad",
      imagePrescriptionModule: "doctor-image-prescriptions",
      featureEnabled: true,
      appointment: {
        appointment_id: appointment.appointment_id,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
        booked_for: appointment.booked_for,
      },
      patient: appointment.patient,
      clinic: appointment.clinic,
      doctor: {
        doctor_id: scope.doctorId,
        doctor_name: doctor.doctor_name,
      },
    });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }
    const response = getEmrFeatureErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
