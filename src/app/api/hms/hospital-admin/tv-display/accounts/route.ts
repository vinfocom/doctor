export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { generateTemporaryPassword } from "@/lib/hms-passwords";

type InsertIdRow = { id: bigint | number };
type ExistingUserRow = { user_id: number };
type TvAccountRow = {
    staff_id: number;
    user_id: number;
    name: string | null;
    email: string | null;
    status: string | null;
    valid_from: Date | string | null;
    valid_to: Date | string | null;
    assigned_doctor_count: bigint | number;
    assigned_doctors_json: unknown;
};
type DoctorOptionRow = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    status: string | null;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalDate(value: unknown) {
    const text = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeDoctorIds(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)));
}

function toNumber(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseAssignedDoctors(value: unknown) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function serializeAccount(row: TvAccountRow) {
    return {
        staff_id: Number(row.staff_id),
        user_id: Number(row.user_id),
        name: row.name,
        email: row.email,
        status: row.status,
        valid_from: dateOnly(row.valid_from),
        valid_to: dateOnly(row.valid_to),
        assigned_doctor_count: toNumber(row.assigned_doctor_count),
        assigned_doctors: parseAssignedDoctors(row.assigned_doctors_json),
    };
}

function serializeDoctor(row: DoctorOptionRow) {
    return {
        doctor_id: Number(row.doctor_id),
        doctor_name: row.doctor_name,
        room_no: row.room_no,
        status: row.status,
    };
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    if (!(await isHmsFeatureEnabled(session.hospitalContext, "tv_display_module"))) return null;
    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin TV Display access is required." }, { status: 403 });
        }

        const [accounts, doctors] = await Promise.all([
            prisma.$queryRawUnsafe<TvAccountRow[]>(
                `
                SELECT
                    hs.staff_id,
                    u.user_id,
                    u.name,
                    u.email,
                    hs.status,
                    hs.valid_from,
                    hs.valid_to,
                    COUNT(hsda.doctor_id) AS assigned_doctor_count,
                    JSON_ARRAYAGG(
                        CASE
                            WHEN hsda.doctor_id IS NULL THEN NULL
                            ELSE JSON_OBJECT(
                                'doctor_id', d.doctor_id,
                                'doctor_name', d.doctor_name,
                                'room_no', hd.room_no,
                                'status', d.status
                            )
                        END
                    ) AS assigned_doctors_json
                FROM hospital_staff hs
                INNER JOIN users u
                  ON u.user_id = hs.user_id
                 AND u.hospital_id = ?
                LEFT JOIN hospital_staff_doctor_access hsda
                  ON hsda.staff_id = hs.staff_id
                LEFT JOIN doctors d
                  ON d.doctor_id = hsda.doctor_id
                 AND d.admin_id = ?
                LEFT JOIN hospital_doctors hd
                  ON hd.hospital_id = hs.hospital_id
                 AND hd.doctor_id = hsda.doctor_id
                WHERE hs.hospital_id = ?
                  AND hs.staff_type = 'TV_DISPLAY'
                GROUP BY hs.staff_id, u.user_id, u.name, u.email, hs.status, hs.valid_from, hs.valid_to
                ORDER BY u.name ASC, hs.staff_id ASC
                `,
                hospital.hospitalId,
                hospital.adminId,
                hospital.hospitalId
            ),
            prisma.$queryRawUnsafe<DoctorOptionRow[]>(
                `
                SELECT d.doctor_id, d.doctor_name, hd.room_no, d.status
                FROM hospital_doctors hd
                INNER JOIN doctors d
                  ON d.doctor_id = hd.doctor_id
                 AND d.admin_id = ?
                WHERE hd.hospital_id = ?
                ORDER BY d.doctor_name ASC, d.doctor_id ASC
                `,
                hospital.adminId,
                hospital.hospitalId
            ),
        ]);

        return NextResponse.json({
            accounts: accounts.map(serializeAccount),
            doctors: doctors.map(serializeDoctor),
        });
    } catch (error) {
        console.error("List HMS TV display accounts error:", error);
        return NextResponse.json({ error: "Unable to load TV display accounts." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin TV Display access is required." }, { status: 403 });
        }

        const body = await req.json();
        const name = normalizeText(body?.name);
        const email = normalizeText(body?.email).toLowerCase();
        const validFrom = normalizeOptionalDate(body?.valid_from);
        const validTo = normalizeOptionalDate(body?.valid_to);
        const doctorIds = normalizeDoctorIds(body?.doctor_ids);

        const fieldErrors: Record<string, string> = {};
        if (!name) fieldErrors.name = "Display account name is required.";
        if (!email) fieldErrors.email = "Email is required.";
        else if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
        if (!doctorIds.length) fieldErrors.doctor_ids = "Assign at least one doctor.";
        if (body?.valid_from && !validFrom) fieldErrors.valid_from = "Valid from must use YYYY-MM-DD format.";
        if (body?.valid_to && !validTo) fieldErrors.valid_to = "Valid to must use YYYY-MM-DD format.";
        if (validFrom && validTo && validFrom > validTo) fieldErrors.valid_to = "Valid to must be on or after valid from.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const existingUsers = await prisma.$queryRawUnsafe<ExistingUserRow[]>(
            "SELECT user_id FROM users WHERE email = ? LIMIT 1",
            email
        );
        if (existingUsers[0]) {
            return NextResponse.json({ error: "A user with this email already exists.", fieldErrors: { email: "Email is already in use." } }, { status: 409 });
        }

        const placeholders = doctorIds.map(() => "?").join(", ");
        const doctorRows = await prisma.$queryRawUnsafe<DoctorOptionRow[]>(
            `
            SELECT d.doctor_id, d.doctor_name, hd.room_no, d.status
            FROM hospital_doctors hd
            INNER JOIN doctors d
              ON d.doctor_id = hd.doctor_id
             AND d.admin_id = ?
            WHERE hd.hospital_id = ?
              AND hd.doctor_id IN (${placeholders})
            `,
            hospital.adminId,
            hospital.hospitalId,
            ...doctorIds
        );
        if (doctorRows.length !== doctorIds.length) {
            return NextResponse.json({ error: "One or more selected doctors do not belong to this hospital.", fieldErrors: { doctor_ids: "Select only doctors from this hospital." } }, { status: 400 });
        }

        const tempPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const account = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO users (name, email, password, role, hospital_id, force_password_change, password_reset_at, password_reset_by)
                VALUES (?, ?, ?, 'CLINIC_STAFF', ?, TRUE, CURRENT_TIMESTAMP, ?)
                `,
                name,
                email,
                hashedPassword,
                hospital.hospitalId,
                hospital.userId
            );
            const userRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
            const userId = toNumber(userRows[0]?.id);
            if (!userId) throw new Error("TV display user was not created.");

            await tx.$executeRawUnsafe(
                "INSERT INTO hospital_staff (hospital_id, user_id, staff_type, status, valid_from, valid_to) VALUES (?, ?, 'TV_DISPLAY', 'ACTIVE', ?, ?)",
                hospital.hospitalId,
                userId,
                validFrom,
                validTo
            );
            const staffRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
            const staffId = toNumber(staffRows[0]?.id);
            if (!staffId) throw new Error("TV display staff row was not created.");

            for (const doctorId of doctorIds) {
                await tx.$executeRawUnsafe("INSERT INTO hospital_staff_doctor_access (staff_id, doctor_id) VALUES (?, ?)", staffId, doctorId);
            }

            return { staffId, userId };
        });

        return NextResponse.json({
            account: {
                staff_id: account.staffId,
                user_id: account.userId,
                name,
                email,
                status: "ACTIVE",
                valid_from: validFrom,
                valid_to: validTo,
                assigned_doctor_count: doctorIds.length,
                assigned_doctors: doctorRows.map(serializeDoctor),
            },
            temporaryPassword: tempPassword,
        }, { status: 201 });
    } catch (error) {
        console.error("Create HMS TV display account error:", error);
        return NextResponse.json({ error: "Unable to create TV display account. Please try again." }, { status: 500 });
    }
}
