import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        let doctorId = searchParams.get('doctorId');
        let adminId = searchParams.get('adminId');
        let clinicId = searchParams.get('clinicId');
        let date = searchParams.get('date');

        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
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

        // Automatic role-based filtering
        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true }
            });
            if (doctor) {
                doctorId = String(doctor.doctor_id);
            } else {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }
        } else if (user.role === 'ADMIN') {
            const admin = await prisma.admins.findUnique({
                where: { user_id: user.userId },
                select: { admin_id: true }
            });
            if (admin) {
                adminId = String(admin.admin_id);
            }
        }

        const where: any = {};
        if (doctorId) where.doctor_id = Number(doctorId);
        if (adminId) where.admin_id = Number(adminId);
        if (clinicId) where.clinic_id = Number(clinicId);
        if (date) {
            where.appointment_date = new Date(date);
        }

        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                patient: true,
                doctor: true,
                clinic: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });


        return NextResponse.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch appointments' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        let { patient_phone, patient_name, doctor_id, clinic_id, admin_id, appointment_date, start_time, end_time } = body;

        // Resolve IDs from session
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }
        if (token) {
            const user = verifyToken(token);
            if (user) {
                if (user.role === 'DOCTOR') {
                    // Fetch doctor details to get admin_id and doctor_id
                    const doctor = await prisma.doctors.findUnique({
                        where: { user_id: user.userId },
                        select: { doctor_id: true, admin_id: true }
                    });
                    if (doctor) {
                        doctor_id = doctor.doctor_id;
                        admin_id = doctor.admin_id;
                    }
                } else if (user.role === 'ADMIN') {
                    const admin = await prisma.admins.findUnique({
                        where: { user_id: user.userId },
                        select: { admin_id: true }
                    });
                    if (admin) {
                        admin_id = admin.admin_id;
                    }
                }
            }
        }

        if (!admin_id) {
            return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
        }


        if (!appointment_date || !start_time || !end_time) {
            return NextResponse.json({ error: 'Date and time required' }, { status: 400 });
        }

        // Construct Date objects
        const dateObj = new Date(appointment_date);
        const startTimeObj = new Date(`1970-01-01T${start_time}:00Z`);
        const endTimeObj = new Date(`1970-01-01T${end_time}:00Z`);

        const existingAppointmentsCount = await prisma.appointment.count({
            where: {
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                appointment_date: dateObj
            }
        });
        const booking_id = existingAppointmentsCount + 1;

        // Find or create patient by phone
        let patient = await prisma.patients.findFirst({
            where: { phone: patient_phone }
        });

        if (!patient) {
            patient = await prisma.patients.create({
                data: {
                    phone: patient_phone,
                    admin_id: Number(admin_id),
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id,
                    full_name: patient_name || 'New Patient',
                }
            });
        } else {
            // Update existing patient with current doctor and booking id
            patient = await prisma.patients.update({
                where: { patient_id: patient.patient_id },
                data: {
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id
                }
            });
        }

        const appointment = await prisma.appointment.create({
            data: {
                patient_id: patient.patient_id,
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                admin_id: Number(admin_id),
                status: 'PENDING',
                appointment_date: dateObj,
                start_time: startTimeObj,
                end_time: endTimeObj
            }
        });

        return NextResponse.json(appointment);

    } catch (error: any) {
        console.error('Error creating appointment:', error);
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Slot already booked' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to create appointment' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const appointmentId = searchParams.get("appointmentId");

        if (!appointmentId) {
            return NextResponse.json({ error: "Appointment ID required" }, { status: 400 });
        }

        await prisma.appointment.delete({
            where: { appointment_id: Number(appointmentId) }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        return NextResponse.json(
            { error: 'Failed to delete appointment' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { appointmentId, status } = body;

        if (!appointmentId || !status) {
            return NextResponse.json({ error: "Appointment ID and status required" }, { status: 400 });
        }

        // Ideally verify user has permission (Doctor/Admin)
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }
        if (!token || !verifyToken(token)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { appointment_id: Number(appointmentId) },
            data: { status: status }
        });

        return NextResponse.json(updatedAppointment);
    } catch (error) {
        console.error('Error updating appointment:', error);
        return NextResponse.json(
            { error: 'Failed to update appointment' },
            { status: 500 }
        );
    }
}
