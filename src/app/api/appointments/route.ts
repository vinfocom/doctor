import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
        const { patient_phone, doctor_id, clinic_id, slot_id, admin_id, notes } = body;

        // Find or create patient by phone
        let patient = await prisma.patients.findFirst({
            where: { phone: patient_phone }
        });

        if (!patient) {
            // Ideally we need more info, but for now create a placeholder
            patient = await prisma.patients.create({
                data: {
                    phone: patient_phone,
                    admin_id: Number(admin_id),
                    full_name: 'New Patient', // Placeholder
                    patient_type: 'NEW'
                }
            });
        }


        const appointment = await prisma.appointment.create({
            data: {
                patient_id: patient.patient_id,
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                slot_id: Number(slot_id),
                admin_id: Number(admin_id),
                status: 'PENDING',
                // notes: notes // notes not in schema currently but maybe inferred? 
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
