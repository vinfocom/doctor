export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

type DoctorRow = {
    doctor_id: number;
};

type VisitRow = {
    visit_id: number;
    visit_number: string | null;
    daily_token_number: number | null;
    visit_date: Date | string;
    visit_type: string;
    status: string;
    patient_id: number;
    patient_name: string | null;
    patient_uhid: string | null;
    patient_phone: string | null;
    age: number | null;
    gender: string | null;
    last_emr_visit_id: number | null;
    finalized_prescription_id: number | null;
    created_at: Date | string | null;
};

type CountRow = {
    total: bigint | number;
    waiting: bigint | number;
    in_consult: bigint | number;
    lab: bigint | number;
};

function getTodayDateInIst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDate(value: unknown) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
}

function parseBoundedPositiveInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeSearch(value: unknown) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    return text.length > 80 ? text.slice(0, 80) : text;
}

function toNumber(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function toDateOnlyString(value: Date | string) {
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
        const visitDate = normalizeDate(searchParams.get("date")) || getTodayDateInIst();
        const activeOnly = searchParams.get("active_only") === "1";
        const page = parseBoundedPositiveInt(searchParams.get("page"), 1, 1, 100000);
        const pageSize = parseBoundedPositiveInt(searchParams.get("page_size"), activeOnly ? 200 : 25, 10, activeOnly ? 500 : 100);
        const offset = (page - 1) * pageSize;
        const searchQuery = normalizeSearch(searchParams.get("q"));
        const searchPattern = `%${searchQuery}%`;
        const activeFilterSql = activeOnly ? "AND v.status IN ('WAITING', 'IN_CONSULT')" : "";
        const searchFilterSql = searchQuery
            ? `
              AND (
                CAST(v.visit_id AS CHAR) LIKE ?
                OR CAST(v.daily_token_number AS CHAR) LIKE ?
                OR COALESCE(v.visit_number, '') LIKE ?
                OR COALESCE(v.visit_type, '') LIKE ?
                OR COALESCE(v.status, '') LIKE ?
                OR COALESCE(p.full_name, '') LIKE ?
                OR COALESCE(p.uhid, '') LIKE ?
                OR COALESCE(p.phone, '') LIKE ?
                OR CAST(COALESCE(p.age, '') AS CHAR) LIKE ?
                OR COALESCE(p.gender, '') LIKE ?
              )
            `
            : "";
        const searchArgs = searchQuery ? Array(10).fill(searchPattern) : [];

        const countRows = await prisma.$queryRawUnsafe<CountRow[]>(
            `
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN v.status = 'WAITING' THEN 1 ELSE 0 END) AS waiting,
                SUM(CASE WHEN v.status = 'IN_CONSULT' THEN 1 ELSE 0 END) AS in_consult,
                SUM(CASE WHEN v.status = 'LAB' THEN 1 ELSE 0 END) AS lab
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            WHERE v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.doctor_id = ?
              AND v.visit_date = ?
              ${searchFilterSql}
            `,
            context.adminId,
            context.hospitalCode,
            context.hospitalId,
            context.adminId,
            context.hospitalCode,
            context.doctorId,
            visitDate,
            ...searchArgs
        );
        const totals = countRows[0] || { total: 0, waiting: 0, in_consult: 0, lab: 0 };
        const fullDayTotal = toNumber(totals.total);
        const activeTotal = toNumber(totals.waiting) + toNumber(totals.in_consult);
        const paginationTotal = activeOnly ? activeTotal : fullDayTotal;
        const totalPages = Math.max(1, Math.ceil(paginationTotal / pageSize));

        const rows = await prisma.$queryRawUnsafe<VisitRow[]>(
            `
            SELECT
                v.visit_id,
                v.visit_number,
                v.daily_token_number,
                v.visit_date,
                v.visit_type,
                v.status,
                v.patient_id,
                p.full_name AS patient_name,
                p.uhid AS patient_uhid,
                p.phone AS patient_phone,
                p.age,
                p.gender,
                (
                    SELECT p2.visit_id
                    FROM prescriptions p2
                    WHERE p2.patient_id = v.patient_id
                      AND p2.doctor_id = ?
                      AND p2.visit_id IS NOT NULL
                      AND p2.is_deleted = 0
                    ORDER BY p2.visit_date DESC, p2.id DESC
                    LIMIT 1
                ) AS last_emr_visit_id,
                (
                    SELECT p3.id
                    FROM prescriptions p3
                    WHERE p3.visit_id = v.visit_id
                      AND p3.patient_id = v.patient_id
                      AND p3.doctor_id = ?
                      AND p3.is_deleted = 0
                      AND p3.finalized_at IS NOT NULL
                    ORDER BY p3.finalized_at DESC, p3.id DESC
                    LIMIT 1
                ) AS finalized_prescription_id,
                v.created_at
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            WHERE v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.doctor_id = ?
              AND v.visit_date = ?
              ${activeFilterSql}
              ${searchFilterSql}
            ORDER BY
                FIELD(v.status, 'IN_CONSULT', 'WAITING', 'LAB', 'COMPLETED', 'CANCELLED'),
                v.visit_id ASC
            LIMIT ? OFFSET ?
            `,
            context.doctorId,
            context.doctorId,
            context.adminId,
            context.hospitalCode,
            context.hospitalId,
            context.adminId,
            context.hospitalCode,
            context.doctorId,
            visitDate,
            ...searchArgs,
            pageSize,
            offset
        );

        return NextResponse.json({
            date: visitDate,
            pagination: {
                page,
                page_size: pageSize,
                total: paginationTotal,
                total_pages: totalPages,
            },
            totals: {
                waiting: toNumber(totals.waiting),
                inConsult: toNumber(totals.in_consult),
                lab: toNumber(totals.lab),
            },
            visits: rows.map((row) => ({
                visit_id: Number(row.visit_id),
                visit_number: row.visit_number,
                daily_token_number: row.daily_token_number === null || row.daily_token_number === undefined ? null : Number(row.daily_token_number),
                visit_date: toDateOnlyString(row.visit_date),
                visit_type: row.visit_type,
                status: row.status,
                patient_id: Number(row.patient_id),
                created_at: row.created_at,
                patient: {
                    patient_id: Number(row.patient_id),
                    full_name: row.patient_name,
                    uhid: row.patient_uhid,
                    phone: row.patient_phone,
                    age: row.age,
                    gender: row.gender,
                    last_emr_visit_id: row.last_emr_visit_id ? Number(row.last_emr_visit_id) : null,
                },
                finalized_prescription_id: row.finalized_prescription_id ? Number(row.finalized_prescription_id) : null,
            })),
        });
    } catch (error) {
        console.error("Load HMS doctor visits error:", error);
        return NextResponse.json({ error: "Unable to load doctor visits." }, { status: 500 });
    }
}
