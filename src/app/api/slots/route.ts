import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';
import { formatUTCDateToISTTime, getISTDayOfWeek, getISTNowYMD, parseISTDate } from '@/lib/appointmentDateTime';
import { getDoctorFullDayLeave } from '@/lib/leaveAvailability';
import {
    getActiveDoctorWhere,
    getClinicStaffAccessBlockReason,
    hasHospitalDoctorAccess,
    resolveAssignedDoctorIds,
} from '@/lib/clinicStaffAccess';

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

        // If doctor or clinic staff, auto-set doctorId
        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({ where: { user_id: user.userId }, select: { doctor_id: true } });
            if (doctor) doctorId = String(doctor.doctor_id);
        } else if (user.role === 'CLINIC_STAFF') {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId },
                select: {
                    doctor_id: true,
                    clinic_id: true,
                    status: true,
                    valid_from: true,
                    valid_to: true,
                    clinics: {
                        select: { hospital_group_code: true },
                    },
                    doctor_access: {
                        select: { doctor_id: true },
                    },
                },
            });
            if (staff) {
                const staffBlockReason = getClinicStaffAccessBlockReason(staff);
                if (staffBlockReason) {
                    return NextResponse.json({ error: staffBlockReason }, { status: 403 });
                }
                const scopedHospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim() || null;
                const hasHospitalDoctorMappings = hasHospitalDoctorAccess(staff) && Boolean(scopedHospitalGroupCode);
                const rawAssignedDoctorIds = resolveAssignedDoctorIds(staff);
                const activeDoctors = await prisma.doctors.findMany({
                    where: {
                        doctor_id: { in: rawAssignedDoctorIds },
                        ...getActiveDoctorWhere(),
                    },
                    select: { doctor_id: true },
                });
                const assignedDoctorIds = hasHospitalDoctorMappings
                    ? activeDoctors.map((doctor) => Number(doctor.doctor_id))
                    : activeDoctors.map((doctor) => Number(doctor.doctor_id)).filter((id) => id === Number(staff.doctor_id));
                const requestedClinicId = Number(clinicId);

                if (!hasHospitalDoctorMappings && staff.clinic_id && requestedClinicId !== Number(staff.clinic_id)) {
                    return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
                }

                const selectedClinic = await prisma.clinics.findFirst({
                    where: {
                        clinic_id: requestedClinicId,
                        doctor_id: hasHospitalDoctorMappings ? { in: assignedDoctorIds } : staff.doctor_id,
                        status: "ACTIVE",
                        doctor: { is: getActiveDoctorWhere() },
                        ...(hasHospitalDoctorMappings && scopedHospitalGroupCode
                            ? { hospital_group_code: scopedHospitalGroupCode }
                            : {}),
                    },
                    select: { doctor_id: true },
                });

                if (!selectedClinic?.doctor_id) {
                    return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
                }

                doctorId = String(selectedClinic.doctor_id);
            }
        }

        // 1. Get ALL Schedules for the specific day
        const [year, month, day] = date.split('-').map(Number);
        const dayOfWeek = getISTDayOfWeek(date);
        const numericDoctorId = Number(doctorId);

        if (numericDoctorId > 0) {
            const leave = await getDoctorFullDayLeave(numericDoctorId, date);
            if (leave) {
                return NextResponse.json({
                    slots: [],
                    leaveBlocked: true,
                    leaveReason: leave.reason,
                });
            }
        }

        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where: {
                clinic_id: Number(clinicId),
                doctor_id: numericDoctorId > 0 ? numericDoctorId : undefined,
                day_of_week: dayOfWeek,
            }
        });

        console.log("=== SLOTS API DEBUG ===");
        console.log("queryDate:", date, "dayOfWeek:", dayOfWeek);
        console.log("clinicId:", clinicId, "doctorId:", doctorId);
        console.log("Found Schedules:", schedules);

        if (!schedules || schedules.length === 0) {
            return NextResponse.json({ slots: [] });
        }


        // Fetch booked appointments for that calendar day using UTC midnight boundaries
        // (MariaDB DATE columns store dates as UTC midnight when read back via Prisma)
        const [yr, mo, dy] = [year, month, day].map(n => String(n).padStart(2, '0'));
        const dateKey = `${yr}-${mo}-${dy}`;
        const apptStart = parseISTDate(dateKey);
        const apptEnd = parseISTDate(dateKey);
        apptEnd.setUTCDate(apptEnd.getUTCDate() + 1);

        const appointments = await prisma.appointment.findMany({
            where: {
                clinic_id: Number(clinicId),
                appointment_date: { gte: apptStart, lt: apptEnd },
                status: {
                    in: ['PENDING', 'CONFIRMED', 'BOOKED', 'COMPLETED']
                }
            },
            select: {
                start_time: true
            }
        });

        const bookedTimes = new Set(appointments.map(apt => {
            if (!apt.start_time) return '';
            return formatUTCDateToISTTime(apt.start_time);
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
                const [rawHours, minutes] = timePart.split(':').map(Number);
                let hours = rawHours;
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

        // Compute "now" in IST for "isToday" / past slot logic
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayYmd = getISTNowYMD();
        const currentYear = Number(todayYmd.slice(0, 4));
        const currentMonth = Number(todayYmd.slice(5, 7));
        const currentDay = Number(todayYmd.slice(8, 10));
        const currentTotalMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

        const isToday = year === currentYear && month === currentMonth && day === currentDay;

        // Check if the requested date is strictly in the past (before today)
        const requestDate = parseISTDate(dateKey);
        const todayDate = parseISTDate(todayYmd);
        const isPastDate = requestDate < todayDate;

        for (const schedule of schedules) {
            if (!schedule.start_time || !schedule.end_time) continue;

            const slotDuration = schedule.slot_duration || 30;
            globalSlotDuration = slotDuration; // Capture one of them, usually they are same for a doctor/clinic

            const start = parseTime(schedule.start_time);
            const end = parseTime(schedule.end_time);

            const current = new Date(start);

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

        console.log("Generated Final Slots:", slots);

        return NextResponse.json({ slots, slot_duration: globalSlotDuration });

    } catch (error) {
        console.error('Error calculating slots:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
