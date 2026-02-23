import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

type TargetMode = "UPCOMING" | "TODAY" | "CUSTOM";
const prismaAny = prisma as any;

function isMissingAnnouncementTableError(error: unknown) {
    const e = error as { code?: string; meta?: { table?: string }; message?: string };
    if (e?.code !== "P2021") return false;
    const table = String(e?.meta?.table || "");
    const message = String(e?.message || "");
    return (
        table.includes("announcement_campaign_recipients") ||
        table.includes("announcement_campaigns") ||
        message.includes("announcement_campaign_recipients") ||
        message.includes("announcement_campaigns")
    );
}

async function getDoctorTargetPatients(userId: number, targetMode: TargetMode = "UPCOMING", targetDate?: string) {
    const doctor = await prisma.doctors.findUnique({
        where: { user_id: userId },
        select: { doctor_id: true },
    });
    if (!doctor) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);

    let dateFilter: { gte?: Date; lt?: Date } = { gte: today };
    if (targetMode === "TODAY") {
        dateFilter = { gte: today, lt: nextDay };
    } else if (targetMode === "CUSTOM") {
        const parsed = targetDate ? new Date(`${targetDate}T00:00:00`) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) {
            return { doctorId: doctor.doctor_id, patientIds: [], invalidDate: true as const };
        }
        const next = new Date(parsed);
        next.setDate(parsed.getDate() + 1);
        dateFilter = { gte: parsed, lt: next };
    }

    const upcoming = await prisma.appointment.findMany({
        where: {
            doctor_id: doctor.doctor_id,
            status: "BOOKED",
            appointment_date: dateFilter,
            patient_id: { not: null },
        },
        select: { patient_id: true },
        distinct: ["patient_id"],
    });

    const patientIds = upcoming
        .map((a) => a.patient_id)
        .filter((id): id is number => typeof id === "number");

    return { doctorId: doctor.doctor_id, patientIds };
}

async function createAnnouncementCampaign(params: {
    doctorId: number;
    message: string;
    recipientIds: number[];
    targetMode: TargetMode;
    targetDate?: string;
}) {
    const campaign = await prismaAny.announcement_campaigns.create({
        data: {
            doctor_id: params.doctorId,
            message: params.message,
            target_mode: params.targetMode,
            target_date: params.targetDate ? new Date(`${params.targetDate}T00:00:00`) : null,
            recipients: {
                createMany: {
                    data: params.recipientIds.map((patientId) => ({ patient_id: patientId })),
                },
            },
        },
        select: { campaign_id: true, created_at: true },
    });

    return campaign;
}

async function mirrorCampaignToChatMessages(params: {
    doctorId: number;
    recipientIds: number[];
    message: string;
    createdAt: Date;
}) {
    const content = `Announcement: ${params.message}`;
    await prisma.chat_messages.createMany({
        data: params.recipientIds.map((patientId) => ({
            patient_id: patientId,
            doctor_id: params.doctorId,
            sender: "DOCTOR",
            content,
            created_at: params.createdAt,
        })),
    });

    return content;
}

