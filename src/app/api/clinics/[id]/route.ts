import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const clinicId = parseInt(id);
        const { clinic_name, location, phone, status, schedule } = await req.json();

        // Verify clinic exists
        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        // Use transaction to update clinic and schedules
        const updatedClinic = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinics.update({
                where: { clinic_id: clinicId },
                data: {
                    clinic_name,
                    location,
                    phone,
                    status,
                },
            });

            // If schedule is provided, replace existing schedules for this clinic
            if (schedule && Array.isArray(schedule)) {
                // Delete existing schedules for this clinic
                await tx.doctor_clinic_schedule.deleteMany({
                    where: { clinic_id: clinicId }
                });

                if (schedule.length > 0) {
                    // Start from fresh, so we need doctor_id and admin_id
                    // We can reuse the ones from existingClinic or fetch from user context if critical
                    // existingClinic has admin_id and doctor_id.

                    const scheduleData = schedule.map((s: any) => ({
                        doctor_id: existingClinic.doctor_id,
                        clinic_id: clinicId,
                        admin_id: existingClinic.admin_id,
                        day_of_week: s.day_of_week,
                        start_time: new Date(`1970-01-01T${s.start_time}:00Z`),
                        end_time: new Date(`1970-01-01T${s.end_time}:00Z`),
                        slot_duration: Number(s.slot_duration),
                        effective_from: new Date(),
                        effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                    }));

                    await tx.doctor_clinic_schedule.createMany({
                        data: scheduleData
                    });
                }
            }

            return clinic;
        });

        return NextResponse.json({ clinic: updatedClinic });
    } catch (error) {
        console.error("Error updating clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const clinicId = parseInt(id);

        // Verify clinic exists
        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        await prisma.clinics.delete({
            where: { clinic_id: clinicId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
