import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";
import { parseISTDate } from "@/lib/appointmentDateTime";
import { Prisma } from "@/generated/prisma/client";
import { attachBookingIds } from "@/lib/bookingId";
import {
    getActiveDoctorWhere,
    getClinicStaffAccessBlockReason,
    hasHospitalDoctorAccess,
    resolveAssignedDoctorIds,
} from "@/lib/clinicStaffAccess";

export const runtime = "nodejs";

const STATUS_LABELS: Record<string, string> = {
    BOOKED: "Booked",
    CONFIRMED: "Booked",
    PENDING: "Not Visited",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
};

const formatISTDate = (value: Date | string | null) => {
    if (!value) return "N/A";
    const iso = typeof value === "string" ? value : value.toISOString();
    const dateOnly = iso.slice(0, 10);
    const parsed = new Date(`${dateOnly}T00:00:00+05:30`);
    return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
};

const formatRangeLabel = (from: string, to: string) => {
    const fromLabel = formatISTDate(`${from}T00:00:00+05:30`);
    const toLabel = formatISTDate(`${to}T00:00:00+05:30`);
    return `${fromLabel} - ${toLabel}`;
};

const summarizeStatuses = (appointments: Array<{ status: string | null }>) => {
    const counts = {
        booked: 0,
        cancelled: 0,
        completed: 0,
        pending: 0,
    };
    for (const appointment of appointments) {
        const status = appointment.status || "";
        if (status === "BOOKED" || status === "CONFIRMED") counts.booked += 1;
        else if (status === "CANCELLED") counts.cancelled += 1;
        else if (status === "COMPLETED") counts.completed += 1;
        else if (status === "PENDING") counts.pending += 1;
    }
    return counts;
};

const buildPdfBuffer = async (payload: {
    rangeLabel: string;
    summary: { booked: number; cancelled: number; completed: number; pending: number };
    rows: Array<{ name: string; doctor: string; appointmentNo: string; clinic: string; date: string; status: string }>;
}) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageSize: [number, number] = [595.28, 841.89]; // A4
    const margin = 40;
    const lineHeight = 13;
    const headerGap = 6;
    const columns = [
        { label: "Patient Name", width: 120 },
        { label: "Doctor", width: 90 },
        { label: "Appt. No", width: 78 },
        { label: "Clinic", width: 86 },
        { label: "Appt. Date", width: 78 },
        { label: "Status", width: 58 },
    ];
    const totalWidth = columns.reduce((s, c) => s + c.width, 0);

    const truncateText = (text: string, width: number, fontSize: number) => {
        if (!text) return "";
        let trimmed = text;
        while (trimmed.length > 0 && font.widthOfTextAtSize(`${trimmed}…`, fontSize) > width) {
            trimmed = trimmed.slice(0, -1);
        }
        return trimmed.length < text.length ? `${trimmed}…` : trimmed;
    };

    const addPage = () => {
        const page = doc.addPage(pageSize);
        return {
            page,
            y: page.getHeight() - margin,
        };
    };

    let { page, y } = addPage();
    const startX = margin;

    const drawLine = (lineY: number) => {
        page.drawLine({
            start: { x: startX, y: lineY },
            end: { x: startX + totalWidth, y: lineY },
            thickness: 1,
            color: rgb(0.9, 0.9, 0.9),
        });
    };

    const drawText = (text: string, x: number, yPos: number, size: number, bold = false, color = rgb(0.22, 0.24, 0.27)) => {
        page.drawText(text, {
            x,
            y: yPos,
            size,
            font: bold ? fontBold : font,
            color,
        });
    };

    drawText("Appointment Report", startX, y, 18, true, rgb(0.07, 0.09, 0.12));
    y -= 18 + headerGap;
    drawText(`Date Range: ${payload.rangeLabel}`, startX, y, 11, false, rgb(0.42, 0.45, 0.49));
    y -= 11 + 4;
    drawText(
        `Summary: Booked ${payload.summary.booked} | Cancelled ${payload.summary.cancelled} | Completed ${payload.summary.completed} | Not Visited ${payload.summary.pending}`,
        startX,
        y,
        11,
        false,
        rgb(0.22, 0.24, 0.27)
    );
    y -= 18;

    let x = startX;
    for (const col of columns) {
        drawText(col.label, x, y, 9, true, rgb(0.07, 0.09, 0.12));
        x += col.width;
    }
    y -= 9 + 6;
    drawLine(y);
    y -= 8;

    for (const row of payload.rows) {
        if (y < margin + lineHeight) {
            ({ page, y } = addPage());
        }
        x = startX;
        const values = [row.name, row.doctor, row.appointmentNo, row.clinic, row.date, row.status];
        for (let i = 0; i < columns.length; i += 1) {
            const value = truncateText(values[i] || "", columns[i].width - 4, 9.5);
            drawText(value, x, y, 9.5, false, rgb(0.22, 0.24, 0.27));
            x += columns[i].width;
        }
        y -= lineHeight;
    }

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
};

