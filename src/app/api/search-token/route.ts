export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { Prisma } from "@/generated/prisma/client";
import {
    getClinicStaffAccessBlockReason,
    resolveEffectiveAssignedDoctorIds,
} from "@/lib/clinicStaffAccess";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function getTodayPartsInIst() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "0000";
    const month = parts.find((part) => part.type === "month")?.value || "00";
    const day = parts.find((part) => part.type === "day")?.value || "00";

    return { year, month, day };
}

function buildDateSearchVariants(input: string) {
    const trimmed = String(input || "").trim();
    if (!trimmed) return [];

    const variants = new Set<string>();
    const normalized = trimmed.replace(/\s+/g, "");
    const digitOnly = normalized.replace(/\D/g, "");

    const pushYmd = (yyyy: string, mm: string, dd: string) => {
        if (yyyy.length !== 4 || mm.length !== 2 || dd.length !== 2) return;
        variants.add(`${yyyy}/${mm}/${dd}`);
        variants.add(`${dd}/${mm}/${yyyy}`);
        variants.add(`${dd}-${mm}-${yyyy}`);
        variants.add(`${yyyy}-${mm}-${dd}`);
    };

    const ymdMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymdMatch) {
        pushYmd(
            ymdMatch[1],
            ymdMatch[2].padStart(2, "0"),
            ymdMatch[3].padStart(2, "0")
        );
    }

    const dmyMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        pushYmd(
            dmyMatch[3],
            dmyMatch[2].padStart(2, "0"),
            dmyMatch[1].padStart(2, "0")
        );
    }

    if (digitOnly.length === 8) {
        const maybeYear = digitOnly.slice(0, 4);
        const maybeMonth = digitOnly.slice(4, 6);
        const maybeDay = digitOnly.slice(6, 8);
        pushYmd(maybeYear, maybeMonth, maybeDay);
    }

    return Array.from(variants);
}

function formatDateInput(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function formatTimeInput(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") {
        if (value.includes("T")) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
            }
        }
        return value.slice(0, 5);
    }

    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

async function getNahStaffScope(req: Request) {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "CLINIC_STAFF") {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const staff = await prisma.clinic_staff.findUnique({
        where: { user_id: session.userId },
        select: {
            staff_id: true,
            doctor_id: true,
            clinic_id: true,
            status: true,
            valid_from: true,
            valid_to: true,
            clinics: {
                select: {
                    hospital_group_code: true,
                },
            },
            doctors: {
                select: {
                    admin_id: true,
                },
            },
            doctor_access: {
                select: {
                    doctor_id: true,
                },
            },
        },
    });

    if (!staff?.doctors?.admin_id) {
        return { error: NextResponse.json({ error: "Staff profile not found" }, { status: 404 }) };
    }

    const blockReason = getClinicStaffAccessBlockReason(staff);
    if (blockReason) {
        return { error: NextResponse.json({ error: blockReason }, { status: 403 }) };
    }

    const hospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim().toUpperCase();
    if (hospitalGroupCode !== "NAH") {
        return { error: NextResponse.json({ error: "Unauthorized for this hospital group" }, { status: 403 }) };
    }

    const assignedDoctorIds = await resolveEffectiveAssignedDoctorIds(prisma, staff);

    return {
        scope: {
            adminId: Number(staff.doctors.admin_id),
            assignedDoctorIds,
            hospitalGroupCode,
        },
    };
}