function emitAnnouncementEvents(params: {
    doctorId: number;
    recipientIds: number[];
    message: string;
    contentForChat: string;
    createdAt: Date;
    campaignId: number;
}) {
    const io = (globalThis as any).__DOCTOR_IO__;
    if (!io || typeof io.to !== "function") return;

    params.recipientIds.forEach((patientId) => {
        const room = `chat_patient_${patientId}_doctor_${params.doctorId}`;
        io.to(room).emit("receive_message", {
            patient_id: patientId,
            doctor_id: params.doctorId,
            sender: "DOCTOR",
            content: params.contentForChat,
            created_at: params.createdAt,
        });
        io.to(room).emit("announcement_received", {
            campaign_id: params.campaignId,
            patient_id: patientId,
            doctor_id: params.doctorId,
            sender: "DOCTOR",
            content: params.message,
            created_at: params.createdAt,
        });
    });
}

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "DOCTOR" && session.role !== "PATIENT")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(req.url);
        const mode = url.searchParams.get("mode");

        if (session.role === "PATIENT") {
            const patientId = session.patientId ?? session.userId;
            const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || "30")));
            let received: any[] = [];
            try {
                received = await prismaAny.announcement_campaign_recipients.findMany({
                    where: { patient_id: patientId },
                    orderBy: { created_at: "desc" },
                    take: limit,
                    select: {
                        campaign_id: true,
                        created_at: true,
                        campaign: {
                            select: {
                                doctor_id: true,
                                message: true,
                                created_at: true,
                                doctor: { select: { doctor_name: true } },
                            },
                        },
                    },
                });
            } catch (error) {
                if (!isMissingAnnouncementTableError(error)) throw error;
                // Fallback for older DBs: infer announcements from prefixed chat messages.
                const fallbackMessages = await prisma.chat_messages.findMany({
                    where: {
                        patient_id: patientId,
                        sender: "DOCTOR",
                        content: { startsWith: "Announcement:" },
                    },
                    orderBy: { created_at: "desc" },
                    take: limit,
                    select: {
                        message_id: true,
                        doctor_id: true,
                        content: true,
                        created_at: true,
                    },
                });

                const doctorIds = Array.from(
                    new Set(
                        fallbackMessages
                            .map((m) => m.doctor_id)
                            .filter((id): id is number => typeof id === "number")
                    )
                );

                const doctors = doctorIds.length
                    ? await prisma.doctors.findMany({
                        where: { doctor_id: { in: doctorIds } },
                        select: { doctor_id: true, doctor_name: true },
                    })
                    : [];
                const doctorNameById = new Map<number, string>(
                    doctors.map((d) => [d.doctor_id, d.doctor_name || "Doctor"])
                );

                return NextResponse.json({
                    announcements: fallbackMessages.map((m) => ({
                        message_id: m.message_id,
                        campaign_id: null,
                        doctor_id: m.doctor_id,
                        doctor_name: doctorNameById.get(m.doctor_id) || "Doctor",
                        content: String(m.content || "").replace(/^Announcement:\s*/, ""),
                        created_at: m.created_at,
                        received_at: m.created_at,
                    })),
                });
            }

            return NextResponse.json({
                announcements: received.map((row: any) => ({
                    message_id: row.campaign_id,
                    campaign_id: row.campaign_id,
                    doctor_id: row.campaign.doctor_id,
                    doctor_name: row.campaign.doctor.doctor_name || "Doctor",
                    content: row.campaign.message,
                    created_at: row.campaign.created_at,
                    received_at: row.created_at,
                })),
            });
        }

        const doctor = await prisma.doctors.findUnique({
            where: { user_id: session.userId },
            select: { doctor_id: true },
        });
        if (!doctor) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });

        if (mode === "history") {
            const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "200")));
            let campaigns: any[] = [];
            try {
                campaigns = await prismaAny.announcement_campaigns.findMany({
                    where: { doctor_id: doctor.doctor_id },
                    orderBy: { created_at: "desc" },
                    take: limit,
                    select: {
                        campaign_id: true,
                        created_at: true,
                        message: true,
                        _count: { select: { recipients: true } },
                    },
                });
            } catch (error) {
                if (!isMissingAnnouncementTableError(error)) throw error;
                return NextResponse.json({ campaigns: [] });
            }

            return NextResponse.json({
                campaigns: campaigns.map((c: any) => ({
                    campaign_id: c.campaign_id,
                    created_at: c.created_at,
                    content: c.message,
                    asAnnouncement: true,
                    recipientCount: c._count.recipients,
                })),
            });
        }

        const targetModeRaw = (url.searchParams.get("targetMode") || "UPCOMING").toUpperCase();
        const targetMode: TargetMode =
            targetModeRaw === "TODAY" ? "TODAY" : targetModeRaw === "CUSTOM" ? "CUSTOM" : "UPCOMING";
        const targetDate = url.searchParams.get("targetDate") || undefined;

        const targets = await getDoctorTargetPatients(session.userId, targetMode, targetDate);
        if (!targets) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        if ("invalidDate" in targets && targets.invalidDate) {
            return NextResponse.json({ error: "Invalid targetDate. Use YYYY-MM-DD" }, { status: 400 });
        }

        return NextResponse.json({ count: targets.patientIds.length });
    } catch (error) {
        console.error("Get announcement targets error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "DOCTOR") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: session.userId },
            select: { doctor_id: true },
        });
        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        if (String(body?.action || "").toLowerCase() === "resend") {
            const campaignIdNum = Number(body?.campaignId);
            if (!Number.isInteger(campaignIdNum) || campaignIdNum <= 0) {
                return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
            }

            const anchor = await prismaAny.announcement_campaigns.findUnique({
                where: { campaign_id: campaignIdNum },
                select: {
                    campaign_id: true,
                    doctor_id: true,
                    message: true,
                    recipients: { select: { patient_id: true } },
                },
            });
            if (!anchor || anchor.doctor_id !== doctor.doctor_id) {
                return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
            }

            const recipientIds: number[] = Array.from(
                new Set(anchor.recipients.map((r: { patient_id: number }) => r.patient_id))
            );
            if (recipientIds.length === 0) {
                return NextResponse.json({ success: true, sent: 0, message: "No recipients in campaign" });
            }

            const message = String(body?.message || "").trim() || anchor.message;
            const campaign = await createAnnouncementCampaign({
                doctorId: doctor.doctor_id,
                message,
                recipientIds,
                targetMode: "UPCOMING",
            });
            const contentForChat = await mirrorCampaignToChatMessages({
                doctorId: doctor.doctor_id,
                recipientIds,
                message,
                createdAt: campaign.created_at,
            });
            emitAnnouncementEvents({
                doctorId: doctor.doctor_id,
                recipientIds,
                message,
                contentForChat,
                createdAt: campaign.created_at,
                campaignId: campaign.campaign_id,
            });

            return NextResponse.json({
                success: true,
                sent: recipientIds.length,
                asAnnouncement: true,
                resentFromCampaignId: campaignIdNum,
                campaignId: campaign.campaign_id,
            });
        }

        const message = String(body?.message || "").trim();
        const targetModeRaw = String(body?.targetMode || "UPCOMING").toUpperCase();
        const targetMode: TargetMode =
            targetModeRaw === "TODAY" ? "TODAY" : targetModeRaw === "CUSTOM" ? "CUSTOM" : "UPCOMING";
        const targetDate = body?.targetDate ? String(body.targetDate) : undefined;
        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const targets = await getDoctorTargetPatients(session.userId, targetMode, targetDate);
        if (!targets) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }
        if ("invalidDate" in targets && targets.invalidDate) {
            return NextResponse.json({ error: "Invalid targetDate. Use YYYY-MM-DD" }, { status: 400 });
        }

        if (targets.patientIds.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "No upcoming booked patients" });
        }

        const campaign = await createAnnouncementCampaign({
            doctorId: targets.doctorId,
            message,
            recipientIds: targets.patientIds,
            targetMode,
            targetDate,
        });
        const contentForChat = await mirrorCampaignToChatMessages({
            doctorId: targets.doctorId,
            recipientIds: targets.patientIds,
            message,
            createdAt: campaign.created_at,
        });
        emitAnnouncementEvents({
            doctorId: targets.doctorId,
            recipientIds: targets.patientIds,
            message,
            contentForChat,
            createdAt: campaign.created_at,
            campaignId: campaign.campaign_id,
        });

        return NextResponse.json({
            success: true,
            sent: targets.patientIds.length,
            asAnnouncement: true,
            targetMode,
            targetDate: targetDate || null,
            campaignId: campaign.campaign_id,
        });
    } catch (error) {
        if (isMissingAnnouncementTableError(error)) {
            return NextResponse.json(
                {
                    error: "Announcement tables are missing. Run Prisma migrations to enable announcements.",
                },
                { status: 503 }
            );
        }
        console.error("Send announcement error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
