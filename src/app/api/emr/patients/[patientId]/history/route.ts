import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getEmrAccessErrorResponse,
  getPrescriptionRecord,
  listPrescriptionHistory,
  type EmrNamedItemPayload,
  type EmrClinicalHistoryPayload,
  type EmrPrescriptionHistoryItem,
} from "@/lib/emr";

export const dynamic = "force-dynamic";

type HistoryGroup = {
  date: string;
  items: EmrPatientHistoryItem[];
};

type EmrPatientHistoryItem = EmrPrescriptionHistoryItem & {
  clinical_history: EmrClinicalHistoryPayload[];
  complaints: EmrNamedItemPayload[];
  diagnosis: EmrNamedItemPayload[];
};

function groupHistoryByDate(items: EmrPatientHistoryItem[]): HistoryGroup[] {
  const groups = new Map<string, EmrPatientHistoryItem[]>();

  items.forEach((item) => {
    const dateKey = item.visit_date.slice(0, 10);
    const existing = groups.get(dateKey) ?? [];
    existing.push(item);
    groups.set(dateKey, existing);
  });

  return Array.from(groups.entries()).map(([date, groupedItems]) => ({
    date,
    items: groupedItems,
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { patientId: patientIdParam } = await params;
    const patientId = Number(patientIdParam);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    const doctor = await prisma.doctors.findUnique({
      where: { user_id: session.userId },
      select: { doctor_id: true, admin_id: true },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
    }

    const patient = await prisma.patients.findUnique({
      where: { patient_id: patientId },
      select: {
        patient_id: true,
        full_name: true,
        age: true,
        gender: true,
        phone: true,
        admin_id: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    if (patient.admin_id !== doctor.admin_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hasDoctorAccess = await prisma.appointment.findFirst({
      where: {
        patient_id: patientId,
        doctor_id: doctor.doctor_id,
      },
      select: { appointment_id: true },
    });

    const isDirectPatient = await prisma.patients.findFirst({
      where: {
        patient_id: patientId,
        doctor_id: doctor.doctor_id,
      },
      select: { patient_id: true },
    });

    if (!hasDoctorAccess && !isDirectPatient) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const history = await listPrescriptionHistory(doctor.doctor_id, patientId);
    const finalHistory = history
      .filter((item) => item.status === "final")
      .sort((left, right) => {
        const leftTime = new Date(left.finalized_at ?? left.updated_at).getTime();
        const rightTime = new Date(right.finalized_at ?? right.updated_at).getTime();
        return rightTime - leftTime;
      });

    const historyWithClinicalHistory = await Promise.all(
      finalHistory.map(async (item) => {
        const record = await getPrescriptionRecord(item.id, doctor.doctor_id);
        return {
          ...item,
          clinical_history: record?.clinical_history ?? [],
          complaints: record?.complaints ?? [],
          diagnosis: record?.diagnosis ?? [],
        };
      })
    );

    return NextResponse.json(
      {
        patient,
        history: groupHistoryByDate(historyWithClinicalHistory),
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
