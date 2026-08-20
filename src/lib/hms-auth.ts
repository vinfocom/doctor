import { cookies } from "next/headers";
import { verifyToken, type JWTPayload } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export type HospitalContext = NonNullable<JWTPayload["hospitalContext"]>;
export type HmsStaffType = "REGISTRATION" | "TV_DISPLAY";

export type HmsSession = JWTPayload & {
    hospitalContext: HospitalContext;
};

type HmsStaffRow = {
    staff_id: number;
    staff_type: string;
    status: string | null;
    valid_from: Date | string | null;
    valid_to: Date | string | null;
};

type HmsSessionOptions = {
    allowPasswordChange?: boolean;
};

export async function getHmsSession(options: HmsSessionOptions = {}): Promise<HmsSession | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("hms_token")?.value;

    if (!token) return null;

    const session = verifyToken(token);
    if (!session?.hospitalContext) return null;
    if (session.forcePasswordChange && !options.allowPasswordChange) return null;

    return session as HmsSession;
}

export async function getHmsSessionFromRequest(req: Request, options: HmsSessionOptions = {}): Promise<HmsSession | null> {
    const cookieStore = await cookies();
    let token = cookieStore.get("hms_token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) return null;

    const session = verifyToken(token);
    if (!session?.hospitalContext) return null;
    if (session.forcePasswordChange && !options.allowPasswordChange) return null;

    return session as HmsSession;
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

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

function isStaffAccessActive(staff: HmsStaffRow) {
    if (String(staff.status || "").toUpperCase() !== "ACTIVE") {
        return false;
    }

    const today = getTodayDateInIst();
    const validFrom = dateOnly(staff.valid_from);
    const validTo = dateOnly(staff.valid_to);

    if (validFrom && validFrom > today) return false;
    if (validTo && validTo < today) return false;

    return true;
}

export async function getHmsStaffProfile(context: HospitalContext) {
    if (context.role !== "HOSPITAL_STAFF") return null;

    const rows = await prisma.$queryRawUnsafe<HmsStaffRow[]>(
        `
        SELECT staff_id, staff_type, status, valid_from, valid_to
        FROM hospital_staff
        WHERE hospital_id = ?
          AND user_id = ?
        LIMIT 1
        `,
        context.hospitalId,
        context.userId
    );
    const staff = rows[0];

    if (!staff || !isStaffAccessActive(staff)) {
        return null;
    }

    const staffType = String(staff.staff_type || "").toUpperCase();
    if (staffType !== "REGISTRATION" && staffType !== "TV_DISPLAY") {
        return null;
    }

    return {
        staffId: Number(staff.staff_id),
        staffType: staffType as HmsStaffType,
    };
}

export async function isHmsStaffType(context: HospitalContext, staffType: HmsStaffType) {
    const staff = await getHmsStaffProfile(context);
    return staff?.staffType === staffType;
}

export async function getHmsStaffAssignedDoctorIds(context: HospitalContext, staffId: number) {
    if (context.role !== "HOSPITAL_STAFF") return [];

    const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number }>>(
        `
        SELECT hsda.doctor_id
        FROM hospital_staff_doctor_access hsda
        INNER JOIN hospital_staff hs
          ON hs.staff_id = hsda.staff_id
         AND hs.hospital_id = ?
        INNER JOIN hospital_doctors hd
          ON hd.hospital_id = hs.hospital_id
         AND hd.doctor_id = hsda.doctor_id
        INNER JOIN doctors d
          ON d.doctor_id = hsda.doctor_id
         AND d.admin_id = ?
        WHERE hsda.staff_id = ?
        ORDER BY d.doctor_name ASC, d.doctor_id ASC
        `,
        context.hospitalId,
        context.adminId,
        staffId
    );

    return rows.map((row) => Number(row.doctor_id));
}
