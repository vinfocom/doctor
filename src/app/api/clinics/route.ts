import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function GET(req: Request) {
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
        // For doctors, filter to their own clinics
        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId }
            });

            if (doctor) {
                const doctorClinics = await prisma.clinics.findMany({
                    where: { doctor_id: doctor.doctor_id },
                    include: {
                        schedules: {
                            orderBy: { day_of_week: 'asc' }
                        }
                    },
                    orderBy: { clinic_name: 'asc' }
                });
                return NextResponse.json({ clinics: doctorClinics });
            }
        }

        // For admins / super_admins — return all clinics with doctor info
        const clinics = await prisma.clinics.findMany({
            include: {
                schedules: true,
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        profile_pic_url: true,
                        num_clinics: true,
                        specialization: true,
                        status: true,
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        // Also fetch all doctors for the "Add Clinic" dropdown
        const doctors = await prisma.doctors.findMany({
            select: {
                doctor_id: true,
                doctor_name: true,
                profile_pic_url: true,
                num_clinics: true,
                specialization: true,
                status: true,
            },
            orderBy: { doctor_name: 'asc' }
        });

        return NextResponse.json({ clinics, doctors });
    } catch (error) {
        console.error("Error fetching clinics:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
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
        const { clinic_name, location, phone, status, schedule } = body;

        let doctor_id: number | null = null;
        let admin_id: number | null = null;

        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({ where: { user_id: user.userId } });
            if (doctor) {
                doctor_id = doctor.doctor_id;
                admin_id = doctor.admin_id;
            }
        } else if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
            const admin = await prisma.admins.findUnique({ where: { user_id: user.userId } });
            if (admin) {
                admin_id = admin.admin_id;
            }
            if (body.doctor_id) {
                doctor_id = Number(body.doctor_id);
            }
        }

        if (!admin_id) {
            return NextResponse.json({ error: "Admin ID not found" }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const newClinic = await tx.clinics.create({
                data: {
                    clinic_name,
                    location,
                    phone,
                    status: status || "ACTIVE",
                    admin_id,
                    doctor_id,
                }
            });

            if (schedule && Array.isArray(schedule) && schedule.length > 0) {
                const scheduleData = schedule.map((s: any) => ({
                    doctor_id: doctor_id,
                    clinic_id: newClinic.clinic_id,
                    admin_id: admin_id,
                    day_of_week: Number(s.day_of_week),
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

            // Sync num_clinics on doctor — only update upward when actual exceeds defined
            if (doctor_id) {
                const count = await tx.clinics.count({ where: { doctor_id } });
                const doc = await tx.doctors.findUnique({ where: { doctor_id }, select: { num_clinics: true } });
                if (count > (doc?.num_clinics ?? 0)) {
                    await tx.doctors.update({
                        where: { doctor_id },
                        data: { num_clinics: count }
                    });
                }
            }

            return await tx.clinics.findUnique({
                where: { clinic_id: newClinic.clinic_id },
                include: { schedules: true, doctor: { select: { doctor_id: true, doctor_name: true, profile_pic_url: true, num_clinics: true, specialization: true, status: true } } }
            });
        });

        return NextResponse.json({ clinic: result }, { status: 201 });

    } catch (error) {
        console.error("Error creating clinic Full Error:", JSON.stringify(error, null, 2));
        console.error("Error creating clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
