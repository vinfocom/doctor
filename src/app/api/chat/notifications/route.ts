import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "DOCTOR" && session.role !== "PATIENT")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(req.url);
        const sinceParam = url.searchParams.get("since");
        const sinceDate = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 5 * 60 * 1000);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor) return NextResponse.json({ count: 0, announcementCount: 0, latestAt: null });

            const incoming = await prisma.chat_messages.findMany({
                where: {
                    doctor_id: doctor.doctor_id,
                    sender: "PATIENT",
                    created_at: { gt: sinceDate },
                },
                orderBy: { created_at: "desc" },
                take: 20,
                select: {
                    created_at: true,
                    content: true,
                    patient_id: true,
                    doctor_id: true,
                },
            });
            const latest = incoming[0];
            const latestSender = latest
                ? await prisma.patients.findUnique({
                    where: { patient_id: latest.patient_id },
                    select: { full_name: true },
                })
                : null;

            return NextResponse.json({
                count: incoming.length,
                announcementCount: 0,
                latestAt: latest?.created_at ?? null,
                latestMessage: latest
                    ? {
                        senderName: latestSender?.full_name || "Patient",
                        senderRole: "PATIENT",
                        preview: latest.content,
                        isAnnouncement: false,
                        createdAt: latest.created_at,
                        patientId: latest.patient_id,
                        doctorId: latest.doctor_id,
                    }
                    : null,
            });
        }

        const patientId = session.patientId ?? session.userId;
        const incoming = await prisma.chat_messages.findMany({
            where: {
                patient_id: patientId,
                sender: "DOCTOR",
                created_at: { gt: sinceDate },
            },
            orderBy: { created_at: "desc" },
            take: 30,
            select: {
                created_at: true,
                content: true,
                patient_id: true,
                doctor_id: true,
            },
        });

        const announcementCount = incoming.filter((m) => m.content?.startsWith("Announcement:")).length;
        const messageCount = incoming.length - announcementCount;
        const latest = incoming[0];
        const latestSender = latest
            ? await prisma.doctors.findUnique({
                where: { doctor_id: latest.doctor_id },
                select: { doctor_name: true },
            })
            : null;

        return NextResponse.json({
            count: messageCount,
            announcementCount,
            latestAt: latest?.created_at ?? null,
            latestMessage: latest
                ? {
                    senderName: latestSender?.doctor_name || "Doctor",
                    senderRole: "DOCTOR",
                    preview: latest.content,
                    isAnnouncement: latest.content?.startsWith("Announcement:") ?? false,
                    createdAt: latest.created_at,
                    patientId: latest.patient_id,
                    doctorId: latest.doctor_id,
                }
                : null,
        });
    } catch (error) {
        console.error("Chat notifications error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
