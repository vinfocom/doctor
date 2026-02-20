import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const doctors = await prisma.doctors.findMany({ include: { user: true } });
        const appointments = await prisma.appointment.findMany();

        return NextResponse.json({
            doctors: doctors.map((d: any) => ({
                doctor_id: d.doctor_id,
                name: d.doctor_name,
                email: d.user?.email,
                user_id: d.user_id,
                role: d.user?.role
            })),
            appointments: appointments.map((a: any) => ({
                id: a.appointment_id,
                doctor_id: a.doctor_id,
                patient_id: a.patient_id,
                date: a.appointment_date,
                status: a.status
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
