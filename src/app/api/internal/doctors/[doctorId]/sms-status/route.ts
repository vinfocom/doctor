import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toDoctorSmsPayload } from "@/lib/doctorSms";
import { isMissingPrismaTable } from "@/lib/prismaErrors";
import { authorizeSmsInternalApi } from "@/lib/internalApiAuth";

export async function GET(_req: Request, { params }: { params: Promise<{ doctorId: string }> }) {
    try {
        const auth = await authorizeSmsInternalApi(_req);
        if (!auth.authorized) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { doctorId } = await params;
        const numericDoctorId = Number(doctorId);
        if (!Number.isInteger(numericDoctorId) || numericDoctorId <= 0) {
            return NextResponse.json({ error: "Invalid doctor id" }, { status: 400 });
        }

        let doctor: any;
        try {
            doctor = await prisma.doctors.findUnique({
                where: { doctor_id: numericDoctorId },
                select: {
                    doctor_id: true,
                    doctor_name: true,
                    sms_service: true,
                },
            });
        } catch (error) {
            if (!isMissingPrismaTable(error, "doctor_sms_service")) {
                throw error;
            }

            doctor = await prisma.doctors.findUnique({
                where: { doctor_id: numericDoctorId },
                select: {
                    doctor_id: true,
                    doctor_name: true,
                },
            });
        }

        if (!doctor) {
            return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
        }

        const sms = toDoctorSmsPayload(doctor.sms_service);
        return NextResponse.json({
            doctorId: doctor.doctor_id,
            doctorName: doctor.doctor_name,
            smsServiceEnabled: sms.enabled,
            status: sms.status,
            totalCredits: sms.totalCredits,
            usedCredits: sms.usedCredits,
            remainingCredits: sms.remainingCredits,
            displayText: sms.displayText,
            canSendSms: sms.enabled && sms.status === "ACTIVE" && sms.remainingCredits > 0,
        });
    } catch (error) {
        console.error("Internal SMS status GET error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
