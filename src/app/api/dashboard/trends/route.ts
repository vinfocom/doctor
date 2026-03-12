export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

function jsonSafe<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
    ) as T;
}

type Period = "daily" | "weekly" | "monthly" | "yearly";

function getBucketKey(date: Date, period: Period): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    if (period === "daily") return `${m}/${d}`;
    if (period === "weekly") {
        // ISO week label: "Wk N, YYYY"
        const start = new Date(date);
        start.setDate(date.getDate() - date.getDay()); // Sunday of that week
        const ws = String(start.getMonth() + 1).padStart(2, "0");
        const wd = String(start.getDate()).padStart(2, "0");
        return `${ws}/${wd}`;
    }
    if (period === "yearly") return `${y}`;
    return `${y}-${m}`; // monthly default
}

function getRangeStart(period: Period): Date {
    const now = new Date();
    if (period === "daily") {
        const d = new Date(now); d.setDate(now.getDate() - 30); return d;
    }
    if (period === "weekly") {
        const d = new Date(now); d.setDate(now.getDate() - 7 * 12); return d; // last 12 weeks
    }
    if (period === "monthly") {
        const d = new Date(now); d.setMonth(now.getMonth() - 12); return d; // last 12 months
    }
    // yearly — all time
    return new Date("2020-01-01T00:00:00Z");
}

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const period: Period = (searchParams.get("period") as Period) || "monthly";
        const rangeStart = getRangeStart(period);

        const [allDoctorUsers, patientsPerDoctorRaw, recentAppointments, appointmentsPerDoctorRaw, totalDoctors, totalPatients, totalAppointments] =
            await Promise.all([
                // 1. Doctors growth filtered by period range
                prisma.users.findMany({
                    where: {
                        role: "DOCTOR",
                        created_at: period === "yearly" ? undefined : { gte: rangeStart },
                    },
                    select: { created_at: true },
                    orderBy: { created_at: "asc" },
                }),

                // 2. Patients per doctor (period-independent)
                prisma.doctors.findMany({
                    select: {
                        doctor_name: true,
                        _count: { select: { patients: true } },
                    },
                    orderBy: { doctor_name: "asc" },
                }),

                // 3. Appointment trend filtered by period range
                prisma.appointment.findMany({
                    where: { created_at: { gte: rangeStart } },
                    select: { created_at: true },
                    orderBy: { created_at: "asc" },
                }),

                // 4. Appointments per doctor (period-independent)
                prisma.doctors.findMany({
                    select: {
                        doctor_name: true,
                        _count: { select: { appointments: true } },
                    },
                    orderBy: { doctor_name: "asc" },
                }),

                // 5. System distribution (period-independent totals)
                prisma.doctors.count(),
                prisma.patients.count(),
                prisma.appointment.count(),
            ]);

        // --- Process: Doctors Growth ---
        const doctorGrowthMap = new Map<string, number>();
        for (const u of allDoctorUsers) {
            if (!u.created_at) continue;
            const key = getBucketKey(new Date(u.created_at), period);
            doctorGrowthMap.set(key, (doctorGrowthMap.get(key) || 0) + 1);
        }
        const doctorsGrowth = Array.from(doctorGrowthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, count]) => ({ label, count }));

        // --- Process: Patients per Doctor ---
        const patientsPerDoctor = patientsPerDoctorRaw
            .filter((d) => d._count.patients > 0)
            .map((d) => ({
                doctor: d.doctor_name
                    ? d.doctor_name.length > 14 ? d.doctor_name.slice(0, 13) + "…" : d.doctor_name
                    : "Unknown",
                patients: d._count.patients,
            }));

        // --- Process: Appointment Trend ---
        const apptTrendMap = new Map<string, number>();
        for (const a of recentAppointments) {
            if (!a.created_at) continue;
            const key = getBucketKey(new Date(a.created_at), period);
            apptTrendMap.set(key, (apptTrendMap.get(key) || 0) + 1);
        }
        const appointmentTrend = Array.from(apptTrendMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, count]) => ({ label, count }));

        // --- Process: Appointments per Doctor ---
        const appointmentsPerDoctor = appointmentsPerDoctorRaw
            .filter((d) => d._count.appointments > 0)
            .map((d) => ({
                doctor: d.doctor_name
                    ? d.doctor_name.length > 14 ? d.doctor_name.slice(0, 13) + "…" : d.doctor_name
                    : "Unknown",
                appointments: d._count.appointments,
            }));

        // --- Process: System Distribution ---
        const systemDistribution = [
            { name: "Doctors", value: totalDoctors },
            { name: "Patients", value: totalPatients },
            { name: "Appointments", value: totalAppointments },
        ];

        return NextResponse.json(jsonSafe({
            period,
            doctorsGrowth,
            patientsPerDoctor,
            appointmentTrend,
            appointmentsPerDoctor,
            systemDistribution,
        }));
    } catch (err) {
        console.error("Trends API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
