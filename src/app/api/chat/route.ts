import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { sendExpoPushNotification } from "@/lib/expoPush";

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
        // For DOCTOR: always use the doctor_id from their session, not the param
        // (mobile may pass 0 or stale id from patient object)
        let doctorIdNum = parseInt(doctor_id, 10);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            // Override doctorIdNum with authoritative value from session
            doctorIdNum = doctor.doctor_id;
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
        const { patient_id, doctor_id, sender, content, attachment_url, attachment_type, attachment_name, attachment_mime, attachment_size } = body;

        if (!patient_id || !doctor_id || !sender) {
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
        // For DOCTOR: always use the doctor_id from their session, not the param
        let doctorIdNum = parseInt(doctor_id, 10);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor || sender !== "DOCTOR") {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            // Override with session-derived doctor_id
            doctorIdNum = doctor.doctor_id;
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

        const safeContent = typeof content === "string" ? content : "";
        if (!safeContent.trim() && !attachment_url) {
            return NextResponse.json(
                { error: "Message content or attachment is required" },
                { status: 400 }
            );
        }

        if (attachment_type && attachment_type !== "image" && attachment_type !== "file") {
            return NextResponse.json({ error: "Invalid attachment_type" }, { status: 400 });
        }

        const message = await prisma.chat_messages.create({
            data: {
                patient_id: patientIdNum,
                doctor_id: doctorIdNum,
                sender,
                content: safeContent,
                attachment_url: attachment_url || null,
                attachment_type: attachment_type || null,
                attachment_name: attachment_name || null,
                attachment_mime: attachment_mime || null,
                attachment_size: Number.isFinite(Number(attachment_size)) ? Number(attachment_size) : null,
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
                attachment_url: message.attachment_url,
                attachment_type: message.attachment_type,
                attachment_name: message.attachment_name,
                attachment_mime: message.attachment_mime,
                attachment_size: message.attachment_size,
                created_at: message.created_at,
            });
        }

        // Send Expo Push Notification in the background
        (async () => {
            try {
                const [patient, doc] = await Promise.all([
                    prisma.patients.findUnique({
                        where: { patient_id: patientIdNum },
                        select: { push_token: true, full_name: true },
                    }),
                    prisma.doctors.findUnique({
                        where: { doctor_id: doctorIdNum },
                        select: { push_token: true, doctor_name: true },
                    }),
                ]);

                const tokens = new Set<string>();
                if (sender === "DOCTOR") {
                    if (patient?.push_token) tokens.add(patient.push_token);
                } else {
                    if (doc?.push_token) tokens.add(doc.push_token);
                }

                const senderName =
                    sender === "DOCTOR"
                        ? `Dr. ${doc?.doctor_name || "Doctor"}`
                        : patient?.full_name || "Patient";

                const bodyText = safeContent
                    ? (safeContent.length > 100 ? safeContent.substring(0, 97) + "..." : safeContent)
                    : "Sent an attachment";

                if (tokens.size > 0) {
                    await sendExpoPushNotification({
                        to: Array.from(tokens),
                        title: `New message from ${senderName}`,
                        body: bodyText,
                        data: {
                            type: "chat",
                            patientId: patientIdNum,
                            doctorId: doctorIdNum,
                            senderRole: sender,
                            senderName,
                        },
                        sound: "default",
                    });
                }
            } catch (err) {
                console.error("Background push notification failed:", err);
            }
        })();

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error("Error creating chat message:", error);
        return NextResponse.json(
            { error: "Failed to create message" },
            { status: 500 }
        );
    }
}
