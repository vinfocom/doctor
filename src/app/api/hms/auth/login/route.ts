export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { generateToken } from "@/lib/jwt";

type HmsSessionRole = "HOSPITAL_ADMIN" | "HOSPITAL_STAFF" | "DOCTOR";

type HospitalContext = {
    hospitalId: number;
    hospitalCode: string;
    hospitalName: string;
    adminId: number;
    userId: number;
    role: HmsSessionRole;
};

type HmsUserRow = {
    user_id: number;
    name: string | null;
    email: string | null;
    password: string | null;
    role: string;
    hospital_id: number | null;
    force_password_change: boolean | number | null;
};

type HospitalByIdRow = {
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
    status: string;
};

type DoctorHospitalRow = {
    doctor_id: number;
    status: string | null;
    active_from: Date | string | null;
    active_to: Date | string | null;
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
    hospital_status: string;
};

type StaffAccessRow = {
    staff_id: number;
    status: string | null;
    valid_from: Date | string | null;
    valid_to: Date | string | null;
};

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    return new Date(value).toISOString().slice(0, 10);
}

function validateActiveWindow(input: {
    status?: string | null;
    activeFrom?: Date | string | null;
    activeTo?: Date | string | null;
    inactiveMessage: string;
}) {
    if (String(input.status || "").toUpperCase() === "INACTIVE") {
        return input.inactiveMessage;
    }

    const today = new Date().toISOString().slice(0, 10);
    const activeFrom = dateOnly(input.activeFrom);
    const activeTo = dateOnly(input.activeTo);

    if (activeFrom && activeFrom > today) {
        return "Your hospital access has not started yet.";
    }

    if (activeTo && activeTo < today) {
        return "Your hospital access has expired.";
    }

    return null;
}

function toHospitalContext(row: HospitalByIdRow | DoctorHospitalRow, userId: number, role: HmsSessionRole): HospitalContext {
    return {
        hospitalId: Number(row.hospital_id),
        hospitalCode: row.code,
        hospitalName: row.name,
        adminId: Number(row.admin_id),
        userId,
        role,
    };
}

async function resolveHospitalAdminOrStaffContext(user: HmsUserRow, role: Exclude<HmsSessionRole, "DOCTOR">) {
    if (!user.hospital_id) {
        return null;
    }

    const hospitals = await prisma.$queryRaw<HospitalByIdRow[]>`
        SELECT hospital_id, code, name, admin_id, status
        FROM hospitals
        WHERE hospital_id = ${user.hospital_id}
        LIMIT 1
    `;
    const hospital = hospitals[0];

    if (!hospital || String(hospital.status || "").toUpperCase() !== "ACTIVE") {
        return null;
    }

    if (role === "HOSPITAL_STAFF") {
        const staffRows = await prisma.$queryRaw<StaffAccessRow[]>`
            SELECT staff_id, status, valid_from, valid_to
            FROM hospital_staff
            WHERE hospital_id = ${hospital.hospital_id}
              AND user_id = ${user.user_id}
            LIMIT 1
        `;
        const staff = staffRows[0];
        if (!staff) {
            return { error: "This staff account is not linked to HMS staff access." };
        }

        const blockReason = validateActiveWindow({
            status: staff.status,
            activeFrom: staff.valid_from,
            activeTo: staff.valid_to,
            inactiveMessage: "Your HMS staff account is inactive. Please contact the hospital administrator.",
        });

        if (blockReason) {
            return { error: blockReason };
        }
    }

    return { context: toHospitalContext(hospital, user.user_id, role) };
}

async function resolveDoctorHospitalContext(user: HmsUserRow) {
    const rows = await prisma.$queryRaw<DoctorHospitalRow[]>`
        SELECT
            d.doctor_id,
            d.status,
            d.active_from,
            d.active_to,
            h.hospital_id,
            h.code,
            h.name,
            h.admin_id,
            h.status AS hospital_status
        FROM doctors d
        INNER JOIN hospitals h ON h.admin_id = d.admin_id
        WHERE d.user_id = ${user.user_id}
        LIMIT 1
    `;
    const doctorHospital = rows[0];

    if (!doctorHospital || String(doctorHospital.hospital_status || "").toUpperCase() !== "ACTIVE") {
        return null;
    }

    const blockReason = validateActiveWindow({
        status: doctorHospital.status,
        activeFrom: doctorHospital.active_from,
        activeTo: doctorHospital.active_to,
        inactiveMessage: "Your HMS doctor account is inactive. Please contact the hospital administrator.",
    });

    if (blockReason) {
        return { error: blockReason };
    }

    return { context: toHospitalContext(doctorHospital, user.user_id, "DOCTOR") };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const email = String(body?.email || "").trim();
        const password = String(body?.password || "");

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
        }

        const users = await prisma.$queryRaw<HmsUserRow[]>`
            SELECT user_id, name, email, password, role, hospital_id, force_password_change
            FROM users
            WHERE email = ${email}
            LIMIT 1
        `;
        const user = users[0];

        if (!user?.password) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        let hospitalContext: HospitalContext | null = null;

        if (user.role === "ADMIN") {
            const resolved = await resolveHospitalAdminOrStaffContext(user, "HOSPITAL_ADMIN");
            if (resolved?.error) {
                return NextResponse.json({ error: resolved.error }, { status: 403 });
            }
            hospitalContext = resolved?.context || null;
        } else if (user.role === "CLINIC_STAFF") {
            const resolved = await resolveHospitalAdminOrStaffContext(user, "HOSPITAL_STAFF");
            if (resolved?.error) {
                return NextResponse.json({ error: resolved.error }, { status: 403 });
            }
            hospitalContext = resolved?.context || null;
        } else if (user.role === "DOCTOR") {
            const resolved = await resolveDoctorHospitalContext(user);
            if (resolved?.error) {
                return NextResponse.json({ error: resolved.error }, { status: 403 });
            }
            hospitalContext = resolved?.context || null;
        }

        if (!hospitalContext) {
            return NextResponse.json({ error: "This account is not linked to an active HMS hospital." }, { status: 403 });
        }

        const token = generateToken({
            userId: user.user_id,
            email: user.email || undefined,
            role: hospitalContext.role,
            hospitalContext,
            forcePasswordChange: Boolean(user.force_password_change),
        });

        const response = NextResponse.json({
            message: "Login successful",
            user: {
                id: user.user_id,
                email: user.email,
                name: user.name,
                role: hospitalContext.role,
                hospitalContext,
                forcePasswordChange: Boolean(user.force_password_change),
            },
            token,
            forcePasswordChange: Boolean(user.force_password_change),
        });

        response.cookies.set("hms_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("HMS login error:", error);
        return NextResponse.json({ error: "Unable to log in. Please try again." }, { status: 500 });
    }
}
