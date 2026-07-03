import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isMissingLiveQueueAdsTableError } from "@/lib/liveQueueAdsDb";
import { isQueueSideAdDisplayable } from "@/lib/liveQueueAds";
import { getActiveDoctorWhere, getClinicStaffAccessBlockReason, hasHospitalDoctorAccess, resolveAssignedDoctorIds } from "@/lib/clinicStaffAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseClinicId(value: string | null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getAdsForClinicScope(input: {
    clinicId: number;
    doctorId?: number;
    doctorIds?: number[];
    hospitalGroupCode?: string | null;
}) {
    const normalizedDoctorIds = Array.isArray(input.doctorIds)
        ? Array.from(new Set(input.doctorIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)))
        : [];
    const groupedClinicIds = input.hospitalGroupCode
        ? await prisma.clinics.findMany({
            where: {
                hospital_group_code: String(input.hospitalGroupCode || "").trim(),
                ...(normalizedDoctorIds.length > 0 ? { doctor_id: { in: normalizedDoctorIds } } : {}),
                status: "ACTIVE",
                doctor: { is: getActiveDoctorWhere() },
            },
            select: { clinic_id: true },
        }).then((clinics) => clinics.map((clinic) => Number(clinic.clinic_id)))
        : [];

    const ads = await prisma.live_queue_side_ads.findMany({
        where: {
            is_active: true,
            ...(groupedClinicIds.length > 0
                ? {
                    clinic_id: { in: groupedClinicIds },
                    ...(normalizedDoctorIds.length > 0 ? { doctor_id: { in: normalizedDoctorIds } } : {}),
                }
                : {
                    clinic_id: input.clinicId,
                    ...(input.doctorId ? { doctor_id: input.doctorId } : {}),
                }),
        },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });

    return ads.filter((ad) => isQueueSideAdDisplayable(ad));
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || (session.role !== "DOCTOR" && session.role !== "CLINIC_STAFF")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const requestedClinicId = parseClinicId(req.nextUrl.searchParams.get("clinicId"));

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });

            if (!doctor) {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }

            const accessibleClinic = requestedClinicId
                ? await prisma.clinics.findFirst({
                    where: {
                        clinic_id: requestedClinicId,
                        doctor_id: doctor.doctor_id,
                    },
                    select: {
                        clinic_id: true,
                        hospital_group_code: true,
                    },
                })
                : null;

            const clinicId = accessibleClinic?.clinic_id ?? requestedClinicId;
            if (!clinicId) {
                return NextResponse.json({ ads: [] });
            }

            const ads = await getAdsForClinicScope({
                clinicId,
                doctorId: doctor.doctor_id,
                hospitalGroupCode: accessibleClinic?.hospital_group_code,
            });

            return NextResponse.json({ ads });
        }

        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            select: {
                clinic_id: true,
                doctor_id: true,
                status: true,
                valid_from: true,
                valid_to: true,
                clinics: {
                    select: {
                        hospital_group_code: true,
                    },
                },
                doctor_access: {
                    select: {
                        doctor_id: true,
                    },
                },
            },
        });

        if (!staff?.doctor_id) {
            return NextResponse.json({ ads: [] });
        }

        const staffBlockReason = getClinicStaffAccessBlockReason(staff);
        if (staffBlockReason) {
            return NextResponse.json({ error: staffBlockReason }, { status: 403 });
        }

        const staffHospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim();
        const canUseHospitalScope = hasHospitalDoctorAccess(staff) && Boolean(staffHospitalGroupCode);
        const rawAssignedDoctorIds = canUseHospitalScope
            ? resolveAssignedDoctorIds(staff)
            : [Number(staff.doctor_id)];
        const activeDoctors = await prisma.doctors.findMany({
            where: {
                doctor_id: { in: rawAssignedDoctorIds },
                ...getActiveDoctorWhere(),
            },
            select: { doctor_id: true },
        });
        const assignedDoctorIds = activeDoctors.map((doctor) => Number(doctor.doctor_id));
        const requestedClinic = requestedClinicId
            ? await prisma.clinics.findFirst({
                where: {
                    clinic_id: requestedClinicId,
                    doctor_id: { in: assignedDoctorIds },
                    ...(canUseHospitalScope ? { hospital_group_code: staffHospitalGroupCode } : {}),
                    status: "ACTIVE",
                    doctor: { is: getActiveDoctorWhere() },
                },
                select: {
                    clinic_id: true,
                    doctor_id: true,
                    hospital_group_code: true,
                },
            })
            : null;

        const fallbackClinic = staff.clinic_id
            ? await prisma.clinics.findFirst({
                where: {
                    clinic_id: staff.clinic_id,
                    doctor_id: { in: assignedDoctorIds },
                    status: "ACTIVE",
                    doctor: { is: getActiveDoctorWhere() },
                },
                select: {
                    clinic_id: true,
                    doctor_id: true,
                    hospital_group_code: true,
                },
            })
            : null;

        const clinic = requestedClinic || fallbackClinic;
        if (!clinic) {
            return NextResponse.json({ ads: [] });
        }

        const ads = await getAdsForClinicScope({
            clinicId: clinic.clinic_id,
            doctorId: clinic.doctor_id || staff.doctor_id,
            doctorIds: assignedDoctorIds,
            hospitalGroupCode: canUseHospitalScope ? clinic.hospital_group_code || staff.clinics?.hospital_group_code : null,
        });

        return NextResponse.json({ ads });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json({ ads: [] });
        }

        console.error("Live queue ads GET error:", error);
        return NextResponse.json({ error: "Failed to load queue ads" }, { status: 500 });
    }
}
