export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, isHmsStaffType } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { extractIdFormatConfig, resolveHmsId } from "@/lib/hms-id-format";

type PolicyRow = {
    policies: unknown;
};

type InsertIdRow = {
    id: bigint | number;
};

type PatientRow = {
    patient_id: number;
    uhid: string | null;
    full_name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    address: string | null;
    hospital_group_code: string | null;
    last_visit_date?: Date | string | null;
    last_visit_number?: string | null;
    last_doctor_room_no?: string | null;
    created_at?: Date | string | null;
};

type CountRow = {
    total: bigint | number;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text || null;
}

function normalizePhone(value: unknown) {
    const phone = normalizeOptionalText(value);
    return phone ? phone.replace(/\D/g, "") : null;
}

function toNumberId(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function parseAge(value: unknown) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const age = Number(value);
    return Number.isInteger(age) ? age : NaN;
}

function normalizeGender(value: unknown) {
    const gender = normalizeText(value).toUpperCase();
    return gender || null;
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number) {
    const parsed = Number(value || "");
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeDate(value: string | null) {
    const text = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function serializePatient(row: PatientRow) {
    return {
        patient_id: Number(row.patient_id),
        uhid: row.uhid,
        full_name: row.full_name,
        phone: row.phone,
        age: row.age,
        gender: row.gender,
        city: row.city,
        location: row.location,
        address: row.address,
        hospital_group_code: row.hospital_group_code,
        last_visit_date: row.last_visit_date
            ? typeof row.last_visit_date === "string"
                ? row.last_visit_date.slice(0, 10)
                : row.last_visit_date.toISOString().slice(0, 10)
            : null,
        last_visit_number: row.last_visit_number || null,
        last_doctor_room_no: row.last_doctor_room_no || null,
        created_at: row.created_at,
    };
}

async function requireReceptionSession(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) {
        return null;
    }

    if (!(await isHmsStaffType(session.hospitalContext, "REGISTRATION"))) {
        return null;
    }

    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireReceptionSession(req);
        if (!hospital) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const query = normalizeText(searchParams.get("q"));
        const exactUhid = normalizeText(searchParams.get("exact_uhid"));
        const rawAge = normalizeText(searchParams.get("age"));
        const gender = normalizeGender(searchParams.get("gender")) || "";
        const requestedVisitDate = normalizeDate(searchParams.get("visit_date"));
        const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100000);
        const pageSize = parsePositiveInt(searchParams.get("page_size"), 25, 10, 100);
        const offset = (page - 1) * pageSize;
        let age: number | null = null;

        if (rawAge) {
            const parsedAge = Number(rawAge);
            if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 150) {
                return NextResponse.json({ error: "Age filter must be a whole number from 0 to 150." }, { status: 400 });
            }
            age = parsedAge;
        }

        const effectiveQuery = exactUhid || query;
        const visitDate = effectiveQuery ? null : requestedVisitDate;
        const prefixQuery = `${effectiveQuery}%`;
        const containsQuery = `%${effectiveQuery}%`;
        const containsNameQuery = effectiveQuery.length >= 3 ? `%${effectiveQuery}%` : prefixQuery;
        const phoneQuery = `${effectiveQuery.replace(/\D/g, "")}%`;
        const dateFilterSql = visitDate
            ? `
              AND EXISTS (
                SELECT 1
                FROM visits pv
                WHERE pv.patient_id = patients.patient_id
                  AND pv.hospital_id = ?
                  AND pv.visit_date = ?
              )
            `
            : "";
        const searchFilterSql = `
              AND (
                ? = ''
                OR (? <> '' AND uhid = ?)
                OR (? = '' AND uhid LIKE ?)
                OR (? = '' AND full_name LIKE ?)
                OR (? = '' AND ? <> '' AND phone LIKE ?)
              )
              AND (? IS NULL OR age = ?)
              AND (? = '' OR UPPER(gender) = ?)
        `;
        const baseWhereValues = visitDate
            ? [hospital.adminId, hospital.hospitalCode, hospital.hospitalId, visitDate]
            : [hospital.adminId, hospital.hospitalCode];
        const searchValues = [
            effectiveQuery,
            exactUhid,
            exactUhid,
            exactUhid,
            containsQuery,
            exactUhid,
            containsNameQuery,
            exactUhid,
            phoneQuery,
            phoneQuery,
            age,
            age,
            gender,
            gender,
        ];

        const countRows = await prisma.$queryRawUnsafe<CountRow[]>(
            `
            SELECT COUNT(*) AS total
            FROM patients
            WHERE admin_id = ?
              AND hospital_group_code = ?
              ${dateFilterSql}
              ${searchFilterSql}
            `,
            ...baseWhereValues,
            ...searchValues
        );
        const total = Number(countRows[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const orderSql = visitDate
            ? `
            ORDER BY (
                SELECT MAX(v.created_at)
                FROM visits v
                WHERE v.patient_id = patients.patient_id
                  AND v.hospital_id = ?
                  AND v.visit_date = ?
            ) DESC, patient_id DESC
            `
            : "ORDER BY patient_id DESC";
        const orderValues = visitDate ? [hospital.hospitalId, visitDate] : [];

        const patients = await prisma.$queryRawUnsafe<PatientRow[]>(
            `
            SELECT
                patient_id,
                uhid,
                full_name,
                phone,
                age,
                gender,
                city,
                location,
                address,
                hospital_group_code,
                (
                    SELECT v.visit_date
                    FROM visits v
                    WHERE v.patient_id = patients.patient_id
                      AND v.hospital_id = ?
                    ORDER BY v.visit_date DESC, v.visit_id DESC
                    LIMIT 1
                ) AS last_visit_date,
                (
                    SELECT v.visit_number
                    FROM visits v
                    WHERE v.patient_id = patients.patient_id
                      AND v.hospital_id = ?
                    ORDER BY v.visit_date DESC, v.visit_id DESC
                    LIMIT 1
                ) AS last_visit_number,
                (
                    SELECT hd.room_no
                    FROM visits v
                    LEFT JOIN hospital_doctors hd
                      ON hd.hospital_id = v.hospital_id
                     AND hd.doctor_id = v.doctor_id
                    WHERE v.patient_id = patients.patient_id
                      AND v.hospital_id = ?
                    ORDER BY v.visit_date DESC, v.visit_id DESC
                    LIMIT 1
                ) AS last_doctor_room_no
            FROM patients
            WHERE admin_id = ?
              AND hospital_group_code = ?
              ${dateFilterSql}
              ${searchFilterSql}
            ${orderSql}
            LIMIT ? OFFSET ?
            `,
            hospital.hospitalId,
            hospital.hospitalId,
            hospital.hospitalId,
            ...baseWhereValues,
            ...searchValues,
            ...orderValues,
            pageSize,
            offset
        );

        return NextResponse.json({
            patients: patients.map(serializePatient),
            pagination: {
                page,
                page_size: pageSize,
                total,
                total_pages: totalPages,
            },
        });
    } catch (error) {
        console.error("Search HMS patients error:", error);
        return NextResponse.json({ error: "Unable to search patients." }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const hospital = await requireReceptionSession(req);
        if (!hospital) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }

        const body = await req.json();
        const patientId = toNumberId(Number(body?.patient_id));
        const fullName = normalizeText(body?.full_name);
        const phone = normalizePhone(body?.phone);
        const age = parseAge(body?.age);
        const gender = normalizeGender(body?.gender);
        const city = normalizeOptionalText(body?.city);
        const location = normalizeOptionalText(body?.location);
        const address = normalizeOptionalText(body?.address);

        const fieldErrors: Record<string, string> = {};
        if (!patientId) fieldErrors.patient_id = "Valid patient is required.";
        if (!fullName) fieldErrors.full_name = "Patient name is required.";
        if (fullName.length > 255) fieldErrors.full_name = "Patient name must be 255 characters or fewer.";
        if (Number.isNaN(age) || age === null || age < 0 || age > 150) {
            fieldErrors.age = "Age must be a whole number from 0 to 150.";
        }
        if (!gender) fieldErrors.gender = "Gender is required.";
        if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) {
            fieldErrors.gender = "Gender must be MALE, FEMALE, or OTHER.";
        }
        if (phone && !/^\d{10}$/.test(phone)) fieldErrors.phone = "Enter a 10 digit phone number.";
        if (city && city.length > 100) fieldErrors.city = "City must be 100 characters or fewer.";
        if (location && location.length > 255) fieldErrors.location = "Location must be 255 characters or fewer.";
        if (address && address.length > 500) fieldErrors.address = "Address must be 500 characters or fewer.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRawUnsafe<PatientRow[]>(
                `
                SELECT patient_id
                FROM patients
                WHERE patient_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                FOR UPDATE
                `,
                patientId,
                hospital.adminId,
                hospital.hospitalCode
            );

            if (!rows[0]) {
                return null;
            }

            await tx.$executeRawUnsafe(
                `
                UPDATE patients
                SET full_name = ?,
                    phone = ?,
                    age = ?,
                    gender = ?,
                    city = ?,
                    location = ?,
                    address = ?
                WHERE patient_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                `,
                fullName,
                phone,
                age,
                gender,
                city,
                location,
                address,
                patientId,
                hospital.adminId,
                hospital.hospitalCode
            );

            const patientRows = await tx.$queryRawUnsafe<PatientRow[]>(
                `
                SELECT
                    patient_id,
                    uhid,
                    full_name,
                    phone,
                    age,
                    gender,
                    city,
                    location,
                    address,
                    hospital_group_code
                FROM patients
                WHERE patient_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                `,
                patientId,
                hospital.adminId,
                hospital.hospitalCode
            );

            return patientRows[0] || null;
        });

        if (!updated) {
            return NextResponse.json({ error: "Patient does not belong to this hospital.", fieldErrors: { patient_id: "Patient does not belong to this hospital." } }, { status: 404 });
        }

        return NextResponse.json({ patient: serializePatient(updated) });
    } catch (error) {
        console.error("Update HMS patient error:", error);
        return NextResponse.json({ error: "Unable to update patient." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireReceptionSession(req);
        if (!hospital) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }

        const body = await req.json();
        const fullName = normalizeText(body?.full_name);
        const phone = normalizePhone(body?.phone);
        const age = parseAge(body?.age);
        const gender = normalizeGender(body?.gender);
        const city = normalizeOptionalText(body?.city);
        const location = normalizeOptionalText(body?.location);
        const address = normalizeOptionalText(body?.address);

        const fieldErrors: Record<string, string> = {};

        if (!fullName) fieldErrors.full_name = "Patient name is required.";
        if (fullName.length > 255) fieldErrors.full_name = "Patient name must be 255 characters or fewer.";
        if (Number.isNaN(age) || (age !== null && (age < 0 || age > 150))) {
            fieldErrors.age = "Age must be a whole number from 0 to 150.";
        }
        if (!gender) fieldErrors.gender = "Gender is required.";
        if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) {
            fieldErrors.gender = "Gender must be MALE, FEMALE, or OTHER.";
        }
        if (phone && !/^\d{10}$/.test(phone)) fieldErrors.phone = "Enter a 10 digit phone number.";
        if (city && city.length > 100) fieldErrors.city = "City must be 100 characters or fewer.";
        if (location && location.length > 255) fieldErrors.location = "Location must be 255 characters or fewer.";
        if (address && address.length > 500) fieldErrors.address = "Address must be 500 characters or fewer.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const created = await prisma.$transaction(async (tx) => {
            const policyRows = await tx.$queryRawUnsafe<PolicyRow[]>(
                `
                SELECT policies
                FROM hospital_policy_settings
                WHERE hospital_id = ?
                LIMIT 1
                `,
                hospital.hospitalId
            );
            const idFormat = extractIdFormatConfig(policyRows[0]?.policies);

            if (!idFormat) {
                throw new Error("Hospital ID format policy is not configured.");
            }

            const uhid = await resolveHmsId({
                db: tx,
                hospitalId: hospital.hospitalId,
                hospitalCode: hospital.hospitalCode,
                idFormat,
                formatKey: "uhid",
            });

            await tx.$executeRawUnsafe(
                `
                INSERT INTO patients (
                    uhid,
                    full_name,
                    admin_id,
                    doctor_id,
                    profile_type,
                    phone,
                    age,
                    gender,
                    city,
                    location,
                    address,
                    hospital_group_code
                )
                VALUES (?, ?, ?, NULL, 'SELF', ?, ?, ?, ?, ?, ?, ?)
                `,
                uhid,
                fullName,
                hospital.adminId,
                phone,
                age,
                gender,
                city,
                location,
                address,
                hospital.hospitalCode
            );

            const patientIdRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
            const patientId = toNumberId(patientIdRows[0]?.id);

            if (!patientId) {
                throw new Error("Patient row was not created.");
            }

            return {
                patient_id: patientId,
                uhid,
                full_name: fullName,
                phone,
                age,
                gender,
                city,
                location,
                address,
                hospital_group_code: hospital.hospitalCode,
            };
        });

        return NextResponse.json({ patient: serializePatient(created) }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to register patient.";
        console.error("Create HMS patient error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
