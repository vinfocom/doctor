import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isMissingLiveQueueAdsTableError } from "@/lib/liveQueueAdsDb";

const AD_POSITIONS = ["LEFT", "RIGHT"] as const;
const AD_TYPES = ["LOGO", "VIDEO"] as const;

function parseDateInput(value: unknown) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
}

async function getDoctorContext(userId: number) {
    return prisma.doctors.findUnique({
        where: { user_id: userId },
        select: {
            doctor_id: true,
            clinics: {
                select: {
                    clinic_id: true,
                    clinic_name: true,
                },
                orderBy: { clinic_name: "asc" },
            },
        },
    });
}

function parseClinicId(value: string | null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const doctor = await getDoctorContext(session.userId);
        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        const requestedClinicId = parseClinicId(req.nextUrl.searchParams.get("clinicId"));
        const clinicIds = new Set(doctor.clinics.map((clinic) => clinic.clinic_id));
        const selectedClinicId =
            requestedClinicId && clinicIds.has(requestedClinicId)
                ? requestedClinicId
                : doctor.clinics[0]?.clinic_id ?? null;

        const ads = selectedClinicId
            ? await prisma.live_queue_side_ads.findMany({
                where: {
                    doctor_id: doctor.doctor_id,
                    clinic_id: selectedClinicId,
                },
                orderBy: [
                    { position: "asc" },
                    { sort_order: "asc" },
                    { created_at: "asc" },
                ],
            })
            : [];

        return NextResponse.json({
            clinics: doctor.clinics,
            selectedClinicId,
            ads,
        });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json(
                {
                    error: "Live queue ads table is missing. Run the Prisma migration to enable ad management.",
                },
                { status: 503 }
            );
        }

        console.error("Live ads GET error:", error);
        return NextResponse.json({ error: "Failed to load live ads" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const clinicId = Number(body?.clinicId);
        const position = String(body?.position || "").toUpperCase();
        const type = String(body?.type || "").toUpperCase();
        const assetUrl = String(body?.assetUrl || "").trim();
        const mimeType = body?.mimeType ? String(body.mimeType) : null;
        const title = body?.title ? String(body.title).trim() : null;
        const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;
        const isActive = body?.isActive !== false;
        const activeFrom = parseDateInput(body?.activeFrom);
        const activeTo = parseDateInput(body?.activeTo);

        if (!clinicId || !assetUrl || !AD_POSITIONS.includes(position as typeof AD_POSITIONS[number]) || !AD_TYPES.includes(type as typeof AD_TYPES[number])) {
            return NextResponse.json({ error: "Clinic, type, position, and asset URL are required." }, { status: 400 });
        }

        if (!activeFrom || !activeTo) {
            return NextResponse.json({ error: "Active from and active to dates are required." }, { status: 400 });
        }

        if (activeFrom.getTime() > activeTo.getTime()) {
            return NextResponse.json({ error: "Active from date must be on or before active to date." }, { status: 400 });
        }

        const doctor = await getDoctorContext(session.userId);
        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        const ownsClinic = doctor.clinics.some((clinic) => clinic.clinic_id === clinicId);
        if (!ownsClinic) {
            return NextResponse.json({ error: "Clinic not found for this doctor." }, { status: 404 });
        }

        const createdAd = await prisma.$transaction(async (tx) => {
            return tx.live_queue_side_ads.create({
                data: {
                    doctor_id: doctor.doctor_id,
                    clinic_id: clinicId,
                    position: position as "LEFT" | "RIGHT",
                    type: type as "LOGO" | "VIDEO",
                    asset_url: assetUrl,
                    mime_type: mimeType,
                    title,
                    is_active: isActive,
                    active_from: activeFrom,
                    active_to: activeTo,
                    sort_order: sortOrder,
                },
            });
        });

        return NextResponse.json({ ad: createdAd }, { status: 201 });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json(
                {
                    error: "Live queue ads table is missing. Run the Prisma migration to enable ad management.",
                },
                { status: 503 }
            );
        }

        console.error("Live ads POST error:", error);
        return NextResponse.json({ error: "Failed to create live ad" }, { status: 500 });
    }
}
