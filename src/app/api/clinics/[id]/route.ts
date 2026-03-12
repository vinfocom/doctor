import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

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

        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const updatedClinic = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinics.update({
                where: { clinic_id: clinicId },
                data: {
                    ...(clinic_name !== undefined && { clinic_name }),
                    ...(location !== undefined && { location }),
                    ...(phone !== undefined && { phone }),
                    ...(status !== undefined && { status }),
                },
            });

            // If schedule is provided, replace existing schedules for this clinic
            if (schedule && Array.isArray(schedule)) {
                await tx.doctor_clinic_schedule.deleteMany({
                    where: { clinic_id: clinicId }
                });

                if (schedule.length > 0) {
                    const scheduleData = schedule.map((s: any) => ({
                        doctor_id: existingClinic.doctor_id,
                        clinic_id: clinicId,
                        admin_id: existingClinic.admin_id,
                        day_of_week: s.day_of_week,
                        start_time: s.start_time,
                        end_time: s.end_time,
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
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

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

        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const doctorId = existingClinic.doctor_id;

        await prisma.$transaction(async (tx) => {
            await tx.clinics.delete({
                where: { clinic_id: clinicId },
            });

            // Sync num_clinics on doctor after deletion
            if (doctorId) {
                const count = await tx.clinics.count({ where: { doctor_id: doctorId } });
                await tx.doctors.update({
                    where: { doctor_id: doctorId },
                    data: { num_clinics: count }
                });
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
