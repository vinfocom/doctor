export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN" && session.role !== "DOCTOR")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (session.role === "SUPER_ADMIN") {
            const patients = await prisma.patients.findMany({
                orderBy: { patient_id: "desc" },
            });
            return NextResponse.json({ patients });
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
        const patients: Array<(typeof appointments)[number]["patient"]> = [];

        for (const row of appointments) {
            if (!row.patient_id || !row.patient || seen.has(row.patient_id)) continue;
            seen.add(row.patient_id);
            patients.push(row.patient);
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

        return NextResponse.json({ patients });
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
