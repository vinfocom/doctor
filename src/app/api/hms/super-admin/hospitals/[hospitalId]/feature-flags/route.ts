export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
    DEFAULT_HMS_FEATURE_FLAGS,
    normalizeHmsFeatureFlags,
    type HmsFeatureFlags,
} from "@/lib/hms-feature-flags";

type FeatureFlagRow = {
    flags: unknown;
};

type HospitalRow = {
    hospital_id: number;
    code: string;
    name: string;
    status: string | null;
};

function normalizeIncomingFlags(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const next: Partial<HmsFeatureFlags> = {};

    for (const key of Object.keys(DEFAULT_HMS_FEATURE_FLAGS) as Array<keyof HmsFeatureFlags>) {
        if (typeof raw[key] === "boolean") {
            next[key] = raw[key];
        }
    }

    return Object.keys(next).length > 0 ? next : null;
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

async function resolveHospital(hospitalId: number) {
    const rows = await prisma.$queryRawUnsafe<HospitalRow[]>(
        `
        SELECT hospital_id, code, name, status
        FROM hospitals
        WHERE hospital_id = ?
        LIMIT 1
        `,
        hospitalId
    );

    return rows[0] || null;
}

async function resolveRouteHospital(params: Promise<{ hospitalId: string }>) {
    const { hospitalId: hospitalIdParam } = await params;
    const hospitalId = Number(hospitalIdParam);

    if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
        return { hospital: null, response: NextResponse.json({ error: "Hospital id must be valid." }, { status: 400 }) };
    }

    const hospital = await resolveHospital(hospitalId);
    if (!hospital) {
        return { hospital: null, response: NextResponse.json({ error: "Hospital was not found." }, { status: 404 }) };
    }

    return { hospital, response: null };
}

export async function GET(req: Request, { params }: { params: Promise<{ hospitalId: string }> }) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can view hospital feature flags." }, { status: 403 });
        }

        const resolved = await resolveRouteHospital(params);
        if (resolved.response) return resolved.response;

        const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
            `
            SELECT flags
            FROM hospital_feature_flags
            WHERE hospital_id = ?
            LIMIT 1
            `,
            resolved.hospital.hospital_id
        );

        return NextResponse.json({
            hospital: resolved.hospital,
            flags: normalizeHmsFeatureFlags(rows[0]?.flags),
        });
    } catch (error) {
        console.error("Load Super Admin HMS feature flags error:", error);
        return NextResponse.json({ error: "Unable to load feature flags." }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ hospitalId: string }> }) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can change hospital feature flags." }, { status: 403 });
        }

        const resolved = await resolveRouteHospital(params);
        if (resolved.response) return resolved.response;

        const body = await req.json();
        const incoming = normalizeIncomingFlags(body?.flags);
        if (!incoming) {
            return NextResponse.json({ error: "At least one feature flag is required." }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
            `
            SELECT flags
            FROM hospital_feature_flags
            WHERE hospital_id = ?
            LIMIT 1
            `,
            resolved.hospital.hospital_id
        );

        const current = normalizeHmsFeatureFlags(rows[0]?.flags);
        const next = {
            ...current,
            ...incoming,
        };

        if (rows[0]) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE hospital_feature_flags
                SET flags = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE hospital_id = ?
                `,
                JSON.stringify(next),
                resolved.hospital.hospital_id
            );
        } else {
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO hospital_feature_flags (hospital_id, flags)
                VALUES (?, ?)
                `,
                resolved.hospital.hospital_id,
                JSON.stringify(next)
            );
        }

        return NextResponse.json({
            hospital: resolved.hospital,
            flags: next,
        });
    } catch (error) {
        console.error("Save Super Admin HMS feature flags error:", error);
        return NextResponse.json({ error: "Unable to save feature flags." }, { status: 500 });
    }
}
