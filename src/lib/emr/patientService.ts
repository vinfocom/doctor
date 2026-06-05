import prisma from "@/lib/prisma";
import {
  getPrescriptionRecord,
} from "@/lib/emr/prescriptionService";
import type {
  EmrPatientPrescriptionDetail,
  EmrPatientPrescriptionSummary,
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
  doctor_name: string | null;
  clinic_name: string | null;
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
