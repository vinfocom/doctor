export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { addMinutesToTimeString, getISTDayOfWeek, parseISTDate, parseISTTimeToUTCDate } from "@/lib/appointmentDateTime";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const appointments = await prisma.appointment.findMany({
            where: { patient_id: patientId },
            include: {
                doctor: {
                    select: { doctor_id: true, doctor_name: true, specialization: true, phone: true },
                },
                clinic: {
                    select: { clinic_id: true, clinic_name: true, location: true, phone: true },
                },
            },
            orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
        });

        const safe = JSON.parse(JSON.stringify(appointments, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
        ));
        return NextResponse.json({ appointments: safe });
    } catch (error) {
        console.error("Patient appointments GET error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const body = await req.json();
        const doctor_id = Number(body?.doctor_id);
        const clinic_id = Number(body?.clinic_id);
        const appointment_date = String(body?.appointment_date || "");
        const start_time = String(body?.start_time || "");
        const patient_name = String(body?.patient_name || "").trim();

        if (!doctor_id || !clinic_id || !appointment_date || !start_time) {
            return NextResponse.json({ error: "doctor_id, clinic_id, appointment_date, start_time are required" }, { status: 400 });
        }

        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: { patient_id: true, admin_id: true, full_name: true },
        });
        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const doctor = await prisma.doctors.findUnique({
            where: { doctor_id },
            select: { doctor_id: true, admin_id: true },
        });
        if (!doctor || doctor.admin_id !== patient.admin_id) {
            return NextResponse.json({ error: "Doctor not available for this patient" }, { status: 403 });
        }

        const clinic = await prisma.clinics.findUnique({
            where: { clinic_id },
            select: { clinic_id: true, doctor_id: true, admin_id: true },
        });
        if (!clinic || clinic.admin_id !== patient.admin_id) {
            return NextResponse.json({ error: "Clinic not available" }, { status: 403 });
        }
        if (clinic.doctor_id && clinic.doctor_id !== doctor_id) {
            return NextResponse.json({ error: "Selected clinic is not assigned to this doctor" }, { status: 400 });
        }

        // MariaDB DATE column stores calendar date from UTC — use UTC midnight so Mar 27 stays Mar 27
        const apptDate = parseISTDate(appointment_date);
        const dayOfWeek = getISTDayOfWeek(appointment_date);
        const schedule = await prisma.doctor_clinic_schedule.findFirst({
            where: {
                doctor_id,
                clinic_id,
                day_of_week: dayOfWeek,
            },
            orderBy: { schedule_id: "desc" },
            select: { slot_duration: true },
        });
        const slotDuration = schedule?.slot_duration || 30;

        const startTimeObj = parseISTTimeToUTCDate(start_time);
        const endTimeObj = parseISTTimeToUTCDate(addMinutesToTimeString(start_time, slotDuration));

        const appointment = await prisma.appointment.create({
            data: {
                patient_id: patient.patient_id,
                doctor_id,
                clinic_id,
                admin_id: patient.admin_id,
                appointment_date: apptDate,
                start_time: startTimeObj,
                end_time: endTimeObj,
                status: "BOOKED",
            },
        });

        if (patient_name && patient_name !== (patient.full_name || "")) {
            await prisma.patients.update({
                where: { patient_id: patient.patient_id },
                data: { full_name: patient_name },
            }).catch(() => undefined);
        }

        return NextResponse.json({ appointment }, { status: 201 });
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "Slot already booked" }, { status: 409 });
        }
        console.error("Patient appointments POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const body = await req.json();
        const appointmentId = Number(body?.appointmentId);

        if (!appointmentId) {
            return NextResponse.json({ error: "appointmentId required" }, { status: 400 });
        }

        // Only allow cancelling own appointments
        const existing = await prisma.appointment.findFirst({
            where: { appointment_id: appointmentId, patient_id: patientId },
            select: { appointment_id: true, status: true },
        });

        if (!existing) {
            return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
        }

        if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
            return NextResponse.json({ error: "Cannot cancel a completed or already cancelled appointment" }, { status: 400 });
        }

        const updated = await prisma.appointment.update({
            where: { appointment_id: appointmentId },
            data: {
                status: "CANCELLED",
                cancelled_by: "PATIENT",
            },
        });

        const safe = JSON.parse(JSON.stringify(updated, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
        ));
        return NextResponse.json({ appointment: safe });
    } catch (error) {
        console.error("Patient appointments PATCH error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}


