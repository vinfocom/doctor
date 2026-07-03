export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { formatDateToISTYMD, getISTDateParts, getISTDayOfWeek, parseISTDate } from "@/lib/appointmentDateTime";
import {
    getActiveDoctorWhere,
    getClinicStaffAccessBlockReason,
    hasHospitalDoctorAccess,
    resolveAssignedDoctorIds,
} from "@/lib/clinicStaffAccess";

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        let doctorId = searchParams.get("doctorId");
        const clinicId = searchParams.get("clinicId");
        const fromDateStr = searchParams.get("fromDate"); // optional, default today
        const daysParam = searchParams.get("days");       // optional, default 60

        if (!clinicId) {
            return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
        }

        if (!doctorId && session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (doctor?.doctor_id) {
                doctorId = String(doctor.doctor_id);
            }
        } else if (!doctorId && session.role === "CLINIC_STAFF") {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: session.userId },
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
            if (staff?.doctor_id) {
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

        if (!doctorId) {
            return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
        }

        const days = Math.min(Number(daysParam) || 60, 120); // cap at 120 days

        // Build "today" in IST
        const today = getISTDateParts(new Date());

        // Start date — either fromDate param or today
        let startDate: Date;
        if (fromDateStr) {
            startDate = parseISTDate(fromDateStr);
        } else {
            startDate = parseISTDate(`${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`);
        }

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + days);

        // 1. Fetch all schedules for this doctor+clinic combination
        const schedules = await prisma.doctor_clinic_schedule.findMany({
            where: {
                doctor_id: Number(doctorId),
                clinic_id: Number(clinicId),
            },
            select: {
                day_of_week: true,
                effective_from: true,
                effective_to: true,
            },
        });

        if (!schedules.length) {
            return NextResponse.json({ availableDates: [] });
        }

        // 2. Fetch all doctor leaves in the date range
        const leaves = await prisma.doctor_leaves.findMany({
            where: {
                doctor_id: Number(doctorId),
                leave_date: {
                    gte: parseISTDate(formatDate(startDate)),
                    lte: parseISTDate(formatDate(endDate)),
                },
            },
            select: {
                leave_date: true,
                start_time: true,
                end_time: true,
            },
        });

        // Build a set of full-day leave date strings (YYYY-MM-DD)
        // A leave without start/end time means full day
        const fullDayLeaves = new Set<string>();
        for (const leave of leaves) {
            if (!leave.start_time && !leave.end_time) {
                const d = new Date(leave.leave_date);
                fullDayLeaves.add(formatDateToISTYMD(d));
            }
        }

        // 3. Loop through each day in range and check if any schedule covers it
        const availableDates: string[] = [];
        const cursor = new Date(startDate);

        while (cursor < endDate) {
            const dateStr = formatDate(cursor);
            const dow = getISTDayOfWeek(dateStr);

            // Skip full-day leaves
            if (!fullDayLeaves.has(dateStr)) {
                // Check if any schedule covers this date
                const hasSchedule = schedules.some((s) => {
                    if (s.day_of_week !== dow) return false;
                    const effFrom = new Date(s.effective_from);
                    const effTo = new Date(s.effective_to);
                    // Normalize to date-only comparison
                    const cursorOnly = parseISTDate(dateStr);
                    const fromOnly = parseISTDate(formatDateToISTYMD(effFrom));
                    const toOnly = parseISTDate(formatDateToISTYMD(effTo));
                    return cursorOnly >= fromOnly && cursorOnly <= toOnly;
                });
                if (hasSchedule) {
                    availableDates.push(dateStr);
                }
            }

            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return NextResponse.json({ availableDates });
    } catch (err) {
        console.error("available-dates error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

function formatDate(d: Date): string {
    return formatDateToISTYMD(d);
}
