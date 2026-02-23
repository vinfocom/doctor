export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const identifier = String(body?.identifier || body?.phone || body?.telegram_chat_id || "").trim();

        if (!identifier) {
            return NextResponse.json(
                { error: "Identifier (phone or telegram_chat_id) is required" },
                { status: 400 }
            );
        }

        let patient: {
            patient_id: number;
            full_name: string | null;
            phone: string | null;
            telegram_chat_id?: string | null;
            doctor_id: number | null;
            admin_id: number;
        } | null = null;

        try {
            patient = await prisma.patients.findFirst({
                where: {
                    OR: [{ phone: identifier }, { telegram_chat_id: identifier }],
                },
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
            // Backward compatibility when running server still has an older Prisma client shape.
            patient = await prisma.patients.findFirst({
                where: { phone: identifier },
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

        const token = generateToken({
            userId: patient.patient_id,
            patientId: patient.patient_id,
            role: "PATIENT",
        });

        const response = NextResponse.json(
            {
                message: "Patient login successful",
                role: "PATIENT",
                token,
                patient,
            },
            { status: 200 }
        );

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Patient login error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
