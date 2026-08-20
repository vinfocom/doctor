export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const AD_POSITIONS = ["LEFT", "RIGHT"] as const;
const AD_TYPES = ["LOGO", "VIDEO"] as const;
const DEFAULT_TV_ROTATION_SECONDS = 40;
const DEFAULT_TV_REMAINING_SLIDE_SECONDS = 8;

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

type PolicyRow = {
    id: number;
    policies: unknown;
};

type InsertIdRow = {
    id: bigint | number;
};

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

function parseSortOrder(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFileSize(value: unknown) {
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

function serializeTvSettings(policies: Record<string, unknown>) {
    return {
        tv_rotation_seconds: parsePositiveInt(policies.tv_rotation_seconds) ?? DEFAULT_TV_ROTATION_SECONDS,
        tv_remaining_slide_seconds: parsePositiveInt(policies.tv_remaining_slide_seconds) ?? DEFAULT_TV_REMAINING_SLIDE_SECONDS,
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

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const ads = await prisma.$queryRawUnsafe<AdRow[]>(
            `
            SELECT
                ad_id,
                hospital_id,
                position,
                type,
                asset_url,
                storage_key,
                mime_type,
                original_filename,
                file_size_bytes,
                title,
                is_active,
                active_from,
                active_to,
                sort_order,
                created_by_user_id,
                created_at,
                updated_at
            FROM hospital_wide_ads
            WHERE hospital_id = ?
            ORDER BY position ASC, sort_order ASC, created_at ASC, ad_id ASC
            `,
            hospital.hospitalId
        );
        const policyRows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT id, policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );

        return NextResponse.json({
            ads: ads.map(serializeAd),
            tvSettings: serializeTvSettings(parseJsonObject(policyRows[0]?.policies)),
        });
    } catch (error) {
        console.error("Load HMS hospital ads error:", error);
        return NextResponse.json({ error: "Unable to load hospital ads." }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const body = await req.json();
        const tvRotationSeconds = parsePositiveInt(body?.tv_rotation_seconds);
        const tvRemainingSlideSeconds = parsePositiveInt(body?.tv_remaining_slide_seconds);
        const fieldErrors: Record<string, string> = {};

        if (!tvRotationSeconds || tvRotationSeconds < 5) {
            fieldErrors.tv_rotation_seconds = "Doctor rotation must be at least 5 seconds.";
        }
        if (!tvRemainingSlideSeconds || tvRemainingSlideSeconds < 2) {
            fieldErrors.tv_remaining_slide_seconds = "Remaining slide timing must be at least 2 seconds.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT id, policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );
        const currentPolicies = parseJsonObject(rows[0]?.policies);
        const nextPolicies = {
            ...currentPolicies,
            tv_rotation_seconds: tvRotationSeconds,
            tv_remaining_slide_seconds: tvRemainingSlideSeconds,
        };

        if (rows[0]) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE hospital_policy_settings
                SET policies = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE hospital_id = ?
                `,
                JSON.stringify(nextPolicies),
                hospital.hospitalId
            );
        } else {
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO hospital_policy_settings (hospital_id, policies)
                VALUES (?, ?)
                `,
                hospital.hospitalId,
                JSON.stringify(nextPolicies)
            );
        }

        return NextResponse.json({
            tvSettings: serializeTvSettings(nextPolicies),
        });
    } catch (error) {
        console.error("Update HMS TV display settings error:", error);
        return NextResponse.json({ error: "Unable to update TV display settings." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const body = await req.json();
        const position = normalizeEnum(body?.position, AD_POSITIONS);
        const type = normalizeEnum(body?.type, AD_TYPES);
        const assetUrl = normalizeText(body?.assetUrl);
        const storageKey = normalizeOptionalText(body?.storageKey);
        const mimeType = normalizeOptionalText(body?.mimeType);
        const originalFilename = normalizeOptionalText(body?.originalFilename);
        const fileSizeBytes = parseFileSize(body?.fileSizeBytes);
        const title = normalizeOptionalText(body?.title);
        const isActive = body?.isActive !== false;
        const activeFrom = parseDateInput(body?.activeFrom);
        const activeTo = parseDateInput(body?.activeTo);
        const sortOrder = parseSortOrder(body?.sortOrder);

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

        const ad = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO hospital_wide_ads (
                    hospital_id,
                    position,
                    type,
                    asset_url,
                    storage_key,
                    mime_type,
                    original_filename,
                    file_size_bytes,
                    title,
                    is_active,
                    active_from,
                    active_to,
                    sort_order,
                    created_by_user_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                hospital.hospitalId,
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
                hospital.userId
            );

            const idRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
            const adId = Number(idRows[0]?.id || 0);
            if (!adId) throw new Error("Hospital ad was not created.");

            const rows = await tx.$queryRawUnsafe<AdRow[]>(
                `
                SELECT *
                FROM hospital_wide_ads
                WHERE ad_id = ?
                  AND hospital_id = ?
                LIMIT 1
                `,
                adId,
                hospital.hospitalId
            );

            if (!rows[0]) throw new Error("Created hospital ad could not be loaded.");
            return rows[0];
        });

        return NextResponse.json({ ad: serializeAd(ad) }, { status: 201 });
    } catch (error) {
        console.error("Create HMS hospital ad error:", error);
        return NextResponse.json({ error: "Unable to create hospital ad. Please try again." }, { status: 500 });
    }
}
