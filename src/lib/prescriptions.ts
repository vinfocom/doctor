import prisma from "@/lib/prisma";
import { deleteObjectFromS3, uploadBufferToS3 } from "@/lib/s3";
import {
  buildPrescriptionPageObjectKey,
  validatePrescriptionImageFile,
  validatePrescriptionPageCount,
} from "@/lib/prescriptionStorage";
import type { JWTPayload } from "@/lib/jwt";

type ScopedAccess = {
  session: JWTPayload;
  patientId: number;
  doctorId: number;
  clinicId: number | null;
  appointmentId: number | null;
};

type PrescriptionAccessMode = "read" | "write";

type CreatePrescriptionInput = {
  session: JWTPayload | null;
  patientId: number;
  doctorId: number;
  clinicId?: unknown;
  appointmentId?: unknown;
  note?: unknown;
};

type UploadPrescriptionPagesInput = {
  session: JWTPayload | null;
  prescriptionId: number;
  patientId: number;
  doctorId: number;
  files: File[];
};

type CreatePrescriptionWithPagesInput = {
  session: JWTPayload | null;
  patientId: number;
  doctorId: number;
  clinicId?: unknown;
  appointmentId?: unknown;
  note?: unknown;
  files: File[];
};

type ListPrescriptionInput = {
  session: JWTPayload | null;
  patientId: number;
  doctorId: number;
};

type GetPrescriptionDetailInput = ListPrescriptionInput & {
  prescriptionId: number;
};

type UpdatePrescriptionInput = GetPrescriptionDetailInput & {
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  note?: string | null;
};

class PrescriptionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const toOptionalPositiveInt = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PrescriptionError(400, "Invalid numeric identifier.");
  }
  return parsed;
};

const normalizeNote = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const note = String(value).trim();
  if (!note) return null;
  return note.slice(0, 500);
};

const requireAuthorizedSession = (session: JWTPayload | null) => {
  if (!session) {
    throw new PrescriptionError(401, "Unauthorized");
  }

  if (
    session.role !== "DOCTOR" &&
    session.role !== "PATIENT" &&
    session.role !== "CLINIC_STAFF"
  ) {
    throw new PrescriptionError(403, "Forbidden");
  }

  return session;
};

const ensurePatientExists = async (patientId: number) => {
  const patient = await prisma.patients.findUnique({
    where: { patient_id: patientId },
    select: {
      patient_id: true,
      admin_id: true,
    },
  });

  if (!patient) {
    throw new PrescriptionError(404, "Patient not found");
  }

  return patient;
};

const ensureDoctorExists = async (doctorId: number) => {
  const doctor = await prisma.doctors.findUnique({
    where: { doctor_id: doctorId },
    select: {
      doctor_id: true,
      admin_id: true,
    },
  });

  if (!doctor) {
    throw new PrescriptionError(404, "Doctor not found");
  }

  return doctor;
};

