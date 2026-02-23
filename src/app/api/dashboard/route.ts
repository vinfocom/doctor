export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET: Dashboard stats
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (session.role === "SUPER_ADMIN" || session.role === "ADMIN") {
            // Find admin record for this user
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
            });

            const adminFilter = admin ? { admin_id: admin.admin_id } : {};

            const [totalDoctors, totalPatients, totalAppointments, recentAppointments, pendingAppointments, completedAppointments] =
                await Promise.all([
                    prisma.doctors.count({ where: adminFilter }),
                    prisma.patients.count({ where: adminFilter }),
                    prisma.appointment.count({ where: adminFilter }),
                    prisma.appointment.findMany({
                        take: 10,
                        where: adminFilter,
                        orderBy: { created_at: "desc" },
                        include: {
                            patient: true,
                            doctor: true,
                            clinic: true,
                        },
                    }),
                    prisma.appointment.count({ where: { ...adminFilter, status: "PENDING" } }),
                    prisma.appointment.count({ where: { ...adminFilter, status: "COMPLETED" } }),
                ]);

            return NextResponse.json({
                stats: {
                    totalDoctors,
                    totalPatients,
                    totalAppointments,
                    pendingAppointments,
                    completedAppointments,
                },
                recentAppointments,
            });
        }

        if (session.role === "DOCTOR") {
            
            const doctor = await prisma.doctors.findFirst({
                where: { phone: session.email }, // fallback approach
            });

            if (!doctor) {
                return NextResponse.json({
                    stats: { totalAppointments: 0, pendingAppointments: 0 },
                    recentAppointments: [],
                });
            }

            const [totalAppointments, pendingAppointments, recentAppointments] =
                await Promise.all([
                    prisma.appointment.count({ where: { doctor_id: doctor.doctor_id } }),
                    prisma.appointment.count({
                        where: { doctor_id: doctor.doctor_id, status: "PENDING" },
                    }),
                    prisma.appointment.findMany({
                        where: { doctor_id: doctor.doctor_id },
                        take: 10,
                        orderBy: { created_at: "desc" },
                        include: {
                            patient: true,
                            clinic: true,
                        },
                    }),
                ]);

            return NextResponse.json({
                stats: {
                    totalAppointments,
                    pendingAppointments,
                },
                recentAppointments,
            });
        }

        return NextResponse.json({ error: "Invalid role" }, { status: 403 });
    } catch (error) {
        console.error("Dashboard error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
