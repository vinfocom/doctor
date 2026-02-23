import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

// GET /api/chat?patient_id=...&doctor_id=...
export async function GET(request: NextRequest) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const patient_id = searchParams.get("patient_id");
        const doctor_id = searchParams.get("doctor_id");

        if (!patient_id || !doctor_id) {
            return NextResponse.json(
                { error: "Missing patient_id or doctor_id" },
                { status: 400 }
            );
        }

        const patientIdNum = parseInt(patient_id, 10);
        const doctorIdNum = parseInt(doctor_id, 10);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor || doctor.doctor_id !== doctorIdNum) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        } else if (session.role === "PATIENT") {
            const sessionPatientId = session.patientId ?? session.userId;
            if (sessionPatientId !== patientIdNum) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            const link = await prisma.appointment.findFirst({
                where: { patient_id: patientIdNum, doctor_id: doctorIdNum },
                select: { appointment_id: true },
            });
            if (!link) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        } else {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const messages = await prisma.chat_messages.findMany({
            where: {
                patient_id: patientIdNum,
                doctor_id: doctorIdNum,
                content: {
                    not: {
                        startsWith: "Announcement:",
                    },
                },
            },
            orderBy: {
                created_at: "asc",
            },
        });

        return NextResponse.json({ messages }, { status: 200 });
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}

// POST /api/chat
export async function POST(request: NextRequest) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { patient_id, doctor_id, sender, content } = body;

        if (!patient_id || !doctor_id || !sender || !content) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        if (sender !== "DOCTOR" && sender !== "PATIENT") {
            return NextResponse.json(
                { error: "Invalid sender. Must be DOCTOR or PATIENT" },
                { status: 400 }
            );
        }

        const patientIdNum = parseInt(patient_id, 10);
        const doctorIdNum = parseInt(doctor_id, 10);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor || doctor.doctor_id !== doctorIdNum || sender !== "DOCTOR") {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        } else if (session.role === "PATIENT") {
            const sessionPatientId = session.patientId ?? session.userId;
            if (sessionPatientId !== patientIdNum || sender !== "PATIENT") {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const link = await prisma.appointment.findFirst({
                where: { patient_id: patientIdNum, doctor_id: doctorIdNum },
                select: { appointment_id: true },
            });
            if (!link) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        } else {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const message = await prisma.chat_messages.create({
            data: {
                patient_id: patientIdNum,
                doctor_id: doctorIdNum,
                sender,
                content,
            },
        });
        const room = `chat_patient_${patientIdNum}_doctor_${doctorIdNum}`;
        const io = (globalThis as any).__DOCTOR_IO__;
        if (io && typeof io.to === "function") {
            io.to(room).emit("receive_message", {
                message_id: message.message_id,
                patient_id: patientIdNum,
                doctor_id: doctorIdNum,
                sender: message.sender,
                content: message.content,
                created_at: message.created_at,
            });
        }

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error("Error creating chat message:", error);
        return NextResponse.json(
            { error: "Failed to create message" },
            { status: 500 }
        );
    }
}
