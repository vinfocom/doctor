import prisma from "@/lib/prisma";
import type { JWTPayload } from "@/lib/jwt";
import { assertDoctorEmrPadEnabled } from "@/lib/emrFeatureGate";

export type EmrAccessMode = "read" | "write" | "review";

export type EmrDoctorScopedContext = {
  session: JWTPayload;
  doctorId: number;
  patientId: number;
  appointmentId: number;
  clinicId: number | null;
  adminId: number;
};

export type EmrAdminReviewContext = {
  session: JWTPayload;
  adminUserId: number;
};

export type EmrDoctorFeatureContext = {
  session: JWTPayload;
  doctorId: number;
  adminId: number;
};

export type EmrPatientFinalAccessContext = {
  session: JWTPayload;
  patientId: number;
  prescriptionId: number;
};

export class EmrAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toRequiredPositiveInt(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EmrAccessError(400, `Invalid ${label}`);
  }
  return parsed;
}

function toOptionalPositiveInt(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return toRequiredPositiveInt(value, label);
}

function requireSession(session: JWTPayload | null) {
  if (!session) {
    throw new EmrAccessError(401, "Unauthorized");
  }

  return session;
}

async function getDoctorProfileForSession(session: JWTPayload) {
  const doctor = await prisma.doctors.findUnique({
    where: { user_id: session.userId },
    select: {
      doctor_id: true,
      admin_id: true,
    },
  });

  if (!doctor) {
    throw new EmrAccessError(404, "Doctor profile not found");
  }

  return doctor;
}

async function getPatientById(patientId: number) {
  const patient = await prisma.patients.findUnique({
    where: { patient_id: patientId },
    select: {
      patient_id: true,
      admin_id: true,
      doctor_id: true,
    },
  });

  if (!patient) {
    throw new EmrAccessError(404, "Patient not found");
  }

  return patient;
}

export async function validateDoctorEmrAccess(input: {
  session: JWTPayload | null;
  doctorId: unknown;
  patientId: unknown;
  appointmentId: unknown;
  clinicId?: unknown;
  accessMode: EmrAccessMode;
}) {
  const session = requireSession(input.session);
  if (session.role !== "DOCTOR") {
    throw new EmrAccessError(
      403,
      "EMR doctor actions are only allowed in the doctor account context."
    );
  }

  const doctorId = toRequiredPositiveInt(input.doctorId, "doctor_id");
  const patientId = toRequiredPositiveInt(input.patientId, "patient_id");
  const appointmentId = toRequiredPositiveInt(
    input.appointmentId,
    "appointment_id"
  );
  const clinicId = toOptionalPositiveInt(input.clinicId, "clinic_id");

  const doctorProfile = await getDoctorProfileForSession(session);
  if (doctorProfile.doctor_id !== doctorId) {
    throw new EmrAccessError(
      403,
      "EMR access is only allowed in the selected doctor context."
    );
  }

  await assertDoctorEmrPadEnabled(doctorId);

  const patient = await getPatientById(patientId);
  if (patient.admin_id !== doctorProfile.admin_id) {
    throw new EmrAccessError(
      403,
      "This patient is not linked to this doctor."
    );
  }

  if (patient.doctor_id && patient.doctor_id !== doctorId) {
    throw new EmrAccessError(
      403,
      "This patient is not linked to this doctor."
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      appointment_id: appointmentId,
      doctor_id: doctorId,
      patient_id: patientId,
      ...(clinicId ? { clinic_id: clinicId } : {}),
    },
    select: {
      appointment_id: true,
      clinic_id: true,
      patient_id: true,
      doctor_id: true,
      admin_id: true,
      status: true,
    },
  });

  if (!appointment) {
    throw new EmrAccessError(
      403,
      "Appointment does not belong to the selected doctor-patient context."
    );
  }

  if (appointment.patient_id !== patientId || appointment.doctor_id !== doctorId) {
    throw new EmrAccessError(
      403,
      "Appointment does not belong to the selected doctor-patient context."
    );
  }

  return {
    session,
    doctorId,
    patientId,
    appointmentId: appointment.appointment_id,
    clinicId: clinicId ?? appointment.clinic_id ?? null,
    adminId: patient.admin_id,
  } satisfies EmrDoctorScopedContext;
}

export async function validateAdminEmrReviewAccess(input: {
  session: JWTPayload | null;
}) {
  const session = requireSession(input.session);
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    throw new EmrAccessError(
      403,
      "Only admin users can review EMR master data or layout settings."
    );
  }

  return {
    session,
    adminUserId: session.userId,
  } satisfies EmrAdminReviewContext;
}

export async function validateDoctorEmrFeatureAccess(input: {
  session: JWTPayload | null;
}) {
  const session = requireSession(input.session);
  if (session.role !== "DOCTOR") {
    throw new EmrAccessError(
      403,
      "Only doctors can access EMR master suggestions in the doctor portal."
    );
  }

  const doctorProfile = await getDoctorProfileForSession(session);
  await assertDoctorEmrPadEnabled(doctorProfile.doctor_id);

  return {
    session,
    doctorId: doctorProfile.doctor_id,
    adminId: doctorProfile.admin_id,
  } satisfies EmrDoctorFeatureContext;
}

export async function validatePatientFinalPrescriptionAccess(input: {
  session: JWTPayload | null;
  patientId: unknown;
  prescriptionId: unknown;
}) {
  const session = requireSession(input.session);
  if (session.role !== "PATIENT") {
    throw new EmrAccessError(
      403,
      "Patient prescription access is only allowed for patient accounts."
    );
  }

  const patientId = toRequiredPositiveInt(input.patientId, "patient_id");
  const prescriptionId = toRequiredPositiveInt(
    input.prescriptionId,
    "prescription_id"
  );

  const sessionPatientId = session.patientId ?? session.userId;
  if (sessionPatientId !== patientId) {
    throw new EmrAccessError(
      403,
      "Prescription access is only allowed for your own patient account."
    );
  }

  const prescription = await prisma.$queryRaw<
    Array<{ id: number; patient_id: number; status: string; is_deleted: boolean | number }>
  >`
    SELECT id, patient_id, status, is_deleted
    FROM prescriptions
    WHERE id = ${prescriptionId}
      AND patient_id = ${patientId}
    LIMIT 1
  `;

  const record = prescription[0];
  if (!record || record.patient_id !== patientId) {
    throw new EmrAccessError(404, "Prescription not found");
  }

  if (record.status !== "final" || record.is_deleted === true || record.is_deleted === 1) {
    throw new EmrAccessError(
      403,
      "Only finalized prescriptions are available in the patient context."
    );
  }

  return {
    session,
    patientId,
    prescriptionId,
  } satisfies EmrPatientFinalAccessContext;
}

export function getEmrAccessErrorResponse(error: unknown) {
  if (error instanceof EmrAccessError) {
    return {
      status: error.status,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    },
  };
}
