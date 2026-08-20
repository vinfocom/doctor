import prisma from "@/lib/prisma";
import type { JWTPayload } from "@/lib/jwt";

type HospitalUserRow = {
    hospital_id: number | null;
};

type DoctorHospitalRow = {
    hospital_id: number;
};

export async function shouldRedirectLegacySessionToHms(session: JWTPayload) {
    if (session.role === "SUPER_ADMIN" || session.role === "PATIENT") {
        return false;
    }

    if (session.role === "ADMIN" || session.role === "CLINIC_STAFF") {
        const rows = await prisma.$queryRawUnsafe<HospitalUserRow[]>(
            `
            SELECT hospital_id
            FROM users
            WHERE user_id = ?
            LIMIT 1
            `,
            session.userId
        );

        return Boolean(rows[0]?.hospital_id);
    }

    if (session.role === "DOCTOR") {
        const rows = await prisma.$queryRawUnsafe<DoctorHospitalRow[]>(
            `
            SELECT h.hospital_id
            FROM doctors d
            INNER JOIN hospitals h
              ON h.admin_id = d.admin_id
            WHERE d.user_id = ?
            LIMIT 1
            `,
            session.userId
        );

        return rows.length > 0;
    }

    return false;
}
