import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

type SettingsRow = {
    setting_id: number;
    hospital_group_code: string;
    remaining_slide_seconds: number;
    missed_slide_seconds: number;
    doctor_rotation_seconds: number;
    updated_by_doctor_id: number | null;
    updated_at: Date | string | null;
};

const DEFAULT_SETTINGS = {
    remaining_slide_seconds: 8,
    missed_slide_seconds: 8,
    doctor_rotation_seconds: 40,
};

function parseClinicId(value: string | null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampSeconds(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function getDoctorClinicContext(userId: number, clinicId: number | null) {
    const doctor = await prisma.doctors.findUnique({
        where: { user_id: userId },
        select: {
            doctor_id: true,
            clinics: {
                where: clinicId ? { clinic_id: clinicId } : undefined,
                select: {
                    clinic_id: true,
                    clinic_name: true,
                    hospital_group_code: true,
                },
                orderBy: { clinic_name: "asc" },
            },
        },
    });

    if (!doctor) return null;

    const clinic = clinicId
        ? doctor.clinics.find((item) => item.clinic_id === clinicId) || null
        : doctor.clinics.find((item) => String(item.hospital_group_code || "").trim()) || doctor.clinics[0] || null;

    if (!clinic) return null;

    return {
        doctorId: doctor.doctor_id,
        clinicId: clinic.clinic_id,
        clinicName: clinic.clinic_name,
        hospitalGroupCode: String(clinic.hospital_group_code || "").trim() || null,
    };
}

async function getSettingsForGroup(hospitalGroupCode: string) {
    const rows = await prisma.$queryRaw<SettingsRow[]>`
        SELECT
            setting_id,
            hospital_group_code,
            remaining_slide_seconds,
            missed_slide_seconds,
            doctor_rotation_seconds,
            updated_by_doctor_id,
            updated_at
        FROM live_queue_display_settings
        WHERE hospital_group_code = ${hospitalGroupCode}
        LIMIT 1
    `;

    const row = rows[0] || null;
    return {
        ...DEFAULT_SETTINGS,
        ...(row
            ? {
                remaining_slide_seconds: Number(row.remaining_slide_seconds) || DEFAULT_SETTINGS.remaining_slide_seconds,
                missed_slide_seconds: Number(row.missed_slide_seconds) || DEFAULT_SETTINGS.missed_slide_seconds,
                doctor_rotation_seconds: Number(row.doctor_rotation_seconds) || DEFAULT_SETTINGS.doctor_rotation_seconds,
                updated_by_doctor_id: row.updated_by_doctor_id,
                updated_at: row.updated_at,
            }
            : {}),
    };
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const clinicId = parseClinicId(req.nextUrl.searchParams.get("clinicId"));
    const context = await getDoctorClinicContext(session.userId, clinicId);

    if (!context) {
        return NextResponse.json({ error: "Clinic not found for this doctor." }, { status: 404 });
    }

    if (!context.hospitalGroupCode) {
        return NextResponse.json({
            clinic_id: context.clinicId,
            clinic_name: context.clinicName,
            hospital_group_code: null,
            is_hospital_clinic: false,
            settings: DEFAULT_SETTINGS,
        });
    }

    const settings = await getSettingsForGroup(context.hospitalGroupCode);

    return NextResponse.json({
        clinic_id: context.clinicId,
        clinic_name: context.clinicName,
        hospital_group_code: context.hospitalGroupCode,
        is_hospital_clinic: true,
        settings,
    });
}

export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const clinicId = parseClinicId(String(body?.clinicId || ""));
    if (!clinicId) {
        return NextResponse.json({ error: "Clinic is required." }, { status: 400 });
    }

    const context = await getDoctorClinicContext(session.userId, clinicId);
    if (!context) {
        return NextResponse.json({ error: "Clinic not found for this doctor." }, { status: 404 });
    }

    if (!context.hospitalGroupCode) {
        return NextResponse.json({ error: "TV timing can only be set for hospital-group clinics." }, { status: 400 });
    }

    const nextSettings = {
        remaining: clampSeconds(body?.remainingSlideSeconds, DEFAULT_SETTINGS.remaining_slide_seconds, 2, 300),
        missed: clampSeconds(body?.missedSlideSeconds, DEFAULT_SETTINGS.missed_slide_seconds, 2, 300),
        doctorRotation: clampSeconds(body?.doctorRotationSeconds, DEFAULT_SETTINGS.doctor_rotation_seconds, 5, 300),
    };

    await prisma.$executeRaw`
        INSERT INTO live_queue_display_settings (
            hospital_group_code,
            remaining_slide_seconds,
            missed_slide_seconds,
            doctor_rotation_seconds,
            updated_by_doctor_id
        )
        VALUES (
            ${context.hospitalGroupCode},
            ${nextSettings.remaining},
            ${nextSettings.missed},
            ${nextSettings.doctorRotation},
            ${context.doctorId}
        )
        ON DUPLICATE KEY UPDATE
            remaining_slide_seconds = VALUES(remaining_slide_seconds),
            missed_slide_seconds = VALUES(missed_slide_seconds),
            doctor_rotation_seconds = VALUES(doctor_rotation_seconds),
            updated_by_doctor_id = VALUES(updated_by_doctor_id),
            updated_at = CURRENT_TIMESTAMP
    `;

    const settings = await getSettingsForGroup(context.hospitalGroupCode);

    return NextResponse.json({
        success: true,
        clinic_id: context.clinicId,
        hospital_group_code: context.hospitalGroupCode,
        settings,
    });
}
