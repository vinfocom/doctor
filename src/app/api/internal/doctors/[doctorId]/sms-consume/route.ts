import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SmsServiceStatus } from "@/generated/prisma/enums";
import { deriveDoctorSmsSnapshot, getDoctorSmsPackAlertType } from "@/lib/doctorSms";
import { isMissingPrismaTable } from "@/lib/prismaErrors";
import { authorizeSmsInternalApi } from "@/lib/internalApiAuth";
import { isExpoPushToken, sendDoctorSmsPackPushNotification } from "@/lib/expoPush";

type LockedSmsRow = {
    doctor_id: number;
    sms_service_enabled: boolean;
    sms_service_status: SmsServiceStatus;
    sms_credit_total: number;
    sms_credit_used: number;
    current_pack_total: number;
    current_pack_used: number;
    low_pack_alert_sent_at?: Date | null;
    exhausted_alert_sent_at?: Date | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ doctorId: string }> }) {
    try {
        const auth = await authorizeSmsInternalApi(req);
        if (!auth.authorized) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { doctorId } = await params;
        const numericDoctorId = Number(doctorId);
        if (!Number.isInteger(numericDoctorId) || numericDoctorId <= 0) {
            return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const appointmentId = Number(body?.appointmentId);
        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
            return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const doctor = await tx.doctors.findUnique({
                where: { doctor_id: numericDoctorId },
                select: {
                    doctor_id: true,
                    doctor_name: true,
                    push_token: true,
                },
            });

            if (!doctor) {
                return { httpStatus: 404, body: { error: "Doctor not found" } };
            }

            const hasValidPushToken = isExpoPushToken(doctor.push_token);

            const appointment = await tx.appointment.findUnique({
                where: { appointment_id: appointmentId },
                select: { appointment_id: true, doctor_id: true },
            });

            if (!appointment || appointment.doctor_id !== numericDoctorId) {
                return {
                    httpStatus: 400,
                    body: { error: "Appointment does not belong to this doctor" },
                };
            }

            const existingUsage = await tx.doctor_sms_usage_log.findFirst({
                where: { appointment_id: appointmentId },
            });

            if (existingUsage) {
                const currentService = await tx.doctor_sms_service.findUnique({
                    where: { doctor_id: numericDoctorId },
                });
                const sms = deriveDoctorSmsSnapshot(currentService);
                return {
                    httpStatus: 200,
                    body: {
                        success: true,
                        alreadyConsumed: true,
                        reserved: true,
                        doctorId: numericDoctorId,
                        appointmentId,
                        status: sms.status,
                        remainingCredits: sms.remainingCredits,
                    },
                };
            }

            await tx.doctor_sms_service.upsert({
                where: { doctor_id: numericDoctorId },
                create: {
                    doctor_id: numericDoctorId,
                    current_pack_total: 0,
                    current_pack_used: 0,
                },
                update: {},
            });

            const lockedRows = await tx.$queryRaw<LockedSmsRow[]>`
                SELECT doctor_id, sms_service_enabled, sms_service_status, sms_credit_total, sms_credit_used, current_pack_total, current_pack_used, low_pack_alert_sent_at, exhausted_alert_sent_at
                FROM doctor_sms_service
                WHERE doctor_id = ${numericDoctorId}
                FOR UPDATE
            `;

            const lockedService = lockedRows[0];
            const currentSms = deriveDoctorSmsSnapshot(lockedService);

            if (!currentSms.enabled) {
                return {
                    httpStatus: 200,
                    body: {
                        success: false,
                        reserved: false,
                        doctorId: numericDoctorId,
                        appointmentId,
                        reason: "SERVICE_DISABLED",
                        status: SmsServiceStatus.DISABLED,
                        remainingCredits: 0,
                    },
                };
            }

            if (currentSms.remainingCredits <= 0) {
                const alertType = getDoctorSmsPackAlertType(lockedService);
                const shouldPersistExhaustedAlert = alertType === "EXHAUSTED" && hasValidPushToken;
                const alertSentAt = shouldPersistExhaustedAlert ? new Date() : null;
                await tx.doctor_sms_service.update({
                    where: { doctor_id: numericDoctorId },
                    data: {
                        sms_service_status: SmsServiceStatus.EXHAUSTED,
                        ...(alertSentAt ? { exhausted_alert_sent_at: alertSentAt } : {}),
                    },
                });

                return {
                    httpStatus: 200,
                    body: {
                        success: false,
                        reserved: false,
                        doctorId: numericDoctorId,
                        appointmentId,
                        reason: "CREDITS_EXHAUSTED",
                        status: SmsServiceStatus.EXHAUSTED,
                        remainingCredits: 0,
                    },
                    notification: alertType && hasValidPushToken && doctor.push_token
                        ? {
                            tokens: [doctor.push_token],
                            doctorId: numericDoctorId,
                            doctorName: doctor.doctor_name || "Doctor",
                            alertType,
                            remainingCredits: currentSms.remainingCredits,
                            totalCredits: currentSms.totalCredits,
                        }
                        : null,
                };
            }

            await tx.doctor_sms_usage_log.create({
                data: {
                    doctor_id: numericDoctorId,
                    appointment_id: appointmentId,
                    credits_used: 1,
                },
            });

            const nextUsed = currentSms.usedCredits + 1;
            const nextLifetimeUsed = Math.max(0, Number(lockedService?.sms_credit_used ?? 0) + 1);
            const nextSnapshot = deriveDoctorSmsSnapshot({
                sms_service_enabled: true,
                sms_credit_total: lockedService?.sms_credit_total,
                sms_credit_used: nextLifetimeUsed,
                current_pack_total: lockedService?.current_pack_total,
                current_pack_used: nextUsed,
            });
            const alertType = getDoctorSmsPackAlertType({
                ...lockedService,
                sms_service_enabled: true,
                sms_credit_used: nextLifetimeUsed,
                current_pack_used: nextUsed,
            });
            const shouldPersistAlert = Boolean(alertType && hasValidPushToken);
            const alertSentAt = shouldPersistAlert ? new Date() : null;

            await tx.doctor_sms_service.update({
                where: { doctor_id: numericDoctorId },
                data: {
                    sms_credit_used: nextLifetimeUsed,
                    current_pack_used: nextUsed,
                    sms_service_status: nextSnapshot.status,
                    ...(alertType === "LOW_PACK" && alertSentAt
                        ? { low_pack_alert_sent_at: alertSentAt }
                        : {}),
                    ...(alertType === "EXHAUSTED" && alertSentAt
                        ? { exhausted_alert_sent_at: alertSentAt }
                        : {}),
                },
            });

            return {
                httpStatus: 200,
                body: {
                    success: true,
                    reserved: true,
                    doctorId: numericDoctorId,
                    appointmentId,
                    status: nextSnapshot.status,
                    remainingCredits: nextSnapshot.remainingCredits,
                },
                notification: alertType && hasValidPushToken && doctor.push_token
                    ? {
                        tokens: [doctor.push_token],
                        doctorId: numericDoctorId,
                        doctorName: doctor.doctor_name || "Doctor",
                        alertType,
                        remainingCredits: nextSnapshot.remainingCredits,
                        totalCredits: nextSnapshot.totalCredits,
                    }
                    : null,
            };
        });

        if (result.notification) {
            const notification = result.notification;
            void (async () => {
                try {
                    const responses = await sendDoctorSmsPackPushNotification(notification);
                    if (responses.length === 0) {
                        await prisma.doctor_sms_service.update({
                            where: { doctor_id: notification.doctorId },
                            data: notification.alertType === "LOW_PACK"
                                ? { low_pack_alert_sent_at: null }
                                : { exhausted_alert_sent_at: null },
                        });
                    }
                } catch (error) {
                    console.error("Failed to send doctor SMS pack push notification:", error);
                    await prisma.doctor_sms_service.update({
                        where: { doctor_id: notification.doctorId },
                        data: notification.alertType === "LOW_PACK"
                            ? { low_pack_alert_sent_at: null }
                            : { exhausted_alert_sent_at: null },
                    }).catch((resetError) => {
                        console.error("Failed to reset doctor SMS pack alert timestamp after push failure:", resetError);
                    });
                }
            })();
        }

        return NextResponse.json(result.body, { status: result.httpStatus });
    } catch (error) {
        if (isMissingPrismaTable(error, "doctor_sms_service")) {
            return NextResponse.json({
                success: false,
                reserved: false,
                reason: "SMS_SERVICE_UNAVAILABLE",
            }, { status: 200 });
        }
        console.error("Internal SMS consume POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
