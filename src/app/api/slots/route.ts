import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clinicId = searchParams.get('clinicId');
        const date = searchParams.get('date');
        let doctorId = searchParams.get('doctorId');

        if (!clinicId || !date) {
            return NextResponse.json({ error: "Clinic ID and Date are required" }, { status: 400 });
        }

        // Auth & Doctor context
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;
        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader?.startsWith("Bearer ")) token = authHeader.split(" ")[1];
        }

        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const user = verifyToken(token);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // If doctor, auto-set doctorId
        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({ where: { user_id: user.userId }, select: { doctor_id: true } });
            if (doctor) doctorId = String(doctor.doctor_id);
        }

        // 1. Get ALL Schedules for the specific day
        const queryDate = new Date(date);
        const dayOfWeek = queryDate.getDay(); // 0-6

        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where: {
                clinic_id: Number(clinicId),
                doctor_id: doctorId ? Number(doctorId) : undefined,
                day_of_week: dayOfWeek,
            }
        });

        if (!schedules || schedules.length === 0) {
            return NextResponse.json({ slots: [] });
        }

        // 2. Fetched Booked Appointments
        const appointments = await prisma.appointment.findMany({
            where: {
                clinic_id: Number(clinicId),
                appointment_date: queryDate,
                status: {
                    in: ['PENDING', 'CONFIRMED', 'BOOKED']
                }
            },
            select: {
                start_time: true
            }
        });

        const bookedTimes = new Set(appointments.map(apt => {
            if (!apt.start_time) return '';
            const d = new Date(apt.start_time);
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
        }));

        // 3. Generate Slots
        let slots: string[] = [];
        let globalSlotDuration = 30;

        // Helper to parse time string (HH:MM:SS or HH:MM AM/PM) to Date object (UTC for calculation)
        const parseTime = (t: string) => {
            const d = new Date('1970-01-01T00:00:00Z');

            // Check for AM/PM
            const is12Hour = t.match(/AM|PM/i);

            if (is12Hour) {
                const [timePart, modifier] = t.split(' ');
                let [hours, minutes] = timePart.split(':').map(Number);
                if (hours === 12) {
                    hours = 0;
                }
                if (modifier.toUpperCase() === 'PM') {
                    hours = hours + 12;
                }
                d.setUTCHours(hours, minutes, 0, 0);
            } else {
                // Assume 24h format "14:00:00" or "14:00"
                const [hours, minutes] = t.split(':').map(Number);
                d.setUTCHours(hours, minutes, 0, 0);
            }
            return d;
        };

        const [year, month, day] = date.split('-').map(Number);
        const now = new Date();

        // Local time components for "Is Past" Logic
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

        const isToday = year === currentYear && month === currentMonth && day === currentDay;

        // Check if the requested date is strictly in the past (before today)
        const requestDate = new Date(year, month - 1, day);
        const todayDate = new Date(currentYear, currentMonth - 1, currentDay);
        const isPastDate = requestDate < todayDate;

        for (const schedule of schedules) {
            if (!schedule.start_time || !schedule.end_time) continue;

            const slotDuration = schedule.slot_duration || 30;
            globalSlotDuration = slotDuration; // Capture one of them, usually they are same for a doctor/clinic

            const start = parseTime(schedule.start_time);
            const end = parseTime(schedule.end_time);

            let current = new Date(start);

            // Loop slots
            while (current < end) {
                const timeString = current.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

                let isPast = false;

                if (isPastDate) {
                    isPast = true;
                } else if (isToday) {
                    const [h, m] = timeString.split(':').map(Number);
                    const slotTotalMinutes = h * 60 + m;

                    // If slot is earlier or equal to now (minute precision)
                    if (slotTotalMinutes <= currentTotalMinutes) {
                        isPast = true;
                    }
                }

                if (!isPast && !bookedTimes.has(timeString)) {
                    slots.push(timeString);
                }

                current.setUTCMinutes(current.getUTCMinutes() + slotDuration);
            }
        }

        // Remove duplicates (if schedules overlap slightly) and Sort
        // unique
        slots = [...new Set(slots)];
        // sort
        slots.sort();

        return NextResponse.json({ slots, slot_duration: globalSlotDuration });

    } catch (error) {
        console.error('Error calculating slots:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
