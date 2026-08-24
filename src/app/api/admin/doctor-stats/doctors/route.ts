export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

type DoctorOptionRow = {
    doctor_id: number;
    doctor_name: string | null;
    specialization: string | null;
    status: string | null;
    clinic_count: bigint | number | null;
    num_clinics: number | null;
    hospital_codes: string | null;
    hospital_names: string | null;
};

function toNumber(value: bigint | number | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

export async function GET(req: Request) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can export doctor stats." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<DoctorOptionRow[]>(
            `
            SELECT
                d.doctor_id,
                d.doctor_name,
                d.specialization,
                d.status,
                COUNT(DISTINCT c.clinic_id) AS clinic_count,
                d.num_clinics,
                GROUP_CONCAT(DISTINCT h.code ORDER BY h.code SEPARATOR ', ') AS hospital_codes,
                GROUP_CONCAT(DISTINCT h.name ORDER BY h.name SEPARATOR ', ') AS hospital_names
            FROM doctors d
            LEFT JOIN clinics c
              ON c.doctor_id = d.doctor_id
            LEFT JOIN hospital_doctors hd
              ON hd.doctor_id = d.doctor_id
            LEFT JOIN hospitals h
              ON h.hospital_id = hd.hospital_id
            GROUP BY
                d.doctor_id,
                d.doctor_name,
                d.specialization,
                d.status,
                d.num_clinics
            ORDER BY d.doctor_name ASC, d.doctor_id ASC
            `
        );

        const doctors = rows.map((row) => {
            const clinicCount = toNumber(row.clinic_count);
            return {
                doctor_id: Number(row.doctor_id),
                doctor_name: row.doctor_name || `Doctor ${row.doctor_id}`,
                specialization: row.specialization || "",
                status: row.status || "",
                clinic_count: clinicCount,
                num_clinics: row.num_clinics ?? 0,
                doctor_type: clinicCount > 0 ? "CMS" : "HMS",
                hospital_codes: row.hospital_codes || "",
                hospital_names: row.hospital_names || "",
            };
        });

        return NextResponse.json({ doctors }, { status: 200 });
    } catch (error) {
        console.error("List admin dashboard doctor stats options error:", error);
        return NextResponse.json({ error: "Unable to load doctors for export." }, { status: 500 });
    }
}
