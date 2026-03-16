import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';
import { Prisma } from '@/generated/prisma/client';
import { parseISTDate, parseISTTimeToUTCDate } from '@/lib/appointmentDateTime';

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
        let staffRole = "";

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
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId }
            });
            if (staff) {
                doctorId = String(staff.doctor_id);
                isClinicStaff = true;
                staffClinicId = staff.clinic_id;
                staffRole = staff.staff_role;
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
        if (doctorId) where.doctor_id = Number(doctorId);
        if (adminId) where.admin_id = Number(adminId);
        if (clinicId) where.clinic_id = Number(clinicId);
        if (isClinicStaff && staffClinicId) where.clinic_id = staffClinicId;
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


        return NextResponse.json(jsonSafe(appointments));
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
        const booking_for = String(body.booking_for || "SELF").toUpperCase();
        const appointment_date = body.appointment_date;
        const start_time = body.start_time;
        const end_time = body.end_time;
        const patient_phone = String(body.patient_phone || '').trim();
        const patient_name = String(body.patient_name || '').trim();

        // Resolve IDs from session
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
                    const staff = await prisma.clinic_staff.findUnique({
                        where: { user_id: user.userId },
                        include: { doctors: true }
                    });
                    if (staff) {
                        if (staff.staff_role === "VIEWER" || staff.staff_role === "Viewer") {
                            return NextResponse.json({ error: "Viewers cannot create appointments" }, { status: 403 });
                        }
                        if (staff.clinic_id && clinic_id && staff.clinic_id !== Number(clinic_id)) {
                            return NextResponse.json({ error: "Cannot create appointments for other clinics" }, { status: 403 });
                        }
                        doctor_id = staff.doctor_id;
                        admin_id = staff.doctors?.admin_id;
                    }
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
        const startTimeObj = parseISTTimeToUTCDate(start_time);
        const endTimeObj = parseISTTimeToUTCDate(end_time);

        const existingAppointmentsCount = await prisma.appointment.count({
            where: {
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                appointment_date: dateObj
            }
        });
        const booking_id = existingAppointmentsCount + 1;

        // Find exact same patient first in the same admin/doctor scope.
        let patient = await prisma.patients.findFirst({
            where: {
                phone: patient_phone,
                full_name: patient_name,
                admin_id: Number(admin_id),
                doctor_id: Number(doctor_id),
            },
            orderBy: {
                patient_id: 'desc'
            }
        });

        const existingPatientsOnPhone = await prisma.patients.findMany({
            where: {
                phone: patient_phone,
                admin_id: Number(admin_id),
                doctor_id: Number(doctor_id),
            },
            select: {
                patient_id: true,
                full_name: true,
            },
            orderBy: {
                patient_id: 'desc'
            }
        });

        const normalizedPatientName = patient_name.trim().toLowerCase();
        const hasDifferentExistingName = existingPatientsOnPhone.some((p) => {
            const existingName = String(p.full_name || '').trim().toLowerCase();
            return Boolean(existingName) && existingName !== normalizedPatientName;
        });

        // SELF means the doctor is booking for an already-known patient on that phone.
        // If the phone already has another patient name and this submitted name doesn't match
        // an existing record, force the caller to switch to OTHER instead of silently creating one.
        if (!patient && booking_for === "SELF" && hasDifferentExistingName) {
            return NextResponse.json(
                {
                    error: 'This phone already has a different patient name. Choose an existing name or book as Other.',
                },
                { status: 409 }
            );
        }

        if (!patient) {
            patient = await prisma.patients.create({
                data: {
                    phone: patient_phone,
                    admin_id: Number(admin_id),
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id,
                    full_name: patient_name,
                }
            });
        } else {
            // Update existing patient with current doctor and booking id
            patient = await prisma.patients.update({
                where: { patient_id: patient.patient_id },
                data: {
                    doctor_id: Number(doctor_id),
                    booking_id: booking_id,
                    full_name: patient_name,
                }
            });
        }

        const appointment = await prisma.appointment.create({
            data: {
                patient_id: patient.patient_id,
                doctor_id: Number(doctor_id),
                clinic_id: Number(clinic_id),
                admin_id: Number(admin_id),
                status: 'BOOKED',
                appointment_date: dateObj,
                start_time: startTimeObj,
                end_time: endTimeObj
            }
        });

        return NextResponse.json({
            ...appointment,
            booking_for,
            patient_reused: Boolean(
                existingPatientsOnPhone.some((p) => p.patient_id === patient.patient_id)
            ),
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
                const staff = await prisma.clinic_staff.findUnique({
                    where: { user_id: user.userId }
                });
                if (staff?.staff_role === "VIEWER" || staff?.staff_role === "Viewer") {
                    return NextResponse.json({ error: "Viewers cannot delete appointments" }, { status: 403 });
                }
                if (staff?.clinic_id) {
                    const apt = await prisma.appointment.findUnique({ where: { appointment_id: Number(appointmentId) } });
                    if (apt && apt.clinic_id !== staff.clinic_id) {
                        return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
                    }
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
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId }
            });
            if (staff?.staff_role === "VIEWER" || staff?.staff_role === "Viewer") {
                return NextResponse.json({ error: "Viewers cannot update appointments" }, { status: 403 });
            }
            if (staff?.clinic_id) {
                const apt = await prisma.appointment.findUnique({ where: { appointment_id: Number(appointmentId) } });
                if (apt && apt.clinic_id !== staff.clinic_id) {
                    return NextResponse.json({ error: "Unauthorized for this clinic" }, { status: 403 });
                }
            }
        }

        const hasRescheduleFields = Boolean(appointment_date || start_time || end_time);
        if (!status && !hasRescheduleFields) {
            return NextResponse.json(
                { error: "Provide status or reschedule fields" },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (appointment_date) updateData.appointment_date = parseISTDate(appointment_date);
        if (start_time) updateData.start_time = parseISTTimeToUTCDate(start_time);
        if (end_time) updateData.end_time = parseISTTimeToUTCDate(end_time);
        if (cancelled_by) updateData.cancelled_by = cancelled_by;
        if (rescheduled_by) updateData.rescheduled_by = rescheduled_by;
        if (hasRescheduleFields && !status) {
            updateData.status = "BOOKED";
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { appointment_id: Number(appointmentId) },
            data: updateData
        });

        return NextResponse.json(jsonSafe(updatedAppointment));
    } catch (error) {
        console.error('Error updating appointment:', error);
        return NextResponse.json(
            { error: 'Failed to update appointment' },
            { status: 500 }
        );
    }
}
