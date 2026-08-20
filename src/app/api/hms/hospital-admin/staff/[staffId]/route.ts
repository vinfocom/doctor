export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

const FAR_FUTURE_DATE = "2099-12-31";

type StaffScopeRow = {
    staff_id: number;
    user_id: number;
};

type DoctorOptionRow = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    status: string | null;
};

type StaffRow = {
    staff_id: number;
    user_id: number;
    name: string | null;
    email: string | null;
    staff_type: string;
    status: string | null;
    valid_from: Date | string | null;
    valid_to: Date | string | null;
    assigned_doctor_count: bigint | number;
    assigned_doctors_json: unknown;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeDate(value: unknown) {
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

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function serializeStaff(row: StaffRow) {
    return {
        staff_id: Number(row.staff_id),
        user_id: Number(row.user_id),
        name: row.name,
        email: row.email,
        staff_type: row.staff_type,
        status: row.status,
        valid_from: dateOnly(row.valid_from),
        valid_to: dateOnly(row.valid_to),
        assigned_doctor_count: toNumber(row.assigned_doctor_count),
        assigned_doctors: parseAssignedDoctors(row.assigned_doctors_json),
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

async function getStaffScope(hospitalId: number, staffId: number, staffType: string) {
    const rows = await prisma.$queryRawUnsafe<StaffScopeRow[]>(
        `
        SELECT staff_id, user_id
        FROM hospital_staff
        WHERE hospital_id = ?
          AND staff_id = ?
          AND staff_type = ?
        LIMIT 1
        `,
        hospitalId,
        staffId,
        staffType
    );
    return rows[0] || null;
}

async function fetchStaff(hospitalId: number, adminId: number, staffId: number, staffType: string) {
    const rows = await prisma.$queryRawUnsafe<StaffRow[]>(
        `
        SELECT
            hs.staff_id,
            u.user_id,
            u.name,
            u.email,
            hs.staff_type,
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
          AND hs.staff_id = ?
          AND hs.staff_type = ?
        GROUP BY hs.staff_id, u.user_id, u.name, u.email, hs.staff_type, hs.status, hs.valid_from, hs.valid_to
        LIMIT 1
        `,
        hospitalId,
        adminId,
        hospitalId,
        staffId,
        staffType
    );
    return rows[0] || null;
}

async function validateDoctorIds(hospitalId: number, adminId: number, doctorIds: number[]) {
    if (!doctorIds.length) return [];
    const placeholders = doctorIds.map(() => "?").join(", ");
    return prisma.$queryRawUnsafe<DoctorOptionRow[]>(
        `
        SELECT d.doctor_id, d.doctor_name, hd.room_no, d.status
        FROM hospital_doctors hd
        INNER JOIN doctors d
          ON d.doctor_id = hd.doctor_id
         AND d.admin_id = ?
        WHERE hd.hospital_id = ?
          AND hd.doctor_id IN (${placeholders})
        `,
        adminId,
        hospitalId,
        ...doctorIds
    );
}

async function updateStaff(req: Request, params: Promise<{ staffId: string }>, staffType: "REGISTRATION" | "TV_DISPLAY") {
    const hospital = await requireHospitalAdmin(req);
    if (!hospital) return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });

    const { staffId: staffIdParam } = await params;
    const staffId = Number(staffIdParam);
    if (!Number.isInteger(staffId) || staffId <= 0) {
        return NextResponse.json({ error: "Staff id must be valid." }, { status: 400 });
    }

    const scope = await getStaffScope(hospital.hospitalId, staffId, staffType);
    if (!scope) return NextResponse.json({ error: "Staff account was not found for this hospital." }, { status: 404 });

    const body = await req.json();
    const action = normalizeText(body?.action).toUpperCase();
    if (action === "ACTIVATE" || action === "DEACTIVATE") {
        const validFrom = action === "ACTIVATE" ? normalizeDate(body?.valid_from) || new Date().toISOString().slice(0, 10) : normalizeDate(body?.valid_from);
        const validTo = action === "ACTIVATE" ? normalizeDate(body?.valid_to) || FAR_FUTURE_DATE : normalizeDate(body?.valid_to);
        await prisma.$executeRawUnsafe(
            `
            UPDATE hospital_staff
            SET status = ?,
                valid_from = COALESCE(?, valid_from),
                valid_to = COALESCE(?, valid_to)
            WHERE hospital_id = ?
              AND staff_id = ?
              AND staff_type = ?
            `,
            action === "ACTIVATE" ? "ACTIVE" : "INACTIVE",
            validFrom,
            validTo,
            hospital.hospitalId,
            staffId,
            staffType
        );
        const updated = await fetchStaff(hospital.hospitalId, hospital.adminId, staffId, staffType);
        return NextResponse.json({ account: updated ? serializeStaff(updated) : null, staff: updated ? serializeStaff(updated) : null }, { status: 200 });
    }

    const name = normalizeText(body?.name);
    const email = normalizeText(body?.email).toLowerCase();
    const validFrom = normalizeDate(body?.valid_from);
    const validTo = normalizeDate(body?.valid_to);
    const doctorIds = normalizeDoctorIds(body?.doctor_ids);
    const status = normalizeText(body?.status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const fieldErrors: Record<string, string> = {};
    if (!name) fieldErrors.name = "Name is required.";
    if (!email) fieldErrors.email = "Email is required.";
    else if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
    if (!doctorIds.length) fieldErrors.doctor_ids = "Assign at least one doctor.";
    if (body?.valid_from && !validFrom) fieldErrors.valid_from = "Valid from must use YYYY-MM-DD format.";
    if (body?.valid_to && !validTo) fieldErrors.valid_to = "Valid to must use YYYY-MM-DD format.";
    if (validFrom && validTo && validFrom > validTo) fieldErrors.valid_to = "Valid to must be on or after valid from.";

    if (Object.keys(fieldErrors).length > 0) {
        return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
    }

    const duplicateUsers = await prisma.$queryRawUnsafe<StaffScopeRow[]>(
        `
        SELECT user_id, NULL AS staff_id
        FROM users
        WHERE email = ?
          AND user_id <> ?
        LIMIT 1
        `,
        email,
        scope.user_id
    );
    if (duplicateUsers[0]) {
        return NextResponse.json({ error: "A user with this email already exists.", fieldErrors: { email: "Email is already in use." } }, { status: 409 });
    }

    const doctorRows = await validateDoctorIds(hospital.hospitalId, hospital.adminId, doctorIds);
    if (doctorRows.length !== doctorIds.length) {
        return NextResponse.json({ error: "One or more selected doctors do not belong to this hospital.", fieldErrors: { doctor_ids: "Select only doctors from this hospital." } }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("UPDATE users SET name = ?, email = ? WHERE user_id = ? AND hospital_id = ?", name, email, scope.user_id, hospital.hospitalId);
        await tx.$executeRawUnsafe(
            "UPDATE hospital_staff SET status = ?, valid_from = ?, valid_to = ? WHERE hospital_id = ? AND staff_id = ? AND staff_type = ?",
            status,
            validFrom,
            validTo,
            hospital.hospitalId,
            staffId,
            staffType
        );
        await tx.$executeRawUnsafe("DELETE FROM hospital_staff_doctor_access WHERE staff_id = ?", staffId);
        for (const doctorId of doctorIds) {
            await tx.$executeRawUnsafe("INSERT INTO hospital_staff_doctor_access (staff_id, doctor_id) VALUES (?, ?)", staffId, doctorId);
        }
    });

    const updated = await fetchStaff(hospital.hospitalId, hospital.adminId, staffId, staffType);
    return NextResponse.json({ account: updated ? serializeStaff(updated) : null, staff: updated ? serializeStaff(updated) : null }, { status: 200 });
}

async function deleteStaff(req: Request, params: Promise<{ staffId: string }>, staffType: "REGISTRATION" | "TV_DISPLAY") {
    const hospital = await requireHospitalAdmin(req);
    if (!hospital) return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });

    const { staffId: staffIdParam } = await params;
    const staffId = Number(staffIdParam);
    if (!Number.isInteger(staffId) || staffId <= 0) {
        return NextResponse.json({ error: "Staff id must be valid." }, { status: 400 });
    }

    const scope = await getStaffScope(hospital.hospitalId, staffId, staffType);
    if (!scope) return NextResponse.json({ error: "Staff account was not found for this hospital." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("DELETE FROM hospital_staff_doctor_access WHERE staff_id = ?", staffId);
        await tx.$executeRawUnsafe("DELETE FROM hospital_staff WHERE hospital_id = ? AND staff_id = ? AND staff_type = ?", hospital.hospitalId, staffId, staffType);
        await tx.$executeRawUnsafe("DELETE FROM users WHERE user_id = ? AND hospital_id = ?", scope.user_id, hospital.hospitalId);
    });

    return NextResponse.json({ message: "Staff account deleted." }, { status: 200 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ staffId: string }> }) {
    try {
        return await updateStaff(req, params, "REGISTRATION");
    } catch (error) {
        console.error("Update HMS registration staff error:", error);
        return NextResponse.json({ error: "Unable to update staff account." }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ staffId: string }> }) {
    try {
        return await deleteStaff(req, params, "REGISTRATION");
    } catch (error) {
        console.error("Delete HMS registration staff error:", error);
        return NextResponse.json({ error: "Unable to delete staff account." }, { status: 500 });
    }
}
