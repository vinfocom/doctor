import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const doctorId = searchParams.get('doctorId');
        const adminId = searchParams.get('adminId');

        const where: any = {};
        if (doctorId) where.doctor_id = Number(doctorId);
        if (adminId) where.admin_id = Number(adminId);

        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                patient: true,
                doctor: true,
                clinic: true,
                slot: true
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
        let { patient_phone, patient_name, doctor_id, clinic_id, slot_id, admin_id, symptoms, slot_date, slot_time } = body;

        // Resolve IDs from session
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;
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


        // Find or create patient by phone
        let patient = await prisma.patients.findFirst({
            where: { phone: patient_phone }
        });

        if (!patient) {
            patient = await prisma.patients.create({
                data: {
                    phone: patient_phone,
                    admin_id: Number(admin_id),
                    full_name: patient_name || 'New Patient',
                    patient_type: 'NEW'
                }
            });
        }

        let finalSlotId = slot_id ? Number(slot_id) : null;

        if (!finalSlotId && slot_date && slot_time) {
            // Check if slot exists or create it
            // Parse date and time
            const dateObj = new Date(slot_date);
            const timeObj = new Date(`1970-01-01T${slot_time}`); // Adjust format as needed


            // Try to find existing slot
            let slot = await prisma.slots.findFirst({
                where: {
                    admin_id: Number(admin_id),
                    slot_date: dateObj,
                    slot_time: timeObj,
                    // We might want to link it to a schedule if we can resolve it, but for ad-hoc it's fine
                }
            });

            if (!slot) {
                slot = await prisma.slots.create({
                    data: {
                        admin_id: Number(admin_id),
                        slot_date: dateObj,
                        slot_time: timeObj,
                        slot_status: 'BOOKED',
                        // schedule_id: ... // Optional: could try to find matching schedule
                    }
                });
            } else {
                if (slot.slot_status === 'BOOKED') {
                    // Check if actually booked in appointment table to be sure?
                    // Or trust the status. For now, trust status.
                    return NextResponse.json({ error: 'Slot already booked' }, { status: 409 });
                }
                // Mark as booked
                await prisma.slots.update({
                    where: { slot_id: slot.slot_id },
                    data: { slot_status: 'BOOKED' }
                });
            }
            finalSlotId = slot.slot_id;
        }

        if (!finalSlotId) {
            return NextResponse.json({ error: 'Slot information required' }, { status: 400 });
        }


        const appointment = await prisma.appointment.create({
            data: {
                patient_id: patient.patient_id,
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                slot_id: finalSlotId,
                admin_id: Number(admin_id),
                status: 'PENDING',
                symptoms: symptoms
            }
        });

        return NextResponse.json(appointment);

    } catch (error) {
        console.error('Error creating appointment:', error);
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
        const token = cookieStore.get("token")?.value;
        if (!token || !verifyToken(token)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { appointment_id: Number(appointmentId) },
            data: { status: status }
        });

        // Also update slot status if needed?
        // If status is CANCELLED, maybe free the slot?
        // If status is COMPLETED, maybe mark slot as... used? (It's already BOOKED)

        if (status === 'CANCELLED' || status === 'REJECTED') {
            // Find the appointment to get the slot_id
            const appointment = await prisma.appointment.findUnique({
                where: { appointment_id: Number(appointmentId) },
                select: { slot_id: true }
            });

            if (appointment && appointment.slot_id) {
                await prisma.slots.update({
                    where: { slot_id: appointment.slot_id },
                    data: { slot_status: 'AVAILABLE' }
                });
            }
        }

        return NextResponse.json(updatedAppointment);
    } catch (error) {
        console.error('Error updating appointment:', error);
        return NextResponse.json(
            { error: 'Failed to update appointment' },
            { status: 500 }
        );
    }
}