const validateDoctorPatientScope = async ({
  session,
  patientId,
  doctorId,
  clinicId,
  appointmentId,
  accessMode,
}: {
  session: JWTPayload;
  patientId: number;
  doctorId: number;
  clinicId?: unknown;
  appointmentId?: unknown;
  accessMode: PrescriptionAccessMode;
}): Promise<ScopedAccess> => {
  const normalizedClinicId = toOptionalPositiveInt(clinicId);
  const normalizedAppointmentId = toOptionalPositiveInt(appointmentId);
  const patient = await ensurePatientExists(patientId);
  const doctor = await ensureDoctorExists(doctorId);

  if (doctor.admin_id !== patient.admin_id) {
    throw new PrescriptionError(
      403,
      "This patient is not linked to this doctor."
    );
  }

  if (session.role === "DOCTOR") {
    const doctorProfile = await prisma.doctors.findUnique({
      where: { user_id: session.userId },
      select: { doctor_id: true },
    });

    if (!doctorProfile || doctorProfile.doctor_id !== doctorId) {
      throw new PrescriptionError(
        403,
        "Prescription access is only allowed in the selected doctor context."
      );
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        patient_id: patientId,
        doctor_id: doctorId,
        ...(normalizedAppointmentId ? { appointment_id: normalizedAppointmentId } : {}),
        ...(normalizedClinicId ? { clinic_id: normalizedClinicId } : {}),
      },
      select: {
        appointment_id: true,
        clinic_id: true,
      },
    });

    if (!appointment) {
      throw new PrescriptionError(
        403,
        "This patient is not linked to this doctor."
      );
    }

    return {
      session,
      patientId,
      doctorId,
      clinicId: normalizedClinicId ?? appointment.clinic_id ?? null,
      appointmentId: normalizedAppointmentId ?? appointment.appointment_id ?? null,
    };
  }

  if (session.role === "CLINIC_STAFF") {
    const staff = await prisma.clinic_staff.findUnique({
      where: { user_id: session.userId },
      select: {
        doctor_id: true,
        clinic_id: true,
        staff_role: true,
      },
    });

    if (!staff || staff.doctor_id !== doctorId) {
      throw new PrescriptionError(
        403,
        "Prescription access is only allowed in the selected doctor context."
      );
    }

    if (
      accessMode === "write" &&
      (staff.staff_role === "VIEWER" || staff.staff_role === "Viewer")
    ) {
      throw new PrescriptionError(403, "Viewers cannot modify prescriptions.");
    }

    if (normalizedClinicId && staff.clinic_id && normalizedClinicId !== staff.clinic_id) {
      throw new PrescriptionError(
        403,
        "Prescription access is only allowed in the selected doctor context."
      );
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        patient_id: patientId,
        doctor_id: doctorId,
        ...(normalizedAppointmentId ? { appointment_id: normalizedAppointmentId } : {}),
        ...(staff.clinic_id ? { clinic_id: staff.clinic_id } : {}),
        ...(normalizedClinicId ? { clinic_id: normalizedClinicId } : {}),
      },
      select: {
        appointment_id: true,
        clinic_id: true,
      },
    });

    if (!appointment) {
      throw new PrescriptionError(
        403,
        "This patient is not linked to this doctor."
      );
    }

    return {
      session,
      patientId,
      doctorId,
      clinicId: normalizedClinicId ?? appointment.clinic_id ?? staff.clinic_id ?? null,
      appointmentId: normalizedAppointmentId ?? appointment.appointment_id ?? null,
    };
  }

  const sessionPatientId = session.patientId ?? session.userId;
  if (sessionPatientId !== patientId) {
    throw new PrescriptionError(
      403,
      "Prescription access is only allowed for your own patient account."
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      patient_id: patientId,
      doctor_id: doctorId,
      ...(normalizedAppointmentId ? { appointment_id: normalizedAppointmentId } : {}),
      ...(normalizedClinicId ? { clinic_id: normalizedClinicId } : {}),
    },
    select: {
      appointment_id: true,
      clinic_id: true,
    },
  });

  if (!appointment) {
    throw new PrescriptionError(
      403,
      "This patient is not linked to this doctor."
    );
  }

  return {
    session,
    patientId,
    doctorId,
    clinicId: normalizedClinicId ?? appointment.clinic_id ?? null,
    appointmentId: normalizedAppointmentId ?? appointment.appointment_id ?? null,
  };
};

const getUploaderFields = (scope: ScopedAccess) => {
  if (scope.session.role === "PATIENT") {
    const patientId = scope.session.patientId ?? scope.session.userId;
    return {
      uploaded_by_role: "PATIENT" as const,
      uploaded_by_user_id: null,
      uploaded_by_patient_id: patientId,
    };
  }

  if (scope.session.role === "DOCTOR") {
    return {
      uploaded_by_role: "DOCTOR" as const,
      uploaded_by_user_id: scope.session.userId,
      uploaded_by_patient_id: null,
    };
  }

  return {
    uploaded_by_role: "STAFF" as const,
    uploaded_by_user_id: scope.session.userId,
    uploaded_by_patient_id: null,
  };
};

