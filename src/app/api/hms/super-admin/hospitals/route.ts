export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { generateTemporaryPassword } from "@/lib/hms-passwords";
import { toHospitalSmsPayload } from "@/lib/hospitalSms";

type InsertIdRow = {
    id: bigint | number;
};

type ExistingHospitalRow = {
    hospital_id: number;
};

type ExistingUserRow = {
    user_id: number;
};

type HospitalListRow = {
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
    status: string;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    admin_user_id: number | null;
    admin_name: string | null;
    admin_email: string | null;
    policy_configured: bigint | number;
    feature_configured: bigint | number;
    doctor_count: bigint | number;
    staff_count: bigint | number;
    visit_count: bigint | number;
    sms_service_enabled: boolean | number | null;
    sms_service_status: string | null;
    sms_credit_total: bigint | number | null;
    sms_credit_used: bigint | number | null;
    current_pack_total: bigint | number | null;
    current_pack_used: bigint | number | null;
};

const DEFAULT_HOSPITAL_POLICIES = {
    registration_fee: 50,
    consultation_fee: 50,
    fee_waiver_allowed: true,
    free_payment: {
        enabled: true,
        require_waiver_reason: true,
    },
    free_reconsult_windows: [
        { scope: "referred_doctor", window_days: 0, count_visit_day: true },
        { scope: "same_doctor", window_days: 3, count_visit_day: false },
    ],
    reconsult_window_unit: "working_days",
    working_days: [0, 1, 2, 3, 4, 5, 6],
    capacity_surcharge: {
        enabled: true,
        surcharge_amount: 300,
    },
    doctor_token_enabled: false,
    default_capacity_count_categories: ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"],
    id_format: {
        uhid: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "UHID", pad_to: 6 },
        ],
        opd: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/OPD/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "OPD", pad_to: 6 },
        ],
        casualty: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/Cas/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "CASUALTY", pad_to: 6 },
        ],
        sequence_reset: {
            uhid: "never",
            opd: "never",
            casualty: "never",
        },
    },
    temp_token_reset: "daily",
    tv_rotation_seconds: 10,
    terminology: {
        visit_noun: "Registration",
        visit_noun_plural: "Registrations",
    },
};

const DEFAULT_HOSPITAL_FEATURE_FLAGS = {
    reception_module: true,
    lab_module: false,
    pharmacy_module: false,
    billing_module: true,
    casualty_module: false,
    qr_temp_token_enabled: true,
    referral_followup_waivers: true,
    capacity_surcharge: true,
    custom_terminology: true,
    emr_module: true,
    shared_paper_print_mode: true,
    tv_display_module: true,
    ads_module: true,
};

