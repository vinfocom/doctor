import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getEmrFeatureErrorResponse } from "@/lib/emrFeatureGate";
import {
  getDoctorSafeErrorMessage,
  logEmrOperationalError,
} from "@/lib/emr";
import {
  EmrAccessError,
  getEmrAccessErrorResponse,
  validateDoctorEmrAccess,
} from "@/lib/emr/access";
import {
  computeDraftWarnings,
  findExistingDraftPrescription,
  getPrescriptionRecord,
  getOrCreateDraftPrescription,
  saveDraftPrescription,
} from "@/lib/emr/prescriptionService";
import type {
  EmrClinicalHistoryPayload,
  EmrCustomFieldValuePayload,
  EmrDraftSavePayload,
} from "@/lib/emr/types";

export const dynamic = "force-dynamic";

async function loadAppointmentForDraft(appointmentId: number) {
  return prisma.appointment.findFirst({
    where: { appointment_id: appointmentId },
    select: {
      appointment_id: true,
      appointment_date: true,
      start_time: true,
      end_time: true,
      status: true,
      booked_for: true,
      patient_id: true,
      doctor_id: true,
      clinic_id: true,
      patient: {
        select: {
          patient_id: true,
          full_name: true,
          phone: true,
          age: true,
          gender: true,
        },
      },
      clinic: {
        select: {
          clinic_id: true,
          clinic_name: true,
        },
      },
      doctor: {
        select: {
          doctor_id: true,
          doctor_name: true,
        },
      },
    },
  });
}

async function resolveDoctorDraftScope(req: NextRequest, appointmentIdParam: string) {
  const session = await getSessionFromRequest(req);
  const appointmentId = Number(appointmentIdParam);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    throw new EmrAccessError(400, "Invalid appointment id");
  }

  const appointment = await loadAppointmentForDraft(appointmentId);
  if (!appointment || !appointment.patient_id || !appointment.doctor_id) {
    throw new EmrAccessError(
      404,
      "Appointment not found in the current doctor context"
    );
  }

  const scope = await validateDoctorEmrAccess({
    session,
    doctorId: appointment.doctor_id,
    patientId: appointment.patient_id,
    appointmentId: appointment.appointment_id,
    clinicId: appointment.clinic_id,
    accessMode: "write",
  });

  return { appointment, scope };
}

function buildDraftResponse(
  appointment: NonNullable<Awaited<ReturnType<typeof loadAppointmentForDraft>>>,
  draft: Awaited<ReturnType<typeof getPrescriptionRecord>>
) {
  const draftWithClinicalHistory = draft
    ? {
        ...draft,
        clinical_history: draft.clinical_history ?? [],
        custom_fields: draft.custom_fields ?? [],
      }
    : null;

  return {
    context: {
      emrModule: "doctor-emr-pad",
      imagePrescriptionModule: "doctor-image-prescriptions",
      featureEnabled: true,
      appointment: {
        appointment_id: appointment.appointment_id,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
        booked_for: appointment.booked_for,
      },
      patient: appointment.patient
        ? {
            ...appointment.patient,
            allergies: [],
          }
        : null,
      clinic: appointment.clinic,
      doctor: appointment.doctor,
    },
    draft: draftWithClinicalHistory,
    warnings: draftWithClinicalHistory ? computeDraftWarnings(draftWithClinicalHistory) : [],
  };
}

