export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

function attachPatientType<T extends { patient_id: number; phone: string | null }>(patients: T[]) {
    const firstPatientByPhone = new Map<string, number>();

    for (const patient of [...patients].sort((a, b) => a.patient_id - b.patient_id)) {
        const phoneKey = String(patient.phone || "").trim();
        if (!phoneKey || firstPatientByPhone.has(phoneKey)) continue;
        firstPatientByPhone.set(phoneKey, patient.patient_id);
    }

    return patients.map((patient) => {
        const phoneKey = String(patient.phone || "").trim();
        const firstPatientId = phoneKey ? firstPatientByPhone.get(phoneKey) : undefined;

        return {
            ...patient,
            patient_type: firstPatientId && firstPatientId !== patient.patient_id ? "Other" : "Self",
        };
    });
}

export async function GET(req: Request) {
    try {
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
            }));

            return NextResponse.json({ patients: attachPatientType(result) });
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

        const appointments = await prisma.appointment.findMany({
            where: appointmentWhere,
            orderBy: { created_at: "desc" },
            select: {
                patient_id: true,
                patient: true
            }
        });

        const seen = new Set<number>();
        type PatientRow = NonNullable<(typeof appointments)[number]["patient"]>;
        const patients: PatientRow[] = [];

        for (const row of appointments) {
            const p = row.patient;
            if (!row.patient_id || !p || seen.has(row.patient_id)) continue;
            seen.add(row.patient_id);
            patients.push(p);
        }

        // Keep direct-assigned patients even if they have no appointment rows yet.
        const directWhere: Record<string, unknown> = {};
        if (doctorId) directWhere.doctor_id = doctorId;
        if (adminId) directWhere.admin_id = adminId;

        const directPatients = await prisma.patients.findMany({
            where: directWhere,
            orderBy: { patient_id: "desc" }
        });

        for (const patient of directPatients) {
            if (seen.has(patient.patient_id)) continue;
            seen.add(patient.patient_id);
            patients.push(patient);
        }

        return NextResponse.json({ patients: attachPatientType(patients) });
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
                doctor_id
            }
        });

        return NextResponse.json({ success: true, patient }, { status: 201 });

    } catch (error) {
        console.error("Create patient error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
