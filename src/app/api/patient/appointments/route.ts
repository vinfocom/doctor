export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { addMinutesToTimeString, getISTDayOfWeek, parseISTDate, parseISTTimeToUTCDate } from "@/lib/appointmentDateTime";
import { attachBookingIds, computeBookingIdForAppointment } from "@/lib/bookingId";

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

async function createPendingSmsNotificationLog({
    appointmentId,
    destination,
    adminId,
    sourceChannel,
}: {
    appointmentId: number;
    destination: string | null | undefined;
    adminId: number;
    sourceChannel: "web" | "app";
}) {
    const normalizedDestination = String(destination || "").trim();
    if (!normalizedDestination) return;

    try {
        await prisma.appointment_notification_log.create({
            data: {
                appointment_id: appointmentId,
                event_type: "CONFIRMATION",
                channel: "sms",
                destination: normalizedDestination,
                status: "PENDING",
                admin_id: adminId,
                meta_json: { source_channel: sourceChannel },
            },
        });
    } catch (error) {
        console.error("Error creating pending SMS notification log:", error);
    }
}

async function getScopedPatientIds(patientId: number) {
    const patient = await prisma.patients.findUnique({
        where: { patient_id: patientId },
        select: {
            patient_id: true,
            admin_id: true,
            phone: true,
        },
    });

    if (!patient) return [];

    if (!patient.phone) {
        return [patient.patient_id];
    }

    const relatedPatients = await prisma.patients.findMany({
        where: { admin_id: patient.admin_id },
        select: {
            patient_id: true,
            phone: true,
        },
        orderBy: { patient_id: "asc" },
    });

    return relatedPatients
        .filter((item) => phonesMatch(item.phone, patient.phone))
        .map((item) => item.patient_id);
}

