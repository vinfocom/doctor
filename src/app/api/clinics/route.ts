import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

async function attachClinicQrStorageUrls<T extends { clinic_id: number }>(clinics: T[]) {
    if (clinics.length === 0) return clinics;

    const clinicIds = clinics
        .map((clinic) => Number(clinic.clinic_id))
        .filter((value) => Number.isFinite(value));

    if (clinicIds.length === 0) return clinics;

    const rows = await prisma.$queryRawUnsafe<Array<{ clinic_id: number; qr_storage_url: string | null }>>(
        `SELECT clinic_id, qr_storage_url FROM clinics WHERE clinic_id IN (${clinicIds.join(",")})`
    );

    const urlMap = new Map(rows.map((row) => [Number(row.clinic_id), row.qr_storage_url || null]));
    return clinics.map((clinic) => ({
        ...clinic,
        qr_storage_url: urlMap.get(Number(clinic.clinic_id)) ?? null,
    }));
}

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
                return NextResponse.json({ clinics: await attachClinicQrStorageUrls(doctorClinics) });
            }
        }

        // For clinic staff, filter to their assigned clinic
        if (user.role === 'CLINIC_STAFF') {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId },
                include: { clinics: { include: { schedules: { orderBy: { day_of_week: 'asc' } } } }, doctors: { select: { doctor_id: true, doctor_name: true, profile_pic_url: true, num_clinics: true, specialization: true, status: true } } }
            });

            if (staff && staff.clinics) {
                // Attach the doctor info directly to the clinic object for consistent mapping on frontend
                const assignedClinic = {
                    ...staff.clinics,
                    doctor: staff.doctors
                };
                return NextResponse.json({
                    clinics: await attachClinicQrStorageUrls([assignedClinic]),
                    doctors: staff.doctors ? [staff.doctors] : [],
                });
            } else {
                return NextResponse.json({ clinics: [], doctors: [] });
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

        return NextResponse.json({ clinics: await attachClinicQrStorageUrls(clinics), doctors });
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
                    barcode_url: null,
                }
            });

            if (schedule && Array.isArray(schedule) && schedule.length > 0) {
                const scheduleData = schedule.map((s: { day_of_week: number | string; start_time: string; end_time: string; slot_duration: number | string }) => ({
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
