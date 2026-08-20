export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { generateTemporaryPassword } from "@/lib/hms-passwords";

type ScopeRow = {
    user_id: number;
};

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    return session.hospitalContext;
}

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const { userId: userIdParam } = await params;
        const userId = Number(userIdParam);
        if (!Number.isInteger(userId) || userId <= 0) {
            return NextResponse.json({ error: "User id must be valid." }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<ScopeRow[]>(
            `
            SELECT u.user_id
            FROM users u
            LEFT JOIN hospital_staff hs
              ON hs.user_id = u.user_id
             AND hs.hospital_id = ?
            LEFT JOIN doctors d
              ON d.user_id = u.user_id
             AND d.admin_id = ?
            LEFT JOIN hospital_doctors hd
              ON hd.doctor_id = d.doctor_id
             AND hd.hospital_id = ?
            WHERE u.user_id = ?
              AND (
                hs.staff_id IS NOT NULL
                OR hd.doctor_id IS NOT NULL
              )
            LIMIT 1
            `,
            hospital.hospitalId,
            hospital.adminId,
            hospital.hospitalId,
            userId
        );

        if (!rows[0]) {
            return NextResponse.json({ error: "User was not found for this hospital." }, { status: 404 });
        }

        const tempPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        await prisma.$executeRawUnsafe(
            `
            UPDATE users
            SET password = ?,
                force_password_change = TRUE,
                password_reset_at = CURRENT_TIMESTAMP,
                password_reset_by = ?
            WHERE user_id = ?
            `,
            hashedPassword,
            hospital.userId,
            userId
        );

        return NextResponse.json({
            message: "Password reset.",
            temporaryPassword: tempPassword,
        });
    } catch (error) {
        console.error("Reset HMS user password error:", error);
        return NextResponse.json({ error: "Unable to reset password. Please try again." }, { status: 500 });
    }
}
