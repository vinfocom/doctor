import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import type { EmrAuditLogRecord } from "@/lib/emr/types";

type AuditExecutor = typeof prisma;

type RecordPrescriptionAuditInput = {
  action: string;
  doctorId: number;
  patientId?: number | null;
  prescriptionId?: number | null;
  entityType: string;
  entityId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
};

function serializeAuditValue(value: unknown) {
  if (value === undefined) return null;

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error("[emr-audit] Failed to serialize audit payload:", error);
    return JSON.stringify({
      audit_serialization_error: true,
    });
  }
}

type AuditLogRow = {
  id: bigint | number;
  action: string;
  doctor_id: number;
  patient_id: number | null;
  prescription_id: number | null;
  entity_type: string;
  entity_id: number | null;
  old_value: unknown;
  new_value: unknown;
  created_at: Date;
};

function mapAuditRow(row: AuditLogRow): EmrAuditLogRecord {
  return {
    id: String(row.id),
    action: row.action,
    doctor_id: row.doctor_id,
    patient_id: row.patient_id,
    prescription_id: row.prescription_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    old_value: row.old_value,
    new_value: row.new_value,
    created_at: row.created_at.toISOString(),
  };
}

export async function recordPrescriptionAudit(
  input: RecordPrescriptionAuditInput,
  executor: AuditExecutor = prisma
) {
  const oldValueJson = serializeAuditValue(input.oldValue);
  const newValueJson = serializeAuditValue(input.newValue);

  await executor.$executeRaw(
    Prisma.sql`
      INSERT INTO prescription_audit_logs (
        action,
        doctor_id,
        patient_id,
        prescription_id,
        entity_type,
        entity_id,
        old_value,
        new_value,
        created_at
      )
      VALUES (
        ${input.action},
        ${input.doctorId},
        ${input.patientId ?? null},
        ${input.prescriptionId ?? null},
        ${input.entityType},
        ${input.entityId ?? null},
        ${oldValueJson},
        ${newValueJson},
        CURRENT_TIMESTAMP
      )
    `
  );
}

export async function recordPrescriptionAuditSafe(
  input: RecordPrescriptionAuditInput,
  executor: AuditExecutor = prisma
) {
  try {
    await recordPrescriptionAudit(input, executor);
  } catch (error) {
    console.error("[emr-audit] Non-blocking audit failure:", error);
  }
}

export async function recordMasterReviewLogSafe(input: {
  masterType: "medicine" | "complaint" | "diagnosis" | "test" | "advice";
  masterId: number;
  action: "approved" | "rejected";
  adminUserId: number;
  notes?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_master_review_logs (
          master_type,
          master_id,
          action,
          admin_user_id,
          notes,
          old_value,
          new_value,
          created_at
        )
        VALUES (
          ${input.masterType},
          ${input.masterId},
          ${input.action},
          ${input.adminUserId},
          ${input.notes ?? null},
          ${serializeAuditValue(input.oldValue)},
          ${serializeAuditValue(input.newValue)},
          CURRENT_TIMESTAMP
        )
      `
    );
  } catch (error) {
    console.error("[emr-audit] Non-blocking master review log failure:", error);
  }
}

export async function listPrescriptionAuditLogs(prescriptionId: number) {
  const rows = await prisma.$queryRaw<AuditLogRow[]>(
    Prisma.sql`
      SELECT
        id,
        action,
        doctor_id,
        patient_id,
        prescription_id,
        entity_type,
        entity_id,
        old_value,
        new_value,
        created_at
      FROM prescription_audit_logs
      WHERE prescription_id = ${prescriptionId}
      ORDER BY created_at DESC, id DESC
    `
  );

  return rows.map(mapAuditRow);
}
