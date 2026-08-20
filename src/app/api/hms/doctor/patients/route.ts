export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

type DoctorRow = {
    doctor_id: number;
};

type PatientRow = {
    patient_id: number;
    full_name: string | null;
    uhid: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    last_visit_date: Date | string | null;
    last_emr_visit_id: number | null;
    visit_count: bigint | number;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeDate(value: unknown) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function toNumber(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

async function requireDoctorContext(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "DOCTOR") {
        return null;
    }

    const doctors = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT doctor_id
        FROM doctors
        WHERE user_id = ?
          AND admin_id = ?
        LIMIT 1
        `,
        session.hospitalContext.userId,
        session.hospitalContext.adminId
    );

    if (!doctors[0]) return null;

    return {
        ...session.hospitalContext,
        doctorId: Number(doctors[0].doctor_id),
    };
}

export async function GET(req: Request) {
    try {
        const context = await requireDoctorContext(req);
        if (!context) {
            return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const query = normalizeText(searchParams.get("q"));
        const visitDate = normalizeDate(searchParams.get("visit_date"));
        const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100000);
        const pageSize = parsePositiveInt(searchParams.get("page_size"), 25, 10, 100);
        const offset = (page - 1) * pageSize;
        const containsQuery = `%${query}%`;
        const phoneQuery = `%${query.replace(/\D/g, "")}%`;
        const dateFilterSql = query || !visitDate
            ? ""
            : `
              AND v.visit_date = ?
            `;
        const countSql = `
            SELECT COUNT(DISTINCT p.patient_id) AS total
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            WHERE v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.doctor_id = ?
              ${dateFilterSql}
              AND (
                ? = ''
                OR COALESCE(p.uhid, '') LIKE ?
                OR COALESCE(v.visit_number, '') LIKE ?
                OR CAST(v.visit_id AS CHAR) LIKE ?
                OR CAST(v.daily_token_number AS CHAR) LIKE ?
                OR COALESCE(p.full_name, '') LIKE ?
                OR (? <> '' AND p.phone LIKE ?)
              )
        `;
        const countRows = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(
            countSql,
            context.adminId,
            context.hospitalCode,
            context.hospitalId,
            context.adminId,
            context.hospitalCode,
            context.doctorId,
            ...(query || !visitDate ? [] : [visitDate]),
            query,
            containsQuery,
            containsQuery,
            containsQuery,
            containsQuery,
            containsQuery,
            phoneQuery,
            phoneQuery
        );
        const total = Number(countRows[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        const rows = await prisma.$queryRawUnsafe<PatientRow[]>(
            `
            SELECT
                p.patient_id,
                p.full_name,
                p.uhid,
                p.phone,
                p.age,
                p.gender,
                p.city,
                p.location,
                MAX(v.visit_date) AS last_visit_date,
                (
                    SELECT p2.visit_id
                    FROM prescriptions p2
                    WHERE p2.patient_id = p.patient_id
                      AND p2.doctor_id = ?
                      AND p2.visit_id IS NOT NULL
                      AND p2.is_deleted = 0
                    ORDER BY p2.visit_date DESC, p2.id DESC
                    LIMIT 1
                ) AS last_emr_visit_id,
                COUNT(v.visit_id) AS visit_count
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            WHERE v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.doctor_id = ?
              ${dateFilterSql}
              AND (
                ? = ''
                OR COALESCE(p.uhid, '') LIKE ?
                OR COALESCE(v.visit_number, '') LIKE ?
                OR CAST(v.visit_id AS CHAR) LIKE ?
                OR CAST(v.daily_token_number AS CHAR) LIKE ?
                OR COALESCE(p.full_name, '') LIKE ?
                OR (? <> '' AND p.phone LIKE ?)
              )
            GROUP BY
                p.patient_id,
                p.full_name,
                p.uhid,
                p.phone,
                p.age,
                p.gender,
                p.city,
                p.location
            ORDER BY last_visit_date DESC, p.full_name ASC, p.patient_id DESC
            LIMIT ? OFFSET ?
            `,
            context.doctorId,
            context.adminId,
            context.hospitalCode,
            context.hospitalId,
            context.adminId,
            context.hospitalCode,
            context.doctorId,
            ...(query || !visitDate ? [] : [visitDate]),
            query,
            containsQuery,
            containsQuery,
            containsQuery,
            containsQuery,
            containsQuery,
            phoneQuery,
            phoneQuery,
            pageSize,
            offset
        );

        return NextResponse.json({
            patients: rows.map((row) => ({
                patient_id: Number(row.patient_id),
                full_name: row.full_name,
                uhid: row.uhid,
                phone: row.phone,
                age: row.age,
                gender: row.gender,
                city: row.city,
                location: row.location,
                last_visit_date: dateOnly(row.last_visit_date),
                last_emr_visit_id: row.last_emr_visit_id ? Number(row.last_emr_visit_id) : null,
                visit_count: toNumber(row.visit_count),
            })),
            pagination: {
                page,
                page_size: pageSize,
                total,
                total_pages: totalPages,
            },
        });
    } catch (error) {
        console.error("Load HMS doctor patients error:", error);
        return NextResponse.json({ error: "Unable to load patients." }, { status: 500 });
    }
}
