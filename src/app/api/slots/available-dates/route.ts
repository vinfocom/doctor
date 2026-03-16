export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { formatDateToISTYMD, getISTDateParts, getISTDayOfWeek, parseISTDate } from "@/lib/appointmentDateTime";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const doctorId = searchParams.get("doctorId");
        const clinicId = searchParams.get("clinicId");
        const fromDateStr = searchParams.get("fromDate"); // optional, default today
        const daysParam = searchParams.get("days");       // optional, default 60

        if (!doctorId || !clinicId) {
            return NextResponse.json({ error: "doctorId and clinicId are required" }, { status: 400 });
        }

        const days = Math.min(Number(daysParam) || 60, 120); // cap at 120 days

        // Build "today" in IST
        const today = getISTDateParts(new Date());

        // Start date — either fromDate param or today
        let startDate: Date;
        if (fromDateStr) {
            startDate = parseISTDate(fromDateStr);
        } else {
            startDate = parseISTDate(`${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`);
        }

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + days);

        // 1. Fetch all schedules for this doctor+clinic combination
        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where: {
                doctor_id: Number(doctorId),
                clinic_id: Number(clinicId),
            },
            select: {
                day_of_week: true,
                effective_from: true,
                effective_to: true,
            },
        });

        if (!schedules.length) {
            return NextResponse.json({ availableDates: [] });
        }

        // 2. Fetch all doctor leaves in the date range
        const leaves = await prisma.doctor_leaves.findMany({
            where: {
                doctor_id: Number(doctorId),
                leave_date: {
                    gte: parseISTDate(formatDate(startDate)),
                    lte: parseISTDate(formatDate(endDate)),
                },
            },
            select: {
                leave_date: true,
                start_time: true,
                end_time: true,
            },
        });

        // Build a set of full-day leave date strings (YYYY-MM-DD)
        // A leave without start/end time means full day
        const fullDayLeaves = new Set<string>();
        for (const leave of leaves) {
            if (!leave.start_time && !leave.end_time) {
                const d = new Date(leave.leave_date);
                fullDayLeaves.add(formatDateToISTYMD(d));
            }
        }

        // 3. Loop through each day in range and check if any schedule covers it
        const availableDates: string[] = [];
        const cursor = new Date(startDate);

        while (cursor < endDate) {
            const dateStr = formatDate(cursor);
            const dow = getISTDayOfWeek(dateStr);

            // Skip full-day leaves
            if (!fullDayLeaves.has(dateStr)) {
                // Check if any schedule covers this date
                const hasSchedule = schedules.some((s) => {
                    if (s.day_of_week !== dow) return false;
                    const effFrom = new Date(s.effective_from);
                    const effTo = new Date(s.effective_to);
                    // Normalize to date-only comparison
                    const cursorOnly = parseISTDate(dateStr);
                    const fromOnly = parseISTDate(formatDateToISTYMD(effFrom));
                    const toOnly = parseISTDate(formatDateToISTYMD(effTo));
                    return cursorOnly >= fromOnly && cursorOnly <= toOnly;
                });
                if (hasSchedule) {
                    availableDates.push(dateStr);
                }
            }

            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return NextResponse.json({ availableDates });
    } catch (err) {
        console.error("available-dates error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

function formatDate(d: Date): string {
    return formatDateToISTYMD(d);
}
