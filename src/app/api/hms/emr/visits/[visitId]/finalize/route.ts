import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  buildHmsDraftResponse,
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";
import {
  computeDraftWarnings,
  finalizePrescription,
  getOrCreateDraftPrescription,
  saveDraftPrescription,
} from "@/lib/emr/prescriptionService";
import type {
  EmrClinicalHistoryPayload,
  EmrCustomFieldValuePayload,
  EmrDraftSavePayload,
} from "@/lib/emr/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ visitId: string }>;
};

function normalizeClinicalHistoryPayload(
  items: EmrDraftSavePayload["clinical_history"]
): EmrClinicalHistoryPayload[] | undefined {
  if (!Array.isArray(items)) return undefined;

  return items
    .map((item, index) => ({
      section: item.section,
      details: item.details.trim(),
      sort_order: item.sort_order ?? index,
    }))
    .filter((item) => item.details.length > 0);
}

function normalizeCustomFieldsPayload(
  items: EmrDraftSavePayload["custom_fields"]
): EmrCustomFieldValuePayload[] | undefined {
  if (!Array.isArray(items)) return undefined;

  return items
    .map((item, index) => ({
      field_key: item.field_key.trim(),
      field_label: item.field_label.trim(),
      field_type: item.field_type,
      field_value: item.field_value?.trim() ?? "",
      sort_order: item.sort_order ?? index,
    }))
    .filter((item) => item.field_key.length > 0 && item.field_label.length > 0);
}

function normalizeOptionalPositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function validateReferredToDoctor(input: {
  referredToDoctorId: number | null;
  currentDoctorId: number;
  hospitalId: number;
  adminId: number;
}) {
  if (!input.referredToDoctorId) return null;
  if (input.referredToDoctorId === input.currentDoctorId) {
    return "Referral doctor must be different from the current doctor.";
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number }>>(
    `
    SELECT d.doctor_id
    FROM hospital_doctors hd
    INNER JOIN doctors d
      ON d.doctor_id = hd.doctor_id
     AND d.admin_id = ?
    WHERE hd.hospital_id = ?
      AND hd.doctor_id = ?
    LIMIT 1
    `,
    input.adminId,
    input.hospitalId,
    input.referredToDoctorId
  );

  return rows[0] ? null : "Select a valid doctor from this hospital.";
}

async function ensureDraftReferringPrescriptionLink(input: {
  prescriptionId: number;
  doctorId: number;
  referringPrescriptionId?: number | null;
}) {
  if (!input.referringPrescriptionId) return;
  await prisma.$executeRawUnsafe(
    `
    UPDATE prescriptions
    SET referring_prescription_id = COALESCE(referring_prescription_id, ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND doctor_id = ?
      AND status = 'draft'
    `,
    input.referringPrescriptionId,
    input.prescriptionId,
    input.doctorId
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveDraftBeforeFinalize(
  prescriptionId: number,
  doctorId: number,
  payload: EmrDraftSavePayload
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await saveDraftPrescription(prescriptionId, doctorId, payload);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("Another save is in progress") || attempt === 3) {
        throw error;
      }
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to save draft before finalizing.");
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    const scope = await resolveHmsDoctorVisitEmrScope(req, visitId);
    const body = (await req.json().catch(() => ({}))) as Partial<EmrDraftSavePayload>;
    const draft = await getOrCreateDraftPrescription({
      doctorId: scope.visit.doctor_id,
      patientId: scope.visit.patient_id,
      visitId: scope.visit.visit_id,
      clinicId: null,
      visitDate: scope.visit.visit_date,
      timezone: "Asia/Kolkata",
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to load EMR draft for finalization." },
        { status: 500 }
      );
    }
    await ensureDraftReferringPrescriptionLink({
      prescriptionId: draft.id,
      doctorId: scope.visit.doctor_id,
      referringPrescriptionId: scope.visit.referral?.referring_prescription_id,
    });

    const referredToDoctorId = normalizeOptionalPositiveId(body.referred_to_doctor_id);
    if (typeof referredToDoctorId === "number" && Number.isNaN(referredToDoctorId)) {
      return NextResponse.json({ error: "Referral doctor is invalid." }, { status: 400 });
    }
    const referralError = await validateReferredToDoctor({
      referredToDoctorId,
      currentDoctorId: scope.visit.doctor_id,
      hospitalId: scope.hospital.hospitalId,
      adminId: scope.hospital.adminId,
    });
    if (referralError) {
      return NextResponse.json({ error: referralError }, { status: 400 });
    }

    const clinicalHistory = normalizeClinicalHistoryPayload(body.clinical_history);
    const customFields = normalizeCustomFieldsPayload(body.custom_fields);
    const hasPayload = Object.keys(body).length > 0;
    if (hasPayload) {
      await saveDraftBeforeFinalize(draft.id, scope.visit.doctor_id, {
        ...(body as EmrDraftSavePayload),
        clinic_id: null,
        visit_date: body.visit_date ?? scope.visit.visit_date,
        timezone: body.timezone ?? "Asia/Kolkata",
        referred_to_doctor_id: referredToDoctorId,
        ...(clinicalHistory !== undefined ? { clinical_history: clinicalHistory } : {}),
        ...(customFields !== undefined ? { custom_fields: customFields } : {}),
      });
    }

    const finalizedDraft = await finalizePrescription(draft.id, scope.visit.doctor_id);

    await prisma.$executeRawUnsafe(
      `
      UPDATE visits
      SET status = 'COMPLETED',
          finalized_at = CURRENT_TIMESTAMP
      WHERE visit_id = ?
        AND hospital_id = ?
        AND doctor_id = ?
        AND status = 'IN_CONSULT'
      `,
      scope.visit.visit_id,
      scope.hospital.hospitalId,
      scope.visit.doctor_id
    );
    scope.visit.status = "COMPLETED";
    scope.visit.appointment.status = "COMPLETED";

    return NextResponse.json(
      buildHmsDraftResponse(scope, finalizedDraft, computeDraftWarnings(finalizedDraft)),
      { status: 200 }
    );
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
