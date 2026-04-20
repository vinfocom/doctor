import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isMissingLiveQueueAdsTableError } from "@/lib/liveQueueAdsDb";
import { isQueueSideAdDisplayable } from "@/lib/liveQueueAds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseClinicId(value: string | null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
                    select: { clinic_id: true },
                })
                : null;

            const clinicId = accessibleClinic?.clinic_id ?? requestedClinicId;
            if (!clinicId) {
                return NextResponse.json({ ads: [] });
            }

            const ads = await prisma.live_queue_side_ads.findMany({
                where: {
                    doctor_id: doctor.doctor_id,
                    clinic_id: clinicId,
                    is_active: true,
                },
                orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            });

            return NextResponse.json({ ads: ads.filter((ad) => isQueueSideAdDisplayable(ad)) });
        }

        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            select: {
                clinic_id: true,
                doctor_id: true,
            },
        });

        if (!staff?.clinic_id || !staff.doctor_id) {
            return NextResponse.json({ ads: [] });
        }

        const clinicId = requestedClinicId && requestedClinicId === staff.clinic_id ? requestedClinicId : staff.clinic_id;
        const ads = await prisma.live_queue_side_ads.findMany({
            where: {
                doctor_id: staff.doctor_id,
                clinic_id: clinicId,
                is_active: true,
            },
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        });

        return NextResponse.json({ ads: ads.filter((ad) => isQueueSideAdDisplayable(ad)) });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json({ ads: [] });
        }

        console.error("Live queue ads GET error:", error);
        return NextResponse.json({ error: "Failed to load queue ads" }, { status: 500 });
    }
}
