import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  getPrescriptionRecord,
} from "@/lib/emr/prescriptionService";
import type {
  EmrComplaintPayload,
  EmrPatientPrescriptionDetail,
  EmrPatientPrescriptionSummary,
  EmrNamedItemPayload,
} from "@/lib/emr/types";

type PatientPrescriptionRow = {
  id: number;
  patient_id: number;
  doctor_id: number;
  appointment_id: number | null;
  visit_date: Date;
  finalized_at: Date | null;
  pdf_url: string | null;
  version_number: number;
  prescription_no: string;
  doctor_name: string | null;
  clinic_name: string | null;
};

type PatientHistoryNamedRow = {
  prescription_id: number;
  id: number;
  name: string;
  normalized_name: string;
  notes: string | null;
  sort_order: number;
};

type PatientHistoryComplaintRow = {
  prescription_id: number;
  id: number;
  complaint_master_id: number | null;
  name: string;
  normalized_name: string;
  severity: string | null;
  frequency: string | null;
  duration_value: number | null;
  duration_unit: "day" | "week" | "month" | "year" | "custom" | null;
  notes: string | null;
  sort_order: number;
};

export type EmrPatientDoctorPrescriptionHistoryItem = {
  prescription_id: number;
  patient_id: number;
  doctor_id: number;
  appointment_id: number | null;
  prescription_no: string;
  visit_date: string;
  finalized_at: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  pdf_url: string | null;
  version_number: number;
  complaints: EmrComplaintPayload[];
  diagnosis: EmrNamedItemPayload[];
};

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function mapPatientPrescriptionSummary(
  row: PatientPrescriptionRow
): EmrPatientPrescriptionSummary {
  return {
    prescription_id: row.id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    appointment_id: row.appointment_id,
    prescription_no: row.prescription_no,
    visit_date: row.visit_date.toISOString(),
    finalized_at: toIsoString(row.finalized_at),
    doctor_name: row.doctor_name,
    clinic_name: row.clinic_name,
    pdf_url: row.pdf_url,
    version_number: row.version_number,
  };
}

export async function listPatientFinalizedPrescriptions(
  patientId: number
): Promise<EmrPatientPrescriptionSummary[]> {
  const rows = await prisma.$queryRaw<PatientPrescriptionRow[]>`
    SELECT
      p.id,
      p.patient_id,
      p.doctor_id,
      p.appointment_id,
      p.prescription_no,
      p.visit_date,
      p.finalized_at,
      p.pdf_url,
      p.version_number,
      d.doctor_name,
      c.clinic_name
    FROM prescriptions p
    INNER JOIN doctors d ON d.doctor_id = p.doctor_id
    LEFT JOIN clinics c ON c.clinic_id = p.clinic_id
    WHERE p.patient_id = ${patientId}
      AND p.status = 'final'
      AND p.is_deleted = 0
    ORDER BY p.visit_date DESC, p.id DESC
  `;

  return rows.map(mapPatientPrescriptionSummary);
}

export async function getPatientFinalizedPrescriptionDetail(input: {
  patientId: number;
  prescriptionId: number;
}): Promise<EmrPatientPrescriptionDetail | null> {
  const summaryRows = await prisma.$queryRaw<PatientPrescriptionRow[]>`
    SELECT
      p.id,
      p.patient_id,
      p.doctor_id,
      p.appointment_id,
      p.prescription_no,
      p.visit_date,
      p.finalized_at,
      p.pdf_url,
      p.version_number,
      d.doctor_name,
      c.clinic_name
    FROM prescriptions p
    INNER JOIN doctors d ON d.doctor_id = p.doctor_id
    LEFT JOIN clinics c ON c.clinic_id = p.clinic_id
    WHERE p.id = ${input.prescriptionId}
      AND p.patient_id = ${input.patientId}
      AND p.status = 'final'
      AND p.is_deleted = 0
    LIMIT 1
  `;

  const summary = summaryRows[0];
  if (!summary) return null;

  const record = await getPrescriptionRecord(summary.id, summary.doctor_id);
  if (!record || record.status !== "final" || record.patient_id !== input.patientId) {
    return null;
  }

  return {
    prescription_id: record.id,
    patient_id: record.patient_id,
    doctor_id: record.doctor_id,
    appointment_id: record.appointment_id,
    visit_date: record.visit_date,
    finalized_at: record.finalized_at,
    doctor_name: summary.doctor_name,
    clinic_name: summary.clinic_name,
    vitals: record.vitals,
    complaints: record.complaints,
    diagnosis: record.diagnosis,
    medicines: record.medicines,
    advice: record.advice,
    tests_requested: record.tests,
    clinical_history: record.clinical_history ?? [],
    custom_fields: record.custom_fields ?? [],
    next_visit_date: record.next_visit_date,
    follow_up_appointment: record.follow_up_appointment,
    pdf_url: record.pdf_url,
  };
}

