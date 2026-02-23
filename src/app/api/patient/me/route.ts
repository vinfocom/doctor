export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;

        let patient: {
            patient_id: number;
            full_name: string | null;
            phone: string | null;
            telegram_chat_id?: string | null;
            doctor_id: number | null;
            admin_id: number;
        } | null = null;

        try {
            patient = await prisma.patients.findUnique({
                where: { patient_id: patientId },
                select: {
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    telegram_chat_id: true,
                    doctor_id: true,
                    admin_id: true,
                },
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : "";
            if (!msg.includes("telegram_chat_id")) throw error;
            // Backward compatibility while local dev server still holds old Prisma model shape.
            patient = await prisma.patients.findUnique({
                where: { patient_id: patientId },
                select: {
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    doctor_id: true,
                    admin_id: true,
                },
            });
        }

        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                patient_id: patientId,
                doctor_id: { not: null },
            },
            select: {
                doctor_id: true,
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        phone: true,
                        specialization: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
        });

        const seen = new Set<number>();
        const doctors = [];
        for (const appt of appointments) {
            if (!appt.doctor_id || !appt.doctor || seen.has(appt.doctor_id)) continue;
            seen.add(appt.doctor_id);
            doctors.push(appt.doctor);
        }

        return NextResponse.json({ patient, doctors });
    } catch (error) {
        console.error("Patient me error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
