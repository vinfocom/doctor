import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const schedules = await prisma.doctor_clinic_schedule.findMany();
        return NextResponse.json({ schedules });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