export async function listPatientFinalizedPrescriptionsForDoctor(input: {
  patientId: number;
  doctorId: number;
}): Promise<EmrPatientDoctorPrescriptionHistoryItem[]> {
  const rows = await prisma.$queryRaw<PatientPrescriptionRow[]>`
    SELECT
      p.id,
      p.patient_id,
      p.doctor_id,
      p.appointment_id,
      p.prescription_no,
      p.visit_date,
      p.finalized_at,
      p.pdf_url,
      p.version_number,
      d.doctor_name,
      c.clinic_name
    FROM prescriptions p
    INNER JOIN doctors d ON d.doctor_id = p.doctor_id
    LEFT JOIN clinics c ON c.clinic_id = p.clinic_id
    WHERE p.patient_id = ${input.patientId}
      AND p.doctor_id = ${input.doctorId}
      AND p.status = 'final'
      AND p.is_deleted = 0
    ORDER BY COALESCE(p.finalized_at, p.visit_date) DESC, p.id DESC
  `;

  if (rows.length === 0) {
    return [];
  }

  const prescriptionIds = rows.map((row) => row.id);

  const [complaintRows, diagnosisRows] = await Promise.all([
    prisma.$queryRaw<PatientHistoryComplaintRow[]>`
      SELECT
        prescription_id,
        id,
        complaint_master_id,
        complaint_name AS name,
        normalized_name,
        severity,
        frequency,
        duration_value,
        duration_unit,
        notes,
        sort_order
      FROM prescription_complaints
      WHERE prescription_id IN (${Prisma.join(prescriptionIds)})
      ORDER BY prescription_id ASC, sort_order ASC, id ASC
    `,
    prisma.$queryRaw<PatientHistoryNamedRow[]>`
      SELECT
        prescription_id,
        id,
        diagnosis_name AS name,
        normalized_name,
        notes,
        sort_order
      FROM prescription_diagnosis
      WHERE prescription_id IN (${Prisma.join(prescriptionIds)})
      ORDER BY prescription_id ASC, sort_order ASC, id ASC
    `,
  ]);

  const complaintMap = new Map<number, EmrComplaintPayload[]>();
  for (const row of complaintRows) {
    const current = complaintMap.get(row.prescription_id) ?? [];
    current.push({
      id: row.id,
      complaint_master_id: row.complaint_master_id,
      name: row.name,
      normalized_name: row.normalized_name,
      severity: row.severity,
      frequency: row.frequency,
      duration_value: row.duration_value,
      duration_unit: row.duration_unit,
      notes: row.notes,
      sort_order: row.sort_order,
    });
    complaintMap.set(row.prescription_id, current);
  }

  const diagnosisMap = new Map<number, EmrNamedItemPayload[]>();
  for (const row of diagnosisRows) {
    const current = diagnosisMap.get(row.prescription_id) ?? [];
    current.push({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
      notes: row.notes,
      sort_order: row.sort_order,
    });
    diagnosisMap.set(row.prescription_id, current);
  }

  const enriched = rows.map((row) => ({
    prescription_id: row.id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    appointment_id: row.appointment_id,
    prescription_no: row.prescription_no,
    visit_date: row.visit_date.toISOString(),
    finalized_at: toIsoString(row.finalized_at),
    doctor_name: row.doctor_name,
    clinic_name: row.clinic_name,
    pdf_url: row.pdf_url,
    version_number: row.version_number,
    complaints: complaintMap.get(row.id) ?? [],
    diagnosis: diagnosisMap.get(row.id) ?? [],
  } satisfies EmrPatientDoctorPrescriptionHistoryItem));

  return enriched;
}
