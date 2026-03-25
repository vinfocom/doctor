import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { sendExpoPushNotification } from "@/lib/expoPush";

type TargetMode = "TOMORROW" | "TODAY" | "CUSTOM";

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

async function getDoctorTargetPatients(userId: number, targetMode: TargetMode = "TODAY", targetDate?: string) {
    const doctor = await prisma.doctors.findUnique({
        where: { user_id: userId },
        select: { doctor_id: true },
    });
    if (!doctor) return null;

    // Compute "today" in IST (UTC+5:30) as a YYYY-MM-DD string so the comparison
    // works correctly regardless of server timezone.
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // shift to IST
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayIST = `${nowIST.getUTCFullYear()}-${pad(nowIST.getUTCMonth() + 1)}-${pad(nowIST.getUTCDate())}`;

    const addDays = (ymd: string, days: number) => {
        const d = new Date(`${ymd}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    };

    let filterDate: string; // YYYY-MM-DD to match
    if (targetMode === "TODAY") {
        filterDate = todayIST;
    } else if (targetMode === "TOMORROW") {
        filterDate = addDays(todayIST, 1);
    } else {
        // CUSTOM
        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
            return { doctorId: doctor.doctor_id, patientIds: [], invalidDate: true as const };
        }
        filterDate = targetDate;
    }

    // Use raw SQL to compare appointment_date as a calendar date in IST (Asia/Kolkata).
    // This avoids all UTC-vs-IST issues regardless of how datetimes were stored.
    const upcoming = await prisma.$queryRaw<Array<{
        patient_id: number | null;
        appointment_date: Date | null;
        start_time: Date | null;
        full_name: string | null;
    }>>`
        SELECT
            a.patient_id,
            a.appointment_date,
            a.start_time,
            p.full_name
        FROM appointment a
        LEFT JOIN patients p ON p.patient_id = a.patient_id
        WHERE
            a.doctor_id = ${doctor.doctor_id}
            AND a.status = 'BOOKED'
            AND a.patient_id IS NOT NULL
            AND DATE(CONVERT_TZ(a.appointment_date, '+00:00', '+05:30')) = ${filterDate}
        ORDER BY a.appointment_date ASC, a.start_time ASC
    `;

    const uniquePatients = new Map<number, any>();
    for (const a of upcoming) {
        if (a.patient_id && !uniquePatients.has(a.patient_id)) {
            uniquePatients.set(a.patient_id, {
                patient_id: a.patient_id,
                name: a.full_name || 'Unknown Patient',
                appointment_date: a.appointment_date,
                start_time: a.start_time,
            });
        }
    }

    const patientsList = Array.from(uniquePatients.values());
    const patientIds = patientsList.map(p => p.patient_id);

    return { doctorId: doctor.doctor_id, patientIds, patientsList };
}

async function getDoctorAnnouncementDates(userId: number) {
    const doctor = await prisma.doctors.findUnique({
        where: { user_id: userId },
        select: { doctor_id: true },
    });
    if (!doctor) return null;

    const rows = await prisma.$queryRaw<Array<{ appointment_date: Date | null }>>`
        SELECT DISTINCT a.appointment_date
        FROM appointment a
        WHERE
            a.doctor_id = ${doctor.doctor_id}
            AND a.status = 'BOOKED'
            AND a.patient_id IS NOT NULL
            AND DATE(CONVERT_TZ(a.appointment_date, '+00:00', '+05:30')) >= DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))
        ORDER BY a.appointment_date ASC
    `;

    return rows
        .map((row) => (row.appointment_date ? new Date(row.appointment_date).toISOString().slice(0, 10) : null))
        .filter((value): value is string => Boolean(value));
}

async function createAnnouncementCampaign(params: {
    doctorId: number;
    message: string;
    recipientIds: number[];
    targetMode: TargetMode;
    targetDate?: string;
}) {
    const campaign = await prisma.announcement_campaigns.create({
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

    // Send Expo Push Notifications in the background
    (async () => {
        try {
            const doc = await prisma.doctors.findUnique({
                where: { doctor_id: params.doctorId },
                select: { doctor_name: true, push_token: true },
            });
            const patients = await prisma.patients.findMany({
                where: { patient_id: { in: params.recipientIds } },
                select: { push_token: true },
            });

            // Exclude sender (doctor) from announcement pushes
            const tokens = new Set<string>();
            patients.forEach((p) => {
                if (p.push_token) tokens.add(p.push_token);
            });

            const title = `Announcement from Dr. ${doc?.doctor_name || "Doctor"}`;
            const body = params.message.length > 100 ? params.message.substring(0, 97) + "..." : params.message;

            console.log("[announcement-push] preparing push", {
                doctorId: params.doctorId,
                campaignId: params.campaignId,
                recipientIds: params.recipientIds,
                targetTokens: Array.from(tokens),
                title,
                body,
            });

            if (tokens.size > 0) {
                const tokenList = Array.from(tokens);
                // Chunk to 100 recipients max per request (Expo API limits)
                for (let i = 0; i < tokenList.length; i += 100) {
                    const chunk = tokenList.slice(i, i + 100);
                    await sendExpoPushNotification({
                        to: chunk,
                        title,
                        body,
                        data: {
                            type: "announcement",
                            doctorId: params.doctorId,
                            campaignId: params.campaignId,
                        },
                        sound: "default",
                        });
                    }
            } else {
                console.log("[announcement-push] skipped because no patient push tokens were available", {
                    doctorId: params.doctorId,
                    campaignId: params.campaignId,
                    recipientIds: params.recipientIds,
                });
            }
        } catch (err) {
            console.error("Background announcement push failed:", err);
        }
    })();
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
                received = await prisma.announcement_campaign_recipients.findMany({
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
                console.error('[announcements] announcement_campaign_recipients table missing, using chat_messages fallback:', error);
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
                campaigns = await prisma.announcement_campaigns.findMany({
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
                console.error('[announcements] announcement_campaigns table missing:', error);
                // Fall through to chat_messages fallback below
            }

            // Also fetch announcements sent via the fallback path (stored as chat_messages with "Announcement:" prefix).
            // This covers broadcasts sent before the campaigns table existed or via the mobile offline fallback.
            const fallbackMessages = await prisma.chat_messages.findMany({
                where: {
                    doctor_id: doctor.doctor_id,
                    sender: "DOCTOR",
                    content: { startsWith: "Announcement:" },
                },
                orderBy: { created_at: "desc" },
                take: limit,
                select: { message_id: true, patient_id: true, content: true, created_at: true },
            });

            // Build a set of campaign keys (message + minute) so we can skip duplicates
            const campaignKeys = new Set(
                campaigns.map((c: any) =>
                    `${String(c.message).trim()}|${new Date(c.created_at).toISOString().slice(0, 16)}`
                )
            );

            // Group fallback messages by unique broadcast (same content + same minute = one broadcast)
            const fallbackGrouped = new Map<string, { content: string; created_at: Date; count: number; id: number }>();
            for (const m of fallbackMessages) {
                const clean = String(m.content).replace(/^Announcement:\s*/, "").trim();
                const key = `${clean}|${new Date(m.created_at).toISOString().slice(0, 16)}`;
                if (campaignKeys.has(key)) continue; // Already represented by a campaign record
                if (!fallbackGrouped.has(key)) {
                    fallbackGrouped.set(key, { content: clean, created_at: m.created_at, count: 0, id: m.message_id });
                }
                fallbackGrouped.get(key)!.count++;
            }

            const allCampaigns = [
                ...campaigns.map((c: any) => ({
                    campaign_id: c.campaign_id,
                    created_at: c.created_at,
                    content: c.message,
                    asAnnouncement: true,
                    recipientCount: c._count.recipients,
                })),
                ...[...fallbackGrouped.values()].map((g) => ({
                    campaign_id: `fallback_${g.id}`,
                    created_at: g.created_at,
                    content: g.content,
                    asAnnouncement: true,
                    recipientCount: g.count,
                })),
            ]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, limit);

            return NextResponse.json({ campaigns: allCampaigns });
        }

        if (mode === "available_dates") {
            const dates = await getDoctorAnnouncementDates(session.userId);
            if (!dates) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            return NextResponse.json({ dates });
        }

        const targetModeRaw = (url.searchParams.get("targetMode") || "TODAY").toUpperCase();
        const targetMode: TargetMode =
            targetModeRaw === "TODAY" ? "TODAY" : targetModeRaw === "TOMORROW" ? "TOMORROW" : targetModeRaw === "CUSTOM" ? "CUSTOM" : "TODAY";
        const targetDate = url.searchParams.get("targetDate") || undefined;

        const targets = await getDoctorTargetPatients(session.userId, targetMode, targetDate);
        if (!targets) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        if ("invalidDate" in targets && targets.invalidDate) {
            return NextResponse.json({ error: "Invalid targetDate. Use YYYY-MM-DD" }, { status: 400 });
        }

        return NextResponse.json({
            count: targets.patientIds.length,
            patients: targets.patientsList || [],
        });
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

            const anchor = await prisma.announcement_campaigns.findUnique({
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
                targetMode: "TODAY",
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
        const targetModeRaw = String(body?.targetMode || "TODAY").toUpperCase();
        const targetMode: TargetMode =
            targetModeRaw === "TODAY" ? "TODAY" : targetModeRaw === "TOMORROW" ? "TOMORROW" : targetModeRaw === "CUSTOM" ? "CUSTOM" : "TODAY";
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
