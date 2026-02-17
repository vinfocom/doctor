export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET: List doctors
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const adminId = searchParams.get("adminId");

        const where: Record<string, unknown> = {};
        if (adminId) where.admin_id = Number(adminId);

        const doctors = await prisma.doctors.findMany({
            where,
            include: {
                admin: {
                    select: {
                        admin_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                schedules: true,
            },
        });

        return NextResponse.json({ doctors });
    } catch (error) {
        console.error("Get doctors error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE: Admin can delete a doctor
export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const doctorId = searchParams.get("id");

        if (!doctorId) {
            return NextResponse.json({ error: "Doctor ID required" }, { status: 400 });
        }

        const doctor = await prisma.doctors.findUnique({
            where: { doctor_id: parseInt(doctorId) },
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
        }

        await prisma.doctors.delete({ where: { doctor_id: doctor.doctor_id } });

        return NextResponse.json({ message: "Doctor deleted successfully" });
    } catch (error) {
        console.error("Delete doctor error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