async function releaseCancelledSlotReservation(appointmentId: number) {
    const existing = await prisma.appointment.findUnique({
        where: { appointment_id: appointmentId },
        select: {
            appointment_id: true,
            doctor_id: true,
            appointment_date: true,
            start_time: true,
            end_time: true,
            status: true,
        },
    });

    if (!existing || existing.status !== "CANCELLED" || !existing.start_time) {
        return existing;
    }

    const minuteStart = new Date(existing.start_time);
    minuteStart.setUTCSeconds(0, 0);
    const minuteEnd = new Date(minuteStart);
    minuteEnd.setUTCMinutes(minuteEnd.getUTCMinutes() + 1);

    const cancelledInSameMinute = await prisma.appointment.findMany({
        where: {
            doctor_id: existing.doctor_id,
            appointment_date: existing.appointment_date,
            status: "CANCELLED",
            appointment_id: { not: existing.appointment_id },
            start_time: {
                gte: minuteStart,
                lt: minuteEnd,
            },
        },
        select: { start_time: true },
    });

    const usedSeconds = new Set(
        cancelledInSameMinute
            .map((item) => item.start_time?.getUTCSeconds())
            .filter((value): value is number => typeof value === "number")
    );

    let nextSecond = 1;
    while (usedSeconds.has(nextSecond) && nextSecond < 59) {
        nextSecond += 1;
    }

    const releasedStart = new Date(minuteStart);
    releasedStart.setUTCSeconds(nextSecond, 0);

    const updateData: Record<string, Date> = {
        start_time: releasedStart,
    };

    if (existing.end_time) {
        const releasedEnd = new Date(existing.end_time);
        releasedEnd.setUTCSeconds(nextSecond, 0);
        updateData.end_time = releasedEnd;
    }

    return prisma.appointment.update({
        where: { appointment_id: appointmentId },
        data: updateData,
    });
}

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: {
                patient_id: true,
                phone: true,
                full_name: true,
                admin_id: true,
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
                    full_name: true,
                    phone: true,
                },
                orderBy: { patient_id: "asc" },
            })
            : [patient];

        const phoneLinkedPatients = relatedPatients.filter((item) => phonesMatch(item.phone, patient.phone));
        const groupedPatientIds = phoneLinkedPatients.map((item) => item.patient_id);
        const groupedPatientIdsSet = new Set(groupedPatientIds);

        const appointments = await prisma.appointment.findMany({
            where: {
                patient_id: groupedPatientIds.length > 0 ? { in: groupedPatientIds } : patientId,
            },
            include: {
                doctor: {
                    select: { doctor_id: true, doctor_name: true, specialization: true, phone: true, profile_pic_url: true },
                },
                clinic: {
                    select: { clinic_id: true, clinic_name: true, location: true, phone: true },
                },
                patient: {
                    select: { patient_id: true, booking_id: true, full_name: true, phone: true, profile_type: true },
                },
            },
            orderBy: [{ appointment_date: "desc" }, { start_time: "desc" }],
        });

        const appointmentsWithBookingIds = await attachBookingIds(appointments);
        const enrichedAppointments = appointmentsWithBookingIds
            .filter((appointment) => appointment.patient_id == null || groupedPatientIdsSet.has(appointment.patient_id))
            .map((appointment) => {
                const relationType = appointment.patient?.profile_type === "OTHER" ? "OTHER" : "SELF";
                return {
                    ...appointment,
                    relation_type: relationType,
                    relation_label: relationType === "SELF"
                        ? "Self"
                        : `Other: ${String(appointment.patient?.full_name || "Patient").trim() || "Patient"}`,
                };
            });

        const safe = JSON.parse(JSON.stringify(enrichedAppointments, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
        ));
        return NextResponse.json({ appointments: safe });
    } catch (error) {
        console.error("Patient appointments GET error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const body = await req.json();
        const doctor_id = Number(body?.doctor_id);
        const clinic_id = Number(body?.clinic_id);
        const appointment_date = String(body?.appointment_date || "");
        const start_time = String(body?.start_time || "");
        const booking_for = String(body?.booking_for || body?.booked_for || "SELF").trim().toUpperCase() === "OTHER" ? "OTHER" : "SELF";
        const patient_name = String(body?.patient_name || "").trim();

        if (!doctor_id || !clinic_id || !appointment_date || !start_time) {
            return NextResponse.json({ error: "doctor_id, clinic_id, appointment_date, start_time are required" }, { status: 400 });
        }

        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: { patient_id: true, admin_id: true, full_name: true, phone: true, profile_type: true },
        });
        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const doctor = await prisma.doctors.findUnique({
            where: { doctor_id },
            select: { doctor_id: true, admin_id: true, status: true },
        });
        if (!doctor || doctor.admin_id !== patient.admin_id) {
            return NextResponse.json({ error: "Doctor not available for this patient" }, { status: 403 });
        }
        if (String(doctor.status || "").toUpperCase() === "INACTIVE") {
            return NextResponse.json({ error: "Doctor not available for this patient" }, { status: 403 });
        }

        const clinic = await prisma.clinics.findUnique({
            where: { clinic_id },
            select: { clinic_id: true, doctor_id: true, admin_id: true },
        });
        if (!clinic || clinic.admin_id !== patient.admin_id) {
            return NextResponse.json({ error: "Clinic not available" }, { status: 403 });
        }
        if (clinic.doctor_id && clinic.doctor_id !== doctor_id) {
            return NextResponse.json({ error: "Selected clinic is not assigned to this doctor" }, { status: 400 });
        }

        // MariaDB DATE column stores calendar date from UTC — use UTC midnight so Mar 27 stays Mar 27
        const apptDate = parseISTDate(appointment_date);
        const dayOfWeek = getISTDayOfWeek(appointment_date);
        const schedule = await prisma.doctor_clinic_schedule.findFirst({
            where: {
                doctor_id,
                clinic_id,
                day_of_week: dayOfWeek,
            },
            orderBy: { schedule_id: "desc" },
            select: { slot_duration: true },
        });
        const slotDuration = schedule?.slot_duration || 30;

        const startTimeObj = parseISTTimeToUTCDate(start_time);
        const endTimeObj = parseISTTimeToUTCDate(addMinutesToTimeString(start_time, slotDuration));
        const appointmentBookingId = await computeBookingIdForAppointment({
            doctor_id,
            clinic_id,
            appointment_date: apptDate,
            start_time: startTimeObj,
        });
        const existingAppointmentsCount = await prisma.appointment.count({
            where: {
                doctor_id,
                clinic_id,
                appointment_date: apptDate,
            },
        });
        const patientBookingId = existingAppointmentsCount + 1;

        const targetProfileType = booking_for === "OTHER" ? "OTHER" : "SELF";
        let targetPatient = patient;

        if (targetProfileType === "OTHER") {
            const relatedPatients = patient.phone
                ? await prisma.patients.findMany({
                    where: { admin_id: patient.admin_id },
                    select: {
                        patient_id: true,
                        admin_id: true,
                        full_name: true,
                        phone: true,
                        profile_type: true,
                    },
                    orderBy: { patient_id: "desc" },
                })
                : [];

            const existingOther = relatedPatients.find((item) =>
                item.profile_type === "OTHER" && phonesMatch(item.phone, patient.phone)
            ) || null;

            if (existingOther) {
                targetPatient = existingOther;
            } else {
                if (!patient_name) {
                    return NextResponse.json({ error: "Other patient name is required" }, { status: 400 });
                }

                targetPatient = await prisma.patients.create({
                    data: {
                        admin_id: patient.admin_id,
                        doctor_id,
                        phone: patient.phone || null,
                        full_name: patient_name,
                        profile_type: "OTHER",
                        booking_id: patientBookingId,
                    },
                    select: {
                        patient_id: true,
                        admin_id: true,
                        full_name: true,
                        phone: true,
                        profile_type: true,
                    },
                });
            }
        }

        const existingSameDay = await prisma.appointment.findFirst({
            where: {
                patient_id: targetPatient.patient_id,
                doctor_id,
                clinic_id,
                appointment_date: apptDate,
            },
            orderBy: { appointment_id: "desc" },
        });

        if (existingSameDay) {
            if (existingSameDay.status === "COMPLETED") {
                return NextResponse.json(
                    { error: "Appointment already completed for this date. Please choose another date." },
                    { status: 409 }
                );
            }

            const rescheduled = await prisma.appointment.update({
                where: { appointment_id: existingSameDay.appointment_id },
                data: {
                    start_time: startTimeObj,
                    end_time: endTimeObj,
                    status: "BOOKED",
                    booked_for: booking_for,
                    channel: "app",
                    rescheduled_by: "PATIENT",
                    ...(appointmentBookingId != null ? { booking_id: appointmentBookingId } : {}),
                },
            });

            const patientUpdateData: { doctor_id: number; booking_id?: number; full_name?: string } = {
                doctor_id,
                booking_id: patientBookingId,
            };
            if (targetProfileType === "SELF" && patient_name && patient_name !== (patient.full_name || "")) {
                patientUpdateData.full_name = patient_name;
            }

            await prisma.patients.update({
                where: { patient_id: targetPatient.patient_id },
                data: patientUpdateData,
            }).catch(() => undefined);

            return NextResponse.json({ appointment: rescheduled, rescheduled_existing: true }, { status: 200 });
        }

        const appointment = await prisma.appointment.create({
            data: {
                appointment_date: apptDate,
                start_time: startTimeObj,
                end_time: endTimeObj,
                status: "BOOKED",
                booked_for: booking_for,
                channel: "app",
                patient: {
                    connect: { patient_id: targetPatient.patient_id },
                },
                doctor: {
                    connect: { doctor_id },
                },
                clinic: {
                    connect: { clinic_id },
                },
                admin: {
                    connect: { admin_id: patient.admin_id },
                },
                ...(appointmentBookingId != null ? { booking_id: appointmentBookingId } : {}),
            },
        });

        await createPendingSmsNotificationLog({
            appointmentId: appointment.appointment_id,
            destination: targetPatient.phone || patient.phone,
            adminId: patient.admin_id,
            sourceChannel: "app",
        });

        const patientUpdateData: { doctor_id: number; booking_id?: number; full_name?: string } = {
            doctor_id,
            booking_id: patientBookingId,
        };
        if (targetProfileType === "SELF" && patient_name && patient_name !== (patient.full_name || "")) {
            patientUpdateData.full_name = patient_name;
        }

        await prisma.patients.update({
            where: { patient_id: targetPatient.patient_id },
            data: patientUpdateData,
        }).catch(() => undefined);

        return NextResponse.json({ appointment, rescheduled_existing: false }, { status: 201 });
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "Slot already booked" }, { status: 409 });
        }
        console.error("Patient appointments POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const body = await req.json();
        const appointmentId = Number(body?.appointmentId);
        const status = body?.status ? String(body.status).trim().toUpperCase() : "";
        const appointment_date = body?.appointment_date ? String(body.appointment_date) : "";
        const start_time = body?.start_time ? String(body.start_time) : "";
        const end_time = body?.end_time ? String(body.end_time) : "";
        const hasRescheduleFields = Boolean(appointment_date || start_time || end_time);

        if (!appointmentId) {
            return NextResponse.json({ error: "appointmentId required" }, { status: 400 });
        }

        const allowedPatientIds = await getScopedPatientIds(patientId);
        if (allowedPatientIds.length === 0) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const existing = await prisma.appointment.findFirst({
            where: {
                appointment_id: appointmentId,
                patient_id: { in: allowedPatientIds },
            },
            select: {
                appointment_id: true,
                doctor_id: true,
                clinic_id: true,
                patient_id: true,
                appointment_date: true,
                start_time: true,
                end_time: true,
                status: true,
                booked_for: true,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
        }

        if (!status && !hasRescheduleFields) {
            return NextResponse.json({ error: "Provide status or reschedule fields" }, { status: 400 });
        }

        if (status === "CANCELLED" && (existing.status === "CANCELLED" || existing.status === "COMPLETED")) {
            return NextResponse.json({ error: "Cannot cancel a completed or already cancelled appointment" }, { status: 400 });
        }

        if (hasRescheduleFields && existing.status === "COMPLETED") {
            return NextResponse.json({ error: "Completed appointments cannot be rescheduled" }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {};

        if (status) {
            updateData.status = status;
        }

        if (hasRescheduleFields) {
            const nextDate = appointment_date ? parseISTDate(appointment_date) : existing.appointment_date;
            const nextStart = start_time ? parseISTTimeToUTCDate(start_time) : existing.start_time;

            if (!nextDate || !nextStart) {
                return NextResponse.json({ error: "appointment_date and start_time are required for reschedule" }, { status: 400 });
            }

            let nextEnd = existing.end_time;
            if (end_time) {
                nextEnd = parseISTTimeToUTCDate(end_time);
            } else if (start_time && existing.start_time && existing.end_time) {
                const durationMs = existing.end_time.getTime() - existing.start_time.getTime();
                nextEnd = new Date(nextStart.getTime() + durationMs);
            }

            const exactSlotConflict = await prisma.appointment.findFirst({
                where: {
                    appointment_id: { not: appointmentId },
                    doctor_id: existing.doctor_id ?? undefined,
                    appointment_date: nextDate,
                    start_time: nextStart,
                    status: { not: "CANCELLED" },
                },
                select: {
                    appointment_id: true,
                },
            });

            if (exactSlotConflict) {
                return NextResponse.json({ error: "Slot already booked" }, { status: 409 });
            }

            const bookingId = await computeBookingIdForAppointment({
                doctor_id: existing.doctor_id,
                clinic_id: existing.clinic_id,
                appointment_date: nextDate,
                start_time: nextStart,
            });

            updateData.appointment_date = nextDate;
            updateData.start_time = nextStart;
            if (nextEnd) updateData.end_time = nextEnd;
            if (bookingId != null) updateData.booking_id = bookingId;
            updateData.status = "BOOKED";
            updateData.rescheduled_by = "PATIENT";
        }

        const updated = await prisma.appointment.update({
            where: { appointment_id: appointmentId },
            data: {
                ...updateData,
                ...(status === "CANCELLED" ? { cancelled_by: "PATIENT" } : {}),
            },
        });

        const released = status === "CANCELLED"
            ? await releaseCancelledSlotReservation(appointmentId)
            : null;
        const safe = JSON.parse(JSON.stringify(released || updated, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
        ));

        return NextResponse.json({ appointment: safe });
    } catch (error) {
        console.error("Patient appointments PATCH error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}


