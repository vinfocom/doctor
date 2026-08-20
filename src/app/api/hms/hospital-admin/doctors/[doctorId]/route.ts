export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const DEFAULT_CAPACITY_CATEGORIES = ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const FAR_FUTURE_DATE = "2099-12-31";
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type ScopeRow = {
    doctor_id: number;
    user_id: number | null;
};

type CountRow = {
    total_count: bigint | number;
};

type DoctorRow = {
    doctor_id: number;
    user_id: number | null;
    doctor_name: string | null;
    email: string | null;
    phone: string | null;
    specialization: string | null;
    registration_no: string | null;
    education: string | null;
    profile_pic_url: string | null;
    active_from: Date | string | null;
    active_to: Date | string | null;
    status: string | null;
    room_no: string | null;
    daily_capacity: number | null;
    capacity_count_categories: unknown;
    sit_days: string | null;
    clinic_count: bigint | number;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text || null;
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : text;
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCapacityCategories(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_CAPACITY_CATEGORIES];

    const normalized = value.map((item) => String(item || "").trim().toUpperCase());
    if (normalized.some((item) => !CAPACITY_CATEGORIES.includes(item as (typeof CAPACITY_CATEGORIES)[number]))) {
        return null;
    }

    return Array.from(new Set(normalized));
}

function normalizeSitDays(value: unknown) {
    if (!Array.isArray(value)) return null;
    const days = Array.from(new Set(value.map(Number)))
        .filter((day) => Number.isInteger(day) && WEEKDAYS.includes(day as (typeof WEEKDAYS)[number]))
        .sort((left, right) => left - right);
    return days.length > 0 ? days : null;
}

