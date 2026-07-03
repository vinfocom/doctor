import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { buildLiveQueueSnapshot } from "@/lib/liveQueueSnapshot";
import { getActiveDoctorWhere, getClinicStaffAccessBlockReason, hasHospitalDoctorAccess, resolveAssignedDoctorIds } from "@/lib/clinicStaffAccess";

type StaffContext = {
    staff_id: number;
    doctor_id: number;
    clinic_id: number | null;
    staff_role: string;
    status: string | null;
    valid_from: Date | string | null;
    valid_to: Date | string | null;
    doctor_access: Array<{ doctor_id: number }>;
    clinics: {
        clinic_id: number;
        hospital_group_code: string | null;
    } | null;
};

type SettingsRow = {
    remaining_slide_seconds: number;
    missed_slide_seconds: number;
    doctor_rotation_seconds: number;
};

const DEFAULT_DISPLAY_SETTINGS = {
    remaining_slide_seconds: 8,
    missed_slide_seconds: 8,
    doctor_rotation_seconds: 40,
};

async function getDisplaySettings(hospitalGroupCode: string | null) {
    const groupCode = String(hospitalGroupCode || "").trim();
    if (!groupCode) return DEFAULT_DISPLAY_SETTINGS;

    const rows = await prisma.$queryRaw<SettingsRow[]>`
        SELECT remaining_slide_seconds, missed_slide_seconds, doctor_rotation_seconds
        FROM live_queue_display_settings
        WHERE hospital_group_code = ${groupCode}
        LIMIT 1
    `;

    const row = rows[0] || null;
    return {
        remaining_slide_seconds: Number(row?.remaining_slide_seconds) || DEFAULT_DISPLAY_SETTINGS.remaining_slide_seconds,
        missed_slide_seconds: Number(row?.missed_slide_seconds) || DEFAULT_DISPLAY_SETTINGS.missed_slide_seconds,
        doctor_rotation_seconds: Number(row?.doctor_rotation_seconds) || DEFAULT_DISPLAY_SETTINGS.doctor_rotation_seconds,
    };
}

function sortSlides(left: { sort_start_minutes: number | null; doctor_name: string }, right: { sort_start_minutes: number | null; doctor_name: string }) {
    const leftMinutes = left.sort_start_minutes ?? Number.MAX_SAFE_INTEGER;
    const rightMinutes = right.sort_start_minutes ?? Number.MAX_SAFE_INTEGER;
    if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;
    return left.doctor_name.localeCompare(right.doctor_name);
}

export async function GET(request: Request) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || session.role !== "CLINIC_STAFF") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            include: {
                clinics: {
                    select: {
                        clinic_id: true,
                        hospital_group_code: true,
                    },
                },
                doctor_access: {
                    select: {
                        doctor_id: true,
                    },
                },
            },
        }) as StaffContext | null;

        if (!staff) {
            return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
        }

        const staffBlockReason = getClinicStaffAccessBlockReason(staff);
        if (staffBlockReason) {
            return NextResponse.json({ error: staffBlockReason }, { status: 403 });
        }

        if (staff.staff_role !== "HAVE_ACCESS") {
            return NextResponse.json({ error: "You do not have access to live display" }, { status: 403 });
        }

        const assignedDoctorIds = resolveAssignedDoctorIds(staff);
        const primaryHospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim() || null;
        const hasHospitalMappings = hasHospitalDoctorAccess(staff);
        if (hasHospitalMappings && !primaryHospitalGroupCode) {
            const displaySettings = await getDisplaySettings(null);
            return NextResponse.json({
                staff_id: staff.staff_id,
                hospital_group_code: null,
                assigned_doctor_ids: [],
                display_settings: displaySettings,
                slide_count: 0,
                slides: [],
            });
        }
        const activeDoctors = await prisma.doctors.findMany({
            where: {
                doctor_id: { in: assignedDoctorIds },
                ...getActiveDoctorWhere(),
            },
            select: { doctor_id: true },
        });
        const activeAssignedDoctorIds = activeDoctors.map((doctor) => Number(doctor.doctor_id));

        let candidateClinics: Array<{
            clinic_id: number;
            doctor_id: number | null;
            clinic_name: string | null;
            hospital_group_code: string | null;
        }> = [];

        if (primaryHospitalGroupCode) {
            candidateClinics = await prisma.clinics.findMany({
                where: {
                    doctor_id: { in: activeAssignedDoctorIds },
                    hospital_group_code: primaryHospitalGroupCode,
                    status: "ACTIVE",
                    doctor: { is: getActiveDoctorWhere() },
                },
                select: {
                    clinic_id: true,
                    doctor_id: true,
                    clinic_name: true,
                    hospital_group_code: true,
                },
                orderBy: [
                    { clinic_name: "asc" },
                    { clinic_id: "asc" },
                ],
            });
        } else if (staff.clinic_id && staff.doctor_id) {
            candidateClinics = await prisma.clinics.findMany({
                where: {
                    clinic_id: staff.clinic_id,
                    doctor_id: staff.doctor_id,
                    status: "ACTIVE",
                    doctor: { is: getActiveDoctorWhere() },
                },
                select: {
                    clinic_id: true,
                    doctor_id: true,
                    clinic_name: true,
                    hospital_group_code: true,
                },
            });
        } else {
            candidateClinics = await prisma.clinics.findMany({
                where: {
                    doctor_id: { in: activeAssignedDoctorIds },
                    status: "ACTIVE",
                    doctor: { is: getActiveDoctorWhere() },
                },
                select: {
                    clinic_id: true,
                    doctor_id: true,
                    clinic_name: true,
                    hospital_group_code: true,
                },
                orderBy: [
                    { clinic_name: "asc" },
                    { clinic_id: "asc" },
                ],
            });
        }

        const slideResults = await Promise.all(
            candidateClinics.map((clinic) =>
                buildLiveQueueSnapshot({
                    doctorId: Number(clinic.doctor_id || 0),
                    clinicId: clinic.clinic_id,
                    activeScheduleOnly: true,
                    includeEndedScheduleWithCurrent: true,
                    endedScheduleSoloCurrentGraceMinutes: 5,
                })
            )
        );

        const sortedActiveSlides = slideResults
            .filter((slide): slide is NonNullable<typeof slide> => Boolean(slide))
            .sort(sortSlides);
        const slides = Array.from(
            sortedActiveSlides.reduce((map, slide) => {
                const doctorId = Number(slide.doctor_id || 0);
                if (doctorId > 0 && !map.has(doctorId)) {
                    map.set(doctorId, slide);
                }
                return map;
            }, new Map<number, typeof sortedActiveSlides[number]>()).values()
        );
        const displaySettings = await getDisplaySettings(primaryHospitalGroupCode);

        return NextResponse.json({
            staff_id: staff.staff_id,
            hospital_group_code: primaryHospitalGroupCode,
            assigned_doctor_ids: activeAssignedDoctorIds,
            display_settings: displaySettings,
            slide_count: slides.length,
            slides,
        });
    } catch (error) {
        console.error("Live hospital GET error:", error);
        return NextResponse.json({ error: "Failed to load hospital live queues" }, { status: 500 });
    }
}
