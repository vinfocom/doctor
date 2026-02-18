import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function GET(req: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");
    const doctorId = searchParams.get("doctorId");

    try {
        const whereClause: Record<string, unknown> = {};

        if (doctorId) {
            whereClause.doctor_id = parseInt(doctorId);
        }
        if (clinicId) {
            whereClause.clinic_id = parseInt(clinicId);
        }

        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where: whereClause,
            orderBy: { day_of_week: 'asc' },
            include: {
                doctor: true,
                clinic: true,
            },
        });

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error("Error fetching schedule:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
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
        const { schedules, clinicId, doctorId } = await req.json();

        if (!Array.isArray(schedules)) {
            return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
        }

        if (!doctorId) {
            return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
        }

        // Helper to convert HH:mm to Date for comparison (using 1970-01-01 UTC)
        const toDate = (timeStr: string) => {
            return new Date(`1970-01-01T${timeStr}:00Z`);
        };

        // Process sequentially
        for (const schedule of schedules) {
            const start = toDate(schedule.start_time);
            const end = toDate(schedule.end_time);

            // 1. Basic Time Validation
            if (start >= end) {
                return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 });
            }

            // 2. Overlap Validation
            const whereClause: any = {
                doctor_id: parseInt(doctorId),
                day_of_week: Number(schedule.day_of_week),
                // We want to check against ALL clinics for this doctor on this day
                // The user said: "doctor can not make same schedule on different place or can not repeat it"
            };

            // If updating, exclude self
            if (schedule.schedule_id) {
                whereClause.schedule_id = { not: schedule.schedule_id };
            }

            const existingSchedules = await prisma.doctor_clinic_schedule.findMany({
                where: whereClause
            });

            const hasOverlap = existingSchedules.some(existing => {
                if (!existing.start_time || !existing.end_time) return false;

                // Create Date objects for existing times on the same arbitrary reference date (1970-01-01 UTC)
                const existingStart = new Date(0);
                existingStart.setUTCHours(existing.start_time.getUTCHours(), existing.start_time.getUTCMinutes(), 0, 0);

                const existingEnd = new Date(0);
                existingEnd.setUTCHours(existing.end_time.getUTCHours(), existing.end_time.getUTCMinutes(), 0, 0);

                // Overlap condition: (StartA < EndB) and (EndA > StartB)
                return (start < existingEnd && end > existingStart);
            });

            if (hasOverlap) {
                const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.day_of_week];
                return NextResponse.json({
                    error: `Schedule overlaps with an existing slot on ${dayName} (${schedule.start_time} - ${schedule.end_time})`
                }, { status: 409 });
            }

            // 3. Create or Update
            const effectiveFrom = schedule.effective_from ? new Date(schedule.effective_from) : new Date();
            const effectiveTo = schedule.effective_to ? new Date(schedule.effective_to) : new Date(new Date().setFullYear(new Date().getFullYear() + 1));

            if (schedule.schedule_id) {
                // Update
                await prisma.doctor_clinic_schedule.update({
                    where: { schedule_id: schedule.schedule_id },
                    data: {
                        clinic_id: clinicId ? parseInt(clinicId) : undefined,
                        day_of_week: Number(schedule.day_of_week),
                        start_time: start,
                        end_time: end,
                        slot_duration: schedule.slot_duration || 30,
                        effective_from: effectiveFrom,
                        effective_to: effectiveTo,
                    }
                });
            } else {
                // Create
                await prisma.doctor_clinic_schedule.create({
                    data: {
                        doctor_id: parseInt(doctorId),
                        clinic_id: clinicId ? parseInt(clinicId) : null,
                        day_of_week: Number(schedule.day_of_week),
                        start_time: start,
                        end_time: end,
                        slot_duration: schedule.slot_duration || 30,
                        effective_from: effectiveFrom,
                        effective_to: effectiveTo,
                    }
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating schedule:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const scheduleId = searchParams.get("scheduleId");

        if (!scheduleId) {
            return NextResponse.json({ error: "Schedule ID required" }, { status: 400 });
        }

        await prisma.doctor_clinic_schedule.delete({
            where: { schedule_id: Number(scheduleId) }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting schedule:", error);
        return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
    }
}