function toNumber(value: bigint | number | null | undefined) {
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

function parseJsonArray(value: unknown) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function serializeDoctor(row: DoctorRow) {
    const capacityCategories = parseJsonArray(row.capacity_count_categories);
    return {
        doctor_id: Number(row.doctor_id),
        user_id: row.user_id === null ? null : Number(row.user_id),
        doctor_name: row.doctor_name,
        email: row.email,
        phone: row.phone,
        specialization: row.specialization,
        registration_no: row.registration_no,
        education: row.education,
        profile_pic_url: row.profile_pic_url,
        active_from: dateOnly(row.active_from),
        active_to: dateOnly(row.active_to),
        status: row.status,
        room_no: row.room_no,
        daily_capacity: row.daily_capacity === null ? null : Number(row.daily_capacity),
        capacity_count_categories: capacityCategories || DEFAULT_CAPACITY_CATEGORIES,
        sit_days: row.sit_days
            ? row.sit_days.split(",").map(Number).filter((day) => Number.isInteger(day))
            : [],
        clinic_count: toNumber(row.clinic_count),
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

async function getDoctorScope(hospital: NonNullable<Awaited<ReturnType<typeof requireHospitalAdmin>>>, doctorId: number) {
    const rows = await prisma.$queryRawUnsafe<ScopeRow[]>(
        `
        SELECT d.doctor_id, d.user_id
        FROM hospital_doctors hd
        INNER JOIN doctors d
          ON d.doctor_id = hd.doctor_id
         AND d.admin_id = ?
        WHERE hd.hospital_id = ?
          AND hd.doctor_id = ?
        LIMIT 1
        `,
        hospital.adminId,
        hospital.hospitalId,
        doctorId
    );
    return rows[0] || null;
}

async function fetchDoctor(hospitalId: number, adminId: number, doctorId: number) {
    const rows = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT
            d.doctor_id,
            d.user_id,
            d.doctor_name,
            u.email,
            d.phone,
            d.specialization,
            d.registration_no,
            d.education,
            d.profile_pic_url,
            d.active_from,
            d.active_to,
            d.status,
            hd.room_no,
            dcs.daily_capacity,
            dcs.capacity_count_categories,
            (
                SELECT GROUP_CONCAT(DISTINCT sit_dcs.day_of_week ORDER BY sit_dcs.day_of_week)
                FROM doctor_clinic_schedule sit_dcs
                WHERE sit_dcs.doctor_id = d.doctor_id
                  AND sit_dcs.admin_id = ?
                  AND sit_dcs.clinic_id IS NULL
                  AND sit_dcs.scheduling_type = 'TOKEN_CAPACITY'
            ) AS sit_days,
            COUNT(DISTINCT c.clinic_id) AS clinic_count
        FROM hospital_doctors hd
        INNER JOIN doctors d
          ON d.doctor_id = hd.doctor_id
         AND d.admin_id = ?
        LEFT JOIN users u
          ON u.user_id = d.user_id
        LEFT JOIN clinics c
          ON c.doctor_id = d.doctor_id
        LEFT JOIN doctor_clinic_schedule dcs
          ON dcs.schedule_id = (
            SELECT latest_dcs.schedule_id
            FROM doctor_clinic_schedule latest_dcs
            WHERE latest_dcs.doctor_id = d.doctor_id
              AND latest_dcs.admin_id = ?
              AND latest_dcs.scheduling_type = 'TOKEN_CAPACITY'
            ORDER BY latest_dcs.effective_from DESC, latest_dcs.schedule_id DESC
            LIMIT 1
          )
        WHERE hd.hospital_id = ?
          AND hd.doctor_id = ?
        GROUP BY
            d.doctor_id,
            d.user_id,
            d.doctor_name,
            u.email,
            d.phone,
            d.specialization,
            d.registration_no,
            d.education,
            d.profile_pic_url,
            d.active_from,
            d.active_to,
            d.status,
            hd.room_no,
            dcs.daily_capacity,
            dcs.capacity_count_categories
        LIMIT 1
        `,
        adminId,
        adminId,
        adminId,
        hospitalId,
        doctorId
    );
    return rows[0] || null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ doctorId: string }> }) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });

        const { doctorId: doctorIdParam } = await params;
        const doctorId = Number(doctorIdParam);
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            return NextResponse.json({ error: "Doctor id must be valid." }, { status: 400 });
        }

        const scope = await getDoctorScope(hospital, doctorId);
        if (!scope) return NextResponse.json({ error: "Doctor was not found for this hospital." }, { status: 404 });

        const body = await req.json();
        const action = normalizeText(body?.action).toUpperCase();

        if (action === "ACTIVATE" || action === "DEACTIVATE") {
            const activeFrom = action === "ACTIVATE" ? normalizeDate(body?.active_from) || new Date().toISOString().slice(0, 10) : normalizeDate(body?.active_from);
            const activeTo = action === "ACTIVATE" ? normalizeDate(body?.active_to) || FAR_FUTURE_DATE : normalizeDate(body?.active_to);
            await prisma.$executeRawUnsafe(
                `
                UPDATE doctors
                SET status = ?,
                    active_from = COALESCE(?, active_from),
                    active_to = COALESCE(?, active_to)
                WHERE doctor_id = ?
                  AND admin_id = ?
                `,
                action === "ACTIVATE" ? "ACTIVE" : "INACTIVE",
                activeFrom,
                activeTo,
                doctorId,
                hospital.adminId
            );
            const updated = await fetchDoctor(hospital.hospitalId, hospital.adminId, doctorId);
            return NextResponse.json({ doctor: updated ? serializeDoctor(updated) : null }, { status: 200 });
        }

        const doctorName = normalizeText(body?.doctor_name);
        const email = normalizeText(body?.email).toLowerCase();
        const roomNo = normalizeText(body?.room_no);
        const dailyCapacity = parsePositiveInt(body?.daily_capacity);
        const capacityCountCategories = normalizeCapacityCategories(body?.capacity_count_categories);
        const sitDays = normalizeSitDays(body?.sit_days);
        const phone = normalizeOptionalText(body?.phone);
        const specialization = normalizeOptionalText(body?.specialization);
        const registrationNo = normalizeOptionalText(body?.registration_no);
        const education = normalizeOptionalText(body?.education);
        const profilePicUrl = normalizeOptionalText(body?.profile_pic_url);
        const activeFrom = normalizeDate(body?.active_from);
        const activeTo = normalizeDate(body?.active_to);
        const status = normalizeText(body?.status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

        const fieldErrors: Record<string, string> = {};
        if (!doctorName) fieldErrors.doctor_name = "Doctor name is required.";
        if (!email) fieldErrors.email = "Email is required.";
        else if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
        if (!roomNo) fieldErrors.room_no = "Room number is required.";
        if (!dailyCapacity) fieldErrors.daily_capacity = "Daily capacity must be a whole number above zero.";
        if (!capacityCountCategories) fieldErrors.capacity_count_categories = "Select valid capacity categories.";
        if (!sitDays) fieldErrors.sit_days = "Select at least one sitting day.";
        if (!specialization) fieldErrors.specialization = "Specialization is required.";
        if (!registrationNo) fieldErrors.registration_no = "Registration number is required.";
        if (!activeFrom) fieldErrors.active_from = "Active from date is required.";
        if (!activeTo) fieldErrors.active_to = "Active to date is required.";
        if (activeFrom && activeTo && activeFrom > activeTo) fieldErrors.active_to = "Active to must be on or after active from.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const duplicateUsers = await prisma.$queryRawUnsafe<ScopeRow[]>(
            `
            SELECT user_id, NULL AS doctor_id
            FROM users
            WHERE email = ?
              AND user_id <> ?
            LIMIT 1
            `,
            email,
            scope.user_id || 0
        );
        if (duplicateUsers[0]) {
            return NextResponse.json({ error: "A user with this email already exists.", fieldErrors: { email: "Email is already in use." } }, { status: 409 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                UPDATE doctors
                SET doctor_name = ?,
                    phone = ?,
                    specialization = ?,
                    registration_no = ?,
                    education = ?,
                    profile_pic_url = ?,
                    active_from = ?,
                    active_to = ?,
                    status = ?
                WHERE doctor_id = ?
                  AND admin_id = ?
                `,
                doctorName,
                phone,
                specialization,
                registrationNo,
                education,
                profilePicUrl,
                activeFrom,
                activeTo,
                status,
                doctorId,
                hospital.adminId
            );
            await tx.$executeRawUnsafe(
                `
                UPDATE hospital_doctors
                SET room_no = ?
                WHERE hospital_id = ?
                  AND doctor_id = ?
                `,
                roomNo,
                hospital.hospitalId,
                doctorId
            );
            await tx.$executeRawUnsafe(
                `
                DELETE FROM doctor_clinic_schedule
                WHERE doctor_id = ?
                  AND admin_id = ?
                  AND clinic_id IS NULL
                  AND scheduling_type = 'TOKEN_CAPACITY'
                `,
                doctorId,
                hospital.adminId
            );
            for (const day of sitDays || []) {
                await tx.$executeRawUnsafe(
                    `
                    INSERT INTO doctor_clinic_schedule (
                        doctor_id,
                        clinic_id,
                        admin_id,
                        start_time,
                        end_time,
                        slot_duration,
                        scheduling_type,
                        daily_capacity,
                        capacity_count_categories,
                        day_of_week,
                        effective_from,
                        effective_to
                    )
                    VALUES (?, NULL, ?, NULL, NULL, NULL, 'TOKEN_CAPACITY', ?, ?, ?, ?, ?)
                    `,
                    doctorId,
                    hospital.adminId,
                    dailyCapacity,
                    JSON.stringify(capacityCountCategories),
                    day,
                    activeFrom,
                    activeTo
                );
            }
            if (scope.user_id) {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE users
                    SET name = ?,
                        email = ?
                    WHERE user_id = ?
                      AND hospital_id IS NULL
                    `,
                    doctorName,
                    email,
                    scope.user_id
                );
            }
        });

        const updated = await fetchDoctor(hospital.hospitalId, hospital.adminId, doctorId);
        return NextResponse.json({ doctor: updated ? serializeDoctor(updated) : null }, { status: 200 });
    } catch (error) {
        console.error("Update HMS doctor error:", error);
        return NextResponse.json({ error: "Unable to update doctor." }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ doctorId: string }> }) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });

        const { doctorId: doctorIdParam } = await params;
        const doctorId = Number(doctorIdParam);
        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            return NextResponse.json({ error: "Doctor id must be valid." }, { status: 400 });
        }

        const scope = await getDoctorScope(hospital, doctorId);
        if (!scope) return NextResponse.json({ error: "Doctor was not found for this hospital." }, { status: 404 });

        const [visitRows, prescriptionRows] = await Promise.all([
            prisma.$queryRawUnsafe<CountRow[]>("SELECT COUNT(*) AS total_count FROM visits WHERE hospital_id = ? AND doctor_id = ?", hospital.hospitalId, doctorId),
            prisma.$queryRawUnsafe<CountRow[]>("SELECT COUNT(*) AS total_count FROM prescriptions WHERE doctor_id = ?", doctorId),
        ]);

        if (toNumber(visitRows[0]?.total_count) > 0 || toNumber(prescriptionRows[0]?.total_count) > 0) {
            return NextResponse.json({ error: "This doctor has visit or EMR records. Deactivate the account instead of deleting it." }, { status: 409 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe("DELETE FROM doctor_clinic_schedule WHERE doctor_id = ? AND admin_id = ? AND clinic_id IS NULL", doctorId, hospital.adminId);
            await tx.$executeRawUnsafe("DELETE FROM hospital_staff_doctor_access WHERE doctor_id = ?", doctorId);
            await tx.$executeRawUnsafe("DELETE FROM hospital_doctors WHERE hospital_id = ? AND doctor_id = ?", hospital.hospitalId, doctorId);
            await tx.$executeRawUnsafe("DELETE FROM doctors WHERE doctor_id = ? AND admin_id = ?", doctorId, hospital.adminId);
            if (scope.user_id) {
                await tx.$executeRawUnsafe("DELETE FROM users WHERE user_id = ?", scope.user_id);
            }
        });

        return NextResponse.json({ message: "Doctor deleted." }, { status: 200 });
    } catch (error) {
        console.error("Delete HMS doctor error:", error);
        return NextResponse.json({ error: "Unable to delete doctor." }, { status: 500 });
    }
}
