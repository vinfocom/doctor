import prisma from "@/lib/prisma";

type DbClient = typeof prisma;

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));
}

function getISTTodayDate() {
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(`${todayYmd}T00:00:00.000Z`);
}

export function getActiveDoctorWhere() {
  const today = getISTTodayDate();
  return {
    status: "ACTIVE" as const,
    AND: [
      {
        OR: [
          { active_from: null },
          { active_from: { lte: today } },
        ],
      },
      {
        OR: [
          { active_to: null },
          { active_to: { gte: today } },
        ],
      },
    ],
  };
}

export function normalizeDoctorIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return uniqueNumbers(raw.map((value) => Number(value)));
}

export function resolveAssignedDoctorIds(staff: {
  doctor_id: number;
  doctor_access?: Array<{ doctor_id: number }> | null;
}) {
  const mappedIds = uniqueNumbers((staff.doctor_access || []).map((item) => Number(item.doctor_id)));
  return uniqueNumbers([Number(staff.doctor_id), ...mappedIds]);
}

export function hasHospitalDoctorAccess(staff: {
  doctor_id: number;
  doctor_access?: Array<{ doctor_id: number }> | null;
}) {
  return (staff.doctor_access || []).some((item) => Number(item.doctor_id) !== Number(staff.doctor_id));
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export function getClinicStaffAccessBlockReason(
  staff: {
    status?: string | null;
    valid_from?: Date | string | null;
    valid_to?: Date | string | null;
  },
  now = new Date()
) {
  const status = String(staff.status || "ACTIVE").toUpperCase();
  if (status !== "ACTIVE") {
    return "Staff account is inactive.";
  }

  const today = formatDateOnly(now);
  const validFrom = formatDateOnly(staff.valid_from);
  const validTo = formatDateOnly(staff.valid_to);

  if (today && validFrom && validFrom > today) {
    return "Staff account access has not started yet.";
  }

  if (today && validTo && validTo < today) {
    return "Staff account access has expired.";
  }

  return null;
}

export async function resolveHospitalScopedDoctorAssignments(
  db: DbClient,
  ownerDoctorId: number,
  rawDoctorIds: unknown,
  clinicId?: number | null
) {
  const requestedIds = uniqueNumbers([ownerDoctorId, ...normalizeDoctorIds(rawDoctorIds)]);
  if (requestedIds.length === 0) return [];

  const extraDoctorIds = requestedIds.filter((doctorId) => doctorId !== ownerDoctorId);
  if (extraDoctorIds.length === 0) {
    return requestedIds;
  }

  let allowedGroupCodes: string[] = [];

  if (clinicId) {
    const scopedClinic = await db.clinics.findFirst({
      where: {
        clinic_id: clinicId,
        doctor_id: ownerDoctorId,
      },
      select: {
        hospital_group_code: true,
      },
    });

    if (!scopedClinic) {
      throw new Error("Selected clinic not found for this doctor.");
    }

    if (scopedClinic.hospital_group_code) {
      allowedGroupCodes = [scopedClinic.hospital_group_code];
    }
  }

  if (allowedGroupCodes.length === 0) {
    const ownerGroupedClinics = await db.clinics.findMany({
      where: {
        doctor_id: ownerDoctorId,
        hospital_group_code: { not: null },
      },
      select: {
        hospital_group_code: true,
      },
    });

    allowedGroupCodes = Array.from(
      new Set(
        ownerGroupedClinics
          .map((clinic) => String(clinic.hospital_group_code || "").trim())
          .filter(Boolean)
      )
    );
  }

  if (allowedGroupCodes.length === 0) {
    throw new Error("Assigning staff to multiple doctors requires a shared hospital group.");
  }

  const matchedClinics = await db.clinics.findMany({
    where: {
      doctor_id: { in: extraDoctorIds },
      hospital_group_code: { in: allowedGroupCodes },
    },
    select: {
      doctor_id: true,
    },
  });

  const matchedDoctorIds = new Set(
    matchedClinics.map((clinic) => Number(clinic.doctor_id)).filter((value) => Number.isFinite(value) && value > 0)
  );
  const invalidDoctorIds = extraDoctorIds.filter((doctorId) => !matchedDoctorIds.has(doctorId));

  if (invalidDoctorIds.length > 0) {
    throw new Error("Some selected doctors are outside the allowed hospital group.");
  }

  return requestedIds;
}

export async function getHospitalGroupCodesForDoctors(
  db: DbClient,
  doctorIds: number[]
) {
  const normalizedDoctorIds = uniqueNumbers(doctorIds);
  if (normalizedDoctorIds.length === 0) return [];

  const clinics = await db.clinics.findMany({
    where: {
      doctor_id: { in: normalizedDoctorIds },
      hospital_group_code: { not: null },
    },
    select: {
      hospital_group_code: true,
    },
  });

  return Array.from(
    new Set(
      clinics
        .map((clinic) => String(clinic.hospital_group_code || "").trim())
        .filter(Boolean)
    )
  );
}

export async function resolveEffectiveAssignedDoctorIds(
  db: DbClient,
  staff: {
    doctor_id: number;
    doctor_access?: Array<{ doctor_id: number }> | null;
    clinics?: { hospital_group_code?: string | null } | null;
  }
) {
  const groupCode = String(staff.clinics?.hospital_group_code || "").trim();
  const canUseHospitalScope = hasHospitalDoctorAccess(staff) && Boolean(groupCode);
  const candidateDoctorIds = canUseHospitalScope
    ? resolveAssignedDoctorIds(staff)
    : uniqueNumbers([Number(staff.doctor_id)]);

  if (candidateDoctorIds.length === 0) return [];

  const activeDoctors = await db.doctors.findMany({
    where: {
      doctor_id: { in: candidateDoctorIds },
      ...getActiveDoctorWhere(),
    },
    select: { doctor_id: true },
  });
  const activeDoctorIds = uniqueNumbers(activeDoctors.map((doctor) => Number(doctor.doctor_id)));

  if (!canUseHospitalScope || activeDoctorIds.length === 0) {
    return activeDoctorIds.filter((doctorId) => doctorId === Number(staff.doctor_id));
  }

  const activeGroupedClinics = await db.clinics.findMany({
    where: {
      doctor_id: { in: activeDoctorIds },
      hospital_group_code: groupCode,
      status: "ACTIVE",
    },
    select: { doctor_id: true },
  });

  return uniqueNumbers(
    activeGroupedClinics
      .map((clinic) => Number(clinic.doctor_id))
      .filter((doctorId) => activeDoctorIds.includes(doctorId))
  );
}
