export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;

        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                doctor_id: true,
                admin_id: true,
                age: true,
                gender: true,
            },
        });

        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                patient_id: patientId,
                doctor_id: { not: null },
            },
            select: {
                doctor_id: true,
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        phone: true,
                        specialization: true,
                        profile_pic_url: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
        });

        const seen = new Set<number>();
        const doctors = [];
        for (const appt of appointments) {
            if (!appt.doctor_id || !appt.doctor || seen.has(appt.doctor_id)) continue;
            seen.add(appt.doctor_id);
            doctors.push(appt.doctor);
        }

        return NextResponse.json({ patient, doctors });
    } catch (error) {
        console.error("Patient me error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        console.log("[patient-profile] PATCH session", session);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;

        const body = await req.json();
        const { full_name, phone, age, gender, push_token } = body;
        console.log("[patient-profile] PATCH request body", {
            patientId,
            hasPushToken: push_token !== undefined,
            pushTokenPreview: push_token ? String(push_token).slice(0, 24) : null,
            keys: Object.keys(body || {}),
        });

        const updateData: Record<string, string | number | null> = {};
        if (full_name !== undefined) updateData.full_name = String(full_name).trim();
        if (phone !== undefined) updateData.phone = String(phone).trim();
        if (gender !== undefined) updateData.gender = String(gender).trim();
        if (push_token !== undefined) updateData.push_token = push_token ? String(push_token).trim() : null;
        if (age !== undefined && age !== null && age !== '') {
            const ageNum = parseInt(String(age), 10);
            if (!isNaN(ageNum) && ageNum > 0 && ageNum < 150) {
                updateData.age = ageNum;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
        }

        const updated = await prisma.patients.update({
            where: { patient_id: patientId },
            data: updateData,
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                age: true,
                gender: true,
            },
        });
        console.log("[patient-profile] PATCH updated successfully", {
            patientId,
            updatedFields: Object.keys(updateData),
        });

        return NextResponse.json({ patient: updated });
    } catch (error) {
        console.error("Patient profile update error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
