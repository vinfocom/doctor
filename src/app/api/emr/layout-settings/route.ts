import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getDefaultPrescriptionLayoutSettings,
  resolvePrescriptionLayoutSettings,
  savePrescriptionLayoutSettings,
} from "@/lib/emr/layoutService";
import type { EmrLayoutCustomField } from "@/lib/emr/types";

export const dynamic = "force-dynamic";

async function resolveLayoutScope(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const url = new URL(req.url);
  const queryDoctorId = Number(url.searchParams.get("doctorId"));
  const queryClinicIdRaw = url.searchParams.get("clinicId");
  const clinicId =
    queryClinicIdRaw === null || queryClinicIdRaw === ""
      ? null
      : Number(queryClinicIdRaw);

  if (clinicId !== null && (!Number.isInteger(clinicId) || clinicId <= 0)) {
    return { error: NextResponse.json({ error: "Invalid clinic id" }, { status: 400 }) };
  }

  if (session.role === "DOCTOR") {
    const doctor = await prisma.doctors.findUnique({
      where: { user_id: session.userId },
      select: {
        doctor_id: true,
        clinics: {
          select: {
            clinic_id: true,
          },
        },
      },
    });

    if (!doctor) {
      return { error: NextResponse.json({ error: "Doctor profile not found" }, { status: 404 }) };
    }

    if (
      clinicId !== null &&
      !doctor.clinics.some((clinic) => clinic.clinic_id === clinicId)
    ) {
      return { error: NextResponse.json({ error: "Clinic not found in doctor scope" }, { status: 403 }) };
    }

    return {
      doctorId: doctor.doctor_id,
      clinicId,
      role: session.role,
    };
  }

  if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") {
    if (!Number.isInteger(queryDoctorId) || queryDoctorId <= 0) {
      return { error: NextResponse.json({ error: "doctorId is required for admin layout access" }, { status: 400 }) };
    }

    const doctor = await prisma.doctors.findUnique({
      where: { doctor_id: queryDoctorId },
      select: {
        doctor_id: true,
        clinics: {
          select: {
            clinic_id: true,
          },
        },
      },
    });

    if (!doctor) {
      return { error: NextResponse.json({ error: "Doctor not found" }, { status: 404 }) };
    }

    if (
      clinicId !== null &&
      !doctor.clinics.some((clinic) => clinic.clinic_id === clinicId)
    ) {
      return { error: NextResponse.json({ error: "Clinic not found in doctor scope" }, { status: 404 }) };
    }

    return {
      doctorId: doctor.doctor_id,
      clinicId,
      role: session.role,
    };
  }

  return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

async function buildScopeMeta(doctorId: number) {
  const doctor = await prisma.doctors.findUnique({
    where: { doctor_id: doctorId },
    select: {
      doctor_id: true,
      doctor_name: true,
      clinics: {
        select: {
          clinic_id: true,
          clinic_name: true,
        },
        orderBy: { clinic_name: "asc" },
      },
    },
  });

  return {
    doctor: doctor
      ? {
          doctor_id: doctor.doctor_id,
          doctor_name: doctor.doctor_name,
        }
      : null,
    clinics:
      doctor?.clinics.map((clinic) => ({
        clinic_id: clinic.clinic_id,
        clinic_name: clinic.clinic_name,
      })) ?? [],
  };
}

export async function GET(req: NextRequest) {
  const scope = await resolveLayoutScope(req);
  if ("error" in scope) return scope.error;

  try {
    const settings = await resolvePrescriptionLayoutSettings({
      doctorId: scope.doctorId,
      clinicId: scope.clinicId,
    });

    return NextResponse.json(
      {
        settings,
        defaults: getDefaultPrescriptionLayoutSettings({
          doctorId: scope.doctorId,
          clinicId: scope.clinicId,
        }),
        scope: await buildScopeMeta(scope.doctorId),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load EMR layout settings",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const scope = await resolveLayoutScope(req);
  if ("error" in scope) return scope.error;

  try {
    const body = (await req.json()) as {
      clinicId?: number | null;
      section_order_json?: unknown;
      section_visibility_json?: unknown;
      print_visibility_json?: unknown;
      complaint_display_mode?: unknown;
      custom_fields_json?: unknown;
      page_margin_json?: unknown;
      pdf_margin_json?: unknown;
      font_family?: string | null;
      font_size?: string | null;
      header_image_url?: string | null;
      footer_image_url?: string | null;
      clinic_logo_url?: string | null;
      doctor_signature_url?: string | null;
      header_height?: string | null;
      footer_height?: string | null;
      custom_fields?: EmrLayoutCustomField[];
    };

    const targetClinicId =
      body.clinicId === undefined ? scope.clinicId : body.clinicId;

    const saved = await savePrescriptionLayoutSettings({
      doctorId: scope.doctorId,
      clinicId: targetClinicId,
      sectionOrderJson: body.section_order_json,
      sectionVisibilityJson: body.section_visibility_json,
      printVisibilityJson: body.print_visibility_json,
      complaintDisplayMode: body.complaint_display_mode,
      customFieldsJson: body.custom_fields_json,
      pageMarginJson: body.page_margin_json,
      pdfMarginJson: body.pdf_margin_json,
      fontFamily: body.font_family ?? null,
      fontSize: body.font_size ?? null,
      headerImageUrl: body.header_image_url ?? null,
      footerImageUrl: body.footer_image_url ?? null,
      clinicLogoUrl: body.clinic_logo_url ?? null,
      doctorSignatureUrl: body.doctor_signature_url ?? null,
      headerHeight: body.header_height ?? null,
      footerHeight: body.footer_height ?? null,
      customFields: body.custom_fields,
    });

    return NextResponse.json(
      {
        settings: saved,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save EMR layout settings",
      },
      { status: 500 }
    );
  }
}