const prescriptionSelect = {
  prescription_id: true,
  patient_id: true,
  doctor_id: true,
  clinic_id: true,
  appointment_id: true,
  uploaded_by_role: true,
  uploaded_by_user_id: true,
  uploaded_by_patient_id: true,
  note: true,
  page_count: true,
  status: true,
  created_at: true,
  updated_at: true,
  pages: {
    select: {
      prescription_page_id: true,
      page_number: true,
      storage_key: true,
      file_url: true,
      mime_type: true,
      original_file_name: true,
      file_size_bytes: true,
      width: true,
      height: true,
      created_at: true,
    },
    orderBy: { page_number: "asc" as const },
  },
  uploaded_by_user: {
    select: {
      user_id: true,
      name: true,
      email: true,
    },
  },
  uploaded_by_patient: {
    select: {
      patient_id: true,
      full_name: true,
      phone: true,
    },
  },
} as const;

type PrescriptionRecordWithRelations = {
  prescription_id: number;
  patient_id: number;
  doctor_id: number;
  clinic_id: number | null;
  appointment_id: number | null;
  uploaded_by_role: "PATIENT" | "DOCTOR" | "STAFF";
  uploaded_by_user_id: number | null;
  uploaded_by_patient_id: number | null;
  note: string | null;
  page_count: number;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  created_at: Date;
  updated_at: Date;
  pages: Array<{
    prescription_page_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
    created_at: Date;
  }>;
  uploaded_by_user: {
    user_id: number;
    name: string | null;
    email: string | null;
  } | null;
  uploaded_by_patient: {
    patient_id: number;
    full_name: string | null;
    phone: string | null;
  } | null;
};

const buildPrescriptionAuditMetadata = (
  prescription: PrescriptionRecordWithRelations
) => {
  const uploaderName =
    prescription.uploaded_by_role === "PATIENT"
      ? prescription.uploaded_by_patient?.full_name ?? null
      : prescription.uploaded_by_user?.name ?? null;

  return {
    uploaded_by: {
      role: prescription.uploaded_by_role,
      user_id: prescription.uploaded_by_user_id,
      patient_id: prescription.uploaded_by_patient_id,
      name: uploaderName,
    },
    uploaded_at: prescription.created_at,
    doctor_id: prescription.doctor_id,
    patient_id: prescription.patient_id,
    appointment_id: prescription.appointment_id,
    clinic_id: prescription.clinic_id,
    page_count: prescription.page_count,
    note: prescription.note,
  };
};

const attachPrescriptionAuditMetadata = <
  T extends PrescriptionRecordWithRelations
>(
  prescription: T
) => ({
  ...prescription,
  audit: buildPrescriptionAuditMetadata(prescription),
});

const attachPrescriptionAuditMetadataList = (
  prescriptions: PrescriptionRecordWithRelations[]
) => prescriptions.map((prescription) => attachPrescriptionAuditMetadata(prescription));

const assertPrescriptionMutationAllowed = (session: JWTPayload) => {
  if (session.role === "PATIENT") {
    throw new PrescriptionError(403, "Patients cannot archive or delete prescriptions.");
  }
};

const cleanupUploadedObjects = async (storageKeys: string[]) => {
  if (storageKeys.length === 0) return;

  await Promise.allSettled(storageKeys.map((key) => deleteObjectFromS3(key)));
};

