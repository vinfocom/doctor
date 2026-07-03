import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';
import { Prisma } from '@/generated/prisma/client';
import { formatDateToISTYMD, parseISTDate, parseISTTimeToUTCDate } from '@/lib/appointmentDateTime';
import { attachBookingIds, computeBookingIdForAppointment } from '@/lib/bookingId';
import { getDoctorFullDayLeave } from '@/lib/leaveAvailability';
import {
    getClinicStaffAccessBlockReason,
    getActiveDoctorWhere,
    hasHospitalDoctorAccess,
    resolveAssignedDoctorIds,
} from '@/lib/clinicStaffAccess';

const VALID_APPOINTMENT_STATUSES = new Set([
    'BOOKED',
    'PENDING',
    'COMPLETED',
    'CANCELLED',
]);

function jsonSafe<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
    ) as T;
}

function normalizePhone(value: string | null | undefined) {
    return String(value || '').replace(/\D/g, '');
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

async function getPatientScopedIds(userId: number) {
    const sessionPatient = await prisma.patients.findUnique({
        where: { patient_id: userId },
        select: { patient_id: true, phone: true, admin_id: true },
    });

    if (!sessionPatient) return [];
    if (!sessionPatient.phone) return [sessionPatient.patient_id];

    const relatedPatients = await prisma.patients.findMany({
        where: { admin_id: sessionPatient.admin_id },
        select: { patient_id: true, phone: true },
    });

    return relatedPatients
        .filter((patient) => phonesMatch(patient.phone, sessionPatient.phone))
        .map((patient) => patient.patient_id);
}

async function getStaffAppointmentScope(userId: number) {
    const staff = await prisma.clinic_staff.findUnique({
        where: { user_id: userId },
        include: {
            doctors: { select: { admin_id: true } },
            clinics: { select: { hospital_group_code: true } },
            doctor_access: { select: { doctor_id: true } },
        },
    });

    if (!staff) return null;
    if (getClinicStaffAccessBlockReason(staff)) return null;

    const rawHasDoctorMappings = hasHospitalDoctorAccess(staff);
    const rawAssignedDoctorIds = resolveAssignedDoctorIds(staff);
    const scopedHospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim() || null;
    const hasDoctorMappings = rawHasDoctorMappings && Boolean(scopedHospitalGroupCode);
    const activeDoctors = await prisma.doctors.findMany({
        where: {
            doctor_id: { in: rawAssignedDoctorIds },
            ...getActiveDoctorWhere(),
        },
        select: { doctor_id: true },
    });
    const activeDoctorIds = activeDoctors.map((doctor) => Number(doctor.doctor_id));
    const assignedDoctorIds = hasDoctorMappings
        ? activeDoctorIds
        : activeDoctorIds.filter((doctorId) => doctorId === Number(staff.doctor_id));
    if (assignedDoctorIds.length === 0) return null;
    let allowedClinicIds: number[] = [];

    if (hasDoctorMappings) {
        const clinics = await prisma.clinics.findMany({
            where: {
                doctor_id: { in: assignedDoctorIds },
                status: "ACTIVE",
                ...(scopedHospitalGroupCode
                    ? { hospital_group_code: scopedHospitalGroupCode }
                    : {}),
            },
            select: { clinic_id: true },
        });
        allowedClinicIds = clinics.map((clinic) => Number(clinic.clinic_id));
        if (allowedClinicIds.length === 0) return null;
    } else if (staff.clinic_id) {
        const clinic = await prisma.clinics.findFirst({
            where: {
                clinic_id: Number(staff.clinic_id),
                doctor_id: staff.doctor_id,
                status: "ACTIVE",
            },
            select: { clinic_id: true },
        });
        allowedClinicIds = clinic ? [Number(clinic.clinic_id)] : [];
    } else {
        const clinics = await prisma.clinics.findMany({
            where: {
                doctor_id: staff.doctor_id,
                status: "ACTIVE",
            },
            select: { clinic_id: true },
        });
        allowedClinicIds = clinics.map((clinic) => Number(clinic.clinic_id));
    }

    return {
        staff,
        hasDoctorMappings,
        assignedDoctorIds,
        allowedClinicIds,
        scopedHospitalGroupCode,
    };
}

async function getAllowedClinicForStaff(userId: number, clinicId: number) {
    const scope = await getStaffAppointmentScope(userId);
    if (!scope) return null;
    if (!Number.isFinite(clinicId) || clinicId <= 0) return { scope, clinic: null };
    if (scope.hasDoctorMappings && !scope.allowedClinicIds.includes(clinicId)) {
        return { scope, clinic: null };
    }

    const clinic = await prisma.clinics.findFirst({
        where: {
            clinic_id: clinicId,
            doctor_id: { in: scope.assignedDoctorIds },
            status: "ACTIVE",
            doctor: { is: getActiveDoctorWhere() },
        },
        select: {
            clinic_id: true,
            doctor_id: true,
            admin_id: true,
        },
    });

    return { scope, clinic };
}

async function canStaffAccessAppointment(userId: number, appointment: { doctor_id: number | null; clinic_id: number | null }) {
    const scope = await getStaffAppointmentScope(userId);
    if (!scope) return false;

    const doctorId = Number(appointment.doctor_id || 0);
    const clinicId = Number(appointment.clinic_id || 0);

    if (scope.hasDoctorMappings) {
        return (
            scope.assignedDoctorIds.includes(doctorId) &&
            (!clinicId || scope.allowedClinicIds.includes(clinicId))
        );
    }

    if (scope.staff.clinic_id) {
        return clinicId === Number(scope.staff.clinic_id);
    }

    return doctorId === Number(scope.staff.doctor_id);
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        let doctorId = searchParams.get('doctorId');
        let adminId = searchParams.get('adminId');
        const clinicId = searchParams.get('clinicId');
        const date = searchParams.get('date');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const status = searchParams.get('status');

        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }

        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = verifyToken(token);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let isClinicStaff = false;
        let staffClinicId: number | null = null;
        let staffDoctorIds: number[] = [];
        let staffAllowedClinicIds: number[] = [];
        let staffHasDoctorMappings = false;

        // Automatic role-based filtering
        if (user.role === 'DOCTOR') {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true }
            });
            if (doctor) {
                doctorId = String(doctor.doctor_id);
            } else {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }
        } else if (user.role === 'CLINIC_STAFF') {
            const scope = await getStaffAppointmentScope(user.userId);
            if (scope) {
                doctorId = String(scope.staff.doctor_id);
                isClinicStaff = true;
                staffClinicId = scope.staff.clinic_id;
                staffDoctorIds = scope.assignedDoctorIds;
                staffAllowedClinicIds = scope.allowedClinicIds;
                staffHasDoctorMappings = scope.hasDoctorMappings;
            } else {
                return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
            }
        } else if (user.role === 'ADMIN') {
            const admin = await prisma.admins.findUnique({
                where: { user_id: user.userId },
                select: { admin_id: true }
            });
            if (admin) {
                adminId = String(admin.admin_id);
            }
        }

        const where: Prisma.appointmentWhereInput = {};
        if (isClinicStaff && staffHasDoctorMappings) {
            where.doctor_id = { in: staffDoctorIds };
        } else if (doctorId) {
            where.doctor_id = Number(doctorId);
        }
        if (adminId) where.admin_id = Number(adminId);
        if (clinicId) {
            const requestedClinicId = Number(clinicId);
            if (isClinicStaff && staffHasDoctorMappings && !staffAllowedClinicIds.includes(requestedClinicId)) {
                return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
            }
            where.clinic_id = requestedClinicId;
        }
        if (isClinicStaff && staffHasDoctorMappings && !clinicId && staffAllowedClinicIds.length > 0) {
            where.clinic_id = { in: staffAllowedClinicIds };
        }
        if (isClinicStaff && !staffHasDoctorMappings && staffClinicId) where.clinic_id = staffClinicId;
        if (isClinicStaff) {
            where.doctor = { is: getActiveDoctorWhere() };
            where.clinic = { is: { status: "ACTIVE" } };
        }
        if (status && status !== 'ALL' && VALID_APPOINTMENT_STATUSES.has(status)) {
            where.status = status as never;
        }
        if (date) {
            const dateStart = parseISTDate(date);
            const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
            where.appointment_date = { gte: dateStart, lt: dateEnd };
        } else if (dateFrom || dateTo) {
            const range: Record<string, Date> = {};
            if (dateFrom) {
                range.gte = parseISTDate(dateFrom);
            }
            if (dateTo) {
                const endStart = parseISTDate(dateTo);
                range.lt = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
            }
            where.appointment_date = range;
        }

        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                patient: true,
                doctor: true,
                clinic: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        let appointmentsWithBookingIds;
        try {
            appointmentsWithBookingIds = await attachBookingIds(appointments);
        } catch (bookingError) {
            console.error("Error attaching booking IDs:", bookingError);
            appointmentsWithBookingIds = appointments.map((appointment) => ({
                ...appointment,
                booking_id: appointment.booking_id ?? null,
            }));
        }

        return NextResponse.json(jsonSafe(appointmentsWithBookingIds));
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
        let doctor_id = body.doctor_id;
        const clinic_id = body.clinic_id;
        let admin_id = body.admin_id;
        const booking_for = String(body.booked_for || body.booking_for || "SELF").trim().toUpperCase();
        const appointment_date = body.appointment_date;
        const start_time = body.start_time;
        const end_time = body.end_time;
        const patient_phone = String(body.patient_phone || '').trim();
        const patient_name = String(body.patient_name || '').trim();

        // Resolve IDs from session
        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;
        let sessionUser: ReturnType<typeof verifyToken> | null = null;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }
        if (token) {
            const user = verifyToken(token);
            sessionUser = user;
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
                } else if (user.role === 'CLINIC_STAFF') {
                    const scopedClinic = await getAllowedClinicForStaff(user.userId, Number(clinic_id));
                    if (!scopedClinic?.scope) {
                        return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
                    }
                    if (scopedClinic.scope.staff.staff_role === "VIEWER" || scopedClinic.scope.staff.staff_role === "Viewer") {
                        return NextResponse.json({ error: "Viewers cannot create appointments" }, { status: 403 });
                    }
                    const requestedClinicId = Number(clinic_id);
                    if (!Number.isFinite(requestedClinicId) || requestedClinicId <= 0) {
                        return NextResponse.json({ error: "Clinic ID required" }, { status: 400 });
                    }
                    if (!scopedClinic.clinic) {
                        return NextResponse.json({ error: "Cannot create appointments for other clinics" }, { status: 403 });
                    }
                    doctor_id = scopedClinic.clinic.doctor_id;
                    admin_id = scopedClinic.clinic.admin_id;
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

        const numericDoctorId = Number(doctor_id);
        const numericClinicId = Number(clinic_id);
        if (!Number.isFinite(numericDoctorId) || numericDoctorId <= 0 || !Number.isFinite(numericClinicId) || numericClinicId <= 0) {
            return NextResponse.json({ error: "Doctor and clinic are required" }, { status: 400 });
        }

        const activeClinicForBooking = await prisma.clinics.findFirst({
            where: {
                clinic_id: numericClinicId,
                doctor_id: numericDoctorId,
                status: "ACTIVE",
                doctor: { is: getActiveDoctorWhere() },
            },
            select: { clinic_id: true },
        });

        if (!activeClinicForBooking) {
            return NextResponse.json({ error: "Doctor or clinic is inactive. Appointment cannot be booked." }, { status: 403 });
        }


        if (!appointment_date || !start_time || !end_time) {
            return NextResponse.json({ error: 'Date and time required' }, { status: 400 });
        }

        if (booking_for !== "SELF" && booking_for !== "OTHER") {
            return NextResponse.json({ error: 'Invalid booking_for value' }, { status: 400 });
        }

        if (!patient_phone || !patient_name) {
            return NextResponse.json({ error: 'Patient phone and patient name are required' }, { status: 400 });
        }

        // Construct Date objects
        const dateObj = parseISTDate(appointment_date);
        const leave = await getDoctorFullDayLeave(Number(doctor_id), appointment_date);
        if (leave) {
            return NextResponse.json(
                { error: leave.reason ? `Doctor is on leave for this date: ${leave.reason}` : "Doctor is on leave for this date" },
                { status: 409 }
            );
        }
        const startTimeObj = parseISTTimeToUTCDate(start_time);
        const endTimeObj = parseISTTimeToUTCDate(end_time);
        const appointmentBookingId = await computeBookingIdForAppointment({
            doctor_id: Number(doctor_id),
            clinic_id: Number(clinic_id),
            appointment_date: dateObj,
            start_time: startTimeObj,
        });

        const existingAppointmentsCount = await prisma.appointment.count({
            where: {
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                appointment_date: dateObj
            }
        });
        const booking_id = existingAppointmentsCount + 1;

        const existingPatientsOnPhone = await prisma.patients.findMany({
            where: {
                admin_id: Number(admin_id),
            },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                doctor_id: true,
                profile_type: true,
            },
            orderBy: {
                patient_id: 'desc'
            }
        });

        const matchingPatientsOnPhone = existingPatientsOnPhone.filter((p) => phonesMatch(p.phone, patient_phone));
        const targetProfileType = booking_for === "OTHER" ? "OTHER" : "SELF";
        const matchingPatientsForProfile = matchingPatientsOnPhone.filter((p) => p.profile_type === targetProfileType);
        const normalizedPatientName = patient_name.trim().toLowerCase();
        let patient =
            matchingPatientsForProfile.find((p) =>
                String(p.full_name || '').trim().toLowerCase() === normalizedPatientName &&
                Number(p.doctor_id || 0) === Number(doctor_id)
            ) ||
            matchingPatientsForProfile.find((p) =>
                String(p.full_name || '').trim().toLowerCase() === normalizedPatientName
            ) ||
            matchingPatientsForProfile[0] ||
            null;

        if (!patient) {
            patient = await prisma.patients.create({
                data: {
                    phone: patient_phone,
                    admin_id: Number(admin_id),
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id,
                    profile_type: targetProfileType,
                    full_name: patient_name,
                }
            });
        } else {
            // Reuse the single SELF/OTHER profile on this phone and keep its current name authoritative.
            patient = await prisma.patients.update({
                where: { patient_id: patient.patient_id },
                data: {
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id,
                }
            });
        }

        const existingSameDay = await prisma.appointment.findFirst({
            where: {
                patient_id: patient.patient_id,
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                appointment_date: dateObj,
            },
            orderBy: { appointment_id: "desc" },
        });

        const existingExactSlot = await prisma.appointment.findFirst({
            where: {
                doctor_id: Number(doctor_id),
                appointment_date: dateObj,
                start_time: startTimeObj,
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

            if (
                existingExactSlot &&
                existingExactSlot.appointment_id !== existingSameDay.appointment_id
            ) {
                if (existingExactSlot.status !== "CANCELLED") {
                    return NextResponse.json(
                        { error: "Slot already booked" },
                        { status: 409 }
                    );
                }
                await releaseCancelledSlotReservation(existingExactSlot.appointment_id);
            }

            const rescheduled = await prisma.appointment.update({
                where: { appointment_id: existingSameDay.appointment_id },
                data: {
                    start_time: startTimeObj,
                    end_time: endTimeObj,
                    status: "BOOKED",
                    booked_for: booking_for,
                    channel: "web",
                    rescheduled_by: String(sessionUser?.role || "DOCTOR"),
                    ...(appointmentBookingId != null ? { booking_id: appointmentBookingId } : {}),
                },
            });

            return NextResponse.json({
                ...rescheduled,
                booking_for,
                patient_name: patient.full_name,
                patient_reused: Boolean(
                    existingPatientsOnPhone.some((p) => p.patient_id === patient.patient_id)
                ),
                rescheduled_existing: true,
            });
        }

        if (existingExactSlot) {
            if (existingExactSlot.status !== "CANCELLED") {
                return NextResponse.json(
                    { error: "Slot already booked" },
                    { status: 409 }
                );
            }
            await releaseCancelledSlotReservation(existingExactSlot.appointment_id);
        }

        const appointment = await prisma.appointment.create({
            data: {
                status: 'BOOKED',
                booked_for: booking_for,
                channel: "web",
                appointment_date: dateObj,
                start_time: startTimeObj,
                end_time: endTimeObj,
                patient: {
                    connect: { patient_id: patient.patient_id },
                },
                doctor: {
                    connect: { doctor_id: Number(doctor_id) },
                },
                clinic: {
                    connect: { clinic_id: Number(clinic_id) },
                },
                admin: {
                    connect: { admin_id: Number(admin_id) },
                },
                ...(appointmentBookingId != null ? { booking_id: appointmentBookingId } : {}),
            }
        });

        await createPendingSmsNotificationLog({
            appointmentId: appointment.appointment_id,
            destination: patient_phone,
            adminId: Number(admin_id),
            sourceChannel: "web",
        });

        return NextResponse.json({
            ...appointment,
            booking_for,
            patient_name: patient.full_name,
            patient_reused: Boolean(
                existingPatientsOnPhone.some((p) => p.patient_id === patient.patient_id)
            ),
            rescheduled_existing: false,
        });

    } catch (error: unknown) {
        console.error('Error creating appointment:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Slot already booked' },
                { status: 409 }
            );
        }
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

        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }
        if (token) {
            const user = verifyToken(token);
            if (user && user.role === 'CLINIC_STAFF') {
                const scope = await getStaffAppointmentScope(user.userId);
                if (scope?.staff.staff_role === "VIEWER" || scope?.staff.staff_role === "Viewer") {
                    return NextResponse.json({ error: "Viewers cannot delete appointments" }, { status: 403 });
                }
                if (scope) {
                    const apt = await prisma.appointment.findUnique({
                        where: { appointment_id: Number(appointmentId) },
                        select: { clinic_id: true, doctor_id: true },
                    });
                    if (apt && !(await canStaffAccessAppointment(user.userId, apt))) {
                        return NextResponse.json({ error: "Unauthorized for this appointment" }, { status: 403 });
                    }
                } else {
                    return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
                }
            }
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
        const { appointmentId, status, appointment_date, start_time, end_time, cancelled_by, rescheduled_by } = body;
        const booking_for = body.booked_for ?? body.booking_for;

        if (!appointmentId) {
            return NextResponse.json({ error: "Appointment ID required" }, { status: 400 });
        }

        const cookieStore = await cookies();
        let token = cookieStore.get("token")?.value;

        if (!token) {
            const authHeader = request.headers.get("Authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const user = verifyToken(token);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (user.role === "CLINIC_STAFF") {
            const scope = await getStaffAppointmentScope(user.userId);
            if (scope?.staff.staff_role === "VIEWER" || scope?.staff.staff_role === "Viewer") {
                return NextResponse.json({ error: "Viewers cannot update appointments" }, { status: 403 });
            }
            if (scope) {
                const apt = await prisma.appointment.findUnique({
                    where: { appointment_id: Number(appointmentId) },
                    select: { clinic_id: true, doctor_id: true },
                });
                if (apt && !(await canStaffAccessAppointment(user.userId, apt))) {
                    return NextResponse.json({ error: "Unauthorized for this appointment" }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
            }
        }

        if (user.role === "PATIENT") {
            const allowedPatientIds = await getPatientScopedIds(user.patientId ?? user.userId);
            if (allowedPatientIds.length === 0) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            const existingForPatient = await prisma.appointment.findFirst({
                where: {
                    appointment_id: Number(appointmentId),
                    patient_id: { in: allowedPatientIds },
                },
                select: { appointment_id: true },
            });

            if (!existingForPatient) {
                return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
            }
        }

        const hasRescheduleFields = Boolean(appointment_date || start_time || end_time);
        if (!status && !hasRescheduleFields) {
            return NextResponse.json(
                { error: "Provide status or reschedule fields" },
                { status: 400 }
            );
        }

        if (booking_for !== undefined) {
            const normalizedBookingFor = String(booking_for).trim().toUpperCase();
            if (normalizedBookingFor !== "SELF" && normalizedBookingFor !== "OTHER") {
                return NextResponse.json({ error: "Invalid booking_for value" }, { status: 400 });
            }

            const existingAppointment = await prisma.appointment.findUnique({
                where: { appointment_id: Number(appointmentId) },
                select: {
                    patient: {
                        select: {
                            profile_type: true,
                        },
                    },
                },
            });

            const currentProfileType = existingAppointment?.patient?.profile_type || "SELF";
            if (currentProfileType !== normalizedBookingFor) {
                return NextResponse.json(
                    { error: "Changing booking_for on an existing appointment is not supported" },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, unknown> = {};
        const currentAppointment = await prisma.appointment.findUnique({
            where: { appointment_id: Number(appointmentId) },
            select: {
                appointment_id: true,
                doctor_id: true,
                clinic_id: true,
                appointment_date: true,
                start_time: true,
                end_time: true,
                status: true,
            },
        });

        if (!currentAppointment) {
            return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
        }

        if (status) updateData.status = status;
        if (appointment_date) updateData.appointment_date = parseISTDate(appointment_date);
        if (start_time) updateData.start_time = parseISTTimeToUTCDate(start_time);
        if (end_time) updateData.end_time = parseISTTimeToUTCDate(end_time);
        if (cancelled_by) updateData.cancelled_by = cancelled_by;
        if (rescheduled_by) updateData.rescheduled_by = rescheduled_by;
        if (booking_for !== undefined) updateData.booked_for = String(booking_for).trim().toUpperCase();
        if (hasRescheduleFields && !status) {
            updateData.status = "BOOKED";
        }

        if (hasRescheduleFields) {
            const nextDate = appointment_date ? parseISTDate(appointment_date) : currentAppointment.appointment_date || null;
            const nextStart = start_time ? parseISTTimeToUTCDate(start_time) : currentAppointment.start_time || null;
            const targetDateStr = appointment_date || (nextDate ? formatDateToISTYMD(nextDate) : "");
            if (currentAppointment.doctor_id && targetDateStr) {
                const leave = await getDoctorFullDayLeave(currentAppointment.doctor_id, targetDateStr);
                if (leave) {
                    return NextResponse.json(
                        { error: leave.reason ? `Doctor is on leave for this date: ${leave.reason}` : "Doctor is on leave for this date" },
                        { status: 409 }
                    );
                }
            }
            const bookingId = await computeBookingIdForAppointment({
                doctor_id: currentAppointment.doctor_id ?? null,
                clinic_id: currentAppointment.clinic_id ?? null,
                appointment_date: nextDate,
                start_time: nextStart,
            });
            if (bookingId != null) {
                updateData.booking_id = bookingId;
            }

            if (nextDate && nextStart) {
                const exactSlotConflict = await prisma.appointment.findFirst({
                    where: {
                        appointment_id: { not: Number(appointmentId) },
                        doctor_id: currentAppointment.doctor_id ?? undefined,
                        appointment_date: nextDate,
                        start_time: nextStart,
                    },
                    orderBy: { appointment_id: "desc" },
                });

                if (exactSlotConflict) {
                    if (exactSlotConflict.status === "CANCELLED") {
                        await releaseCancelledSlotReservation(exactSlotConflict.appointment_id);
                    } else {
                        return NextResponse.json(
                            { error: "Slot already booked" },
                            { status: 409 }
                        );
                    }
                }
            }
        }

        if (status === "CANCELLED" && currentAppointment.status !== "CANCELLED") {
            const released = await releaseCancelledSlotReservation(Number(appointmentId));
            if (released?.start_time) {
                updateData.start_time = released.start_time;
            }
            if (released?.end_time) {
                updateData.end_time = released.end_time;
            }
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { appointment_id: Number(appointmentId) },
            data: updateData
        });

        return NextResponse.json(jsonSafe(updatedAppointment));
    } catch (error) {
        console.error('Error updating appointment:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Slot already booked' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to update appointment' },
            { status: 500 }
        );
    }
}
