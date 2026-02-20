import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    let doctorId = searchParams.get("doctorId");
    const clinicId = searchParams.get("clinicId");

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
        let adminIdFilter: number | undefined = undefined;

        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({ where: { user_id: user.userId } });
            if (doctor) doctorId = String(doctor.doctor_id);
        } else if (user.role === 'ADMIN') {
            const admin = await prisma.admins.findUnique({ where: { user_id: user.userId } });
            if (admin) adminIdFilter = admin.admin_id;
        }

        const where: any = {};
        if (doctorId) where.doctor_id = Number(doctorId);
        if (clinicId) where.clinic_id = Number(clinicId);
        if (adminIdFilter) where.admin_id = adminIdFilter;

        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where,
            include: {
                clinic: {
                    select: { clinic_name: true }
                }
            }
        });

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error("Error fetching schedules:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
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
        const body = await req.json();
        const { clinicId, doctorId, schedules } = body;

        // Verify doctorId/adminId based on user role if needed
        // Assuming the ID passed is correct for now, or validated by frontend context

        if (!Array.isArray(schedules)) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        const results = [];
        for (const s of schedules) {
            let scheduleData: any = {
                doctor_id: Number(doctorId),
                clinic_id: Number(clinicId),
                day_of_week: s.day_of_week,
                start_time: s.start_time,
                end_time: s.end_time,
                slot_duration: s.slot_duration,
                effective_to: new Date(s.effective_to),
                // effective_from? default to now if creating
            };

            // If we need admin_id, we should fetch it.
            // Let's get it from doctor record
            const doctor = await prisma.doctors.findUnique({
                where: { doctor_id: Number(doctorId) },
                select: { admin_id: true }
            });

            if (doctor) {
                scheduleData.admin_id = doctor.admin_id;
            }

            if (s.schedule_id) {
                // Update
                const updated = await prisma.doctor_clinic_schedule.update({
                    where: { schedule_id: Number(s.schedule_id) },
                    data: scheduleData
                });
                results.push(updated);
            } else {
                // Create
                scheduleData.effective_from = new Date();
                const created = await prisma.doctor_clinic_schedule.create({
                    data: scheduleData
                });
                results.push(created);
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error("Error saving schedules:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get("scheduleId");

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

    if (!scheduleId) {
        return NextResponse.json({ error: "Schedule ID required" }, { status: 400 });
    }

    try {
        await prisma.doctor_clinic_schedule.delete({
            where: { schedule_id: Number(scheduleId) }
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting schedule:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
