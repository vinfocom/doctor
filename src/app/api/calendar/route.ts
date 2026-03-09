export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function GET(req: Request) {
    try {
        // Auth — accept cookie or Authorization: Bearer token
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;
        if (!token) {
            const authHeader = req.headers.get("Authorization");
            if (authHeader?.startsWith("Bearer ")) token = authHeader.split(" ")[1];
        }
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const session = await verifyToken(token);
        if (!session || session.role !== "DOCTOR") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const doctor = await prisma.doctors.findFirst({ where: { user_id: session.userId } });
        if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

        const { searchParams } = new URL(req.url);
        const now = new Date();
        const year = parseInt(searchParams.get("year") || String(now.getUTCFullYear()));
        const month = parseInt(searchParams.get("month") || String(now.getUTCMonth() + 1));

        // UTC midnight boundaries for the whole month
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 1)); // exclusive

        // Appointments for this doctor in the month (non-cancelled)
        const appointments = await prisma.appointment.findMany({
            where: {
                doctor_id: doctor.doctor_id,
                appointment_date: { gte: monthStart, lt: monthEnd },
                status: { not: "CANCELLED" },
            },
            select: {
                appointment_id: true,
                appointment_date: true,
                status: true,
                start_time: true,
                patient: {
                    select: {
                        patient_id: true,
                        full_name: true,
                        phone: true,
                        booking_id: true,
                    },
                },
                clinic: { select: { clinic_name: true } },
            },
        });

        // Doctor leaves for the month
        const leaves = await prisma.doctor_leaves.findMany({
            where: {
                doctor_id: doctor.doctor_id,
                leave_date: { gte: monthStart, lt: monthEnd },
            },
            select: { leave_date: true, reason: true },
        });

        // Group appointments by YYYY-MM-DD date key
        const dayMap: Record<string, {
            date: string; total: number; arrived: number; upcoming: number; appointments: any[];
        }> = {};

        for (const apt of appointments) {
            if (!apt.appointment_date) continue;
            const dateKey = new Date(apt.appointment_date).toISOString().slice(0, 10);
            if (!dayMap[dateKey]) {
                dayMap[dateKey] = { date: dateKey, total: 0, arrived: 0, upcoming: 0, appointments: [] };
            }
            dayMap[dateKey].total += 1;
            if (apt.status === "COMPLETED") {
                dayMap[dateKey].arrived += 1;
            } else {
                dayMap[dateKey].upcoming += 1;
            }

            // Format start_time for display
            let startDisplay = "";
            if (apt.start_time) {
                const t = new Date(apt.start_time as unknown as string);
                const h = t.getUTCHours(), m2 = t.getUTCMinutes();
                const ampm = h >= 12 ? "PM" : "AM";
                startDisplay = `${h % 12 || 12}:${String(m2).padStart(2, "0")} ${ampm}`;
            }

            dayMap[dateKey].appointments.push({
                appointment_id: apt.appointment_id,
                status: apt.status,
                start_time_display: startDisplay,
                patient_name: apt.patient?.full_name || "Unknown",
                patient_phone: apt.patient?.phone || "",
                booking_id: apt.patient?.booking_id,
                clinic_name: apt.clinic?.clinic_name || "",
            });
        }

        // Sort each day's list by start time string
        for (const day of Object.values(dayMap)) {
            day.appointments.sort((a, b) => a.start_time_display.localeCompare(b.start_time_display));
        }

        const leaveDays = leaves.map(l => ({
            date: new Date(l.leave_date).toISOString().slice(0, 10),
            reason: l.reason || "",
        }));

        return NextResponse.json({ year, month, days: dayMap, leaves: leaveDays });
    } catch (error) {
        console.error("Calendar API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
