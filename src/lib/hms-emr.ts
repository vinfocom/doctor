import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { getHmsEmrLayoutSettings } from "@/lib/hms-emr-layout-settings";

export class HmsEmrAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HmsEmrAccessError";
  }
}

type HmsVisitForEmrRow = {
  visit_id: number;
  visit_number: string | null;
  visit_date: Date | string;
  visit_type: string;
  status: string;
  referred_by_doctor_id: number | null;
  referring_prescription_id: number | null;
  patient_id: number;
  doctor_id: number;
  patient_name: string | null;
  patient_uhid: string | null;
  patient_phone: string | null;
  age: number | null;
  gender: string | null;
  doctor_name: string | null;
  referred_by_doctor_name: string | null;
  room_no: string | null;
};

type HmsReferralDoctorRow = {
  doctor_id: number;
  doctor_name: string | null;
  specialization: string | null;
  education: string | null;
};

function normalizeId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HmsEmrAccessError(400, "Invalid visit id");
  }
  return id;
}

function toDateString(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export async function resolveHmsDoctorVisitEmrScope(
  req: NextRequest,
  visitIdParam: string,
  options: { autoResumeLab?: boolean } = {}
) {
  const session = await getHmsSessionFromRequest(req);
  if (!session || session.hospitalContext.role !== "DOCTOR") {
    throw new HmsEmrAccessError(403, "Doctor access is required.");
  }

  if (session.forcePasswordChange) {
    throw new HmsEmrAccessError(403, "Change your temporary password before using HMS.");
  }

  if (!(await isHmsFeatureEnabled(session.hospitalContext, "emr_module"))) {
    throw new HmsEmrAccessError(403, "EMR is disabled for this hospital.");
  }

  const visitId = normalizeId(visitIdParam);
  const hospital = session.hospitalContext;

  const rows = await prisma.$queryRawUnsafe<HmsVisitForEmrRow[]>(
    `
    SELECT
      v.visit_id,
      v.visit_number,
      v.visit_date,
      v.visit_type,
      v.status,
      v.referred_by_doctor_id,
      v.referring_prescription_id,
      v.patient_id,
      v.doctor_id,
      p.full_name AS patient_name,
      p.uhid AS patient_uhid,
      p.phone AS patient_phone,
      p.age,
      p.gender,
      d.doctor_name,
      rd.doctor_name AS referred_by_doctor_name,
      hd.room_no
    FROM visits v
    INNER JOIN patients p
      ON p.patient_id = v.patient_id
     AND p.admin_id = ?
     AND p.hospital_group_code = ?
    INNER JOIN doctors d
      ON d.doctor_id = v.doctor_id
     AND d.admin_id = ?
     AND d.user_id = ?
    INNER JOIN hospital_doctors hd
      ON hd.hospital_id = v.hospital_id
     AND hd.doctor_id = v.doctor_id
    LEFT JOIN doctors rd
      ON rd.doctor_id = v.referred_by_doctor_id
     AND rd.admin_id = ?
    WHERE v.visit_id = ?
      AND v.hospital_id = ?
      AND v.admin_id = ?
      AND v.hospital_group_code = ?
      AND v.status <> 'CANCELLED'
    LIMIT 1
    `,
    hospital.adminId,
    hospital.hospitalCode,
    hospital.adminId,
    hospital.userId,
    hospital.adminId,
    visitId,
    hospital.hospitalId,
    hospital.adminId,
    hospital.hospitalCode
  );

  const visit = rows[0];
  if (!visit) {
    throw new HmsEmrAccessError(404, "Visit not found in your HMS doctor context.");
  }

  if (visit.status === "WAITING" || (visit.status === "LAB" && options.autoResumeLab)) {
    const updatedRows = await prisma.$executeRawUnsafe(
      `
      UPDATE visits
      SET status = 'IN_CONSULT',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE visit_id = ?
        AND hospital_id = ?
        AND admin_id = ?
        AND hospital_group_code = ?
        AND doctor_id = ?
        AND status IN (${options.autoResumeLab ? "'WAITING', 'LAB'" : "'WAITING'"})
      `,
      visit.visit_id,
      hospital.hospitalId,
      hospital.adminId,
      hospital.hospitalCode,
      visit.doctor_id
    );
    if (Number(updatedRows) > 0) {
      visit.status = "IN_CONSULT";
    }
  }

  const referralDoctorRows = await prisma.$queryRawUnsafe<HmsReferralDoctorRow[]>(
    `
    SELECT
      d.doctor_id,
      d.doctor_name,
      d.specialization,
      d.education
    FROM hospital_doctors hd
    INNER JOIN doctors d
      ON d.doctor_id = hd.doctor_id
     AND d.admin_id = ?
    WHERE hd.hospital_id = ?
      AND hd.doctor_id <> ?
    ORDER BY d.doctor_name ASC, d.doctor_id ASC
    `,
    hospital.adminId,
    hospital.hospitalId,
    visit.doctor_id
  );

  return {
    hospital,
    visit: {
      visit_id: Number(visit.visit_id),
      visit_number: visit.visit_number,
      visit_date: toDateString(visit.visit_date),
      visit_type: visit.visit_type,
      status: visit.status,
      patient_id: Number(visit.patient_id),
      doctor_id: Number(visit.doctor_id),
      patient: {
        patient_id: Number(visit.patient_id),
        full_name: visit.patient_name,
        uhid: visit.patient_uhid,
        phone: visit.patient_phone,
        age: visit.age,
        gender: visit.gender,
        allergies: [],
      },
      doctor: {
        doctor_id: Number(visit.doctor_id),
        doctor_name: visit.doctor_name,
      },
      referral: visit.referring_prescription_id
        ? {
            referred_by_doctor_id: visit.referred_by_doctor_id ? Number(visit.referred_by_doctor_id) : null,
            referred_by_doctor_name: visit.referred_by_doctor_name,
            referring_prescription_id: Number(visit.referring_prescription_id),
          }
        : null,
      clinic: {
        clinic_id: null,
        clinic_name: "HMS",
      },
      appointment: {
        appointment_id: Number(visit.visit_id),
        appointment_date: toDateString(visit.visit_date),
        start_time: null,
        end_time: null,
        status: visit.status,
        booked_for: "SELF",
      },
      referral_doctors: referralDoctorRows.map((doctor) => ({
        doctor_id: Number(doctor.doctor_id),
        doctor_name: doctor.doctor_name,
        specialization: doctor.specialization,
        qualification: doctor.education,
      })),
    },
  };
}

export function buildHmsDraftResponse(
  scope: Awaited<ReturnType<typeof resolveHmsDoctorVisitEmrScope>>,
  draft: unknown,
  warnings: unknown[],
  layout?: Awaited<ReturnType<typeof getHmsEmrLayoutSettings>> | null
) {
  return {
    context: {
      emrModule: "hms-doctor-emr-pad",
      imagePrescriptionModule: "doctor-image-prescriptions",
      featureEnabled: true,
      appointment: scope.visit.appointment,
      patient: scope.visit.patient,
      clinic: scope.visit.clinic,
      doctor: scope.visit.doctor,
      referral: scope.visit.referral,
      referral_doctors: scope.visit.referral_doctors,
      visit: {
        visit_id: scope.visit.visit_id,
        visit_number: scope.visit.visit_number,
        visit_type: scope.visit.visit_type,
        status: scope.visit.status,
      },
    },
    draft,
    warnings,
    ...(layout
      ? {
          layout_settings: layout.settings,
          layout_defaults: layout.defaults,
          hms_layout: layout.hmsLayout,
        }
      : {}),
  };
}

export function getHmsEmrAccessErrorResponse(error: unknown) {
  if (error instanceof HmsEmrAccessError) {
    return {
      status: error.status,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: { error: "Unable to process HMS EMR request." },
  };
}
