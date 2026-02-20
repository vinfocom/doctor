export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN" && session.role !== "DOCTOR")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        let where = {};

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true }
            });
            if (doctor) {
                where = { doctor_id: doctor.doctor_id };
            } else {
                // Should not happen if token is valid but data integrity...
                return NextResponse.json({ patients: [] });
            }
        } else if (session.role === "ADMIN") {
            // Find admin record for this user
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
            });
            if (admin) {
                where = { admin_id: admin.admin_id };
            }
        }

        const patients = await prisma.patients.findMany({
            where,
            orderBy: { patient_id: 'desc' }
        });

        return NextResponse.json({ patients });
    } catch (error) {
        console.error("Get patients error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN" && session.role !== "DOCTOR")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { full_name, age, gender, phone, reason, mode, patient_type } = body;

        let admin_id: number | null = null;
        let doctor_id: number | null = null;

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true, admin_id: true }
            });
            if (doctor) {
                doctor_id = doctor.doctor_id;
                admin_id = doctor.admin_id;
            }
        } else if (session.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
                select: { admin_id: true }
            });
            if (admin) admin_id = admin.admin_id;
        }

        if (!admin_id) {
            return NextResponse.json({ error: "Admin context required" }, { status: 400 });
        }

        const patient = await prisma.patients.create({
            data: {
                full_name,
                age: Number(age),
                gender,
                phone,
                reason,
                patient_type,
                admin_id,
                doctor_id
            }
        });

        return NextResponse.json({ success: true, patient }, { status: 201 });

    } catch (error) {
        console.error("Create patient error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