function normalizeHospitalCode(value: unknown) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function normalizeStatus(value: unknown) {
    const status = String(value || "ACTIVE").trim().toUpperCase();
    return status === "ACTIVE" || status === "INACTIVE" ? status : null;
}

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
    return normalizeText(value).toLowerCase();
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toNumberId(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function toNumber(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function serializeHospital(row: HospitalListRow) {
    return {
        hospital_id: Number(row.hospital_id),
        code: row.code,
        name: row.name,
        admin_id: Number(row.admin_id),
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        admin_user: row.admin_user_id
            ? {
                user_id: Number(row.admin_user_id),
                name: row.admin_name,
                email: row.admin_email,
            }
            : null,
        config: {
            policy_configured: toNumber(row.policy_configured) > 0,
            feature_configured: toNumber(row.feature_configured) > 0,
        },
        counts: {
            doctors: toNumber(row.doctor_count),
            staff: toNumber(row.staff_count),
            visits: toNumber(row.visit_count),
        },
        sms_service: toHospitalSmsPayload({
            sms_service_enabled: row.sms_service_enabled,
            sms_service_status: row.sms_service_status,
            sms_credit_total: row.sms_credit_total,
            sms_credit_used: row.sms_credit_used,
            current_pack_total: row.current_pack_total,
            current_pack_used: row.current_pack_used,
        }),
    };
}

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

export async function GET(req: Request) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can view HMS hospitals." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<HospitalListRow[]>(
            `
            SELECT
                h.hospital_id,
                h.code,
                h.name,
                h.admin_id,
                h.status,
                h.created_at,
                h.updated_at,
                u.user_id AS admin_user_id,
                u.name AS admin_name,
                u.email AS admin_email,
                COUNT(DISTINCT hps.id) AS policy_configured,
                COUNT(DISTINCT hff.id) AS feature_configured,
                COUNT(DISTINCT hd.doctor_id) AS doctor_count,
                COUNT(DISTINCT hs.staff_id) AS staff_count,
                COUNT(DISTINCT v.visit_id) AS visit_count,
                hss.sms_service_enabled,
                hss.sms_service_status,
                hss.sms_credit_total,
                hss.sms_credit_used,
                hss.current_pack_total,
                hss.current_pack_used
            FROM hospitals h
            INNER JOIN admins a
              ON a.admin_id = h.admin_id
            LEFT JOIN users u
              ON u.user_id = a.user_id
            LEFT JOIN hospital_policy_settings hps
              ON hps.hospital_id = h.hospital_id
            LEFT JOIN hospital_feature_flags hff
              ON hff.hospital_id = h.hospital_id
            LEFT JOIN hospital_doctors hd
              ON hd.hospital_id = h.hospital_id
            LEFT JOIN hospital_staff hs
              ON hs.hospital_id = h.hospital_id
            LEFT JOIN visits v
              ON v.hospital_id = h.hospital_id
            LEFT JOIN hospital_sms_service hss
              ON hss.hospital_id = h.hospital_id
            GROUP BY
                h.hospital_id,
                h.code,
                h.name,
                h.admin_id,
                h.status,
                h.created_at,
                h.updated_at,
                u.user_id,
                u.name,
                u.email,
                hss.sms_service_enabled,
                hss.sms_service_status,
                hss.sms_credit_total,
                hss.sms_credit_used,
                hss.current_pack_total,
                hss.current_pack_used
            ORDER BY h.created_at DESC, h.hospital_id DESC
            `
        );

        const hospitals = rows.map(serializeHospital);

        return NextResponse.json({
            hospitals,
            totals: {
                hospitals: hospitals.length,
                active: hospitals.filter((hospital) => hospital.status === "ACTIVE").length,
                inactive: hospitals.filter((hospital) => hospital.status !== "ACTIVE").length,
                admins: hospitals.filter((hospital) => hospital.admin_user).length,
            },
        });
    } catch (error) {
        console.error("List HMS hospitals error:", error);
        return NextResponse.json({ error: "Unable to load HMS hospitals." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can create HMS hospitals." }, { status: 403 });
        }

        const body = await req.json();
        const code = normalizeHospitalCode(body?.code);
        const name = normalizeText(body?.name);
        const status = normalizeStatus(body?.status);
        const adminName = normalizeText(body?.admin_name);
        const adminEmail = normalizeEmail(body?.admin_email);

        const fieldErrors: Record<string, string> = {};
        if (!code) fieldErrors.code = "Hospital code is required.";
        else if (!/^[A-Z0-9_-]{2,50}$/.test(code)) fieldErrors.code = "Hospital code must be 2-50 characters using only letters, numbers, underscore, or hyphen.";
        if (!name) fieldErrors.name = "Hospital name is required.";
        else if (name.length > 255) fieldErrors.name = "Hospital name must be 255 characters or fewer.";
        if (!status) fieldErrors.status = "Hospital status must be ACTIVE or INACTIVE.";
        if (!adminName) fieldErrors.admin_name = "Hospital Admin name is required.";
        else if (adminName.length > 255) fieldErrors.admin_name = "Hospital Admin name must be 255 characters or fewer.";
        if (!adminEmail) fieldErrors.admin_email = "Hospital Admin email is required.";
        else if (!isValidEmail(adminEmail)) fieldErrors.admin_email = "Enter a valid Hospital Admin email.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const existingHospitals = await prisma.$queryRaw<ExistingHospitalRow[]>`
            SELECT hospital_id
            FROM hospitals
            WHERE code = ${code}
            LIMIT 1
        `;

        if (existingHospitals.length > 0) {
            return NextResponse.json({ error: "A hospital with this code already exists.", fieldErrors: { code: "Hospital code is already in use." } }, { status: 409 });
        }

        const existingUsers = await prisma.$queryRawUnsafe<ExistingUserRow[]>(
            `
            SELECT user_id
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            adminEmail
        );

        if (existingUsers.length > 0) {
            return NextResponse.json({ error: "A user with this email already exists.", fieldErrors: { admin_email: "Email is already in use." } }, { status: 409 });
        }

        const tempPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const created = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                INSERT INTO users (
                    name,
                    email,
                    password,
                    role,
                    force_password_change,
                    password_reset_at,
                    password_reset_by
                )
                VALUES (?, ?, ?, 'ADMIN', TRUE, CURRENT_TIMESTAMP, ?)
                `,
                adminName,
                adminEmail,
                hashedPassword,
                session.userId
            );

            const userRows = await tx.$queryRaw<InsertIdRow[]>`
                SELECT LAST_INSERT_ID() AS id
            `;
            const adminUserId = toNumberId(userRows[0]?.id);

            if (!adminUserId) {
                throw new Error("Hospital Admin user was not created.");
            }

            await tx.$executeRawUnsafe(
                `
                INSERT INTO admins (user_id)
                VALUES (?)
                `,
                adminUserId
            );

            const adminRows = await tx.$queryRaw<InsertIdRow[]>`
                SELECT LAST_INSERT_ID() AS id
            `;
            const adminId = toNumberId(adminRows[0]?.id);

            if (!adminId) {
                throw new Error("Dedicated admin row was not created.");
            }

            await tx.$executeRaw`
                INSERT INTO hospitals (code, name, admin_id, status)
                VALUES (${code}, ${name}, ${adminId}, ${status})
            `;

            const hospitalRows = await tx.$queryRaw<InsertIdRow[]>`
                SELECT LAST_INSERT_ID() AS id
            `;
            const hospitalId = toNumberId(hospitalRows[0]?.id);

            if (!hospitalId) {
                throw new Error("Hospital row was not created.");
            }

            await tx.$executeRawUnsafe(
                `
                UPDATE users
                SET hospital_id = ?
                WHERE user_id = ?
                `,
                hospitalId,
                adminUserId
            );

            await tx.$executeRaw`
                INSERT INTO hospital_policy_settings (hospital_id, policies)
                VALUES (${hospitalId}, ${JSON.stringify(DEFAULT_HOSPITAL_POLICIES)})
            `;

            await tx.$executeRaw`
                INSERT INTO hospital_feature_flags (hospital_id, flags)
                VALUES (${hospitalId}, ${JSON.stringify(DEFAULT_HOSPITAL_FEATURE_FLAGS)})
            `;

            await tx.$executeRaw`
                INSERT INTO hospital_sms_service (hospital_id)
                VALUES (${hospitalId})
            `;

            return { adminId, hospitalId, adminUserId };
        });

        return NextResponse.json(
            {
                hospital: {
                    hospital_id: created.hospitalId,
                    code,
                    name,
                    admin_id: created.adminId,
                    status,
                    admin_user: {
                        user_id: created.adminUserId,
                        name: adminName,
                        email: adminEmail,
                    },
                },
                temporaryPassword: tempPassword,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create HMS hospital error:", error);
        return NextResponse.json({ error: "Unable to create HMS hospital. Please try again." }, { status: 500 });
    }
}
