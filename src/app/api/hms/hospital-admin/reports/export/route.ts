export const dynamic = "force-dynamic";

import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { buildHmsReports, todayYmdInIst } from "@/lib/hms-reports";

type SheetColumn = {
    header: string;
    key: string;
    width?: number;
};

function safeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function styleSheet(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF000000" },
    };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    sheet.columns.forEach((column) => {
        column.alignment = { vertical: "top", wrapText: true };
    });
}

function addSheet<T extends Record<string, unknown>>(
    workbook: ExcelJS.Workbook,
    name: string,
    columns: SheetColumn[],
    rows: T[]
) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    sheet.addRows(rows);
    styleSheet(sheet);
    return sheet;
}

export async function GET(req: Request) {
    try {
        const session = await getHmsSessionFromRequest(req);
        if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const today = todayYmdInIst();
        const fromDate = url.searchParams.get("from_date") || today;
        const toDate = url.searchParams.get("to_date") || fromDate;
        const reports = await buildHmsReports({
            hospitalId: session.hospitalContext.hospitalId,
            fromDate,
            toDate,
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "HMS";
        workbook.created = new Date();

        addSheet(workbook, "Summary", [
            { header: "Metric", key: "metric", width: 34 },
            { header: "Value", key: "value", width: 18 },
        ], [
            { metric: "From Date", value: reports.from_date },
            { metric: "To Date", value: reports.to_date },
            { metric: "Total Visits", value: reports.summary.total_visits },
            { metric: "New OPD", value: reports.summary.opd_new },
            { metric: "Old OPD", value: reports.summary.opd_old },
            { metric: "Follow-up", value: reports.summary.followup },
            { metric: "Referral", value: reports.summary.referral },
            { metric: "Lab Only", value: reports.summary.lab_only },
            { metric: "Waiting", value: reports.summary.waiting },
            { metric: "In Consult", value: reports.summary.in_consult },
            { metric: "Lab", value: reports.summary.lab },
            { metric: "Completed", value: reports.summary.completed },
            { metric: "Cancelled", value: reports.summary.cancelled },
            { metric: "Total Fee Charged", value: reports.summary.total_fee_charged },
            { metric: "Paid Amount", value: reports.summary.paid_amount },
            { metric: "Pending Amount", value: reports.summary.pending_amount },
            { metric: "Free Visits", value: reports.summary.free_visits },
            { metric: "Waived Amount", value: reports.summary.waived_amount },
            { metric: "Estimated Surcharge", value: reports.summary.surcharge_amount },
            { metric: "Cash Paid", value: reports.summary.cash_amount },
            { metric: "UPI Paid", value: reports.summary.upi_amount },
            { metric: "Card Paid", value: reports.summary.card_amount },
            { metric: "Pre-registration Total Tokens", value: reports.pre_registration.total_tokens },
            { metric: "Pre-registration Converted to OPD", value: reports.pre_registration.converted_tokens },
            { metric: "Pre-registration Pending Tokens", value: reports.pre_registration.pending_tokens },
            { metric: "Pre-registration Doctor Selected", value: reports.pre_registration.doctor_selected_tokens },
            { metric: "Pre-registration Doctor Missing", value: reports.pre_registration.doctor_missing_tokens },
            { metric: "Pre-registration Conversion Rate", value: `${reports.pre_registration.conversion_rate}%` },
        ]);

        addSheet(workbook, "Daily", [
            { header: "Date", key: "date", width: 14 },
            { header: "Visits", key: "total_visits", width: 10 },
            { header: "New OPD", key: "opd_new", width: 10 },
            { header: "Old OPD", key: "opd_old", width: 10 },
            { header: "Follow-up", key: "followup", width: 11 },
            { header: "Referral", key: "referral", width: 10 },
            { header: "Lab Only", key: "lab_only", width: 10 },
            { header: "Completed", key: "completed", width: 12 },
            { header: "Cancelled", key: "cancelled", width: 12 },
            { header: "Total Fee", key: "total_fee_charged", width: 12 },
            { header: "Paid", key: "paid_amount", width: 12 },
            { header: "Pending", key: "pending_amount", width: 12 },
            { header: "Free", key: "free_visits", width: 10 },
            { header: "Surcharge", key: "surcharge_amount", width: 12 },
        ], reports.daily);

        addSheet(workbook, "Pre-registration", [
            { header: "Metric", key: "metric", width: 34 },
            { header: "Value", key: "value", width: 18 },
        ], [
            { metric: "Total Tokens", value: reports.pre_registration.total_tokens },
            { metric: "Converted to OPD", value: reports.pre_registration.converted_tokens },
            { metric: "Pending Tokens", value: reports.pre_registration.pending_tokens },
            { metric: "Doctor Selected", value: reports.pre_registration.doctor_selected_tokens },
            { metric: "Doctor Missing", value: reports.pre_registration.doctor_missing_tokens },
            { metric: "Conversion Rate", value: `${reports.pre_registration.conversion_rate}%` },
        ]);

        addSheet(workbook, "Doctor Wise", [
            { header: "Doctor", key: "doctor_name", width: 24 },
            { header: "Room", key: "room_no", width: 10 },
            { header: "Capacity", key: "daily_capacity", width: 10 },
            { header: "Visits", key: "total_visits", width: 10 },
            { header: "Non-cancelled Visits", key: "capacity_used", width: 20 },
            { header: "Beyond Capacity", key: "beyond_capacity_count", width: 16 },
            { header: "New OPD", key: "opd_new", width: 10 },
            { header: "Old OPD", key: "opd_old", width: 10 },
            { header: "Follow-up", key: "followup", width: 11 },
            { header: "Referral", key: "referral", width: 10 },
            { header: "Lab Only", key: "lab_only", width: 10 },
            { header: "Waiting", key: "waiting", width: 10 },
            { header: "In Consult", key: "in_consult", width: 12 },
            { header: "Lab", key: "lab", width: 10 },
            { header: "Completed", key: "completed", width: 12 },
            { header: "Cancelled", key: "cancelled", width: 12 },
            { header: "Total Fee", key: "total_fee_charged", width: 12 },
            { header: "Paid", key: "paid_amount", width: 12 },
            { header: "Pending", key: "pending_amount", width: 12 },
            { header: "Free Visits", key: "free_visits", width: 12 },
            { header: "Surcharge", key: "surcharge_amount", width: 12 },
            { header: "Cash", key: "cash_amount", width: 12 },
            { header: "UPI", key: "upi_amount", width: 12 },
            { header: "Card", key: "card_amount", width: 12 },
        ], reports.doctors);

        const registrationColumns: SheetColumn[] = [
            { header: "Date", key: "date", width: 14 },
            { header: "Created At", key: "created_at", width: 20 },
            { header: "OPD No.", key: "opd_no", width: 24 },
            { header: "Token", key: "token_no", width: 10 },
            { header: "UHID", key: "uhid", width: 20 },
            { header: "Patient", key: "patient_name", width: 24 },
            { header: "Age", key: "age", width: 8 },
            { header: "Gender", key: "gender", width: 10 },
            { header: "Phone", key: "phone", width: 15 },
            { header: "Visit Type", key: "visit_type", width: 14 },
            { header: "Status", key: "status", width: 14 },
            { header: "Doctor", key: "doctor_name", width: 24 },
            { header: "Room", key: "room_no", width: 10 },
            { header: "Referral Route", key: "referral_route", width: 18 },
            { header: "Fee", key: "fee_charged", width: 10 },
            { header: "Base Fee", key: "estimated_base_fee", width: 10 },
            { header: "Surcharge", key: "estimated_surcharge", width: 12 },
            { header: "Payment Mode", key: "payment_mode", width: 14 },
            { header: "Payment Status", key: "payment_status", width: 16 },
            { header: "Waiver Reason", key: "fee_waived_reason", width: 28 },
            { header: "Override Reason", key: "override_reason", width: 28 },
            { header: "Registered By", key: "registered_by", width: 22 },
            { header: "Cancelled By", key: "cancelled_by", width: 22 },
        ];
        addSheet(workbook, "Registrations", registrationColumns, reports.registrations);
        addSheet(workbook, "Pending Payments", registrationColumns, reports.pending_payments);
        addSheet(workbook, "Waivers", registrationColumns, reports.waivers);
        addSheet(workbook, "Staff Activity", [
            { header: "Staff", key: "staff_name", width: 24 },
            { header: "Registrations", key: "total_registrations", width: 14 },
            { header: "Cancelled", key: "cancelled_visits", width: 12 },
            { header: "Paid Amount", key: "paid_amount", width: 14 },
            { header: "Pending Amount", key: "pending_amount", width: 16 },
            { header: "Free Visits", key: "free_visits", width: 12 },
            { header: "Waived Amount", key: "waived_amount", width: 14 },
        ], reports.staff_activity);

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `hms-report-${safeFilePart(reports.from_date)}-to-${safeFilePart(reports.to_date)}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Export HMS hospital reports error:", error);
        return NextResponse.json({ error: "Unable to export hospital reports." }, { status: 500 });
    }
}
