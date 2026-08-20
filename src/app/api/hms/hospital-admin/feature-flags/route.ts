export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import {
    normalizeHmsFeatureFlags,
} from "@/lib/hms-feature-flags";

type FeatureFlagRow = {
    flags: unknown;
};

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
            `
            SELECT flags
            FROM hospital_feature_flags
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );

        return NextResponse.json({
            flags: normalizeHmsFeatureFlags(rows[0]?.flags),
        });
    } catch (error) {
        console.error("Load HMS feature flags error:", error);
        return NextResponse.json({ error: "Unable to load feature flags." }, { status: 500 });
    }
}

export async function PATCH() {
    return NextResponse.json({ error: "Only Super Admin can change hospital feature flags." }, { status: 403 });
}
