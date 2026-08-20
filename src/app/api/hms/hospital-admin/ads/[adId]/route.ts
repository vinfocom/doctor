export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const AD_POSITIONS = ["LEFT", "RIGHT"] as const;
const AD_TYPES = ["LOGO", "VIDEO"] as const;

type RouteContext = {
    params: Promise<{
        adId: string;
    }>;
};

type AdRow = {
    ad_id: number;
    hospital_id: number;
    position: string;
    type: string;
    asset_url: string;
    storage_key: string | null;
    mime_type: string | null;
    original_filename: string | null;
    file_size_bytes: bigint | number | null;
    title: string | null;
    is_active: boolean | number;
    active_from: Date | string | null;
    active_to: Date | string | null;
    sort_order: number;
    created_by_user_id: number | null;
    created_at: Date | string;
    updated_at: Date | string;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text || null;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T) {
    const normalized = normalizeText(value).toUpperCase();
    return allowed.includes(normalized) ? normalized as T[number] : null;
}

function parseDateInput(value: unknown) {
    const raw = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function parseSortOrder(value: unknown, fallback: number) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseFileSize(value: unknown, fallback: bigint | number | null) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function serializeAd(row: AdRow) {
    return {
        ad_id: Number(row.ad_id),
        hospital_id: Number(row.hospital_id),
        position: row.position,
        type: row.type,
        asset_url: row.asset_url,
        storage_key: row.storage_key,
        mime_type: row.mime_type,
        original_filename: row.original_filename,
        file_size_bytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
        title: row.title,
        is_active: Boolean(row.is_active),
        active_from: dateOnly(row.active_from),
        active_to: dateOnly(row.active_to),
        sort_order: Number(row.sort_order || 0),
        created_by_user_id: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "ads_module"))) {
        return null;
    }

    return session.hospitalContext;
}

async function getScopedAd(adId: number, hospitalId: number) {
    const rows = await prisma.$queryRawUnsafe<AdRow[]>(
        `
        SELECT *
        FROM hospital_wide_ads
        WHERE ad_id = ?
          AND hospital_id = ?
        LIMIT 1
        `,
        adId,
        hospitalId
    );

    return rows[0] || null;
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const { adId: adIdParam } = await context.params;
        const adId = normalizeId(adIdParam);
        if (!adId) {
            return NextResponse.json({ error: "Valid ad id is required." }, { status: 400 });
        }

        const existingAd = await getScopedAd(adId, hospital.hospitalId);
        if (!existingAd) {
            return NextResponse.json({ error: "Hospital ad was not found." }, { status: 404 });
        }

        const body = await req.json();
        const position = body?.position === undefined ? existingAd.position : normalizeEnum(body.position, AD_POSITIONS);
        const type = body?.type === undefined ? existingAd.type : normalizeEnum(body.type, AD_TYPES);
        const title = body?.title === undefined ? existingAd.title : normalizeOptionalText(body.title);
        const assetUrl = body?.assetUrl === undefined ? existingAd.asset_url : normalizeText(body.assetUrl);
        const storageKey = body?.storageKey === undefined ? existingAd.storage_key : normalizeOptionalText(body.storageKey);
        const mimeType = body?.mimeType === undefined ? existingAd.mime_type : normalizeOptionalText(body.mimeType);
        const originalFilename = body?.originalFilename === undefined ? existingAd.original_filename : normalizeOptionalText(body.originalFilename);
        const fileSizeBytes = parseFileSize(body?.fileSizeBytes, existingAd.file_size_bytes);
        const isActive = body?.isActive === undefined ? Boolean(existingAd.is_active) : Boolean(body.isActive);
        const activeFrom = body?.activeFrom === undefined ? dateOnly(existingAd.active_from) : parseDateInput(body.activeFrom);
        const activeTo = body?.activeTo === undefined ? dateOnly(existingAd.active_to) : parseDateInput(body.activeTo);
        const sortOrder = parseSortOrder(body?.sortOrder, Number(existingAd.sort_order || 0));

        const fieldErrors: Record<string, string> = {};
        if (!position) fieldErrors.position = "Position must be LEFT or RIGHT.";
        if (!type) fieldErrors.type = "Type must be LOGO or VIDEO.";
        if (!assetUrl) fieldErrors.assetUrl = "Uploaded asset is required.";
        if (!activeFrom) fieldErrors.activeFrom = "Active from date is required.";
        if (!activeTo) fieldErrors.activeTo = "Active to date is required.";
        if (activeFrom && activeTo && activeFrom > activeTo) fieldErrors.activeTo = "Active to must be on or after active from.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        await prisma.$executeRawUnsafe(
            `
            UPDATE hospital_wide_ads
            SET position = ?,
                type = ?,
                asset_url = ?,
                storage_key = ?,
                mime_type = ?,
                original_filename = ?,
                file_size_bytes = ?,
                title = ?,
                is_active = ?,
                active_from = ?,
                active_to = ?,
                sort_order = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ad_id = ?
              AND hospital_id = ?
            `,
            position,
            type,
            assetUrl,
            storageKey,
            mimeType,
            originalFilename,
            fileSizeBytes,
            title,
            isActive,
            activeFrom,
            activeTo,
            sortOrder,
            adId,
            hospital.hospitalId
        );

        const updated = await getScopedAd(adId, hospital.hospitalId);
        return NextResponse.json({ ad: updated ? serializeAd(updated) : null });
    } catch (error) {
        console.error("Update HMS hospital ad error:", error);
        return NextResponse.json({ error: "Unable to update hospital ad. Please try again." }, { status: 500 });
    }
}

export async function DELETE(req: Request, context: RouteContext) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const { adId: adIdParam } = await context.params;
        const adId = normalizeId(adIdParam);
        if (!adId) {
            return NextResponse.json({ error: "Valid ad id is required." }, { status: 400 });
        }

        const existingAd = await getScopedAd(adId, hospital.hospitalId);
        if (!existingAd) {
            return NextResponse.json({ error: "Hospital ad was not found." }, { status: 404 });
        }

        await prisma.$executeRawUnsafe(
            `
            DELETE FROM hospital_wide_ads
            WHERE ad_id = ?
              AND hospital_id = ?
            `,
            adId,
            hospital.hospitalId
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete HMS hospital ad error:", error);
        return NextResponse.json({ error: "Unable to delete hospital ad. Please try again." }, { status: 500 });
    }
}
