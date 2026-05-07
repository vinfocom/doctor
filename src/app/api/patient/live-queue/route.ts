export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { attachBookingIds } from "@/lib/bookingId";
import { formatDateToISTYMD, formatUTCDateToISTTime, getISTDayOfWeek, getISTNowYMD } from "@/lib/appointmentDateTime";

type AppointmentWithRelations = {
    appointment_id: number;
    booking_id?: number | null;
    patient_id: number | null;
    doctor_id: number | null;
    clinic_id: number | null;
    status: string | null;
    appointment_date: Date | string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    patient: {
        patient_id: number;
        full_name: string | null;
        phone: string | null;
        profile_type: string | null;
    } | null;
    clinic: {
        clinic_id: number;
        clinic_name: string | null;
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
const WAITING_MESSAGE = "Live queue will be available during your appointment schedule";
const MISSED_MESSAGE = "This appointment was marked as not visited";

function normalizePhone(value: string | null | undefined) {
    return String(value || "").replace(/\D/g, "");
}

function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
    const normalizedLeft = normalizePhone(left);
    const normalizedRight = normalizePhone(right);
    if (!normalizedLeft || !normalizedRight) return false;
    if (normalizedLeft === normalizedRight) return true;
    if (normalizedLeft.length >= 10 && normalizedRight.length >= 10) {
        return normalizedLeft.slice(-10) === normalizedRight.slice(-10);
    }
    return false;
}

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

function getQueueNumber(appointment: Pick<AppointmentWithRelations, "booking_id" | "appointment_id">) {
    return appointment.booking_id ?? appointment.appointment_id;
}

export async function GET(request: Request) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const appointmentId = Number(searchParams.get("appointmentId"));

        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
            return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
        }

        const patientId = session.patientId ?? session.userId;
        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: {
                patient_id: true,
                admin_id: true,
                phone: true,
            },
        });

        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const relatedPatients = patient.phone
            ? await prisma.patients.findMany({
                where: { admin_id: patient.admin_id },
                select: {
                    patient_id: true,
                    phone: true,
                },
                orderBy: { patient_id: "asc" },
            })
            : [patient];

        const groupedPatientIds = relatedPatients
            .filter((item) => phonesMatch(item.phone, patient.phone))
            .map((item) => item.patient_id);
        const scopedPatientIds = groupedPatientIds.length > 0 ? groupedPatientIds : [patient.patient_id];

        const requestedAppointmentRaw = await prisma.appointment.findFirst({
            where: {
                appointment_id: appointmentId,
                patient_id: { in: scopedPatientIds },
            },
            include: {
                patient: {
                    select: {
                        patient_id: true,
                        full_name: true,
                        phone: true,
                        profile_type: true,
                    },
                },
                clinic: {
                    select: {
                        clinic_id: true,
                        clinic_name: true,
                    },
                },
            },
        });

        if (!requestedAppointmentRaw) {
            return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
        }

        const requestedWithBooking = (await attachBookingIds([requestedAppointmentRaw]))[0] as AppointmentWithRelations;
        const appointmentDateYmd = formatDateToISTYMD(requestedWithBooking.appointment_date);
        const todayYmd = getISTNowYMD();
        const appointmentStatus = String(requestedWithBooking.status || "").toUpperCase();

        if (appointmentDateYmd !== todayYmd) {
            return NextResponse.json({
                state: "UNAVAILABLE",
                message: "",
            });
        }

        if (appointmentStatus === "PENDING") {
            return NextResponse.json({
                state: "MISSED",
                message: MISSED_MESSAGE,
                clinic_name: requestedWithBooking.clinic?.clinic_name || "Clinic",
                your_number: getQueueNumber(requestedWithBooking),
                current_number: null,
                next_number: null,
                patients_ahead: null,
            });
        }

        if (appointmentStatus !== "BOOKED") {
            return NextResponse.json({
                state: "UNAVAILABLE",
                message: "",
            });
        }

        if (!requestedWithBooking.doctor_id || !requestedWithBooking.clinic_id) {
            return NextResponse.json({
                state: "UNAVAILABLE",
                message: "",
            });
        }

        const todayStart = new Date(`${todayYmd}T00:00:00.000Z`);
        const todayEnd = new Date(`${todayYmd}T00:00:00.000Z`);
        todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
        const now = new Date();
        const todayDayOfWeek = getISTDayOfWeek(todayYmd);
        const nowMinutesInIST = getNowMinutesInIST(now);

        const scheduleWindows = await prisma.doctor_clinic_schedule.findMany({
            where: {
                doctor_id: requestedWithBooking.doctor_id,
                clinic_id: requestedWithBooking.clinic_id,
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
            ) || null;

        const appointmentStartHm = formatUTCDateToISTTime(requestedWithBooking.start_time);
        const appointmentStartMinutes = appointmentStartHm ? timeToMinutes(appointmentStartHm) : Number.NaN;
        const appointmentSchedule = scheduleDisplayWindows.find((schedule) =>
            Number.isFinite(appointmentStartMinutes) &&
            appointmentStartMinutes >= schedule.startMinutes &&
            appointmentStartMinutes < schedule.endMinutes
        ) || null;

        if (!appointmentSchedule) {
            return NextResponse.json({
                state: "UNAVAILABLE",
                message: "",
            });
        }

        const clinicName = requestedWithBooking.clinic?.clinic_name || "Clinic";
        const yourNumber = getQueueNumber(requestedWithBooking);

        if (nowMinutesInIST < appointmentSchedule.displayStartMinutes) {
            return NextResponse.json({
                state: "WAITING",
                message: WAITING_MESSAGE,
                clinic_name: clinicName,
                your_number: yourNumber,
                current_number: null,
                next_number: null,
                patients_ahead: null,
            });
        }

        const isWithinAppointmentSchedule = Boolean(
            selectedSchedule && selectedSchedule.schedule_id === appointmentSchedule.schedule_id
        );

        if (!isWithinAppointmentSchedule) {
            return NextResponse.json({
                state: nowMinutesInIST < appointmentSchedule.queueEndMinutes ? "WAITING" : "UNAVAILABLE",
                message: nowMinutesInIST < appointmentSchedule.queueEndMinutes ? WAITING_MESSAGE : "",
                clinic_name: clinicName,
                your_number: yourNumber,
                current_number: null,
                next_number: null,
                patients_ahead: null,
            });
        }

        const appointmentsRaw = await prisma.appointment.findMany({
            where: {
                doctor_id: requestedWithBooking.doctor_id,
                clinic_id: requestedWithBooking.clinic_id,
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
                        phone: true,
                        profile_type: true,
                    },
                },
                clinic: {
                    select: {
                        clinic_id: true,
                        clinic_name: true,
                    },
                },
            },
            orderBy: [
                { start_time: "asc" },
                { created_at: "asc" },
            ],
        });

        const appointments = (await attachBookingIds(appointmentsRaw)) as AppointmentWithRelations[];

        const scheduleAppointments = appointments
            .map((appointment) => {
                const startHm = formatUTCDateToISTTime(appointment.start_time);
                const startMinutes = startHm ? timeToMinutes(startHm) : Number.MAX_SAFE_INTEGER;
                return {
                    ...appointment,
                    startMinutes,
                };
            })
            .filter((appointment) =>
                appointment.startMinutes >= appointmentSchedule.queueStartMinutes &&
                appointment.startMinutes < appointmentSchedule.queueEndMinutes
            )
            .sort((left, right) => {
                if (left.startMinutes !== right.startMinutes) {
                    return left.startMinutes - right.startMinutes;
                }
                const leftQueue = getQueueNumber(left);
                const rightQueue = getQueueNumber(right);
                if (leftQueue !== rightQueue) {
                    return leftQueue - rightQueue;
                }
                return left.appointment_id - right.appointment_id;
            });

        const activeQueue = scheduleAppointments.filter((appointment) => {
            const status = String(appointment.status || "").toUpperCase();
            return status !== "CANCELLED" && status !== "COMPLETED" && status !== "PENDING";
        });

        const patientQueueIndex = activeQueue.findIndex((appointment) => appointment.appointment_id === requestedWithBooking.appointment_id);
        if (patientQueueIndex === -1) {
            return NextResponse.json({
                state: "UNAVAILABLE",
                message: "",
            });
        }

        const current = activeQueue[0] ?? null;
        const next = activeQueue[1] ?? null;

        return NextResponse.json({
            state: "ACTIVE",
            message: "",
            clinic_name: clinicName,
            your_number: yourNumber,
            current_number: current ? getQueueNumber(current) : null,
            next_number: next ? getQueueNumber(next) : null,
            patients_ahead: patientQueueIndex,
        });
    } catch (error) {
        console.error("Patient live queue GET error:", error);
        return NextResponse.json({ error: "Failed to load patient live queue" }, { status: 500 });
    }
}