function normalizeClinicalHistoryPayload(
  items: EmrDraftSavePayload["clinical_history"]
): EmrClinicalHistoryPayload[] | undefined {
  if (!Array.isArray(items)) {
    return undefined;
  }

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
  if (!Array.isArray(items)) {
    return undefined;
  }

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const { appointment, scope } = await resolveDoctorDraftScope(req, appointmentId);
    const prescriptionIdParam = req.nextUrl.searchParams.get("prescriptionId");
    const requestedPrescriptionId = Number(prescriptionIdParam);

    let draft = null;

    if (Number.isInteger(requestedPrescriptionId) && requestedPrescriptionId > 0) {
      const existingPrescription = await getPrescriptionRecord(
        requestedPrescriptionId,
        scope.doctorId
      );

      if (!existingPrescription) {
        throw new EmrAccessError(404, "Prescription not found in the current doctor context");
      }

      if (
        existingPrescription.patient_id !== scope.patientId
      ) {
        throw new EmrAccessError(
          403,
          "Prescription does not belong to the selected patient context"
        );
      }

      draft = existingPrescription;
    } else {
      draft = await findExistingDraftPrescription({
        doctorId: scope.doctorId,
        patientId: scope.patientId,
        appointmentId: scope.appointmentId,
      });
    }

    return NextResponse.json(buildDraftResponse(appointment, draft), {
      status: 200,
    });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    const featureResponse = getEmrFeatureErrorResponse(error);
    if (featureResponse.status !== 500) {
      return NextResponse.json(featureResponse.body, {
        status: featureResponse.status,
      });
    }

    logEmrOperationalError("emr-open-draft", error);

    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(error, "Failed to open EMR draft"),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const { appointment, scope } = await resolveDoctorDraftScope(req, appointmentId);

    const draft =
      (await findExistingDraftPrescription({
        doctorId: scope.doctorId,
        patientId: scope.patientId,
        appointmentId: scope.appointmentId,
      })) ??
      (await getOrCreateDraftPrescription({
        doctorId: scope.doctorId,
        patientId: scope.patientId,
        appointmentId: scope.appointmentId,
        clinicId: scope.clinicId,
        visitDate: appointment.appointment_date,
        timezone: "Asia/Kolkata",
      }));

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to create EMR draft" },
        { status: 500 }
      );
    }

    return NextResponse.json(buildDraftResponse(appointment, draft), {
      status: 200,
    });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    const featureResponse = getEmrFeatureErrorResponse(error);
    if (featureResponse.status !== 500) {
      return NextResponse.json(featureResponse.body, {
        status: featureResponse.status,
      });
    }

    logEmrOperationalError("emr-create-draft", error);

    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(error, "Failed to create EMR draft"),
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { appointmentId } = await params;
    const { appointment, scope } = await resolveDoctorDraftScope(req, appointmentId);
    const body = (await req.json()) as EmrDraftSavePayload;

    const draft =
      (await findExistingDraftPrescription({
        doctorId: scope.doctorId,
        patientId: scope.patientId,
        appointmentId: scope.appointmentId,
      })) ??
      (await getOrCreateDraftPrescription({
      doctorId: scope.doctorId,
      patientId: scope.patientId,
      appointmentId: scope.appointmentId,
      clinicId: scope.clinicId,
      visitDate: appointment.appointment_date,
      timezone: body.timezone ?? "Asia/Kolkata",
      }));

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to load EMR draft" },
        { status: 500 }
      );
    }

    const clinicalHistory = normalizeClinicalHistoryPayload(body.clinical_history);
    const customFields = normalizeCustomFieldsPayload(body.custom_fields);
    const updatedDraft = await saveDraftPrescription(draft.id, scope.doctorId, {
      ...body,
      clinic_id: body.clinic_id ?? scope.clinicId,
      visit_date: body.visit_date ?? appointment.appointment_date,
      timezone: body.timezone ?? "Asia/Kolkata",
      ...(clinicalHistory !== undefined ? { clinical_history: clinicalHistory } : {}),
      ...(customFields !== undefined ? { custom_fields: customFields } : {}),
    });

    return NextResponse.json(
      {
        draft: updatedDraft,
        warnings: computeDraftWarnings(updatedDraft),
        save_state: "saved",
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Another save is in progress. Please try again."
    ) {
      const { appointmentId } = await params;
      const { appointment, scope } = await resolveDoctorDraftScope(req, appointmentId);
      const draft =
        (await findExistingDraftPrescription({
          doctorId: scope.doctorId,
          patientId: scope.patientId,
          appointmentId: scope.appointmentId,
        })) ??
        (await getOrCreateDraftPrescription({
        doctorId: scope.doctorId,
        patientId: scope.patientId,
        appointmentId: scope.appointmentId,
        clinicId: scope.clinicId,
        visitDate: appointment.appointment_date,
        timezone: "Asia/Kolkata",
        }));

      return NextResponse.json(
        {
          draft,
          warnings: computeDraftWarnings(draft),
          save_state: "busy",
        },
        { status: 202 }
      );
    }

    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    const featureResponse = getEmrFeatureErrorResponse(error);
    if (featureResponse.status !== 500) {
      return NextResponse.json(featureResponse.body, {
        status: featureResponse.status,
      });
    }

    logEmrOperationalError("emr-autosave-draft", error);

    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to autosave EMR draft"
        ),
      },
      { status: 500 }
    );
  }
}
