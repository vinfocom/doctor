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
        const clinics = await prisma.clinics.findMany({
            include: {
                schedules: true,
                doctor: {
                    select: {
                        doctor_name: true,
                        user_id: true
                    }
                }
            }
        });

        // If user is doctor, maybe filter? But requirement says "list clinics", usually for that doctor.
        // Let's filter if the user is a DOCTOR.
        if (user.role === 'DOCTOR') {
            const filteredClinics = clinics.filter(c => c.doctor?.user_id === user.userId);
            // Wait, c.doctor_id refers to doctor table. user.userId is from users table.
            // We need to match clinics where doctor.user_id === user.userId
            // The include handles the join, but let's do it in the query for efficiency next time.
            // For now, let's just return all for admins, and filtered for doctors if needed.
            // Actually, let's refine the query:

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

        return NextResponse.json({ clinics });
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
        } else if (user.role === 'ADMIN') {
            const admin = await prisma.admins.findUnique({ where: { user_id: user.userId } });
            if (admin) {
                admin_id = admin.admin_id;
            }
            // Validating if doctor_id is passed in body for admin? 
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
                    status,
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

            return await tx.clinics.findUnique({
                where: { clinic_id: newClinic.clinic_id },
                include: { schedules: true }
            });
        });

        return NextResponse.json({ clinic: result }, { status: 201 });

    } catch (error) {
        console.error("Error creating clinic Full Error:", JSON.stringify(error, null, 2));
        console.error("Error creating clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