const buildUploadedPrescriptionPages = async ({
  files,
  prescriptionId,
  doctorId,
  patientId,
  startingPageNumber,
}: {
  files: File[];
  prescriptionId: number;
  doctorId: number;
  patientId: number;
  startingPageNumber: number;
}) => {
  const uploadedPages: Array<{
    prescription_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
  }> = [];
  const uploadedStorageKeys: string[] = [];
  let pageNumber = startingPageNumber;

  try {
    for (const file of files) {
      const validation = validatePrescriptionImageFile({
        mimeType: file.type,
        size: file.size,
      });

      if (!validation.ok) {
        throw new PrescriptionError(400, validation.error);
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const key = buildPrescriptionPageObjectKey({
        doctorId,
        patientId,
        prescriptionId,
        pageNumber,
        mimeType: file.type,
      });

      const uploaded = await uploadBufferToS3({
        key,
        buffer,
        contentType: file.type || "application/octet-stream",
      });

      uploadedStorageKeys.push(uploaded.key);
      uploadedPages.push({
        prescription_id: prescriptionId,
        page_number: pageNumber,
        storage_key: uploaded.key,
        file_url: uploaded.url,
        mime_type: file.type || null,
        original_file_name: file.name || null,
        file_size_bytes: file.size || null,
        width: null,
        height: null,
      });

      pageNumber += 1;
    }

    return uploadedPages;
  } catch (error) {
    await cleanupUploadedObjects(uploadedStorageKeys);
    throw error;
  }
};

export const createPrescriptionRecord = async ({
  session,
  patientId,
  doctorId,
  clinicId,
  appointmentId,
  note,
}: CreatePrescriptionInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    clinicId,
    appointmentId,
    accessMode: "write",
  });

  const created = await prisma.prescription_records.create({
    data: {
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      clinic_id: scope.clinicId,
      appointment_id: scope.appointmentId,
      note: normalizeNote(note),
      page_count: 0,
      status: "ACTIVE",
      ...getUploaderFields(scope),
    },
    select: prescriptionSelect,
  });

  return attachPrescriptionAuditMetadata(created);
};

export const createPrescriptionWithPages = async ({
  session,
  patientId,
  doctorId,
  clinicId,
  appointmentId,
  note,
  files,
}: CreatePrescriptionWithPagesInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    clinicId,
    appointmentId,
    accessMode: "write",
  });

  const pageCountCheck = validatePrescriptionPageCount(files.length);
  if (!pageCountCheck.ok) {
    throw new PrescriptionError(400, pageCountCheck.error);
  }

  const created = await prisma.prescription_records.create({
    data: {
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      clinic_id: scope.clinicId,
      appointment_id: scope.appointmentId,
      note: normalizeNote(note),
      page_count: 0,
      status: "ACTIVE",
      ...getUploaderFields(scope),
    },
    select: {
      prescription_id: true,
    },
  });

  let uploadedPages: Array<{
    prescription_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
  }> = [];

  try {
    uploadedPages = await buildUploadedPrescriptionPages({
      files,
      prescriptionId: created.prescription_id,
      doctorId: scope.doctorId,
      patientId: scope.patientId,
      startingPageNumber: 1,
    });

    await prisma.$transaction(async (tx) => {
      await tx.prescription_pages.createMany({
        data: uploadedPages,
      });

      await tx.prescription_records.update({
        where: { prescription_id: created.prescription_id },
        data: {
          page_count: uploadedPages.length,
        },
      });
    });
  } catch (error) {
    await cleanupUploadedObjects(uploadedPages.map((page) => page.storage_key));
    await prisma.prescription_records
      .delete({
        where: { prescription_id: created.prescription_id },
      })
      .catch(() => undefined);
    throw error;
  }

  const prescription = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: created.prescription_id,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: prescriptionSelect,
  });

  if (!prescription) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  return attachPrescriptionAuditMetadata(prescription);
};

