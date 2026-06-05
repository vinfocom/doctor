import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { recordPrescriptionAuditSafe } from "@/lib/emr/auditService";
import {
  normalizeDisplayName,
  normalizeMasterName,
} from "@/lib/emr/normalization";
import {
  buildPrescriptionNamedItem,
  incrementMasterUsageCount,
} from "@/lib/emr/masterService";
import type {
  EmrCustomFieldValuePayload,
  EmrDraftWarning,
  EmrClinicalHistoryPayload,
  EmrClinicalHistorySection,
  EmrCustomFieldType,
  EmrDraftSavePayload,
  EmrFollowUpAppointmentSummary,
  EmrMedicinePayload,
  EmrNamedItemPayload,
  EmrPrescriptionHistoryItem,
  EmrPrescriptionRecord,
  EmrPrescriptionStatus,
  EmrVitalsPayload,
} from "@/lib/emr/types";

type PrescriptionRow = {
  id: number;
  prescription_no: string;
  doctor_sequence_no: number | null;
  doctor_id: number;
  patient_id: number;
  appointment_id: number | null;
  clinic_id: number | null;
  visit_date: Date;
  next_visit_date: Date | null;
  timezone: string;
  status: EmrPrescriptionStatus;
  pdf_url: string | null;
  finalized_at: Date | null;
  previous_version_id: number | null;
  copied_from_prescription_id: number | null;
  version_number: number;
  edit_reason: string | null;
  is_deleted: boolean | number;
  deleted_at: Date | null;
  deleted_by: number | null;
  last_saved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type VitalsRow = {
  bp: string | null;
  pulse: string | null;
  height: string | null;
  weight: string | null;
  temperature: string | null;
  spo2: string | null;
  bmi: string | null;
};

type NamedRow = {
  id: number;
  master_id: number | null;
  name: string;
  normalized_name: string;
  notes: string | null;
  sort_order: number;
};

type MedicineRow = {
  id: number;
  medicine_master_id: number | null;
  type: string | null;
  medicine_name: string;
  normalized_name: string;
  salt_composition: string | null;
  strength: string | null;
  dose: string | null;
  timing: string | null;
  frequency: string | null;
  duration_value: number | null;
  duration_unit: "day" | "week" | "month" | "year" | "custom" | null;
  duration_text: string | null;
  notes: string | null;
  sort_order: number;
};

type ClinicalHistoryRow = {
  id: number;
  section: string;
  details: string;
  sort_order: number;
};

type CustomFieldValueRow = {
  id: number;
  field_key: string;
  field_label: string;
  field_type: EmrCustomFieldType;
  field_value: string | null;
  sort_order: number;
};

type FollowUpAuditRow = {
  prescription_id: number;
  entity_id: number | null;
  new_value: unknown;
};

type TxExecutor = Parameters<typeof prisma.$transaction>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
  : typeof prisma;

const EMR_INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

const EMR_CLINICAL_HISTORY_SECTIONS: readonly EmrClinicalHistorySection[] = [
  "examination_findings",
  "investigation_findings",
  "past_medical_history",
  "family_history",
  "surgical_history",
  "treatment_history",
  "allergies",
  "personal_social_history",
];

const EMR_CLINICAL_HISTORY_SECTION_SET = new Set<string>(
  EMR_CLINICAL_HISTORY_SECTIONS
);

const EMR_DOSE_SEPARATOR = " . ";

function toBoolean(value: boolean | number) {
  return value === true || value === 1;
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function normalizeDateInput(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapVitals(row: VitalsRow | undefined): EmrVitalsPayload | null {
  if (!row) return null;
  return {
    bp: row.bp,
    pulse: row.pulse,
    height: row.height,
    weight: row.weight,
    temperature: row.temperature,
    spo2: row.spo2,
    bmi: row.bmi,
  };
}

function mapNamedRows(rows: NamedRow[]): EmrNamedItemPayload[] {
  return rows.map((row) => ({
    id: row.master_id,
    name: row.name,
    normalized_name: row.normalized_name,
    notes: row.notes,
    sort_order: row.sort_order,
  }));
}

function mapMedicineRows(rows: MedicineRow[]): EmrMedicinePayload[] {
  return rows.map((row) => ({
    id: row.id,
    medicine_master_id: row.medicine_master_id,
    type: row.type,
    medicine_name: row.medicine_name,
    normalized_name: row.normalized_name,
    salt_composition: row.salt_composition,
    strength: row.strength,
    dose: formatDoseInput(row.dose),
    timing: row.timing,
    frequency: row.frequency,
    duration_value: row.duration_value,
    duration_unit: row.duration_unit,
    duration_text: row.duration_text,
    notes: row.notes,
    sort_order: row.sort_order,
  }));
}

function parseCompactDoseTokens(value: string) {
  const compact = value.replace(/\s+/g, "").replace(/-/g, ".");
  if (!compact || /[^0-9/.]/.test(compact)) return null;

  if (compact.includes(".")) {
    const separatedTokens = compact.split(".").filter(Boolean);
    if (
      separatedTokens.length === 0 ||
      separatedTokens.some((token) => !/^\d+(?:\/\d+)?$/.test(token))
    ) {
      return null;
    }

    return separatedTokens;
  }

  const tokens: string[] = [];
  for (let cursor = 0; cursor < compact.length; ) {
    const fractionMatch = compact.slice(cursor).match(/^(\d)\/(\d)/);
    if (fractionMatch) {
      tokens.push(`${fractionMatch[1]}/${fractionMatch[2]}`);
      cursor += fractionMatch[0].length;
      continue;
    }

    const current = compact[cursor];
    if (/\d/.test(current)) {
      tokens.push(current);
      cursor += 1;
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

function formatDoseInput(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const tokens = parseCompactDoseTokens(trimmed);
  return tokens ? tokens.join(EMR_DOSE_SEPARATOR) : trimmed;
}

function mapClinicalHistoryRows(
  rows: ClinicalHistoryRow[]
): EmrClinicalHistoryPayload[] {
  return rows.flatMap((row) => {
    if (!EMR_CLINICAL_HISTORY_SECTION_SET.has(row.section)) {
      return [];
    }

    return {
      section: row.section as EmrClinicalHistorySection,
      details: row.details,
      sort_order: row.sort_order,
    };
  });
}

function mapCustomFieldRows(
  rows: CustomFieldValueRow[]
): EmrCustomFieldValuePayload[] {
  return rows.map((row) => ({
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    field_value: row.field_value,
    sort_order: row.sort_order,
  }));
}

function parseAuditJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return null;
}

function normalizeFollowUpAppointmentSummary(
  payload: unknown,
  fallbackAppointmentId?: number | null
): EmrFollowUpAppointmentSummary | null {
  const parsed = parseAuditJson<{
    follow_up_appointment_id?: number | null;
    follow_up_date?: string | null;
    slot_time?: string | null;
    clinic_id?: number | null;
    clinic_name?: string | null;
  }>(payload);

  if (!parsed?.follow_up_date || !parsed.slot_time) {
    return null;
  }

  const appointmentId = Number(parsed.follow_up_appointment_id ?? fallbackAppointmentId ?? 0);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return null;
  }

  return {
    appointment_id: appointmentId,
    date: parsed.follow_up_date,
    slot_time: parsed.slot_time,
    clinic_id:
      parsed.clinic_id !== null && parsed.clinic_id !== undefined
        ? Number(parsed.clinic_id)
        : null,
    clinic_name: parsed.clinic_name ?? null,
  };
}

async function loadFollowUpAppointmentSummaries(
  tx: TxExecutor,
  prescriptionIds: number[]
) {
  if (prescriptionIds.length === 0) {
    return new Map<number, EmrFollowUpAppointmentSummary>();
  }

  const rows = await tx.$queryRaw<FollowUpAuditRow[]>(
    Prisma.sql`
      SELECT prescription_id, entity_id, new_value
      FROM prescription_audit_logs
      WHERE action = 'booked follow-up appointment'
        AND entity_type = 'appointment'
        AND prescription_id IN (${Prisma.join(prescriptionIds)})
      ORDER BY created_at DESC, id DESC
    `
  );

  const summaryMap = new Map<number, EmrFollowUpAppointmentSummary>();
  for (const row of rows) {
    if (summaryMap.has(row.prescription_id)) {
      continue;
    }

    const summary = normalizeFollowUpAppointmentSummary(row.new_value, row.entity_id);
    if (summary) {
      summaryMap.set(row.prescription_id, summary);
    }
  }

  return summaryMap;
}

function buildDoctorSequenceLockName(doctorId: number) {
  return `emr:prescription-seq:${doctorId}`;
}

function formatDoctorSpecificPrescriptionNumber(
  doctorId: number,
  doctorSequenceNo: number
) {
  return `RX-${doctorId}-${String(doctorSequenceNo).padStart(6, "0")}`;
}

async function nextDoctorPrescriptionSequence(
  tx: TxExecutor,
  doctorId: number
) {
  const rows = await tx.$queryRaw<Array<{ next_sequence: number | bigint | null }>>(
    Prisma.sql`
      SELECT COALESCE(MAX(doctor_sequence_no), 0) + 1 AS next_sequence
      FROM prescriptions
      WHERE doctor_id = ${doctorId}
    `
  );

  return Number(rows[0]?.next_sequence ?? 1);
}

function buildDraftLockName(input: {
  doctorId: number;
  patientId: number;
  appointmentId: number;
}) {
  return `emr:draft:${input.doctorId}:${input.patientId}:${input.appointmentId}`;
}

function buildSaveLockName(input: { doctorId: number; prescriptionId: number }) {
  return `emr:save:${input.doctorId}:${input.prescriptionId}`;
}

export async function findExistingDraftPrescription(input: {
  doctorId: number;
  patientId: number;
  appointmentId: number;
}) {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      SELECT id
      FROM prescriptions
      WHERE doctor_id = ${input.doctorId}
        AND patient_id = ${input.patientId}
        AND appointment_id = ${input.appointmentId}
        AND status = 'draft'
        AND is_deleted = 0
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `
  );

  const prescriptionId = rows[0]?.id;
  if (!prescriptionId) {
    return null;
  }

  return getPrescriptionRecord(prescriptionId, input.doctorId);
}

async function loadPrescriptionRecordBase(
  tx: TxExecutor,
  prescriptionId: number,
  doctorId: number
) {
  const rows = await tx.$queryRaw<PrescriptionRow[]>(
    Prisma.sql`
      SELECT *
      FROM prescriptions
      WHERE id = ${prescriptionId}
        AND doctor_id = ${doctorId}
        AND is_deleted = 0
      LIMIT 1
    `
  );

  return rows[0] ?? null;
}

async function loadPrescriptionRecord(
  tx: TxExecutor,
  prescriptionId: number,
  doctorId: number
): Promise<EmrPrescriptionRecord | null> {
  const base = await loadPrescriptionRecordBase(tx, prescriptionId, doctorId);
  if (!base) return null;

  const [
    vitalsRows,
    complaintsRows,
    diagnosisRows,
    medicineRows,
    testRows,
    adviceRows,
    clinicalHistoryRows,
    customFieldRows,
    followUpSummaryMap,
  ] = await Promise.all([
      tx.$queryRaw<VitalsRow[]>(
        Prisma.sql`
          SELECT bp, pulse, height, weight, temperature, spo2, bmi
          FROM prescription_vitals
          WHERE prescription_id = ${prescriptionId}
          LIMIT 1
        `
      ),
      tx.$queryRaw<NamedRow[]>(
        Prisma.sql`
          SELECT id, complaint_master_id AS master_id, complaint_name AS name, normalized_name, notes, sort_order
          FROM prescription_complaints
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<NamedRow[]>(
        Prisma.sql`
          SELECT id, diagnosis_master_id AS master_id, diagnosis_name AS name, normalized_name, notes, sort_order
          FROM prescription_diagnosis
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<MedicineRow[]>(
        Prisma.sql`
          SELECT
            id,
            medicine_master_id,
            type,
            medicine_name,
            normalized_name,
            salt_composition,
            strength,
            dose,
            timing,
            frequency,
            duration_value,
            duration_unit,
            duration_text,
            notes,
            sort_order
          FROM prescription_medicines
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<NamedRow[]>(
        Prisma.sql`
          SELECT id, test_master_id AS master_id, test_name AS name, normalized_name, notes, sort_order
          FROM prescription_tests
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<NamedRow[]>(
        Prisma.sql`
          SELECT id, advice_master_id AS master_id, advice_name AS name, normalized_name, notes, sort_order
          FROM prescription_advice
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<ClinicalHistoryRow[]>(
        Prisma.sql`
          SELECT id, section, details, sort_order
          FROM prescription_clinical_history
          WHERE prescription_id = ${prescriptionId}
          ORDER BY section ASC, sort_order ASC, id ASC
        `
      ),
      tx.$queryRaw<CustomFieldValueRow[]>(
        Prisma.sql`
          SELECT id, field_key, field_label, field_type, field_value, sort_order
          FROM prescription_custom_fields
          WHERE prescription_id = ${prescriptionId}
          ORDER BY sort_order ASC, id ASC
        `
      ),
      loadFollowUpAppointmentSummaries(tx, [prescriptionId]),
    ]);

  return {
    id: base.id,
    prescription_no: base.prescription_no,
    doctor_sequence_no: base.doctor_sequence_no,
    doctor_id: base.doctor_id,
    patient_id: base.patient_id,
    appointment_id: base.appointment_id,
    clinic_id: base.clinic_id,
    visit_date: base.visit_date.toISOString(),
    next_visit_date: toIsoString(base.next_visit_date),
    timezone: base.timezone,
    status: base.status,
    pdf_url: base.pdf_url,
    finalized_at: toIsoString(base.finalized_at),
    previous_version_id: base.previous_version_id,
    copied_from_prescription_id: base.copied_from_prescription_id,
    version_number: base.version_number,
    edit_reason: base.edit_reason,
    is_deleted: toBoolean(base.is_deleted),
    deleted_at: toIsoString(base.deleted_at),
    deleted_by: base.deleted_by,
    last_saved_at: toIsoString(base.last_saved_at),
    created_at: base.created_at.toISOString(),
    updated_at: base.updated_at.toISOString(),
    follow_up_appointment: followUpSummaryMap.get(prescriptionId) ?? null,
    vitals: mapVitals(vitalsRows[0]),
    complaints: mapNamedRows(complaintsRows),
    diagnosis: mapNamedRows(diagnosisRows),
    medicines: mapMedicineRows(medicineRows),
    tests: mapNamedRows(testRows),
    advice: mapNamedRows(adviceRows),
    clinical_history: mapClinicalHistoryRows(clinicalHistoryRows),
    custom_fields: mapCustomFieldRows(customFieldRows),
  };
}

export async function getPrescriptionRecord(
  prescriptionId: number,
  doctorId: number
): Promise<EmrPrescriptionRecord | null> {
  return prisma.$transaction((tx) =>
    loadPrescriptionRecord(tx, prescriptionId, doctorId)
  );
}

export async function getOrCreateDraftPrescription(input: {
  doctorId: number;
  patientId: number;
  appointmentId: number;
  clinicId?: number | null;
  visitDate?: string | Date | null;
  timezone?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const lockName = buildDraftLockName(input);
    const lockRows = await tx.$queryRaw<Array<{ emr_lock_acquired: number | bigint | null }>>(
      Prisma.sql`
        SELECT GET_LOCK(${lockName}, 2) AS emr_lock_acquired
      `
    );
    const lockAcquired = Number(lockRows[0]?.emr_lock_acquired ?? 0) === 1;
    if (!lockAcquired) {
      throw new Error("Could not acquire draft lock. Please try again.");
    }

    try {
    const draftRows = await tx.$queryRaw<PrescriptionRow[]>(
      Prisma.sql`
        SELECT *
        FROM prescriptions
        WHERE doctor_id = ${input.doctorId}
          AND patient_id = ${input.patientId}
          AND appointment_id = ${input.appointmentId}
          AND status = 'draft'
          AND is_deleted = 0
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    );

    if (draftRows[0]) {
      return loadPrescriptionRecord(tx, draftRows[0].id, input.doctorId);
    }

    const visitDate =
      normalizeDateInput(input.visitDate) ?? new Date();

    let insertedId: number | null = null;

    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO prescriptions (
          prescription_no,
          doctor_sequence_no,
          doctor_id,
          patient_id,
          appointment_id,
          clinic_id,
          visit_date,
          next_visit_date,
          timezone,
          status,
          version_number,
          is_deleted,
          last_saved_at,
          created_at,
          updated_at
        )
        VALUES (
          ${`TMP-${Date.now()}-${input.doctorId}-${input.patientId}-${input.appointmentId}`},
          NULL,
          ${input.doctorId},
          ${input.patientId},
          ${input.appointmentId},
          ${input.clinicId ?? null},
          ${visitDate},
          NULL,
          ${input.timezone ?? "Asia/Kolkata"},
          'draft',
          1,
          0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );

    const insertedRows = await tx.$queryRaw<Array<{ id: number | bigint }>>(
      Prisma.sql`SELECT LAST_INSERT_ID() AS id`
    );

    insertedId = Number(insertedRows[0]?.id ?? 0);
    if (!insertedId) {
      throw new Error("Failed to create prescription draft");
    }

    if (!insertedId) {
      throw new Error("Failed to create prescription draft");
    }

    await recordPrescriptionAuditSafe(
      {
        action: "created draft",
        doctorId: input.doctorId,
        patientId: input.patientId,
        prescriptionId: insertedId,
        entityType: "prescription",
        entityId: insertedId,
        newValue: {
          appointment_id: input.appointmentId,
          clinic_id: input.clinicId ?? null,
          status: "draft",
        },
      },
      tx as typeof prisma
    );

    return loadPrescriptionRecord(tx, insertedId, input.doctorId);
    } finally {
      await tx.$queryRaw(
        Prisma.sql`SELECT RELEASE_LOCK(${lockName})`
      );
    }
  }, EMR_INTERACTIVE_TRANSACTION_OPTIONS);
}

async function replaceNamedSection(
  tx: TxExecutor,
  tableName: "prescription_complaints" | "prescription_diagnosis" | "prescription_tests" | "prescription_advice",
  nameColumn: "complaint_name" | "diagnosis_name" | "test_name" | "advice_name",
  masterIdColumn:
    | "complaint_master_id"
    | "diagnosis_master_id"
    | "test_master_id"
    | "advice_master_id",
  prescriptionId: number,
  items: EmrNamedItemPayload[]
) {
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM ${Prisma.raw(tableName)} WHERE prescription_id = ${prescriptionId}`
  );

  for (const [index, item] of items.entries()) {
    const normalized = buildPrescriptionNamedItem(item, index);
    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO ${Prisma.raw(tableName)} (
          prescription_id,
          ${Prisma.raw(masterIdColumn)},
          ${Prisma.raw(nameColumn)},
          normalized_name,
          sort_order,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          ${prescriptionId},
          ${item.id ?? null},
          ${normalized.name},
          ${normalized.normalized_name},
          ${normalized.sort_order},
          ${normalized.notes},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );
  }
}

async function replaceMedicinesSection(
  tx: TxExecutor,
  prescriptionId: number,
  medicines: EmrMedicinePayload[]
) {
  const medicineMasterIds: number[] = [];

  await tx.$executeRaw(
    Prisma.sql`DELETE FROM prescription_medicines WHERE prescription_id = ${prescriptionId}`
  );

  for (const [index, item] of medicines.entries()) {
    const medicineName = normalizeDisplayName(item.medicine_name);
    const normalizedName =
      item.normalized_name || normalizeMasterName(medicineName);

    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_medicines (
          prescription_id,
          medicine_master_id,
          type,
          medicine_name,
          normalized_name,
          salt_composition,
          strength,
          dose,
          timing,
          frequency,
          duration_value,
          duration_unit,
          duration_text,
          notes,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (
          ${prescriptionId},
          ${item.medicine_master_id ?? null},
          ${item.type ?? null},
          ${medicineName},
          ${normalizedName},
          ${item.salt_composition?.trim() || null},
          ${item.strength?.trim() || null},
          ${formatDoseInput(item.dose) || null},
          ${item.timing?.trim() || null},
          ${item.frequency?.trim() || null},
          ${item.duration_value ?? null},
          ${item.duration_unit ?? null},
          ${item.duration_text?.trim() || null},
          ${item.notes?.trim() || null},
          ${item.sort_order ?? index},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );

    if (item.medicine_master_id) {
      medicineMasterIds.push(item.medicine_master_id);
    }
  }

  return medicineMasterIds;
}

async function replaceClinicalHistorySection(
  tx: TxExecutor,
  prescriptionId: number,
  items: EmrClinicalHistoryPayload[]
) {
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM prescription_clinical_history WHERE prescription_id = ${prescriptionId}`
  );

  for (const [index, item] of items.entries()) {
    const details = item.details.trim();
    if (!details || !EMR_CLINICAL_HISTORY_SECTION_SET.has(item.section)) {
      continue;
    }

    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_clinical_history (
          prescription_id,
          section,
          details,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (
          ${prescriptionId},
          ${item.section},
          ${details},
          ${item.sort_order ?? index},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );
  }
}

async function replaceCustomFieldsSection(
  tx: TxExecutor,
  prescriptionId: number,
  fields: EmrCustomFieldValuePayload[]
) {
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM prescription_custom_fields WHERE prescription_id = ${prescriptionId}`
  );

  for (const [index, field] of fields.entries()) {
    const fieldKey = field.field_key.trim();
    const fieldLabel = field.field_label.trim();
    const fieldValue = field.field_value?.trim() ?? "";

    if (!fieldKey || !fieldLabel || !fieldValue) {
      continue;
    }

    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_custom_fields (
          prescription_id,
          field_key,
          field_label,
          field_type,
          field_value,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (
          ${prescriptionId},
          ${fieldKey},
          ${fieldLabel},
          ${field.field_type},
          ${fieldValue},
          ${field.sort_order ?? index},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );
  }
}

export async function saveDraftPrescription(
  prescriptionId: number,
  doctorId: number,
  payload: EmrDraftSavePayload
) {
  const saveResult = await prisma.$transaction(async (tx) => {
    const lockName = buildSaveLockName({ doctorId, prescriptionId });
    const lockRows = await tx.$queryRaw<Array<{ emr_save_lock_acquired: number | bigint | null }>>(
      Prisma.sql`
        SELECT GET_LOCK(${lockName}, 0) AS emr_save_lock_acquired
      `
    );
    const lockAcquired = Number(lockRows[0]?.emr_save_lock_acquired ?? 0) === 1;
    if (!lockAcquired) {
      throw new Error("Another save is in progress. Please try again.");
    }

    try {
      const existing = await loadPrescriptionRecordBase(tx, prescriptionId, doctorId);
      if (!existing) {
        throw new Error("Prescription draft not found");
      }

      if (existing.status !== "draft") {
        throw new Error("Only draft prescriptions can be autosaved");
      }

      const visitDate = normalizeDateInput(payload.visit_date) ?? existing.visit_date;
      const nextVisitDate = normalizeDateInput(payload.next_visit_date);
      const nextClinicId = payload.clinic_id ?? existing.clinic_id;
      const nextTimezone = payload.timezone ?? existing.timezone;

      await tx.$executeRaw(
        Prisma.sql`
          UPDATE prescriptions
          SET
            clinic_id = ${nextClinicId},
            visit_date = ${visitDate},
            next_visit_date = ${nextVisitDate},
            timezone = ${nextTimezone},
            last_saved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${prescriptionId}
            AND doctor_id = ${doctorId}
        `
      );

      const vitals = payload.vitals ?? null;
      if (vitals) {
        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO prescription_vitals (
              prescription_id,
              bp,
              pulse,
              height,
              weight,
              temperature,
              spo2,
              bmi,
              created_at,
              updated_at
            )
            VALUES (
              ${prescriptionId},
              ${vitals.bp ?? null},
              ${vitals.pulse ?? null},
              ${vitals.height ?? null},
              ${vitals.weight ?? null},
              ${vitals.temperature ?? null},
              ${vitals.spo2 ?? null},
              ${vitals.bmi ?? null},
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            ON DUPLICATE KEY UPDATE
              bp = VALUES(bp),
              pulse = VALUES(pulse),
              height = VALUES(height),
              weight = VALUES(weight),
              temperature = VALUES(temperature),
              spo2 = VALUES(spo2),
              bmi = VALUES(bmi),
              updated_at = CURRENT_TIMESTAMP
          `
        );
      }

      await replaceNamedSection(
        tx,
        "prescription_complaints",
        "complaint_name",
        "complaint_master_id",
        prescriptionId,
        payload.complaints ?? []
      );
      await replaceNamedSection(
        tx,
        "prescription_diagnosis",
        "diagnosis_name",
        "diagnosis_master_id",
        prescriptionId,
        payload.diagnosis ?? []
      );
      const medicineMasterIds = await replaceMedicinesSection(tx, prescriptionId, payload.medicines ?? []);
      await replaceNamedSection(
        tx,
        "prescription_tests",
        "test_name",
        "test_master_id",
        prescriptionId,
        payload.tests ?? []
      );
      await replaceNamedSection(
        tx,
        "prescription_advice",
        "advice_name",
        "advice_master_id",
        prescriptionId,
        payload.advice ?? []
      );
      if (payload.clinical_history !== undefined) {
        await replaceClinicalHistorySection(
          tx,
          prescriptionId,
          payload.clinical_history
        );
      }
      if (payload.custom_fields !== undefined) {
        await replaceCustomFieldsSection(tx, prescriptionId, payload.custom_fields);
      }

      return {
        patientId: existing.patient_id,
        clinicId: nextClinicId,
        visitDate,
        nextVisitDate,
        medicineMasterIds,
      };
    } finally {
      await tx.$queryRaw(
        Prisma.sql`SELECT RELEASE_LOCK(${lockName})`
      );
    }
  }, EMR_INTERACTIVE_TRANSACTION_OPTIONS);

  await Promise.allSettled([
    recordPrescriptionAuditSafe({
      action: "autosaved draft",
      doctorId,
      patientId: saveResult.patientId,
      prescriptionId,
      entityType: "prescription",
      entityId: prescriptionId,
      newValue: {
        clinic_id: saveResult.clinicId,
        visit_date: saveResult.visitDate.toISOString(),
        next_visit_date: saveResult.nextVisitDate?.toISOString() ?? null,
      },
    }),
    ...saveResult.medicineMasterIds.map((medicineMasterId) =>
      incrementMasterUsageCount("medicine", medicineMasterId)
    ),
  ]);

  return getPrescriptionRecord(prescriptionId, doctorId);
}

export async function listPrescriptionHistory(
  doctorId: number,
  patientId: number
): Promise<EmrPrescriptionHistoryItem[]> {
  const rows = await prisma.$queryRaw<PrescriptionRow[]>(
    Prisma.sql`
      SELECT *
      FROM prescriptions
      WHERE doctor_id = ${doctorId}
        AND patient_id = ${patientId}
        AND is_deleted = 0
        AND status IN ('draft', 'final')
      ORDER BY visit_date DESC, id DESC
    `
  );
  const followUpSummaryMap = await prisma.$transaction((tx) =>
    loadFollowUpAppointmentSummaries(
      tx,
      rows.map((row) => row.id)
    )
  );

  return rows.map((row) => ({
    id: row.id,
    prescription_no: row.prescription_no,
    visit_date: row.visit_date.toISOString(),
    status: row.status,
    finalized_at: toIsoString(row.finalized_at),
    version_number: row.version_number,
    pdf_url: row.pdf_url,
    previous_version_id: row.previous_version_id,
    edit_reason: row.edit_reason,
    copied_from_prescription_id: row.copied_from_prescription_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    follow_up_appointment: followUpSummaryMap.get(row.id) ?? null,
  }));
}

export function computeDraftWarnings(
  record: EmrPrescriptionRecord | null
): EmrDraftWarning[] {
  if (!record) return [];

  const warnings: EmrDraftWarning[] = [];
  const seenMedicines = new Set<string>();

  record.medicines.forEach((medicine, index) => {
    const normalizedName = normalizeMasterName(medicine.medicine_name);
    const hasMedicineName = Boolean(medicine.medicine_name?.trim());
    const medicineLabel = medicine.medicine_name?.trim() || `medicine row ${index + 1}`;
    const hasStructuredMedicineDetails = Boolean(
      medicine.medicine_master_id ||
        medicine.type?.trim() ||
        medicine.strength?.trim() ||
        medicine.salt_composition?.trim()
    );

    if (hasMedicineName && !hasStructuredMedicineDetails) {
      warnings.push({
        code: "unresolved_medicine",
        level: "warning",
        message: `Select an existing medicine or add "${medicineLabel}" as a new medicine before finalizing.`,
        medicine_name: medicine.medicine_name,
        row_index: index,
      });
    }

    if (normalizedName) {
      if (seenMedicines.has(normalizedName)) {
        warnings.push({
          code: "duplicate_medicine",
          level: "warning",
          message: `Duplicate medicine found: ${medicineLabel}`,
          medicine_name: medicine.medicine_name,
          row_index: index,
        });
      } else {
        seenMedicines.add(normalizedName);
      }
    }

    if (!medicine.dose?.trim() || !medicine.frequency?.trim()) {
      warnings.push({
        code: "empty_dose_frequency",
        level: "warning",
        message: `Dose or frequency is missing for ${medicineLabel}`,
        medicine_name: medicine.medicine_name,
        row_index: index,
      });
    }

    const hasDurationValue =
      medicine.duration_value !== null && medicine.duration_value !== undefined;
    const hasDurationText = Boolean(medicine.duration_text?.trim());
    if (!hasDurationValue && !hasDurationText) {
      warnings.push({
        code: "empty_duration",
        level: "warning",
        message: `Duration is missing for ${medicineLabel}`,
        medicine_name: medicine.medicine_name,
        row_index: index,
      });
    }
  });

  return warnings;
}

export async function finalizePrescription(
  prescriptionId: number,
  doctorId: number
) {
  const record = await getPrescriptionRecord(prescriptionId, doctorId);
  if (!record) {
    throw new Error("Prescription not found");
  }

  if (!record.patient_id) {
    throw new Error("Patient id is required before finalizing");
  }

  if (!record.doctor_id) {
    throw new Error("Doctor id is required before finalizing");
  }

  if (record.status === "final") {
    return record;
  }

  if (record.status !== "draft") {
    throw new Error("Only draft prescriptions can be finalized");
  }

  if (!record.visit_date) {
    throw new Error("Visit date is required");
  }

  const hasClinicalContent =
    record.medicines.length > 0 ||
    record.advice.length > 0 ||
    record.diagnosis.length > 0 ||
    record.tests.length > 0;

  if (!hasClinicalContent) {
    throw new Error(
      "At least one clinical section is required before finalizing"
    );
  }

  const hasUnresolvedMedicine = record.medicines.some((medicine) => {
    if (!medicine.medicine_name?.trim()) {
      return false;
    }

    return !(
      medicine.medicine_master_id ||
      medicine.type?.trim() ||
      medicine.strength?.trim() ||
      medicine.salt_composition?.trim()
    );
  });

  if (hasUnresolvedMedicine) {
    throw new Error(
      "Each medicine must be selected from suggestions or added as a new medicine before finalizing."
    );
  }

  await prisma.$transaction(async (tx) => {
    const sequenceLockName = buildDoctorSequenceLockName(doctorId);
    const sequenceLockRows = await tx.$queryRaw<
      Array<{ emr_lock_acquired: number | bigint | null }>
    >(
      Prisma.sql`
        SELECT GET_LOCK(${sequenceLockName}, 2) AS emr_lock_acquired
      `
    );
    const sequenceLockAcquired =
      Number(sequenceLockRows[0]?.emr_lock_acquired ?? 0) === 1;
    if (!sequenceLockAcquired) {
      throw new Error("Could not acquire prescription sequence lock. Please try again.");
    }

    try {
      const currentRows = await tx.$queryRaw<
        Array<{ doctor_sequence_no: number | bigint | null }>
      >(
        Prisma.sql`
          SELECT doctor_sequence_no
          FROM prescriptions
          WHERE id = ${prescriptionId}
            AND doctor_id = ${doctorId}
            AND is_deleted = 0
          LIMIT 1
        `
      );

      const existingDoctorSequenceNo = Number(
        currentRows[0]?.doctor_sequence_no ?? 0
      );
      const doctorSequenceNo =
        existingDoctorSequenceNo > 0
          ? existingDoctorSequenceNo
          : await nextDoctorPrescriptionSequence(tx, doctorId);
      const prescriptionNo = formatDoctorSpecificPrescriptionNumber(
        doctorId,
        doctorSequenceNo
      );

      await tx.$executeRaw(
        Prisma.sql`
          UPDATE prescriptions
          SET
            prescription_no = ${prescriptionNo},
            doctor_sequence_no = ${doctorSequenceNo},
            status = 'final',
            finalized_at = CURRENT_TIMESTAMP,
            last_saved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${prescriptionId}
            AND doctor_id = ${doctorId}
            AND is_deleted = 0
        `
      );
    } finally {
      await tx.$queryRaw(
        Prisma.sql`SELECT RELEASE_LOCK(${sequenceLockName})`
      );
    }

    await recordPrescriptionAuditSafe(
      {
        action: "finalized prescription",
        doctorId,
        patientId: record.patient_id,
        prescriptionId,
        entityType: "prescription",
        entityId: prescriptionId,
        oldValue: { status: record.status },
        newValue: { status: "final" },
      },
      tx as typeof prisma
    );
  });

  const finalizedRecord = await getPrescriptionRecord(prescriptionId, doctorId);
  if (!finalizedRecord) {
    throw new Error("Failed to load finalized prescription");
  }

  return finalizedRecord;
}

export async function cancelDraftPrescription(
  prescriptionId: number,
  doctorId: number,
  reason?: string | null
) {
  const record = await getPrescriptionRecord(prescriptionId, doctorId);
  if (!record) {
    throw new Error("Prescription not found");
  }

  if (record.status !== "draft") {
    throw new Error("Only draft prescriptions can be cancelled");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE prescriptions
        SET
          status = 'cancelled',
          edit_reason = ${reason?.trim() || record.edit_reason},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${prescriptionId}
          AND doctor_id = ${doctorId}
          AND is_deleted = 0
      `
    );

    await recordPrescriptionAuditSafe(
      {
        action: "cancelled prescription",
        doctorId,
        patientId: record.patient_id,
        prescriptionId,
        entityType: "prescription",
        entityId: prescriptionId,
        oldValue: { status: record.status },
        newValue: {
          status: "cancelled",
          reason: reason?.trim() || null,
        },
      },
      tx as typeof prisma
    );
  });

  return getPrescriptionRecord(prescriptionId, doctorId);
}

export async function clonePrescriptionAsDraft(input: {
  sourcePrescriptionId: number;
  doctorId: number;
  patientId: number;
  appointmentId: number;
  clinicId?: number | null;
  visitDate?: string | Date | null;
  timezone?: string | null;
  copiedFromPrescriptionId?: number | null;
  previousVersionId?: number | null;
  editReason?: string | null;
  preventOverwritingExistingDraft?: boolean;
}) {
  const source = await getPrescriptionRecord(
    input.sourcePrescriptionId,
    input.doctorId
  );

  if (!source) {
    throw new Error("Source prescription not found");
  }

  if (source.patient_id !== input.patientId) {
    throw new Error("Source prescription does not belong to the selected patient");
  }

  if (source.status !== "final") {
    throw new Error("Only finalized prescriptions can be copied into a new draft");
  }

  const draft = await getOrCreateDraftPrescription({
    doctorId: input.doctorId,
    patientId: input.patientId,
    appointmentId: input.appointmentId,
    clinicId: input.clinicId ?? source.clinic_id,
    visitDate: input.visitDate,
    timezone: input.timezone ?? source.timezone,
  });

  if (!draft) {
    throw new Error("Failed to create draft copy");
  }

  const hasExistingDraftContent =
    Boolean(draft.next_visit_date) ||
    draft.complaints.length > 0 ||
    draft.diagnosis.length > 0 ||
    draft.medicines.some(
      (medicine) =>
        Boolean(medicine.medicine_name?.trim()) ||
        Boolean(medicine.dose?.trim()) ||
        Boolean(medicine.frequency?.trim()) ||
        Boolean(medicine.notes?.trim())
    ) ||
    draft.tests.length > 0 ||
    draft.advice.length > 0 ||
    (draft.clinical_history?.length ?? 0) > 0 ||
    (draft.custom_fields?.some((field) => Boolean(field.field_value?.trim())) ?? false) ||
    Boolean(
      draft.vitals &&
        Object.values(draft.vitals).some((value) => Boolean(String(value ?? "").trim()))
    );

  const isMatchingRevisionDraft =
    input.previousVersionId !== undefined &&
    input.previousVersionId !== null &&
    draft.previous_version_id === input.previousVersionId;

  if (input.preventOverwritingExistingDraft && hasExistingDraftContent && !isMatchingRevisionDraft) {
    throw new Error(
      "A different draft already exists for this appointment. Open the current draft or finalize/cancel it before creating a revision."
    );
  }

  if (input.preventOverwritingExistingDraft && isMatchingRevisionDraft) {
    return draft;
  }

  await saveDraftPrescription(draft.id, input.doctorId, {
    clinic_id: input.clinicId ?? source.clinic_id,
    visit_date: input.visitDate ?? source.visit_date,
    next_visit_date: source.next_visit_date,
    timezone: input.timezone ?? source.timezone,
    vitals: source.vitals,
    complaints: source.complaints,
    diagnosis: source.diagnosis,
    medicines: source.medicines,
    tests: source.tests,
    advice: source.advice,
    clinical_history: source.clinical_history ?? [],
    custom_fields: source.custom_fields ?? [],
  });

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE prescriptions
      SET
        copied_from_prescription_id = ${input.copiedFromPrescriptionId ?? source.id},
        previous_version_id = ${input.previousVersionId ?? null},
        edit_reason = ${input.editReason ?? null},
        version_number = ${input.previousVersionId ? source.version_number + 1 : draft.version_number},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${draft.id}
    `
  );

  await recordPrescriptionAuditSafe({
    action: input.previousVersionId ? "edited prescription" : "copied previous prescription",
    doctorId: input.doctorId,
    patientId: input.patientId,
    prescriptionId: draft.id,
    entityType: "prescription",
    entityId: draft.id,
    newValue: {
      source_prescription_id: source.id,
      previous_version_id: input.previousVersionId ?? null,
      edit_reason: input.editReason ?? null,
    },
  });

  return getPrescriptionRecord(draft.id, input.doctorId);
}

export async function createPrescriptionRevisionDraft(input: {
  sourcePrescriptionId: number;
  doctorId: number;
  patientId: number;
  appointmentId: number;
  clinicId?: number | null;
  visitDate?: string | Date | null;
  timezone?: string | null;
  editReason: string;
}) {
  const trimmedReason = input.editReason.trim();
  if (!trimmedReason) {
    throw new Error("Edit reason is required to revise a finalized prescription");
  }

  const source = await getPrescriptionRecord(
    input.sourcePrescriptionId,
    input.doctorId
  );

  if (!source) {
    throw new Error("Source prescription not found");
  }

  if (source.patient_id !== input.patientId) {
    throw new Error("Source prescription does not belong to the selected patient");
  }

  if (source.status !== "final") {
    throw new Error("Only finalized prescriptions can be revised");
  }

  const draft = await clonePrescriptionAsDraft({
    sourcePrescriptionId: input.sourcePrescriptionId,
    doctorId: input.doctorId,
    patientId: input.patientId,
    appointmentId: input.appointmentId,
    clinicId: input.clinicId ?? source.clinic_id,
    visitDate: input.visitDate,
    timezone: input.timezone ?? source.timezone,
    copiedFromPrescriptionId: source.id,
    previousVersionId: source.id,
    editReason: trimmedReason,
    preventOverwritingExistingDraft: true,
  });

  if (!draft) {
    throw new Error("Failed to create revision draft");
  }

  if (draft.edit_reason?.trim() !== trimmedReason) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE prescriptions
        SET
          edit_reason = ${trimmedReason},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${draft.id}
      `
    );
  }

  return getPrescriptionRecord(draft.id, input.doctorId);
}
