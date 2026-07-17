export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { Prisma } from "@/generated/prisma/client";

function attachPatientType<T extends { profile_type?: "SELF" | "OTHER" | null }>(patients: T[]) {
    return patients.map((patient) => ({
        ...patient,
        patient_type: patient.profile_type === "OTHER" ? "Other" : "Self",
    }));
}

function normalizePhone(value: string | null | undefined) {
    return String(value || "").replace(/\D/g, "");
}

async function findPatientIdsBySearch(search: string) {
    const trimmedSearch = String(search || "").trim();
    if (!trimmedSearch) return [];

    const normalizedDigits = normalizePhone(trimmedSearch);

    if (!normalizedDigits) {
        const patients = await prisma.patients.findMany({
            where: {
                full_name: {
                    contains: trimmedSearch,
                },
            },
            select: {
                patient_id: true,
            },
        });

        return patients.map((patient) => patient.patient_id);
    }

    const likeName = `%${trimmedSearch}%`;
    const likePhone = `%${normalizedDigits}%`;
    const rows = await prisma.$queryRaw<Array<{ patient_id: number }>>(Prisma.sql`
        SELECT patient_id
        FROM patients
        WHERE full_name LIKE ${likeName}
           OR REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(
                                REPLACE(COALESCE(phone, ''), ' ', ''),
                            '-', ''),
                        '+', ''),
                    '(', ''),
                ')', ''),
            '.', '') LIKE ${likePhone}
    `);

    return rows.map((row) => row.patient_id);
}

async function attachPrescriptionImageStatus<
    T extends { patient_id: number }
