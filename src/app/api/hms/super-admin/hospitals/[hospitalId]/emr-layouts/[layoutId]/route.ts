export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import { deactivateHmsPrintLayout, listHmsPrintLayouts } from "@/lib/hms-print-layout-service";
import prisma from "@/lib/prisma";

type RouteContext = {
    params: Promise<{ hospitalId: string; layoutId: string }>;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireSuperAdminHospital(req: Request, hospitalIdParam: string) {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "SUPER_ADMIN") return null;

    const hospitalId = normalizeId(hospitalIdParam);
    if (!hospitalId) throw new Error("Valid hospital id is required.");

    const rows = await prisma.$queryRawUnsafe<Array<{ hospital_id: number }>>(
        `
        SELECT hospital_id
        FROM hospitals
        WHERE hospital_id = ?
        LIMIT 1
        `,
        hospitalId
    );

    if (!rows[0]) throw new Error("Hospital was not found.");
    return { session, hospitalId: Number(rows[0].hospital_id) };
}

export async function DELETE(req: Request, context: RouteContext) {
    try {
        const { hospitalId, layoutId: layoutIdParam } = await context.params;
        const scope = await requireSuperAdminHospital(req, hospitalId);
        if (!scope) {
            return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
        }

        const layoutId = normalizeId(layoutIdParam);
        if (!layoutId) {
            return NextResponse.json({ error: "Valid layout id is required." }, { status: 400 });
        }

        const deactivated = await deactivateHmsPrintLayout({
            hospitalId: scope.hospitalId,
            layoutId,
            userId: scope.session.userId,
        });
        if (!deactivated) {
            return NextResponse.json({ error: "Layout was not found." }, { status: 404 });
        }

        const layouts = await listHmsPrintLayouts(scope.hospitalId);
        return NextResponse.json({ layouts });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to deactivate layout.";
        const status = message.includes("not found") ? 404 : message.includes("hospital id") ? 400 : 500;
        console.error("Deactivate HMS Super Admin EMR layout error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
