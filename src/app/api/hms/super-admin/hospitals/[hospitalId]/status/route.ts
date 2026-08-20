export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

type RouteContext = {
    params: Promise<{
        hospitalId: string;
    }>;
};

type HospitalRow = {
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
    status: string;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeStatus(value: unknown) {
    const status = String(value || "").trim().toUpperCase();
    return status === "ACTIVE" || status === "INACTIVE" ? status : null;
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can update HMS hospitals." }, { status: 403 });
        }

        const { hospitalId: hospitalIdParam } = await context.params;
        const hospitalId = normalizeId(hospitalIdParam);
        if (!hospitalId) {
            return NextResponse.json({ error: "Valid hospital id is required." }, { status: 400 });
        }

        const body = await req.json();
        const status = normalizeStatus(body?.status);
        if (!status) {
            return NextResponse.json({ error: "Hospital status must be ACTIVE or INACTIVE." }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<HospitalRow[]>(
            `
            SELECT hospital_id, code, name, admin_id, status
            FROM hospitals
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospitalId
        );

        if (!rows[0]) {
            return NextResponse.json({ error: "Hospital was not found." }, { status: 404 });
        }

        await prisma.$executeRawUnsafe(
            `
            UPDATE hospitals
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE hospital_id = ?
            `,
            status,
            hospitalId
        );

        return NextResponse.json({
            hospital: {
                ...rows[0],
                hospital_id: Number(rows[0].hospital_id),
                admin_id: Number(rows[0].admin_id),
                status,
            },
        });
    } catch (error) {
        console.error("Update HMS hospital status error:", error);
        return NextResponse.json({ error: "Unable to update hospital status." }, { status: 500 });
    }
}
