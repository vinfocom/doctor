export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

type TempTokenRow = {
    registration_id: number;
    hospital_group_code: string;
    reg_date: Date | string;
    seq_no: number;
    token: string;
    patient_name: string;
    phone: string | null;
    age: number | null;
    gender: string | null;
    doctor_id: number | null;
    room_no: string | null;
    doctor_name: string | null;
    admin_id: number | null;
    patient_id: number | null;
    visit_id: number | null;
    resolved_at: Date | string | null;
    created_at: Date | string | null;
    uhid: string | null;
    visit_number: string | null;
    visit_status: string | null;
};

type TempTokenCountsRow = {
    total_tokens: number | bigint | null;
    registered_tokens: number | bigint | null;
    pending_tokens: number | bigint | null;
    date_tokens: number | bigint | null;
    date_registered_tokens: number | bigint | null;
    date_pending_tokens: number | bigint | null;
};

type TempTokenListCountRow = {
    total: number | bigint | null;
};

type ReceptionAccess = {
    hospital: NonNullable<Awaited<ReturnType<typeof getHmsSessionFromRequest>>>["hospitalContext"];
    staffId: number;
    assignedDoctorIds: number[];
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getTodayPartsInIst() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());

    return {
        year: parts.find((part) => part.type === "year")?.value || "0000",
        month: parts.find((part) => part.type === "month")?.value || "00",
        day: parts.find((part) => part.type === "day")?.value || "00",
    };
}

function toDateOnlyString(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function serializeToken(row: TempTokenRow) {
    return {
        registration_id: Number(row.registration_id),
        hospital_group_code: row.hospital_group_code,
        reg_date: toDateOnlyString(row.reg_date),
        seq_no: Number(row.seq_no),
        token: row.token,
        patient_name: row.patient_name,
        phone: row.phone,
        age: row.age,
        gender: row.gender,
        doctor_id: row.doctor_id,
        room_no: row.room_no,
        doctor_name: row.doctor_name,
        admin_id: row.admin_id,
        patient_id: row.patient_id,
        visit_id: row.visit_id,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        doctor: row.doctor_id
            ? {
                doctor_id: row.doctor_id,
                doctor_name: row.doctor_name,
                room_no: row.room_no,
            }
            : null,
        patient: row.patient_id
            ? {
                patient_id: row.patient_id,
                uhid: row.uhid,
            }
            : null,
        visit: row.visit_id
            ? {
                visit_id: row.visit_id,
                visit_number: row.visit_number,
                status: row.visit_status,
            }
            : null,
    };
}

function toCount(value: number | bigint | null | undefined) {
    return Number(value || 0);
}

async function requireReceptionSession(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "qr_temp_token_enabled"))) {
        return null;
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        return null;
    }

    return {
        hospital: session.hospitalContext,
        staffId: staff.staffId,
        assignedDoctorIds: await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId),
    } satisfies ReceptionAccess;
}

