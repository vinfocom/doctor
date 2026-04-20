import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { attachBookingIds } from "@/lib/bookingId";
import { formatDateToISTYMD, formatUTCDateToISTTime, getISTDayOfWeek, getISTNowYMD } from "@/lib/appointmentDateTime";

type AppointmentWithRelations = {
    appointment_id: number;
    booking_id?: number | null;
    status: string | null;
    appointment_date: Date | string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    patient: {
        patient_id: number;
        full_name: string | null;
    } | null;
    clinic: {
        clinic_id: number;
        clinic_name: string | null;
    } | null;
    doctor: {
        doctor_id: number;
        doctor_name: string | null;
        education: string | null;
        specialization: string | null;
    } | null;
};

type ScheduleWindow = {
    schedule_id: number;
    doctor_id: number | null;
    clinic_id: number | null;
    day_of_week: number;
    start_time: string | null;
    end_time: string | null;
    slot_duration: number | null;
    effective_from: Date;
    effective_to: Date;
};

const IST_TIMEZONE = "Asia/Kolkata";
const SCHEDULE_DISPLAY_LEAD_MINUTES = 60;

function normalizeScheduleTime(value?: string | null) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (amPmMatch) {
        let hours = Number(amPmMatch[1]) % 12;
        const minutes = Number(amPmMatch[2]);
        if (amPmMatch[3].toUpperCase() === "PM") hours += 12;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (twentyFourHour) {
        const hours = Number(twentyFourHour[1]);
        const minutes = Number(twentyFourHour[2]);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    return raw.slice(0, 5);
}

function timeToMinutes(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function getNowMinutesInIST(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: IST_TIMEZONE,
    }).formatToParts(date);

    const hours = Number(parts.find((part) => part.type === "hour")?.value || "0");
    const minutes = Number(parts.find((part) => part.type === "minute")?.value || "0");

    return hours * 60 + minutes;
}

function isScheduleValidForDate(schedule: ScheduleWindow, dateYmd: string) {
    const effectiveFrom = formatDateToISTYMD(schedule.effective_from);
    const effectiveTo = formatDateToISTYMD(schedule.effective_to);
    if (!effectiveFrom || !effectiveTo) return false;
    return dateYmd >= effectiveFrom && dateYmd <= effectiveTo;
}

function getScheduleMinutes(schedule: ScheduleWindow) {
    const startHm = normalizeScheduleTime(schedule.start_time);
    const endHm = normalizeScheduleTime(schedule.end_time);
    if (!startHm || !endHm) return null;

    return {
        startHm,
        endHm,
        startMinutes: timeToMinutes(startHm),
        endMinutes: timeToMinutes(endHm),
    };
}

function clampMinutes(value: number) {
    return Math.max(0, Math.min(24 * 60, value));
}

function jsonSafe<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current))
    ) as T;
}

function formatISTDateLabel(dateYmd: string) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: IST_TIMEZONE,
    }).format(new Date(`${dateYmd}T00:00:00+05:30`));
}

function formatISTTimeLabel(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: IST_TIMEZONE,
    }).format(date);
}

function formatHmTo12Hour(value: string) {
    const [hoursRaw, minutesRaw] = value.split(":").map(Number);
    const hours = hoursRaw || 0;
    const minutes = minutesRaw || 0;
    const suffix = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function toYmd(value: Date | string | null | undefined) {
    if (!value) return "";
    const raw = value instanceof Date ? value.toISOString() : String(value);
    return raw.slice(0, 10);
}

function toTimeLabel(value: Date | string | null | undefined) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
    }).format(date);
}

function toAppointmentMoment(dateYmd: string, value: Date | string | null | undefined) {
    if (!dateYmd || !value) return null;

    const raw = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(raw.getTime())) return null;

    const hours = String(raw.getUTCHours()).padStart(2, "0");
    const minutes = String(raw.getUTCMinutes()).padStart(2, "0");
    const moment = new Date(`${dateYmd}T${hours}:${minutes}:00+05:30`);
    return Number.isNaN(moment.getTime()) ? null : moment;
}

function getAppointmentSchedule(
    appointmentStartMinutes: number,
    schedules: Array<ScheduleWindow & {
        startHm: string;
        endHm: string;
        startMinutes: number;
        endMinutes: number;
    }>
) {
    return schedules.find((schedule) =>
        appointmentStartMinutes >= schedule.startMinutes &&
        appointmentStartMinutes < schedule.endMinutes
    ) || null;
}

function getPatientDisplayName(appointment: AppointmentWithRelations) {
    return appointment.patient?.full_name?.trim() || "Walk-in Patient";
}

function getQueueNumber(appointment: AppointmentWithRelations) {
    return appointment.booking_id ?? appointment.appointment_id;
}

