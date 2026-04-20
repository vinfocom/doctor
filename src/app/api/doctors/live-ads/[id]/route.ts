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

async function getDoctorId(userId: number) {
    const doctor = await prisma.doctors.findUnique({
        where: { user_id: userId },
        select: { doctor_id: true },
    });

    return doctor?.doctor_id ?? null;
}

async function getOwnedAd(userId: number, adId: number) {
    const doctorId = await getDoctorId(userId);
    if (!doctorId) return null;

    const ad = await prisma.live_queue_side_ads.findFirst({
        where: {
            ad_id: adId,
            doctor_id: doctorId,
        },
    });

    return ad;
}

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const params = await context.params;
        const adId = Number(params.id);

        if (!adId) {
            return NextResponse.json({ error: "Invalid ad id" }, { status: 400 });
        }

        const existingAd = await getOwnedAd(session.userId, adId);
        if (!existingAd) {
            return NextResponse.json({ error: "Ad not found" }, { status: 404 });
        }

        const body = await req.json();
        const nextClinicId = Number.isFinite(Number(body?.clinicId)) ? Number(body.clinicId) : existingAd.clinic_id;
        const nextPosition = body?.position ? String(body.position).toUpperCase() : existingAd.position;
        const nextType = body?.type ? String(body.type).toUpperCase() : existingAd.type;
        const nextAssetUrl = body?.assetUrl !== undefined ? String(body.assetUrl || "").trim() : existingAd.asset_url;
        const nextMimeType = body?.mimeType !== undefined ? (body.mimeType ? String(body.mimeType) : null) : existingAd.mime_type;
        const nextTitle = body?.title !== undefined ? (body.title ? String(body.title).trim() : null) : existingAd.title;
        const nextSortOrder = body?.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
            ? Number(body.sortOrder)
            : existingAd.sort_order;
        const nextIsActive = body?.isActive !== undefined ? Boolean(body.isActive) : existingAd.is_active;
        const nextActiveFrom = body?.activeFrom !== undefined ? parseDateInput(body.activeFrom) : existingAd.active_from;
        const nextActiveTo = body?.activeTo !== undefined ? parseDateInput(body.activeTo) : existingAd.active_to;

        if (
            !nextClinicId ||
            !nextAssetUrl ||
            !AD_POSITIONS.includes(nextPosition as typeof AD_POSITIONS[number]) ||
            !AD_TYPES.includes(nextType as typeof AD_TYPES[number])
        ) {
            return NextResponse.json({ error: "Clinic, type, position, and asset URL are required." }, { status: 400 });
        }

        if (!nextActiveFrom || !nextActiveTo) {
            return NextResponse.json({ error: "Active from and active to dates are required." }, { status: 400 });
        }

        if (new Date(nextActiveFrom).getTime() > new Date(nextActiveTo).getTime()) {
            return NextResponse.json({ error: "Active from date must be on or before active to date." }, { status: 400 });
        }

        const doctorId = existingAd.doctor_id;
        const ownsClinic = await prisma.clinics.findFirst({
            where: {
                clinic_id: nextClinicId,
                doctor_id: doctorId,
            },
            select: { clinic_id: true },
        });

        if (!ownsClinic) {
            return NextResponse.json({ error: "Clinic not found for this doctor." }, { status: 404 });
        }

        const updatedAd = await prisma.$transaction(async (tx) => {
            return tx.live_queue_side_ads.update({
                where: { ad_id: adId },
                data: {
                    clinic_id: nextClinicId,
                    position: nextPosition as "LEFT" | "RIGHT",
                    type: nextType as "LOGO" | "VIDEO",
                    asset_url: nextAssetUrl,
                    mime_type: nextMimeType,
                    title: nextTitle,
                    is_active: nextIsActive,
                    active_from: nextActiveFrom,
                    active_to: nextActiveTo,
                    sort_order: nextSortOrder,
                },
            });
        });

        return NextResponse.json({ ad: updatedAd });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json(
                {
                    error: "Live queue ads table is missing. Run the Prisma migration to enable ad management.",
                },
                { status: 503 }
            );
        }

        console.error("Live ads PATCH error:", error);
        return NextResponse.json({ error: "Failed to update live ad" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const params = await context.params;
        const adId = Number(params.id);

        if (!adId) {
            return NextResponse.json({ error: "Invalid ad id" }, { status: 400 });
        }

        const existingAd = await getOwnedAd(session.userId, adId);
        if (!existingAd) {
            return NextResponse.json({ error: "Ad not found" }, { status: 404 });
        }

        await prisma.live_queue_side_ads.delete({
            where: { ad_id: adId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (isMissingLiveQueueAdsTableError(error)) {
            return NextResponse.json(
                {
                    error: "Live queue ads table is missing. Run the Prisma migration to enable ad management.",
                },
                { status: 503 }
            );
        }

        console.error("Live ads DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete live ad" }, { status: 500 });
    }
}