export const uploadPrescriptionPages = async ({
  session,
  prescriptionId,
  patientId,
  doctorId,
  files,
}: UploadPrescriptionPagesInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    accessMode: "write",
  });

  const pageCountCheck = validatePrescriptionPageCount(files.length);
  if (!pageCountCheck.ok) {
    throw new PrescriptionError(400, pageCountCheck.error);
  }

  const prescription = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: prescriptionId,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: {
      prescription_id: true,
      patient_id: true,
      doctor_id: true,
      page_count: true,
      status: true,
      pages: {
        select: {
          page_number: true,
        },
        orderBy: { page_number: "asc" },
      },
    },
  });

  if (!prescription) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  if (prescription.page_count === 0 && prescription.pages.length === 0) {
    throw new PrescriptionError(
      409,
      "This prescription record is incomplete. Use grouped prescription upload instead of the legacy page upload path."
    );
  }

  const nextTotalPageCount = prescription.page_count + files.length;
  const totalPageCountCheck = validatePrescriptionPageCount(nextTotalPageCount);
  if (!totalPageCountCheck.ok) {
    throw new PrescriptionError(400, totalPageCountCheck.error);
  }

  const uploadedPages = await buildUploadedPrescriptionPages({
    files,
    prescriptionId: prescription.prescription_id,
    doctorId: scope.doctorId,
    patientId: scope.patientId,
    startingPageNumber: prescription.page_count + 1,
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.prescription_pages.createMany({
        data: uploadedPages,
      });

      await tx.prescription_records.update({
        where: { prescription_id: prescription.prescription_id },
        data: {
          page_count: nextTotalPageCount,
        },
      });
    });
  } catch (error) {
    await cleanupUploadedObjects(uploadedPages.map((page) => page.storage_key));
    throw error;
  }

  const refreshedPrescription = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: prescription.prescription_id,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: prescriptionSelect,
  });

  if (!refreshedPrescription) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  return attachPrescriptionAuditMetadata(refreshedPrescription);
};

export const listPrescriptionsForPatientDoctor = async ({
  session,
  patientId,
  doctorId,
}: ListPrescriptionInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    accessMode: "read",
  });

  const prescriptions = await prisma.prescription_records.findMany({
    where: {
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: prescriptionSelect,
    orderBy: { created_at: "desc" },
  });

  return attachPrescriptionAuditMetadataList(prescriptions);
};

export const getPrescriptionDetail = async ({
  session,
  prescriptionId,
  patientId,
  doctorId,
}: GetPrescriptionDetailInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    accessMode: "read",
  });

  const prescription = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: prescriptionId,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: prescriptionSelect,
  });

  if (!prescription) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  return attachPrescriptionAuditMetadata(prescription);
};

export const updatePrescriptionStatus = async ({
  session,
  prescriptionId,
  patientId,
  doctorId,
  status,
  note,
}: UpdatePrescriptionInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  assertPrescriptionMutationAllowed(authorizedSession);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    accessMode: "write",
  });

  const existing = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: prescriptionId,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
    },
    select: { prescription_id: true },
  });

  if (!existing) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  const updatedPrescription = await prisma.prescription_records.update({
    where: { prescription_id: existing.prescription_id },
    data: {
      status,
      ...(note !== undefined ? { note: normalizeNote(note) } : {}),
    },
    select: prescriptionSelect,
  });

  return attachPrescriptionAuditMetadata(updatedPrescription);
};

export const deletePrescription = async ({
  session,
  prescriptionId,
  patientId,
  doctorId,
}: GetPrescriptionDetailInput) => {
  const authorizedSession = requireAuthorizedSession(session);
  const scope = await validateDoctorPatientScope({
    session: authorizedSession,
    patientId,
    doctorId,
    accessMode: "write",
  });

  const existing = await prisma.prescription_records.findFirst({
    where: {
      prescription_id: prescriptionId,
      patient_id: scope.patientId,
      doctor_id: scope.doctorId,
      status: { not: "DELETED" },
    },
    select: prescriptionSelect,
  });

  if (!existing) {
    throw new PrescriptionError(404, "Prescription not found");
  }

  const storageKeys = existing.pages.map((page) => page.storage_key).filter(Boolean);

  await prisma.$transaction(async (tx) => {
    await tx.prescription_pages.deleteMany({
      where: { prescription_id: existing.prescription_id },
    });

    await tx.prescription_records.delete({
      where: { prescription_id: existing.prescription_id },
    });
  });

  await cleanupUploadedObjects(storageKeys);

  return attachPrescriptionAuditMetadata(existing as PrescriptionRecordWithRelations);
};

export const parseRequiredId = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PrescriptionError(400, `Invalid ${label}`);
  }
  return parsed;
};

export const getPrescriptionErrorResponse = (error: unknown) => {
  if (error instanceof PrescriptionError) {
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
};
