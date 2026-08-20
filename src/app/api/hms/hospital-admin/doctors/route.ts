export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { generateTemporaryPassword } from "@/lib/hms-passwords";

type InsertIdRow = {
    id: bigint | number;
};

type ExistingUserRow = {
    user_id: number;
};

type HmsDoctorRow = {
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

const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const DEFAULT_CAPACITY_CATEGORIES = ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text || null;
}

function toNumberId(value: bigint | number | undefined) {
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

function serializeDoctor(row: HmsDoctorRow) {
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
        daily_capacity: row.daily_capacity,
        capacity_count_categories: capacityCategories || DEFAULT_CAPACITY_CATEGORIES,
        sit_days: row.sit_days
            ? row.sit_days.split(",").map(Number).filter((day) => Number.isInteger(day))
            : [],
        clinic_count: Number(row.clinic_count || 0),
    };
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

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : text;
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const doctors = await prisma.$queryRaw<HmsDoctorRow[]>`
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
                      AND sit_dcs.admin_id = ${hospital.adminId}
                      AND sit_dcs.clinic_id IS NULL
                      AND sit_dcs.scheduling_type = 'TOKEN_CAPACITY'
                ) AS sit_days,
                COUNT(DISTINCT c.clinic_id) AS clinic_count
            FROM hospital_doctors hd
            INNER JOIN doctors d ON d.doctor_id = hd.doctor_id
            LEFT JOIN users u ON u.user_id = d.user_id
            LEFT JOIN clinics c ON c.doctor_id = d.doctor_id
            LEFT JOIN doctor_clinic_schedule dcs
              ON dcs.schedule_id = (
                SELECT latest_dcs.schedule_id
                FROM doctor_clinic_schedule latest_dcs
                WHERE latest_dcs.doctor_id = d.doctor_id
                  AND latest_dcs.admin_id = ${hospital.adminId}
                  AND latest_dcs.scheduling_type = 'TOKEN_CAPACITY'
                ORDER BY latest_dcs.effective_from DESC, latest_dcs.schedule_id DESC
                LIMIT 1
              )
            WHERE hd.hospital_id = ${hospital.hospitalId}
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
            ORDER BY d.doctor_name ASC, d.doctor_id ASC
        `;

        return NextResponse.json({ doctors: doctors.map(serializeDoctor) });
    } catch (error) {
        console.error("List HMS doctors error:", error);
        return NextResponse.json({ error: "Unable to load doctors." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
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

        const fieldErrors: Record<string, string> = {};

        if (!doctorName) fieldErrors.doctor_name = "Doctor name is required.";
        if (doctorName.length > 255) fieldErrors.doctor_name = "Doctor name must be 255 characters or fewer.";
        if (!email) fieldErrors.email = "Email is required.";
        else if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
        if (!roomNo) fieldErrors.room_no = "Room number is required.";
        if (roomNo.length > 50) fieldErrors.room_no = "Room number must be 50 characters or fewer.";
        if (!dailyCapacity) fieldErrors.daily_capacity = "Daily capacity must be a whole number above zero.";
        if (!capacityCountCategories) fieldErrors.capacity_count_categories = "Select valid capacity categories.";
        if (!sitDays) fieldErrors.sit_days = "Select at least one sitting day.";
        if (!specialization) fieldErrors.specialization = "Specialization is required.";
        if (!registrationNo) fieldErrors.registration_no = "Registration number is required.";
        if (!activeFrom) fieldErrors.active_from = "Active from date is required.";
        if (!activeTo) fieldErrors.active_to = "Active to date is required.";
        if (activeFrom && activeTo && activeFrom > activeTo) fieldErrors.active_to = "Active to must be on or after active from.";
        if (phone && phone.length > 255) fieldErrors.phone = "Phone must be 255 characters or fewer.";
        if (specialization && specialization.length > 255) fieldErrors.specialization = "Specialization must be 255 characters or fewer.";
        if (registrationNo && registrationNo.length > 255) fieldErrors.registration_no = "Registration number must be 255 characters or fewer.";
        if (education && education.length > 500) fieldErrors.education = "Education must be 500 characters or fewer.";
        if (profilePicUrl && profilePicUrl.length > 500) fieldErrors.profile_pic_url = "Profile picture URL must be 500 characters or fewer.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const existingUsers = await prisma.$queryRaw<ExistingUserRow[]>`
            SELECT user_id
            FROM users
            WHERE email = ${email}
            LIMIT 1
        `;

        if (existingUsers.length > 0) {
            return NextResponse.json(
                { error: "A user with this email already exists.", fieldErrors: { email: "Email is already in use." } },
                { status: 409 }
            );
        }

        const tempPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const created = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`
                INSERT INTO users (name, email, password, role, force_password_change, password_reset_at, password_reset_by)
                VALUES (${doctorName}, ${email}, ${hashedPassword}, 'DOCTOR', TRUE, CURRENT_TIMESTAMP, ${hospital.userId})
            `;

            const userRows = await tx.$queryRaw<InsertIdRow[]>`
                SELECT LAST_INSERT_ID() AS id
            `;
            const userId = toNumberId(userRows[0]?.id);

            if (!userId) {
                throw new Error("Doctor user was not created.");
            }

            await tx.$executeRaw`
                INSERT INTO doctors (
                    doctor_name,
                    phone,
                    specialization,
                    registration_no,
                    education,
                    profile_pic_url,
                    active_from,
                    active_to,
                    status,
                    admin_id,
                    user_id,
                    num_clinics
                )
                VALUES (
                    ${doctorName},
                    ${phone},
                    ${specialization},
                    ${registrationNo},
                    ${education},
                    ${profilePicUrl},
                    ${activeFrom},
                    ${activeTo},
                    'ACTIVE',
                    ${hospital.adminId},
                    ${userId},
                    0
                )
            `;

            const doctorRows = await tx.$queryRaw<InsertIdRow[]>`
                SELECT LAST_INSERT_ID() AS id
            `;
            const doctorId = toNumberId(doctorRows[0]?.id);

            if (!doctorId) {
                throw new Error("Doctor row was not created.");
            }

            await tx.$executeRaw`
                INSERT INTO hospital_doctors (hospital_id, doctor_id, room_no)
                VALUES (${hospital.hospitalId}, ${doctorId}, ${roomNo})
            `;

            for (const day of sitDays || []) {
                await tx.$executeRaw`
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
                    VALUES (
                        ${doctorId},
                        NULL,
                        ${hospital.adminId},
                        NULL,
                        NULL,
                        NULL,
                        'TOKEN_CAPACITY',
                        ${dailyCapacity},
                        ${JSON.stringify(capacityCountCategories || DEFAULT_CAPACITY_CATEGORIES)},
                        ${day},
                        ${activeFrom},
                        ${activeTo}
                    )
                `;
            }

            return { userId, doctorId };
        });

        return NextResponse.json(
            {
                doctor: {
                    doctor_id: created.doctorId,
                    user_id: created.userId,
                    doctor_name: doctorName,
                    email,
                    phone,
                    specialization,
                    registration_no: registrationNo,
                    education,
                    profile_pic_url: profilePicUrl,
                    active_from: activeFrom,
                    active_to: activeTo,
                    status: "ACTIVE",
                    room_no: roomNo,
                    daily_capacity: dailyCapacity,
                    capacity_count_categories: capacityCountCategories,
                    sit_days: sitDays,
                    clinic_count: 0,
                },
                temporaryPassword: tempPassword,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create HMS doctor error:", error);
        return NextResponse.json({ error: "Unable to create doctor. Please try again." }, { status: 500 });
    }
}
