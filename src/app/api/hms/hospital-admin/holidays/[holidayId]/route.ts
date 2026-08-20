export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ holidayId: string }> }) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const { holidayId: holidayIdParam } = await params;
        const holidayId = Number(holidayIdParam);
        if (!Number.isInteger(holidayId) || holidayId <= 0) {
            return NextResponse.json({ error: "Holiday id must be valid." }, { status: 400 });
        }

        await prisma.$executeRawUnsafe(
            `
            DELETE FROM hospital_holidays
            WHERE id = ?
              AND hospital_id = ?
            `,
            holidayId,
            hospital.hospitalId
        );

        return NextResponse.json({ message: "Holiday deleted." });
    } catch (error) {
        console.error("Delete HMS hospital holiday error:", error);
        return NextResponse.json({ error: "Unable to delete holiday." }, { status: 500 });
    }
}
