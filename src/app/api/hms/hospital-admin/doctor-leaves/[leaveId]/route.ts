export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ leaveId: string }> }) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const { leaveId: leaveIdParam } = await params;
        const leaveId = Number(leaveIdParam);
        if (!Number.isInteger(leaveId) || leaveId <= 0) {
            return NextResponse.json({ error: "Leave id must be valid." }, { status: 400 });
        }

        await prisma.$executeRawUnsafe(
            `
            DELETE dl
            FROM doctor_leaves dl
            INNER JOIN hospital_doctors hd
              ON hd.doctor_id = dl.doctor_id
             AND hd.hospital_id = ?
            WHERE dl.leave_id = ?
              AND dl.admin_id = ?
            `,
            hospital.hospitalId,
            leaveId,
            hospital.adminId
        );

        return NextResponse.json({ message: "Doctor leave deleted." });
    } catch (error) {
        console.error("Delete HMS doctor leave error:", error);
        return NextResponse.json({ error: "Unable to delete doctor leave." }, { status: 500 });
    }
}