export async function GET(req: Request) {
    try {
        const access = await requireReceptionSession(req);
        if (!access) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }
        const { hospital, assignedDoctorIds } = access;

        const { searchParams } = new URL(req.url);
        const query = normalizeText(searchParams.get("q"));
        const registrationId = normalizeId(searchParams.get("registration_id"));
        const includeResolved = normalizeText(searchParams.get("include_resolved")) === "1";
        const selectedDate = normalizeDate(searchParams.get("date"));
        const sortDirection = normalizeText(searchParams.get("sort")).toUpperCase() === "DESC" ? "DESC" : "ASC";
        const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100000);
        const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = (page - 1) * limit;
        const todayOnly = normalizeText(searchParams.get("scope")).toUpperCase() !== "ALL";
        const likeQuery = `%${query}%`;
        const todayParts = getTodayPartsInIst();
        const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
        const effectiveDate = selectedDate || today;
        const doctorPlaceholders = assignedDoctorIds.length > 0 ? assignedDoctorIds.map(() => "?").join(", ") : "-1";

        let listTotal = 0;
        if (includeResolved) {
            const listCountRows = await prisma.$queryRawUnsafe<TempTokenListCountRow[]>(
                `
                SELECT COUNT(*) AS total
                FROM hospital_registrations hr
                LEFT JOIN hospital_doctors hd
                  ON hd.hospital_id = ?
                 AND hd.doctor_id = hr.doctor_id
                LEFT JOIN doctors d ON d.doctor_id = hr.doctor_id
                WHERE hr.hospital_group_code = ?
                  AND hr.admin_id = ?
                  ${registrationId ? "AND hr.registration_id = ?" : ""}
                  AND (hr.doctor_id IS NULL OR hr.doctor_id IN (${doctorPlaceholders}))
                  AND (? = 0 OR hr.reg_date = ?)
                  AND (
                    ? = ''
                    OR hr.token LIKE ?
                    OR hr.patient_name LIKE ?
                    OR hr.phone LIKE ?
                    OR CAST(hr.age AS CHAR) LIKE ?
                    OR COALESCE(hr.gender, '') LIKE ?
                    OR COALESCE(hd.room_no, '') LIKE ?
                    OR COALESCE(d.doctor_name, '') LIKE ?
                  )
                `,
                hospital.hospitalId,
                hospital.hospitalCode,
                hospital.adminId,
                ...(registrationId ? [registrationId] : []),
                ...assignedDoctorIds,
                todayOnly || selectedDate ? 1 : 0,
                effectiveDate,
                query,
                likeQuery,
                likeQuery,
                likeQuery,
                likeQuery,
                likeQuery,
                likeQuery,
                likeQuery
            );
            listTotal = toCount(listCountRows[0]?.total);
        }

        const rows = await prisma.$queryRawUnsafe<TempTokenRow[]>(
            `
            SELECT
                hr.registration_id,
                hr.hospital_group_code,
                hr.reg_date,
                hr.seq_no,
                hr.token,
                hr.patient_name,
                hr.phone,
                hr.age,
                hr.gender,
                hr.doctor_id,
                hd.room_no,
                hr.admin_id,
                hr.patient_id,
                hr.visit_id,
                hr.resolved_at,
                hr.created_at,
                d.doctor_name,
                p.uhid,
                v.visit_number,
                v.status AS visit_status
            FROM hospital_registrations hr
            LEFT JOIN hospital_doctors hd
              ON hd.hospital_id = ?
             AND hd.doctor_id = hr.doctor_id
            LEFT JOIN doctors d ON d.doctor_id = hr.doctor_id
            LEFT JOIN patients p
              ON p.patient_id = hr.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            LEFT JOIN visits v
              ON v.visit_id = hr.visit_id
             AND v.hospital_id = ?
             AND v.admin_id = ?
             AND v.hospital_group_code = ?
            WHERE hr.hospital_group_code = ?
              AND hr.admin_id = ?
              ${includeResolved ? "" : "AND hr.resolved_at IS NULL"}
              ${registrationId ? "AND hr.registration_id = ?" : ""}
              AND (hr.doctor_id IS NULL OR hr.doctor_id IN (${doctorPlaceholders}))
              AND (? = 0 OR hr.reg_date = ?)
              AND (
                ? = ''
                OR hr.token LIKE ?
                OR hr.patient_name LIKE ?
                OR hr.phone LIKE ?
                OR CAST(hr.age AS CHAR) LIKE ?
                OR COALESCE(hr.gender, '') LIKE ?
                OR COALESCE(hd.room_no, '') LIKE ?
                OR COALESCE(d.doctor_name, '') LIKE ?
              )
            ORDER BY hr.reg_date ${sortDirection}, hr.seq_no ${sortDirection}, hr.registration_id ${sortDirection}
            LIMIT ?
            OFFSET ?
            `,
            hospital.hospitalId,
            hospital.adminId,
            hospital.hospitalCode,
            hospital.hospitalId,
            hospital.adminId,
            hospital.hospitalCode,
            hospital.hospitalCode,
            hospital.adminId,
            ...(registrationId ? [registrationId] : []),
            ...assignedDoctorIds,
            todayOnly || selectedDate ? 1 : 0,
            effectiveDate,
            query,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            likeQuery,
            limit,
            offset
        );

        let counts = null;
        if (includeResolved) {
            const countRows = await prisma.$queryRawUnsafe<TempTokenCountsRow[]>(
                `
                SELECT
                    COUNT(*) AS total_tokens,
                    SUM(CASE WHEN hr.resolved_at IS NOT NULL OR hr.visit_id IS NOT NULL THEN 1 ELSE 0 END) AS registered_tokens,
                    SUM(CASE WHEN hr.resolved_at IS NULL AND hr.visit_id IS NULL THEN 1 ELSE 0 END) AS pending_tokens,
                    SUM(CASE WHEN hr.reg_date = ? THEN 1 ELSE 0 END) AS date_tokens,
                    SUM(CASE WHEN hr.reg_date = ? AND (hr.resolved_at IS NOT NULL OR hr.visit_id IS NOT NULL) THEN 1 ELSE 0 END) AS date_registered_tokens,
                    SUM(CASE WHEN hr.reg_date = ? AND hr.resolved_at IS NULL AND hr.visit_id IS NULL THEN 1 ELSE 0 END) AS date_pending_tokens
                FROM hospital_registrations hr
                WHERE hr.hospital_group_code = ?
                  AND hr.admin_id = ?
                  AND (hr.doctor_id IS NULL OR hr.doctor_id IN (${doctorPlaceholders}))
                `,
                effectiveDate,
                effectiveDate,
                effectiveDate,
                hospital.hospitalCode,
                hospital.adminId,
                ...assignedDoctorIds
            );
            const row = countRows[0];
            counts = {
                totalTokens: toCount(row?.total_tokens),
                registeredTokens: toCount(row?.registered_tokens),
                pendingTokens: toCount(row?.pending_tokens),
                dateTokens: toCount(row?.date_tokens),
                dateRegisteredTokens: toCount(row?.date_registered_tokens),
                datePendingTokens: toCount(row?.date_pending_tokens),
            };
        }

        return NextResponse.json({
            tempTokens: rows.map(serializeToken),
            counts,
            date: effectiveDate,
            pagination: includeResolved ? {
                page,
                page_size: limit,
                total: listTotal,
                total_pages: Math.max(1, Math.ceil(listTotal / limit)),
            } : null,
        });
    } catch (error) {
        console.error("Search HMS temp tokens error:", error);
        return NextResponse.json({ error: "Unable to load temp tokens." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    void req;
    return NextResponse.json(
        { error: "Temp tokens are created by the hospital QR registration flow, not by Reception." },
        { status: 405 }
    );
}
