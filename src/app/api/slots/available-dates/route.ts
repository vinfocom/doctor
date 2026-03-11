export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

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
        const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const todayYear = nowIST.getUTCFullYear();
        const todayMonth = nowIST.getUTCMonth(); // 0-indexed
        const todayDay = nowIST.getUTCDate();

        // Start date — either fromDate param or today
        let startDate: Date;
        if (fromDateStr) {
            const [y, m, d] = fromDateStr.split("-").map(Number);
            startDate = new Date(y, m - 1, d);
        } else {
            startDate = new Date(todayYear, todayMonth, todayDay);
        }

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + days);

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
                    gte: new Date(`${formatDate(startDate)}T00:00:00.000Z`),
                    lte: new Date(`${formatDate(endDate)}T00:00:00.000Z`),
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
                fullDayLeaves.add(
                    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
                );
            }
        }

        // 3. Loop through each day in range and check if any schedule covers it
        const availableDates: string[] = [];
        const cursor = new Date(startDate);

        while (cursor < endDate) {
            const dateStr = formatDate(cursor);
            const dow = cursor.getDay(); // 0=Sun ... 6=Sat

            // Skip full-day leaves
            if (!fullDayLeaves.has(dateStr)) {
                // Check if any schedule covers this date
                const hasSchedule = schedules.some((s) => {
                    if (s.day_of_week !== dow) return false;
                    const effFrom = new Date(s.effective_from);
                    const effTo = new Date(s.effective_to);
                    // Normalize to date-only comparison
                    const cursorOnly = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
                    const fromOnly = new Date(effFrom.getUTCFullYear(), effFrom.getUTCMonth(), effFrom.getUTCDate());
                    const toOnly = new Date(effTo.getUTCFullYear(), effTo.getUTCMonth(), effTo.getUTCDate());
                    return cursorOnly >= fromOnly && cursorOnly <= toOnly;
                });
                if (hasSchedule) {
                    availableDates.push(dateStr);
                }
            }

            cursor.setDate(cursor.getDate() + 1);
        }

        return NextResponse.json({ availableDates });
    } catch (err) {
        console.error("available-dates error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
