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
    admin_user_id: number | null;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

export async function DELETE(req: Request, context: RouteContext) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can delete HMS hospitals." }, { status: 403 });
        }

        const { hospitalId: hospitalIdParam } = await context.params;
        const hospitalId = normalizeId(hospitalIdParam);
        if (!hospitalId) {
            return NextResponse.json({ error: "Valid hospital id is required." }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<HospitalRow[]>(
            `
            SELECT
                h.hospital_id,
                h.code,
                h.name,
                h.admin_id,
                h.status,
                a.user_id AS admin_user_id
            FROM hospitals h
            LEFT JOIN admins a
              ON a.admin_id = h.admin_id
            WHERE h.hospital_id = ?
            LIMIT 1
            `,
            hospitalId
        );

        const hospital = rows[0];
        if (!hospital) {
            return NextResponse.json({ error: "Hospital was not found." }, { status: 404 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                DELETE FROM hospitals
                WHERE hospital_id = ?
                `,
                hospitalId
            );

            await tx.$executeRawUnsafe(
                `
                DELETE FROM admins
                WHERE admin_id = ?
                `,
                Number(hospital.admin_id)
            );

            if (hospital.admin_user_id) {
                await tx.$executeRawUnsafe(
                    `
                    DELETE FROM users
                    WHERE user_id = ?
                    `,
                    Number(hospital.admin_user_id)
                );
            }
        });

        return NextResponse.json({
            hospital: {
                hospital_id: Number(hospital.hospital_id),
                code: hospital.code,
                name: hospital.name,
                admin_id: Number(hospital.admin_id),
                status: hospital.status,
            },
        });
    } catch (error) {
        console.error("Delete HMS hospital error:", error);
        return NextResponse.json({ error: "Unable to delete HMS hospital." }, { status: 500 });
    }
}
