import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deriveDoctorSmsSnapshot } from "@/lib/doctorSms";
import { isMissingPrismaTable } from "@/lib/prismaErrors";
import { authorizeSmsInternalApi } from "@/lib/internalApiAuth";

type LockedSmsRow = {
    doctor_id: number;
    sms_service_enabled: boolean;
    sms_credit_total: number;
    sms_credit_used: number;
    current_pack_total: number;
    current_pack_used: number;
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

            const usage = await tx.doctor_sms_usage_log.findFirst({
                where: {
                    appointment_id: appointmentId,
                    doctor_id: numericDoctorId,
                },
            });

            if (!usage) {
                const currentService = await tx.doctor_sms_service.findUnique({
                    where: { doctor_id: numericDoctorId },
                });
                const sms = deriveDoctorSmsSnapshot(currentService);
                return {
                    httpStatus: 200,
                    body: {
                        success: true,
                        released: false,
                        doctorId: numericDoctorId,
                        appointmentId,
                        status: sms.status,
                        remainingCredits: sms.remainingCredits,
                    },
                };
            }

            const lockedRows = await tx.$queryRaw<LockedSmsRow[]>`
                SELECT doctor_id, sms_service_enabled, sms_credit_total, sms_credit_used, current_pack_total, current_pack_used
                FROM doctor_sms_service
                WHERE doctor_id = ${numericDoctorId}
                FOR UPDATE
            `;

            const lockedService = lockedRows[0];
            const nextUsed = Math.max(0, Number(lockedService?.sms_credit_used ?? 0) - usage.credits_used);
            const nextPackUsed = Math.max(0, Number(lockedService?.current_pack_used ?? 0) - usage.credits_used);
            const nextSnapshot = deriveDoctorSmsSnapshot({
                sms_service_enabled: lockedService?.sms_service_enabled,
                sms_credit_total: lockedService?.sms_credit_total,
                sms_credit_used: nextUsed,
                current_pack_total: lockedService?.current_pack_total,
                current_pack_used: nextPackUsed,
            });

            await tx.doctor_sms_usage_log.delete({
                where: { id: usage.id },
            });

            await tx.doctor_sms_service.update({
                where: { doctor_id: numericDoctorId },
                data: {
                    sms_credit_used: nextUsed,
                    current_pack_used: nextPackUsed,
                    sms_service_status: nextSnapshot.status,
                },
            });

            return {
                httpStatus: 200,
                body: {
                    success: true,
                    released: true,
                    doctorId: numericDoctorId,
                    appointmentId,
                    status: nextSnapshot.status,
                    remainingCredits: nextSnapshot.remainingCredits,
                },
            };
        });

        return NextResponse.json(result.body, { status: result.httpStatus });
    } catch (error) {
        if (isMissingPrismaTable(error, "doctor_sms_service")) {
            return NextResponse.json({
                success: true,
                released: false,
                reason: "SMS_SERVICE_UNAVAILABLE",
            }, { status: 200 });
        }
        console.error("Internal SMS release POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