export async function GET(req: Request) {
    try {
        const scopeResult = await getNahStaffScope(req);
        if ("error" in scopeResult) {
            return scopeResult.error;
        }

        const { adminId, assignedDoctorIds, hospitalGroupCode } = scopeResult.scope;
        const { searchParams } = new URL(req.url);
        const mode = String(searchParams.get("mode") || "token").trim().toLowerCase() === "details" ? "details" : "token";
        const requestedScope = String(searchParams.get("scope") || "TODAY").trim().toUpperCase() === "ALL" ? "ALL" : "TODAY";
        const requestedLimit = Number(searchParams.get("limit") || DEFAULT_LIMIT);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
            : DEFAULT_LIMIT;
        const query = String(searchParams.get("query") || "").trim();
        const serial = String(searchParams.get("serial") || "").replace(/\D/g, "").slice(0, 5);

        const todayParts = getTodayPartsInIst();
        const year = String(searchParams.get("year") || todayParts.year).replace(/\D/g, "").slice(0, 4) || todayParts.year;
        const month = String(searchParams.get("month") || todayParts.month).replace(/\D/g, "").slice(0, 2).padStart(2, "0") || todayParts.month;
        const day = String(searchParams.get("day") || todayParts.day).replace(/\D/g, "").slice(0, 2).padStart(2, "0") || todayParts.day;
        const tokenPrefix = `${hospitalGroupCode}/${year}/${month}/${day}/`;
        const todayDate = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

        const where: Prisma.hospital_registrationsWhereInput = {
            hospital_group_code: hospitalGroupCode,
            OR: [
                { admin_id: adminId },
                { admin_id: null },
            ],
            AND: [
                {
                    OR: [
                        { doctor_id: null },
                        { doctor_id: { in: assignedDoctorIds.length > 0 ? assignedDoctorIds : [-1] } },
                    ],
                },
            ],
        };

        if (mode === "token") {
            if (serial) {
                where.token = serial.length === 5
                    ? `${tokenPrefix}${serial}`
                    : { startsWith: `${tokenPrefix}${serial}` };
            } else {
                where.token = { startsWith: tokenPrefix };
            }
        } else {
            if (requestedScope === "TODAY") {
                where.reg_date = new Date(`${todayDate}T00:00:00.000Z`);
            }

            if (query) {
                const dateVariants = buildDateSearchVariants(query);
                const matchingDoctors = assignedDoctorIds.length > 0
                    ? await prisma.doctors.findMany({
                        where: {
                            doctor_id: { in: assignedDoctorIds },
                            doctor_name: { contains: query },
                        },
                        select: { doctor_id: true },
                        take: 25,
                    })
                    : [];

                where.AND = [
                    ...(Array.isArray(where.AND) ? where.AND : []),
                    {
                        OR: [
                            { patient_name: { contains: query } },
                            { phone: { contains: query } },
                            { token: { contains: query } },
                            ...(matchingDoctors.length > 0
                                ? [{ doctor_id: { in: matchingDoctors.map((doctor) => doctor.doctor_id) } }]
                                : []),
                            ...dateVariants.map((variant) => ({
                                token: {
                                    contains: variant,
                                },
                            })),
                        ],
                    },
                ];
            }
        }

        const registrations = await prisma.hospital_registrations.findMany({
            where,
            select: {
                registration_id: true,
                hospital_group_code: true,
                reg_date: true,
                token: true,
                patient_name: true,
                phone: true,
                age: true,
                gender: true,
                doctor_id: true,
                admin_id: true,
                created_at: true,
            },
            orderBy: [
                { reg_date: "desc" },
                { seq_no: "desc" },
                { registration_id: "desc" },
            ],
            take: limit,
        });

        const registrationPhones = Array.from(
            new Set(
                registrations
                    .map((registration) => registration.phone)
                    .filter((phone): phone is string => typeof phone === "string" && phone.trim().length > 0)
            )
        );
        const registrationDoctorIds = Array.from(
            new Set(registrations.map((registration) => registration.doctor_id).filter((id): id is number => typeof id === "number" && Number.isFinite(id)))
        );
        const doctorIdsToLoad = Array.from(new Set([...assignedDoctorIds, ...registrationDoctorIds]));
        const doctors = doctorIdsToLoad.length > 0
            ? await prisma.doctors.findMany({
                where: { doctor_id: { in: doctorIdsToLoad } },
                select: { doctor_id: true, doctor_name: true },
            })
            : [];
        const doctorById = new Map(doctors.map((doctor) => [doctor.doctor_id, doctor]));

        const regDateByPhone = new Map<string, string>();
        for (const registration of registrations) {
            const regDate = formatDateInput(registration.reg_date);
            if (!regDate) continue;
            if (!registration.phone) continue;
            const current = regDateByPhone.get(registration.phone);
            if (!current || regDate < current) {
                regDateByPhone.set(registration.phone, regDate);
            }
        }
        const earliestRegDate = Array.from(regDateByPhone.values()).sort()[0] || null;

        const existingAppointments = registrationPhones.length > 0
            ? await prisma.appointment.findMany({
                where: {
                    admin_id: adminId,
                    doctor_id: { in: assignedDoctorIds.length > 0 ? assignedDoctorIds : [-1] },
                    status: { not: "CANCELLED" },
                    patient: {
                        is: {
                            phone: { in: registrationPhones },
                        },
                    },
                    ...(earliestRegDate
                        ? {
                            appointment_date: {
                                gte: new Date(`${earliestRegDate}T00:00:00.000Z`),
                            },
                        }
                        : {}),
                },
                select: {
                    appointment_id: true,
                    patient_id: true,
                    doctor_id: true,
                    clinic_id: true,
                    appointment_date: true,
                    start_time: true,
                    end_time: true,
                    payment_status: true,
                    status: true,
                    created_at: true,
                    patient: {
                        select: {
                            phone: true,
                        },
                    },
                },
                orderBy: [
                    { appointment_date: "desc" },
                    { created_at: "desc" },
                    { appointment_id: "desc" },
                ],
            })
            : [];

        const rows = registrations.map((registration) => {
            const registrationDate = formatDateInput(registration.reg_date);
            const appointment = existingAppointments.find((item) => {
                if (item.patient?.phone !== registration.phone) return false;
                const appointmentDate = formatDateInput(item.appointment_date);
                return !registrationDate || !appointmentDate || appointmentDate >= registrationDate;
            });
            const doctor = registration.doctor_id ? doctorById.get(registration.doctor_id) : null;
            return {
                registration_id: registration.registration_id,
                patient_id: appointment?.patient_id ?? null,
                full_name: registration.patient_name,
                phone: registration.phone,
                age: registration.age,
                gender: registration.gender,
                token: registration.token,
                doctor_id: registration.doctor_id,
                profile_type: "SELF",
                doctor: doctor
                    ? {
                        doctor_id: doctor.doctor_id,
                        doctor_name: doctor.doctor_name,
                    }
                    : null,
                confirmed_appointment: appointment
                    ? {
                        appointment_id: appointment.appointment_id,
                        doctor_id: appointment.doctor_id,
                        clinic_id: appointment.clinic_id,
                        appointment_date: formatDateInput(appointment.appointment_date),
                        start_time: formatTimeInput(appointment.start_time),
                        end_time: formatTimeInput(appointment.end_time),
                        payment_status: appointment.payment_status,
                        status: appointment.status,
                    }
                    : null,
            };
        });

        return NextResponse.json({
            patients: rows,
            meta: {
                mode,
                scope: requestedScope,
                tokenPrefix,
            },
        });
    } catch (error) {
        console.error("Search token registrations error:", error);
        return NextResponse.json({ error: "Failed to fetch search token registrations" }, { status: 500 });
    }
}
