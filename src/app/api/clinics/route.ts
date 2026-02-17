
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';

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

    try {
        let whereClause = {};

        if (user.role === "DOCTOR") {
            // Find doctor
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true, admin_id: true }
            });
            if (doctor) {
                // Strict isolation: only show clinics created by this doctor
                // OR clinics where this doctor is scheduled? 
                // The prompt says "data isolation... add doctor_id...". 
                // Implicitly, show only clinics with this doctor_id.
                whereClause = { doctor_id: doctor.doctor_id };
            } else {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }
        } else if (user.role === "ADMIN") {
            // Find admin record for this user
            const admin = await prisma.admins.findUnique({
                where: { user_id: user.userId },
                select: { admin_id: true }
            });
            if (admin) {
                whereClause = { admin_id: admin.admin_id };
            }
        }

        const clinics = await prisma.clinics.findMany({
            where: whereClause,
            include: {
                admin: {
                    select: {
                        user: {
                            select: { name: true, email: true }
                        }
                    }
                }
            }
        });
        return NextResponse.json({ clinics });
    } catch (error) {
        console.error('Error fetching clinics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch clinics' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
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
        const body = await request.json();
        const { clinic_name, phone, location } = body;
        let admin_id = body.admin_id;
        let doctor_id: number | null = null;

        // Determine admin_id and doctor_id based on role
        if (user.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true, admin_id: true }
            });
            if (!doctor) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            admin_id = doctor.admin_id;
            doctor_id = doctor.doctor_id;
        } else if (user.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: user.userId },
                select: { admin_id: true }
            });
            if (!admin) return NextResponse.json({ error: "Admin profile not found" }, { status: 404 });
            admin_id = admin.admin_id;
        } else if (user.role === "SUPER_ADMIN") {
            // If admin_id is passed, use it. If not, map to Super Admin's own admin profile if exists
            if (!admin_id) {
                const admin = await prisma.admins.findUnique({
                    where: { user_id: user.userId },
                    select: { admin_id: true }
                });
                if (admin) admin_id = admin.admin_id;
            }
        }

        if (!admin_id) {
            return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
        }

        const clinic = await prisma.clinics.create({
            data: {
                clinic_name,
                phone,
                location,
                admin_id: Number(admin_id),
                doctor_id: doctor_id, // Link to doctor if created by doctor
                status: 'ACTIVE'
            },
        });

        return NextResponse.json(clinic);
    } catch (error) {
        console.error('Error creating clinic:', error);
        return NextResponse.json(
            { error: 'Failed to create clinic' },
            { status: 500 }
        );
    }
}
