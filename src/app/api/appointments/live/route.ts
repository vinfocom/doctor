import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { attachBookingIds } from "@/lib/bookingId";
import { getISTNowYMD } from "@/lib/appointmentDateTime";

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
    } | null;
};

const IST_TIMEZONE = "Asia/Kolkata";

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
                    },
                },
            },
            orderBy: [
                { start_time: "asc" },
                { created_at: "asc" },
            ],
        });

        const appointments = (await attachBookingIds(appointmentsRaw)) as AppointmentWithRelations[];
        const now = new Date();

        const sorted = [...appointments]
            .map((appointment) => {
                const dateYmd = toYmd(appointment.appointment_date);
                const startMoment = toAppointmentMoment(dateYmd, appointment.start_time);
                const endMoment = toAppointmentMoment(dateYmd, appointment.end_time);

                return {
                    ...appointment,
                    sortTime: startMoment?.getTime() ?? Number.MAX_SAFE_INTEGER,
                    startMoment,
                    endMoment,
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

        const missed = sorted.filter((appointment) =>
            appointment.status === "PENDING" &&
            appointment.endMoment &&
            appointment.endMoment.getTime() < now.getTime()
        );

        const current = sorted.find((appointment) =>
            appointment.status !== "CANCELLED" &&
            appointment.status !== "COMPLETED" &&
            appointment.status !== "PENDING" &&
            appointment.startMoment &&
            appointment.endMoment &&
            appointment.startMoment.getTime() <= now.getTime() &&
            appointment.endMoment.getTime() >= now.getTime()
        ) || null;

        const nextCandidates = sorted.filter((appointment) => {
            if (appointment.status === "CANCELLED" || appointment.status === "COMPLETED") return false;
            if (missed.some((missedAppointment) => missedAppointment.appointment_id === appointment.appointment_id)) return false;
            if (!appointment.startMoment) return false;
            if (current) {
                return appointment.startMoment.getTime() > (current.startMoment?.getTime() ?? 0);
            }
            return appointment.startMoment.getTime() > now.getTime();
        });

        const next = nextCandidates[0] ?? null;

        const remaining = next
            ? sorted.filter((appointment) =>
                appointment.status !== "CANCELLED" &&
                appointment.status !== "COMPLETED" &&
                !missed.some((missedAppointment) => missedAppointment.appointment_id === appointment.appointment_id) &&
                appointment.appointment_id !== next.appointment_id &&
                appointment.appointment_id !== current?.appointment_id &&
                appointment.startMoment &&
                next.startMoment &&
                appointment.startMoment.getTime() > next.startMoment.getTime()
            )
            : [];

        const response = {
            doctor_name: sorted[0]?.doctor?.doctor_name || "",
            clinic_name: sorted[0]?.clinic?.clinic_name || "",
            selected_clinic_id: allowedClinicId,
            today_label: formatISTDateLabel(todayYmd),
            now_label: formatISTTimeLabel(now),
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