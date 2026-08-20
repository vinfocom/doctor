import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getHmsSessionFromRequest,
  getHmsStaffAssignedDoctorIds,
  getHmsStaffProfile,
} from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

export const dynamic = "force-dynamic";

type ReferralPrescriptionRow = {
  id: number;
  visit_id: number | null;
  visit_date: Date | string;
  finalized_at: Date | string | null;
  doctor_id: number;
  doctor_name: string | null;
  referred_to_doctor_id: number | null;
  referred_to_doctor_name: string | null;
  diagnosis_names: string | null;
  test_names: string | null;
};

function parsePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

async function requireReceptionSession(req: NextRequest) {
  const session = await getHmsSessionFromRequest(req);
  if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
    return null;
  }

  if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) {
    return null;
  }

  const staff = await getHmsStaffProfile(session.hospitalContext);
  if (staff?.staffType !== "REGISTRATION") {
    return null;
  }

  return {
    hospital: session.hospitalContext,
    assignedDoctorIds: await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireReceptionSession(req);
    if (!access) {
      return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
    }

    const patientId = parsePositiveId(req.nextUrl.searchParams.get("patient_id"));
    const referringDoctorId = parsePositiveId(req.nextUrl.searchParams.get("referred_by_doctor_id"));
    const consultingDoctorId = parsePositiveId(req.nextUrl.searchParams.get("doctor_id"));

    const fieldErrors: Record<string, string> = {};
    if (!patientId) fieldErrors.patient_id = "Select a patient.";
    if (!referringDoctorId) fieldErrors.referred_by_doctor_id = "Select the referring doctor.";
    if (!consultingDoctorId) fieldErrors.doctor_id = "Select the consulting doctor.";
    if (referringDoctorId && consultingDoctorId && referringDoctorId === consultingDoctorId) {
      fieldErrors.referred_by_doctor_id = "Referring doctor must be different from consulting doctor.";
    }
    if (consultingDoctorId && !access.assignedDoctorIds.includes(consultingDoctorId)) {
      fieldErrors.doctor_id = "Consulting doctor is not assigned to this staff account.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
    }

    const { hospital } = access;
    const rows = await prisma.$queryRawUnsafe<ReferralPrescriptionRow[]>(
      `
      SELECT
        p.id,
        p.visit_id,
        p.visit_date,
        p.finalized_at,
        p.doctor_id,
        rd.doctor_name,
        p.referred_to_doctor_id,
        cd.doctor_name AS referred_to_doctor_name,
        (
          SELECT GROUP_CONCAT(pd.diagnosis_name ORDER BY pd.sort_order ASC, pd.id ASC SEPARATOR ', ')
          FROM prescription_diagnosis pd
          WHERE pd.prescription_id = p.id
        ) AS diagnosis_names,
        (
          SELECT GROUP_CONCAT(pt.test_name ORDER BY pt.sort_order ASC, pt.id ASC SEPARATOR ', ')
          FROM prescription_tests pt
          WHERE pt.prescription_id = p.id
        ) AS test_names
      FROM prescriptions p
      INNER JOIN patients pa
        ON pa.patient_id = p.patient_id
       AND pa.admin_id = ?
       AND pa.hospital_group_code = ?
      INNER JOIN doctors rd
        ON rd.doctor_id = p.doctor_id
       AND rd.admin_id = ?
      INNER JOIN hospital_doctors rhd
        ON rhd.hospital_id = ?
       AND rhd.doctor_id = rd.doctor_id
      INNER JOIN doctors cd
        ON cd.doctor_id = p.referred_to_doctor_id
       AND cd.admin_id = ?
      INNER JOIN hospital_doctors chd
        ON chd.hospital_id = ?
       AND chd.doctor_id = cd.doctor_id
      WHERE p.patient_id = ?
        AND p.doctor_id = ?
        AND p.referred_to_doctor_id = ?
        AND p.status = 'final'
        AND p.is_deleted = 0
      ORDER BY COALESCE(p.finalized_at, p.visit_date) DESC, p.id DESC
      LIMIT 20
      `,
      hospital.adminId,
      hospital.hospitalCode,
      hospital.adminId,
      hospital.hospitalId,
      hospital.adminId,
      hospital.hospitalId,
      patientId,
      referringDoctorId,
      consultingDoctorId
    );

    return NextResponse.json({
      prescriptions: rows.map((row) => ({
        id: Number(row.id),
        visit_id: row.visit_id ? Number(row.visit_id) : null,
        visit_date: dateOnly(row.visit_date),
        finalized_at: row.finalized_at,
        doctor_id: Number(row.doctor_id),
        doctor_name: row.doctor_name,
        referred_to_doctor_id: row.referred_to_doctor_id ? Number(row.referred_to_doctor_id) : null,
        referred_to_doctor_name: row.referred_to_doctor_name,
        diagnosis_names: row.diagnosis_names,
        test_names: row.test_names,
      })),
    });
  } catch (error) {
    console.error("Load HMS referral prescriptions error:", error);
    return NextResponse.json({ error: "Unable to load referral prescriptions." }, { status: 500 });
  }
}