function serializeAppointment(appointment: AppointmentWithRelations) {
    return {
        appointment_id: appointment.appointment_id,
        queue_number: getQueueNumber(appointment),
        patient_name: getPatientDisplayName(appointment),
        status: appointment.status || "BOOKED",
        start_time_label: toTimeLabel(appointment.start_time),
        end_time_label: toTimeLabel(appointment.end_time),
    };
}

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader?.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }

        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = verifyToken(token);
        if (!user || (user.role !== "DOCTOR" && user.role !== "CLINIC_STAFF")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedClinicId = Number(searchParams.get("clinicId"));

        let doctorId: number | null = null;
        let allowedClinicId: number | null = null;

        if (user.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true },
            });

            if (!doctor) {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }

            doctorId = doctor.doctor_id;

            if (requestedClinicId) {
                const clinic = await prisma.clinics.findFirst({
                    where: {
                        clinic_id: requestedClinicId,
                        doctor_id: doctorId,
                    },
                    select: { clinic_id: true },
                });

                if (!clinic) {
                    return NextResponse.json({ error: "Clinic not found for this doctor" }, { status: 404 });
                }

                allowedClinicId = clinic.clinic_id;
            } else {
                const firstClinic = await prisma.clinics.findFirst({
                    where: { doctor_id: doctorId },
                    orderBy: { clinic_name: "asc" },
                    select: { clinic_id: true },
                });

                allowedClinicId = firstClinic?.clinic_id ?? null;
            }
        }

        if (user.role === "CLINIC_STAFF") {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId },
                select: {
                    doctor_id: true,
                    clinic_id: true,
                    staff_role: true,
                },
            });

            if (!staff) {
                return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
            }

            if (staff.staff_role !== "HAVE_ACCESS") {
                return NextResponse.json({ error: "You do not have access to live display" }, { status: 403 });
            }

            doctorId = staff.doctor_id;
            allowedClinicId = staff.clinic_id ?? null;

            if (requestedClinicId && allowedClinicId && requestedClinicId !== allowedClinicId) {
                return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
            }
        }

        if (!doctorId || !allowedClinicId) {
            return NextResponse.json({
                doctor_name: "",
                clinic_name: "",
                selected_clinic_id: null,
                today_label: formatISTDateLabel(getISTNowYMD()),
                now_label: formatISTTimeLabel(new Date()),
                current: null,
                next: null,
                missed: [],
                remaining: [],
                total_today: 0,
            });
        }

        const todayYmd = getISTNowYMD();
        const todayStart = new Date(`${todayYmd}T00:00:00.000Z`);
        const todayEnd = new Date(`${todayYmd}T00:00:00.000Z`);
        todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
        const now = new Date();
        const todayDayOfWeek = getISTDayOfWeek(todayYmd);
        const nowMinutesInIST = getNowMinutesInIST(now);

        const scheduleWindows = await prisma.doctor_clinic_schedule.findMany({
            where: {
                doctor_id: doctorId,
                clinic_id: allowedClinicId,
                day_of_week: todayDayOfWeek,
                effective_from: { lte: todayStart },
                effective_to: { gte: todayStart },
            },
            select: {
                schedule_id: true,
                doctor_id: true,
                clinic_id: true,
                day_of_week: true,
                start_time: true,
                end_time: true,
                slot_duration: true,
                effective_from: true,
                effective_to: true,
            },
            orderBy: [
                { start_time: "asc" },
                { end_time: "asc" },
            ],
        });

        const eligibleSchedules = scheduleWindows
            .filter((schedule) => isScheduleValidForDate(schedule, todayYmd))
            .map((schedule) => {
                const minutes = getScheduleMinutes(schedule);
                if (!minutes) return null;

                return {
                    ...schedule,
                    ...minutes,
                };
            })
            .filter((schedule): schedule is ScheduleWindow & {
                startHm: string;
                endHm: string;
                startMinutes: number;
                endMinutes: number;
            } => Boolean(schedule))
            .sort((left, right) => {
                if (left.startMinutes !== right.startMinutes) {
                    return left.startMinutes - right.startMinutes;
                }

                if (left.endMinutes !== right.endMinutes) {
                    return left.endMinutes - right.endMinutes;
                }

                return left.schedule_id - right.schedule_id;
            });

        const scheduleDisplayWindows = eligibleSchedules.map((schedule, index) => {
            const nextSchedule = eligibleSchedules[index + 1] ?? null;
            const displayStartMinutes = clampMinutes(schedule.startMinutes - SCHEDULE_DISPLAY_LEAD_MINUTES);
            const queueStartMinutes = schedule.startMinutes;
            const queueEndMinutes = nextSchedule
                ? clampMinutes(nextSchedule.startMinutes - SCHEDULE_DISPLAY_LEAD_MINUTES)
                : 24 * 60;

            return {
                ...schedule,
                displayStartMinutes,
                queueStartMinutes,
                queueEndMinutes,
            };
        });

        const selectedSchedule =
            scheduleDisplayWindows.find((schedule) =>
                nowMinutesInIST >= schedule.displayStartMinutes && nowMinutesInIST < schedule.queueEndMinutes
            ) ||
            null;

        const appointmentsRaw = await prisma.appointment.findMany({
            where: {
                doctor_id: doctorId,
                clinic_id: allowedClinicId,
                appointment_date: {
                    gte: todayStart,
                    lt: todayEnd,
                },
            },
            include: {
                patient: {
                    select: {
                        patient_id: true,
                        full_name: true,
                    },
                },
                clinic: {
                    select: {
                        clinic_id: true,
                        clinic_name: true,
                    },
                },
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        education: true,
                        specialization: true,
                    },
                },
            },
            orderBy: [
                { start_time: "asc" },
                { created_at: "asc" },
            ],
        });

        const appointments = (await attachBookingIds(appointmentsRaw)) as AppointmentWithRelations[];

        const sortedAll = [...appointments]
            .map((appointment) => {
                const dateYmd = toYmd(appointment.appointment_date);
                const startMoment = toAppointmentMoment(dateYmd, appointment.start_time);
                const startHm = formatUTCDateToISTTime(appointment.start_time);
                const startMinutes = startHm ? timeToMinutes(startHm) : Number.MAX_SAFE_INTEGER;
                const savedEndMoment = toAppointmentMoment(dateYmd, appointment.end_time);
                const matchedSchedule =
                    Number.isFinite(startMinutes) && startMinutes !== Number.MAX_SAFE_INTEGER
                        ? getAppointmentSchedule(startMinutes, eligibleSchedules)
                        : null;
                const scheduleDurationMinutes = Number(matchedSchedule?.slot_duration || 0);
                const scheduleEndMoment =
                    startMoment && scheduleDurationMinutes > 0
                        ? new Date(startMoment.getTime() + scheduleDurationMinutes * 60 * 1000)
                        : null;
                const endMoment =
                    savedEndMoment && scheduleEndMoment
                        ? new Date(Math.min(savedEndMoment.getTime(), scheduleEndMoment.getTime()))
                        : savedEndMoment || scheduleEndMoment;

                return {
                    ...appointment,
                    sortTime: startMoment?.getTime() ?? Number.MAX_SAFE_INTEGER,
                    startMoment,
                    endMoment,
                    startHm,
                    startMinutes,
                };
            })
            .sort((left, right) => {
                if (left.sortTime !== right.sortTime) {
                    return left.sortTime - right.sortTime;
                }

                const leftQueue = getQueueNumber(left);
                const rightQueue = getQueueNumber(right);

                if (leftQueue !== rightQueue) {
                    return leftQueue - rightQueue;
                }

                return left.appointment_id - right.appointment_id;
            });

        const sorted = selectedSchedule
            ? sortedAll.filter((appointment) =>
                appointment.startHm &&
                appointment.startMinutes >= selectedSchedule.queueStartMinutes &&
                appointment.startMinutes < selectedSchedule.queueEndMinutes
            )
            : eligibleSchedules.length > 0
                ? []
                : sortedAll;

        const missed = sorted.filter((appointment) => appointment.status === "PENDING");

        const activeQueue = sorted.filter((appointment) =>
            appointment.status !== "CANCELLED" &&
            appointment.status !== "COMPLETED" &&
            appointment.status !== "PENDING"
        );

        // Inside the active schedule, queue progression is manual/status-driven.
        // "Visited" and "Not Visited" remove the patient from the active queue,
        // then the next booked appointment moves up in sorted order.
        const current = activeQueue[0] ?? null;
        const next = activeQueue[1] ?? null;
        const remaining = activeQueue.slice(2);

        const response = {
            doctor_name: sorted[0]?.doctor?.doctor_name || sortedAll[0]?.doctor?.doctor_name || "",
            doctor_education: sorted[0]?.doctor?.education || sortedAll[0]?.doctor?.education || "",
            doctor_specialization: sorted[0]?.doctor?.specialization || sortedAll[0]?.doctor?.specialization || "",
            clinic_name: sorted[0]?.clinic?.clinic_name || sortedAll[0]?.clinic?.clinic_name || "",
            selected_clinic_id: allowedClinicId,
            today_label: formatISTDateLabel(todayYmd),
            now_label: formatISTTimeLabel(now),
            schedule_label: selectedSchedule
                ? `Doctor Schedule: ${formatHmTo12Hour(selectedSchedule.startHm)} - ${formatHmTo12Hour(selectedSchedule.endHm)}`
                : "Doctor Schedule: Not available",
            current: current ? serializeAppointment(current) : null,
            next: next ? serializeAppointment(next) : null,
            missed: missed.map(serializeAppointment),
            remaining: remaining.map(serializeAppointment),
            total_today: sorted.length,
        };

        return NextResponse.json(jsonSafe(response));
    } catch (error) {
        console.error("Live appointments GET error:", error);
        return NextResponse.json({ error: "Failed to load live appointments" }, { status: 500 });
    }
}