const buildExcelBuffer = async (payload: {
    rangeLabel: string;
    summary: { booked: number; cancelled: number; completed: number; pending: number };
    rows: Array<{ name: string; doctor: string; appointmentNo: string; clinic: string; date: string; status: string }>;
}) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Appointments");

    sheet.addRow(["Appointment Report"]);
    sheet.addRow([`Date Range: ${payload.rangeLabel}`]);
    sheet.addRow([
        `Summary: Booked ${payload.summary.booked} | Cancelled ${payload.summary.cancelled} | Completed ${payload.summary.completed} | Not Visited ${payload.summary.pending}`,
    ]);
    sheet.addRow([]);
    sheet.addRow(["Patient Name", "Doctor", "Appointment No", "Clinic", "Appointment Date", "Appointment Status"]);

    for (const row of payload.rows) {
        sheet.addRow([row.name, row.doctor, row.appointmentNo, row.clinic, row.date, row.status]);
    }

    sheet.getRow(1).font = { size: 16, bold: true };
    sheet.getRow(2).font = { size: 11, color: { argb: "FF6B7280" } };
    sheet.getRow(3).font = { size: 11, color: { argb: "FF374151" } };
    sheet.getRow(5).font = { bold: true };
    sheet.columns = [
        { width: 26 },
        { width: 24 },
        { width: 18 },
        { width: 22 },
        { width: 18 },
        { width: 18 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get("dateFrom") || "";
        const dateTo = searchParams.get("dateTo") || "";
        const format = (searchParams.get("format") || "pdf").toLowerCase();
        const selectedDoctorIds = searchParams
            .getAll("doctorId")
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0);

        if (!dateFrom || !dateTo) {
            return NextResponse.json({ error: "dateFrom and dateTo required" }, { status: 400 });
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

        let doctorId: string | null = null;
        let adminId: string | null = null;
        let isClinicStaff = false;
        let staffClinicId: number | null = null;
        let assignedDoctorIds: number[] = [];

        if (user.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.userId },
                select: { doctor_id: true },
            });
            if (!doctor) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            doctorId = String(doctor.doctor_id);
        } else if (user.role === "CLINIC_STAFF") {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.userId },
                include: {
                    clinics: {
                        select: {
                            hospital_group_code: true,
                        },
                    },
                    doctor_access: {
                        select: {
                            doctor_id: true,
                        },
                    },
                },
            });
            if (!staff) return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
            const staffBlockReason = getClinicStaffAccessBlockReason(staff);
            if (staffBlockReason) {
                return NextResponse.json({ error: staffBlockReason }, { status: 403 });
            }
            doctorId = String(staff.doctor_id);
            isClinicStaff = true;
            staffClinicId = staff.clinic_id;
            const rawAssignedDoctorIds = resolveAssignedDoctorIds(staff);
            const staffHospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim();
            const canUseHospitalScope = hasHospitalDoctorAccess(staff) && Boolean(staffHospitalGroupCode);
            const activeDoctors = await prisma.doctors.findMany({
                where: {
                    doctor_id: { in: rawAssignedDoctorIds },
                    ...getActiveDoctorWhere(),
                },
                select: { doctor_id: true },
            });
            assignedDoctorIds = activeDoctors.map((doctor) => Number(doctor.doctor_id));
            if (!canUseHospitalScope) {
                assignedDoctorIds = assignedDoctorIds.filter((id) => id === Number(staff.doctor_id));
            }
            if (assignedDoctorIds.length === 0) {
                return NextResponse.json({ error: "No active assigned doctors found" }, { status: 403 });
            }
        } else if (user.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: user.userId },
                select: { admin_id: true },
            });
            if (admin) {
                adminId = String(admin.admin_id);
            }
        }

        const range: Record<string, Date> = {
            gte: parseISTDate(dateFrom),
            lt: new Date(parseISTDate(dateTo).getTime() + 24 * 60 * 60 * 1000),
        };

        const where: Prisma.appointmentWhereInput = {
            appointment_date: range,
        };
        if (isClinicStaff) {
            if (selectedDoctorIds.length > 0) {
                const invalidDoctorIds = selectedDoctorIds.filter((doctorId) => !assignedDoctorIds.includes(doctorId));
                if (invalidDoctorIds.length > 0) {
                    return NextResponse.json({ error: "Forbidden doctor selection" }, { status: 403 });
                }
                where.doctor_id = selectedDoctorIds.length === 1 ? selectedDoctorIds[0] : { in: selectedDoctorIds };
            } else if (assignedDoctorIds.length > 1) {
                where.doctor_id = { in: assignedDoctorIds };
            } else if (doctorId) {
                where.doctor_id = Number(doctorId);
            }
        } else if (doctorId) {
            where.doctor_id = Number(doctorId);
        }
        if (adminId) where.admin_id = Number(adminId);
        if (isClinicStaff) {
            where.doctor = { is: getActiveDoctorWhere() };
            where.clinic = { is: { status: "ACTIVE" } };
        }
        if (isClinicStaff && staffClinicId) {
            const scopedClinic = await prisma.clinics.findUnique({
                where: { clinic_id: staffClinicId },
                select: { hospital_group_code: true },
            });

            const hospitalGroupCode = String(scopedClinic?.hospital_group_code || "").trim();

            if (hospitalGroupCode && assignedDoctorIds.length > 1) {
                const allowedClinics = await prisma.clinics.findMany({
                    where: {
                        doctor_id: { in: assignedDoctorIds },
                        hospital_group_code: hospitalGroupCode,
                        status: "ACTIVE",
                    },
                    select: { clinic_id: true },
                });

                const allowedClinicIds = allowedClinics
                    .map((clinic) => Number(clinic.clinic_id))
                    .filter((clinicId) => Number.isFinite(clinicId) && clinicId > 0);

                if (allowedClinicIds.length > 0) {
                    where.clinic_id = { in: allowedClinicIds };
                } else {
                    where.clinic_id = -1;
                }
            } else {
                where.clinic_id = staffClinicId;
            }
        }

        const appointments = await prisma.appointment.findMany({
            where,
            include: { patient: true, clinic: true, doctor: true },
            orderBy: [{ appointment_date: "asc" }, { start_time: "asc" }],
        });

        const appointmentsWithBookingIds = await attachBookingIds(appointments);

        const rows = appointmentsWithBookingIds.map((apt) => ({
            name: apt.patient?.full_name || "Unknown",
            doctor: apt.doctor?.doctor_name
                ? (/^dr\.?\s/i.test(apt.doctor.doctor_name) ? apt.doctor.doctor_name : `Dr. ${apt.doctor.doctor_name}`)
                : "N/A",
            appointmentNo: String(apt.booking_id ?? apt.appointment_id),
            clinic: apt.clinic?.clinic_name || "N/A",
            date: formatISTDate(apt.appointment_date),
            status: STATUS_LABELS[apt.status || ""] || apt.status || "N/A",
        }));

        const summary = summarizeStatuses(appointments);
        const rangeLabel = formatRangeLabel(dateFrom, dateTo);

        if (format === "excel" || format === "xlsx") {
            const buffer = await buildExcelBuffer({ rangeLabel, summary, rows });
            const filename = `appointments_${dateFrom.replaceAll("-", "")}_${dateTo.replaceAll("-", "")}.xlsx`;
            return new NextResponse(buffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${filename}"`,
                },
            });
        }

        const buffer = await buildPdfBuffer({ rangeLabel, summary, rows });
        const filename = `appointments_${dateFrom.replaceAll("-", "")}_${dateTo.replaceAll("-", "")}.pdf`;
        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Error exporting appointments:", error);
        return NextResponse.json({ error: "Failed to export appointments" }, { status: 500 });
    }
}
