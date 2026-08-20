export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

type LeaveRow = {
    leave_id: number;
    doctor_id: number;
    doctor_name: string | null;
    leave_date: Date | string;
    reason: string | null;
};

type DoctorScopeRow = {
    doctor_id: number;
};

type ExistingLeaveRow = {
    leave_id: number;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return Number.isNaN(new Date(`${text}T00:00:00+05:30`).getTime()) ? null : text;
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateOnly(value: Date | string) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function serializeLeave(row: LeaveRow) {
    return {
        leave_id: Number(row.leave_id),
        doctor_id: Number(row.doctor_id),
        doctor_name: row.doctor_name,
        leave_date: dateOnly(row.leave_date),
        reason: row.reason,
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

async function isHospitalDoctor(hospitalId: number, adminId: number, doctorId: number) {
    const rows = await prisma.$queryRawUnsafe<DoctorScopeRow[]>(
        `
        SELECT d.doctor_id
        FROM hospital_doctors hd
        INNER JOIN doctors d
          ON d.doctor_id = hd.doctor_id
         AND d.admin_id = ?
        WHERE hd.hospital_id = ?
          AND hd.doctor_id = ?
        LIMIT 1
        `,
        adminId,
        hospitalId,
        doctorId
    );
    return Boolean(rows[0]);
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<LeaveRow[]>(
            `
            SELECT
                dl.leave_id,
                dl.doctor_id,
                d.doctor_name,
                dl.leave_date,
                dl.reason
            FROM doctor_leaves dl
            INNER JOIN hospital_doctors hd
              ON hd.doctor_id = dl.doctor_id
             AND hd.hospital_id = ?
            INNER JOIN doctors d
              ON d.doctor_id = dl.doctor_id
             AND d.admin_id = ?
            WHERE dl.admin_id = ?
              AND dl.start_time IS NULL
              AND dl.end_time IS NULL
            ORDER BY dl.leave_date DESC, d.doctor_name ASC, dl.leave_id DESC
            LIMIT 300
            `,
            hospital.hospitalId,
            hospital.adminId,
            hospital.adminId
        );

        return NextResponse.json({ leaves: rows.map(serializeLeave) });
    } catch (error) {
        console.error("Load HMS doctor leaves error:", error);
        return NextResponse.json({ error: "Unable to load doctor leaves." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
        const doctorId = parsePositiveInt(body?.doctor_id);
        const leaveDate = normalizeDate(body?.leave_date);
        const reason = normalizeText(body?.reason) || null;
        const fieldErrors: Record<string, string> = {};

        if (!doctorId) fieldErrors.doctor_id = "Select a doctor.";
        if (!leaveDate) fieldErrors.leave_date = "Leave date is required.";
        if (reason && reason.length > 255) fieldErrors.reason = "Reason must be 255 characters or fewer.";

        if (doctorId && !(await isHospitalDoctor(hospital.hospitalId, hospital.adminId, doctorId))) {
            fieldErrors.doctor_id = "Select a doctor from this hospital.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const existingRows = await prisma.$queryRawUnsafe<ExistingLeaveRow[]>(
            `
            SELECT leave_id
            FROM doctor_leaves
            WHERE doctor_id = ?
              AND admin_id = ?
              AND leave_date = ?
              AND start_time IS NULL
              AND end_time IS NULL
            ORDER BY leave_id ASC
            LIMIT 1
            `,
            doctorId,
            hospital.adminId,
            leaveDate
        );

        if (existingRows[0]) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE doctor_leaves
                SET reason = ?
                WHERE leave_id = ?
                  AND admin_id = ?
                `,
                reason,
                existingRows[0].leave_id,
                hospital.adminId
            );
        } else {
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO doctor_leaves (doctor_id, admin_id, leave_date, start_time, end_time, reason)
                VALUES (?, ?, ?, NULL, NULL, ?)
                `,
                doctorId,
                hospital.adminId,
                leaveDate,
                reason
            );
        }

        const rows = await prisma.$queryRawUnsafe<LeaveRow[]>(
            `
            SELECT
                dl.leave_id,
                dl.doctor_id,
                d.doctor_name,
                dl.leave_date,
                dl.reason
            FROM doctor_leaves dl
            INNER JOIN doctors d
              ON d.doctor_id = dl.doctor_id
             AND d.admin_id = ?
            WHERE dl.doctor_id = ?
              AND dl.admin_id = ?
              AND dl.leave_date = ?
              AND dl.start_time IS NULL
              AND dl.end_time IS NULL
            ORDER BY dl.leave_id ASC
            LIMIT 1
            `,
            hospital.adminId,
            doctorId,
            hospital.adminId,
            leaveDate
        );

        return NextResponse.json({ leave: rows[0] ? serializeLeave(rows[0]) : null }, { status: 201 });
    } catch (error) {
        console.error("Save HMS doctor leave error:", error);
        return NextResponse.json({ error: "Unable to save doctor leave." }, { status: 500 });
    }
}