>(patients: T[], options?: { doctorId?: number | null }) {
    if (patients.length === 0) {
        return patients.map((patient) => ({
            ...patient,
            has_prescription_image: false,
        }));
    }

    const patientIds = patients.map((patient) => patient.patient_id);
    const records = await prisma.prescription_records.findMany({
        where: {
            patient_id: { in: patientIds },
            status: { not: "DELETED" },
            ...(options?.doctorId ? { doctor_id: options.doctorId } : {}),
        },
        select: {
            patient_id: true,
        },
        distinct: ["patient_id"],
    });

    const patientsWithImages = new Set(records.map((record) => record.patient_id));

    return patients.map((patient) => ({
        ...patient,
        has_prescription_image: patientsWithImages.has(patient.patient_id),
    }));
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search")?.trim() || "";
        const pageParam = Number(searchParams.get("page") || "1");
        const pageSizeParam = Number(searchParams.get("pageSize") || "25");
        const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
        const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0
            ? Math.min(Math.floor(pageSizeParam), 100)
            : 25;
        const shouldPaginate = searchParams.has("page") || searchParams.has("pageSize");
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN" && session.role !== "DOCTOR")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (session.role === "SUPER_ADMIN") {
            const patients = await prisma.patients.findMany({
                orderBy: { patient_id: "desc" },
                include: {
                    doctor: { select: { doctor_id: true, doctor_name: true } },
                    _count: { select: { appointments: true } },
                },
            });

            // Get first appointment date per patient as "registration date"
            const firstAppointments = await prisma.appointment.groupBy({
                by: ["patient_id"],
                _min: { created_at: true },
                where: { patient_id: { not: null } },
            });
            const firstApptMap = new Map<number, Date | null>();
            for (const fa of firstAppointments) {
                if (fa.patient_id) firstApptMap.set(fa.patient_id, fa._min.created_at);
            }

            const result = patients.map((p) => ({
                patient_id: p.patient_id,
                full_name: p.full_name,
                phone: p.phone,
                age: p.age,
                gender: p.gender,
                doctor_id: p.doctor_id,
                doctor_name: p.doctor?.doctor_name || null,
                appointment_count: p._count.appointments,
                registered_at: firstApptMap.get(p.patient_id)?.toISOString() || null,
                profile_type: p.profile_type,
            }));

            const patientsWithType = attachPatientType(result);
            const patientsWithImageStatus = await attachPrescriptionImageStatus(patientsWithType);

            return NextResponse.json({ patients: patientsWithImageStatus });
        }

        let doctorId: number | null = null;
        let adminId: number | null = null;

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true }
            });
            if (doctor) {
                doctorId = doctor.doctor_id;
            } else {
                return NextResponse.json({ patients: [] });
            }
        } else if (session.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
                select: { admin_id: true }
            });
            if (admin) {
                adminId = admin.admin_id;
            } else {
                return NextResponse.json({ patients: [] });
            }
        }

        const appointmentWhere: Record<string, unknown> = {
            patient_id: { not: null }
        };
        if (doctorId) appointmentWhere.doctor_id = doctorId;
        if (adminId) appointmentWhere.admin_id = adminId;

        const appointmentPatientRows = await prisma.appointment.findMany({
            where: appointmentWhere,
            orderBy: { created_at: "desc" },
            select: {
                patient_id: true,
            }
        });

        const orderedPatientIds: number[] = [];
        const seen = new Set<number>();

        for (const row of appointmentPatientRows) {
            if (!row.patient_id || seen.has(row.patient_id)) continue;
            seen.add(row.patient_id);
            orderedPatientIds.push(row.patient_id);
        }

        // Keep direct-assigned patients even if they have no appointment rows yet.
        const directWhere: Record<string, unknown> = {};
        if (doctorId) directWhere.doctor_id = doctorId;
        if (adminId) directWhere.admin_id = adminId;

        const directPatients = await prisma.patients.findMany({
            where: directWhere,
            orderBy: { patient_id: "desc" },
            select: { patient_id: true },
        });

        for (const patient of directPatients) {
            if (seen.has(patient.patient_id)) continue;
            seen.add(patient.patient_id);
            orderedPatientIds.push(patient.patient_id);
        }

        const matchingPatientIds = search ? await findPatientIdsBySearch(search) : null;
        const matchingPatientSet = matchingPatientIds ? new Set(matchingPatientIds) : null;
        const finalPatientIds = matchingPatientSet
            ? orderedPatientIds.filter((patientId) => matchingPatientSet.has(patientId))
            : orderedPatientIds;

        const totalCount = finalPatientIds.length;
        const totalPages = shouldPaginate ? Math.max(1, Math.ceil(totalCount / pageSize)) : (totalCount > 0 ? 1 : 0);
        const safePage = shouldPaginate ? Math.min(page, Math.max(totalPages, 1)) : 1;
        const pagePatientIds = shouldPaginate
            ? finalPatientIds.slice((safePage - 1) * pageSize, safePage * pageSize)
            : finalPatientIds;

        const patients = pagePatientIds.length > 0
            ? await prisma.patients.findMany({
                where: {
                    patient_id: { in: pagePatientIds },
                },
            })
            : [];

        const patientsById = new Map(patients.map((patient) => [patient.patient_id, patient]));
        const orderedPatients = pagePatientIds
            .map((patientId) => patientsById.get(patientId))
            .filter((patient): patient is (typeof patients)[number] => Boolean(patient));

        const patientsWithType = attachPatientType(orderedPatients);
        const patientsWithImageStatus = await attachPrescriptionImageStatus(patientsWithType, {
            doctorId,
        });

        return NextResponse.json({
            patients: patientsWithImageStatus,
            page: safePage,
            pageSize,
            totalCount,
            totalPages,
        });
    } catch (error) {
        console.error("Get patients error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN" && session.role !== "DOCTOR")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { full_name, phone, telegram_chat_id } = body;

        let admin_id: number | null = null;
        let doctor_id: number | null = null;

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true, admin_id: true }
            });
            if (doctor) {
                doctor_id = doctor.doctor_id;
                admin_id = doctor.admin_id;
            }
        } else if (session.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
                select: { admin_id: true }
            });
            if (admin) admin_id = admin.admin_id;
        }

        if (!admin_id) {
            return NextResponse.json({ error: "Admin context required" }, { status: 400 });
        }

        const patient = await prisma.patients.create({
            data: {
                full_name,
                phone,
                telegram_chat_id: telegram_chat_id || null,
                admin_id,
                doctor_id,
                profile_type: "SELF",
            }
        });

        return NextResponse.json({ success: true, patient }, { status: 201 });

    } catch (error) {
        console.error("Create patient error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
