export const dynamic = "force-dynamic";

import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deriveDoctorSmsSnapshot } from "@/lib/doctorSms";
import { getSessionFromRequest } from "@/lib/request-auth";

type DoctorTypeFilter = "all" | "cms" | "hms";

type SheetColumn = {
    header: string;
    key: string;
    width?: number;
};

type DoctorRow = {
    doctor_id: number;
    doctor_name: string | null;
    specialization: string | null;
    status: string | null;
    clinic_count: bigint | number | null;
    num_clinics: number | null;
    hospital_codes: string | null;
    hospital_names: string | null;
    emr_prescription_enabled: boolean | number | null;
    sms_service_enabled: boolean | number | null;
    sms_service_status: "DISABLED" | "ACTIVE" | "EXHAUSTED" | null;
    sms_credit_total: number | null;
    sms_credit_used: number | null;
    current_pack_total: number | null;
    current_pack_used: number | null;
};

type AppointmentStatsRow = {
    doctor_id: number;
    total_appointments: bigint | number | null;
    pending_appointments: bigint | number | null;
    confirmed_appointments: bigint | number | null;
    booked_appointments: bigint | number | null;
    completed_appointments: bigint | number | null;
    cancelled_appointments: bigint | number | null;
    last_appointment_date: Date | string | null;
};

type VisitStatsRow = {
    doctor_id: number;
    total_visits: bigint | number | null;
    opd_new: bigint | number | null;
    opd_old: bigint | number | null;
    followup: bigint | number | null;
    referral: bigint | number | null;
    lab_only: bigint | number | null;
    waiting: bigint | number | null;
    in_consult: bigint | number | null;
    lab: bigint | number | null;
    completed_visits: bigint | number | null;
    cancelled_visits: bigint | number | null;
    last_visit_date: Date | string | null;
};

type PatientStatsRow = {
    doctor_id: number;
    unique_patients: bigint | number | null;
    new_patients: bigint | number | null;
    repeat_patients: bigint | number | null;
};

type PrescriptionStatsRow = {
    doctor_id: number;
    emr_records_created: bigint | number | null;
};

type SmsUsageRow = {
    doctor_id: number;
    sms_used_in_range: bigint | number | null;
};

type DailyStatsRow = {
    date: Date | string;
    doctor_id: number;
    total_encounters: bigint | number | null;
    cms_appointments: bigint | number | null;
    hms_visits: bigint | number | null;
    completed_total: bigint | number | null;
    cancelled_total: bigint | number | null;
    unique_patients: bigint | number | null;
    emr_records_created: bigint | number | null;
    sms_used: bigint | number | null;
};

function todayYmdInIst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateInput(value: string | null, fallback: string) {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return fallback;
}

function safeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function toNumber(value: bigint | number | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function toDate(value: Date | string | null | undefined) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function yesNo(value: boolean) {
    return value ? "Yes" : "No";
}

function placeholders(values: unknown[]) {
    return values.map(() => "?").join(", ");
}

function parseDoctorIds(value: string | null) {
    if (!value) return [];
    return Array.from(new Set(
        value
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isInteger(item) && item > 0)
    ));
}

function normalizeDoctorType(value: string | null): DoctorTypeFilter {
    const normalized = String(value || "all").toLowerCase();
    if (normalized === "cms" || normalized === "hms") return normalized;
    return "all";
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

async function requireSuperAdmin(req: Request) {
    const session = await getSessionFromRequest(req);
    return session?.role === "SUPER_ADMIN" ? session : null;
}

async function loadDoctors(type: DoctorTypeFilter, selectedDoctorIds: number[]) {
    const whereSelected = selectedDoctorIds.length > 0 ? `WHERE d.doctor_id IN (${placeholders(selectedDoctorIds)})` : "";
    const rows = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT
            d.doctor_id,
            d.doctor_name,
            d.specialization,
            d.status,
            COUNT(DISTINCT c.clinic_id) AS clinic_count,
            d.num_clinics,
            GROUP_CONCAT(DISTINCT h.code ORDER BY h.code SEPARATOR ', ') AS hospital_codes,
            GROUP_CONCAT(DISTINCT h.name ORDER BY h.name SEPARATOR ', ') AS hospital_names,
            des.emr_prescription_enabled,
            dss.sms_service_enabled,
            dss.sms_service_status,
            dss.sms_credit_total,
            dss.sms_credit_used,
            dss.current_pack_total,
            dss.current_pack_used
        FROM doctors d
        LEFT JOIN clinics c
          ON c.doctor_id = d.doctor_id
        LEFT JOIN hospital_doctors hd
          ON hd.doctor_id = d.doctor_id
        LEFT JOIN hospitals h
          ON h.hospital_id = hd.hospital_id
        LEFT JOIN doctor_emr_settings des
          ON des.doctor_id = d.doctor_id
        LEFT JOIN doctor_sms_service dss
          ON dss.doctor_id = d.doctor_id
        ${whereSelected}
        GROUP BY
            d.doctor_id,
            d.doctor_name,
            d.specialization,
            d.status,
            d.num_clinics,
            des.emr_prescription_enabled,
            dss.sms_service_enabled,
            dss.sms_service_status,
            dss.sms_credit_total,
            dss.sms_credit_used,
            dss.current_pack_total,
            dss.current_pack_used
        ORDER BY d.doctor_name ASC, d.doctor_id ASC
        `,
        ...selectedDoctorIds
    );

    return rows.filter((row) => {
        const clinicCount = toNumber(row.clinic_count);
        if (type === "cms") return clinicCount > 0;
        if (type === "hms") return clinicCount === 0;
        return true;
    });
}

async function loadGroupedStats<T>(doctorIds: number[], query: string, extraParams: unknown[] = []) {
    if (doctorIds.length === 0) return [];
    return prisma.$queryRawUnsafe<T[]>(query.replaceAll("__DOCTOR_IDS__", placeholders(doctorIds)), ...doctorIds, ...extraParams);
}

export async function GET(req: Request) {
    try {
        const session = await requireSuperAdmin(req);
        if (!session) {
            return NextResponse.json({ error: "Only Super Admin can export doctor stats." }, { status: 403 });
        }

        const url = new URL(req.url);
        const today = todayYmdInIst();
        const fromInput = normalizeDateInput(url.searchParams.get("from_date"), today);
        const toInput = normalizeDateInput(url.searchParams.get("to_date"), fromInput);
        const startDate = fromInput <= toInput ? fromInput : toInput;
        const endDate = fromInput <= toInput ? toInput : fromInput;
        const doctorType = normalizeDoctorType(url.searchParams.get("doctor_type"));
        const selectedDoctorIds = parseDoctorIds(url.searchParams.get("doctor_ids"));

        const doctors = await loadDoctors(doctorType, selectedDoctorIds);
        const doctorIds = doctors.map((doctor) => Number(doctor.doctor_id));

        if (doctorIds.length === 0) {
            return NextResponse.json({ error: "No doctors match the selected filters." }, { status: 400 });
        }

        const [
            appointmentRows,
            visitRows,
            patientRows,
            prescriptionRows,
            smsUsageRows,
            dailyRows,
        ] = await Promise.all([
            loadGroupedStats<AppointmentStatsRow>(doctorIds, `
                SELECT
                    doctor_id,
                    COUNT(*) AS total_appointments,
                    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_appointments,
                    SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_appointments,
                    SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) AS booked_appointments,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_appointments,
                    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_appointments,
                    MAX(appointment_date) AS last_appointment_date
                FROM appointment
                WHERE doctor_id IN (__DOCTOR_IDS__)
                  AND appointment_date BETWEEN ? AND ?
                GROUP BY doctor_id
            `, [startDate, endDate]),
            loadGroupedStats<VisitStatsRow>(doctorIds, `
                SELECT
                    doctor_id,
                    COUNT(*) AS total_visits,
                    SUM(CASE WHEN visit_type = 'OPD_NEW' THEN 1 ELSE 0 END) AS opd_new,
                    SUM(CASE WHEN visit_type = 'OPD_OLD' THEN 1 ELSE 0 END) AS opd_old,
                    SUM(CASE WHEN visit_type = 'FOLLOWUP' THEN 1 ELSE 0 END) AS followup,
                    SUM(CASE WHEN visit_type = 'REFERRAL' THEN 1 ELSE 0 END) AS referral,
                    SUM(CASE WHEN visit_type = 'LAB_ONLY' THEN 1 ELSE 0 END) AS lab_only,
                    SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) AS waiting,
                    SUM(CASE WHEN status = 'IN_CONSULT' THEN 1 ELSE 0 END) AS in_consult,
                    SUM(CASE WHEN status = 'LAB' THEN 1 ELSE 0 END) AS lab,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_visits,
                    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_visits,
                    MAX(visit_date) AS last_visit_date
                FROM visits
                WHERE doctor_id IN (__DOCTOR_IDS__)
                  AND visit_date BETWEEN ? AND ?
                GROUP BY doctor_id
            `, [startDate, endDate]),
            loadGroupedStats<PatientStatsRow>(doctorIds, `
                SELECT
                    current_encounters.doctor_id,
                    COUNT(*) AS unique_patients,
                    SUM(CASE WHEN previous_encounters.patient_id IS NULL THEN 1 ELSE 0 END) AS new_patients,
                    SUM(CASE WHEN previous_encounters.patient_id IS NULL THEN 0 ELSE 1 END) AS repeat_patients
                FROM (
                    SELECT doctor_id, patient_id
                    FROM (
                        SELECT doctor_id, patient_id
                        FROM appointment
                        WHERE doctor_id IN (__DOCTOR_IDS__)
                          AND patient_id IS NOT NULL
                          AND appointment_date BETWEEN ? AND ?
                        UNION ALL
                        SELECT doctor_id, patient_id
                        FROM visits
                        WHERE doctor_id IN (__DOCTOR_IDS__)
                          AND visit_date BETWEEN ? AND ?
                    ) selected_encounters
                    GROUP BY doctor_id, patient_id
                ) current_encounters
                LEFT JOIN (
                    SELECT doctor_id, patient_id
                    FROM (
                        SELECT doctor_id, patient_id
                        FROM appointment
                        WHERE doctor_id IN (__DOCTOR_IDS__)
                          AND patient_id IS NOT NULL
                          AND appointment_date < ?
                        UNION ALL
                        SELECT doctor_id, patient_id
                        FROM visits
                        WHERE doctor_id IN (__DOCTOR_IDS__)
                          AND visit_date < ?
                    ) earlier_encounters
                    GROUP BY doctor_id, patient_id
                ) previous_encounters
                  ON previous_encounters.doctor_id = current_encounters.doctor_id
                 AND previous_encounters.patient_id = current_encounters.patient_id
                GROUP BY current_encounters.doctor_id
            `, [startDate, endDate, ...doctorIds, startDate, endDate, ...doctorIds, startDate, ...doctorIds, startDate]),
            loadGroupedStats<PrescriptionStatsRow>(doctorIds, `
                SELECT doctor_id, COUNT(*) AS emr_records_created
                FROM prescriptions
                WHERE doctor_id IN (__DOCTOR_IDS__)
                  AND is_deleted = FALSE
                  AND status <> 'cancelled'
                  AND DATE(visit_date) BETWEEN ? AND ?
                GROUP BY doctor_id
            `, [startDate, endDate]),
            loadGroupedStats<SmsUsageRow>(doctorIds, `
                SELECT doctor_id, SUM(credits_used) AS sms_used_in_range
                FROM doctor_sms_usage_log
                WHERE doctor_id IN (__DOCTOR_IDS__)
                  AND DATE(created_at) BETWEEN ? AND ?
                GROUP BY doctor_id
            `, [startDate, endDate]),
            loadGroupedStats<DailyStatsRow>(doctorIds, `
                SELECT
                    daily.date,
                    daily.doctor_id,
                    COUNT(*) AS total_encounters,
                    SUM(CASE WHEN daily.source = 'CMS' THEN 1 ELSE 0 END) AS cms_appointments,
                    SUM(CASE WHEN daily.source = 'HMS' THEN 1 ELSE 0 END) AS hms_visits,
                    SUM(CASE WHEN daily.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_total,
                    SUM(CASE WHEN daily.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_total,
                    COUNT(DISTINCT daily.patient_id) AS unique_patients,
                    COALESCE(emr.emr_records_created, 0) AS emr_records_created,
                    COALESCE(sms.sms_used, 0) AS sms_used
                FROM (
                    SELECT
                        appointment_date AS date,
                        doctor_id,
                        patient_id,
                        CAST(status AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
                        CAST('CMS' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS source
                    FROM appointment
                    WHERE doctor_id IN (__DOCTOR_IDS__)
                      AND appointment_date BETWEEN ? AND ?
                    UNION ALL
                    SELECT
                        visit_date AS date,
                        doctor_id,
                        patient_id,
                        CAST(status AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
                        CAST('HMS' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS source
                    FROM visits
                    WHERE doctor_id IN (__DOCTOR_IDS__)
                      AND visit_date BETWEEN ? AND ?
                ) daily
                LEFT JOIN (
                    SELECT DATE(visit_date) AS date, doctor_id, COUNT(*) AS emr_records_created
                    FROM prescriptions
                    WHERE doctor_id IN (__DOCTOR_IDS__)
                      AND is_deleted = FALSE
                      AND status <> 'cancelled'
                      AND DATE(visit_date) BETWEEN ? AND ?
                    GROUP BY DATE(visit_date), doctor_id
                ) emr
                  ON emr.date = daily.date
                 AND emr.doctor_id = daily.doctor_id
                LEFT JOIN (
                    SELECT DATE(created_at) AS date, doctor_id, SUM(credits_used) AS sms_used
                    FROM doctor_sms_usage_log
                    WHERE doctor_id IN (__DOCTOR_IDS__)
                      AND DATE(created_at) BETWEEN ? AND ?
                    GROUP BY DATE(created_at), doctor_id
                ) sms
                  ON sms.date = daily.date
                 AND sms.doctor_id = daily.doctor_id
                GROUP BY
                    daily.date,
                    daily.doctor_id,
                    emr.emr_records_created,
                    sms.sms_used
                ORDER BY daily.date DESC, daily.doctor_id ASC
            `, [startDate, endDate, ...doctorIds, startDate, endDate, ...doctorIds, startDate, endDate, ...doctorIds, startDate, endDate]),
        ]);

        const appointmentMap = new Map(appointmentRows.map((row) => [Number(row.doctor_id), row]));
        const visitMap = new Map(visitRows.map((row) => [Number(row.doctor_id), row]));
        const patientMap = new Map(patientRows.map((row) => [Number(row.doctor_id), row]));
        const prescriptionMap = new Map(prescriptionRows.map((row) => [Number(row.doctor_id), row]));
        const smsUsageMap = new Map(smsUsageRows.map((row) => [Number(row.doctor_id), row]));

        const doctorStatsRows = doctors.map((doctor) => {
            const doctorId = Number(doctor.doctor_id);
            const clinicCount = toNumber(doctor.clinic_count);
            const appointmentStats = appointmentMap.get(doctorId);
            const visitStats = visitMap.get(doctorId);
            const patientStats = patientMap.get(doctorId);
            const prescriptionStats = prescriptionMap.get(doctorId);
            const smsUsageStats = smsUsageMap.get(doctorId);
            const sms = deriveDoctorSmsSnapshot({
                sms_service_enabled: doctor.sms_service_enabled === true || doctor.sms_service_enabled === 1,
                sms_credit_total: doctor.sms_credit_total,
                sms_credit_used: doctor.sms_credit_used,
                current_pack_total: doctor.current_pack_total,
                current_pack_used: doctor.current_pack_used,
            });
            const smsStatus = !sms.enabled ? "Not enabled" : sms.status === "EXHAUSTED" ? "Exhausted" : "Available";
            const totalAppointments = toNumber(appointmentStats?.total_appointments);
            const totalVisits = toNumber(visitStats?.total_visits);

            return {
                doctor_id: doctorId,
                doctor_name: doctor.doctor_name || `Doctor ${doctorId}`,
                doctor_type: clinicCount > 0 ? "CMS" : "HMS",
                status: doctor.status || "",
                clinic_count: clinicCount,
                configured_clinics: doctor.num_clinics ?? 0,
                specialization: doctor.specialization || "",
                hospitals: doctor.hospital_names || doctor.hospital_codes || "",
                emr_enabled: yesNo(doctor.emr_prescription_enabled === true || doctor.emr_prescription_enabled === 1),
                sms_enabled: yesNo(sms.enabled),
                sms_given: sms.totalCredits,
                sms_used: sms.usedCredits,
                sms_left: sms.remainingCredits,
                sms_used_in_range: toNumber(smsUsageStats?.sms_used_in_range),
                sms_status: smsStatus,
                total_encounters: totalAppointments + totalVisits,
                cms_appointments: totalAppointments,
                hms_visits: totalVisits,
                cms_pending: toNumber(appointmentStats?.pending_appointments),
                cms_confirmed: toNumber(appointmentStats?.confirmed_appointments),
                cms_booked: toNumber(appointmentStats?.booked_appointments),
                cms_completed: toNumber(appointmentStats?.completed_appointments),
                cms_cancelled: toNumber(appointmentStats?.cancelled_appointments),
                hms_opd_new: toNumber(visitStats?.opd_new),
                hms_opd_old: toNumber(visitStats?.opd_old),
                hms_followup: toNumber(visitStats?.followup),
                hms_referral: toNumber(visitStats?.referral),
                hms_lab_only: toNumber(visitStats?.lab_only),
                hms_waiting: toNumber(visitStats?.waiting),
                hms_in_consult: toNumber(visitStats?.in_consult),
                hms_lab: toNumber(visitStats?.lab),
                hms_completed: toNumber(visitStats?.completed_visits),
                hms_cancelled: toNumber(visitStats?.cancelled_visits),
                unique_patients: toNumber(patientStats?.unique_patients),
                new_patients: toNumber(patientStats?.new_patients),
                repeat_patients: toNumber(patientStats?.repeat_patients),
                emr_records_created: toNumber(prescriptionStats?.emr_records_created),
                last_activity_date: [toDate(appointmentStats?.last_appointment_date), toDate(visitStats?.last_visit_date)]
                    .filter(Boolean)
                    .sort()
                    .at(-1) || "",
            };
        });

        const summary = doctorStatsRows.reduce((acc, row) => {
            acc.cmsDoctors += row.doctor_type === "CMS" ? 1 : 0;
            acc.hmsDoctors += row.doctor_type === "HMS" ? 1 : 0;
            acc.emrEnabled += row.emr_enabled === "Yes" ? 1 : 0;
            acc.smsEnabled += row.sms_enabled === "Yes" ? 1 : 0;
            acc.smsExhausted += row.sms_status === "Exhausted" ? 1 : 0;
            acc.smsGiven += row.sms_given;
            acc.smsUsed += row.sms_used;
            acc.smsLeft += row.sms_left;
            acc.smsUsedInRange += row.sms_used_in_range;
            acc.totalEncounters += row.total_encounters;
            acc.cmsAppointments += row.cms_appointments;
            acc.hmsVisits += row.hms_visits;
            acc.completed += row.cms_completed + row.hms_completed;
            acc.cancelled += row.cms_cancelled + row.hms_cancelled;
            acc.uniquePatients += row.unique_patients;
            acc.newPatients += row.new_patients;
            acc.repeatPatients += row.repeat_patients;
            acc.emrRecordsCreated += row.emr_records_created;
            return acc;
        }, {
            cmsDoctors: 0,
            hmsDoctors: 0,
            emrEnabled: 0,
            smsEnabled: 0,
            smsExhausted: 0,
            smsGiven: 0,
            smsUsed: 0,
            smsLeft: 0,
            smsUsedInRange: 0,
            totalEncounters: 0,
            cmsAppointments: 0,
            hmsVisits: 0,
            completed: 0,
            cancelled: 0,
            uniquePatients: 0,
            newPatients: 0,
            repeatPatients: 0,
            emrRecordsCreated: 0,
        });

        const doctorNameMap = new Map(doctorStatsRows.map((row) => [row.doctor_id, row.doctor_name]));
        const doctorTypeMap = new Map(doctorStatsRows.map((row) => [row.doctor_id, row.doctor_type]));
        const dailyStatsRows = dailyRows.map((row) => ({
            date: toDate(row.date),
            doctor_id: Number(row.doctor_id),
            doctor_name: doctorNameMap.get(Number(row.doctor_id)) || `Doctor ${row.doctor_id}`,
            doctor_type: doctorTypeMap.get(Number(row.doctor_id)) || "",
            total_encounters: toNumber(row.total_encounters),
            cms_appointments: toNumber(row.cms_appointments),
            hms_visits: toNumber(row.hms_visits),
            completed_total: toNumber(row.completed_total),
            cancelled_total: toNumber(row.cancelled_total),
            unique_patients: toNumber(row.unique_patients),
            emr_records_created: toNumber(row.emr_records_created),
            sms_used: toNumber(row.sms_used),
        }));

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Admin Dashboard";
        workbook.created = new Date();

        addSheet(workbook, "Summary", [
            { header: "Metric", key: "metric", width: 34 },
            { header: "Value", key: "value", width: 20 },
        ], [
            { metric: "From Date", value: startDate },
            { metric: "To Date", value: endDate },
            { metric: "Doctor Type Filter", value: doctorType.toUpperCase() },
            { metric: "Doctors Included", value: doctorStatsRows.length },
            { metric: "CMS Doctors", value: summary.cmsDoctors },
            { metric: "HMS Doctors", value: summary.hmsDoctors },
            { metric: "EMR Enabled Doctors", value: summary.emrEnabled },
            { metric: "EMR Disabled Doctors", value: doctorStatsRows.length - summary.emrEnabled },
            { metric: "SMS Enabled Doctors", value: summary.smsEnabled },
            { metric: "SMS Disabled Doctors", value: doctorStatsRows.length - summary.smsEnabled },
            { metric: "SMS Exhausted Doctors", value: summary.smsExhausted },
            { metric: "SMS Given", value: summary.smsGiven },
            { metric: "SMS Used", value: summary.smsUsed },
            { metric: "SMS Left", value: summary.smsLeft },
            { metric: "SMS Used In Selected Range", value: summary.smsUsedInRange },
            { metric: "Total Encounters", value: summary.totalEncounters },
            { metric: "CMS Appointments", value: summary.cmsAppointments },
            { metric: "HMS Visits", value: summary.hmsVisits },
            { metric: "Completed Total", value: summary.completed },
            { metric: "Cancelled Total", value: summary.cancelled },
            { metric: "Unique Patients Count", value: summary.uniquePatients },
            { metric: "New Patients Count", value: summary.newPatients },
            { metric: "Repeat Patients Count", value: summary.repeatPatients },
            { metric: "EMR Records Created", value: summary.emrRecordsCreated },
        ]);

        addSheet(workbook, "Doctor Wise Stats", [
            { header: "Doctor ID", key: "doctor_id", width: 10 },
            { header: "Doctor", key: "doctor_name", width: 26 },
            { header: "Doctor Type", key: "doctor_type", width: 12 },
            { header: "Status", key: "status", width: 12 },
            { header: "Clinic Count", key: "clinic_count", width: 12 },
            { header: "Configured Clinics", key: "configured_clinics", width: 16 },
            { header: "Specialization", key: "specialization", width: 22 },
            { header: "Hospitals", key: "hospitals", width: 24 },
            { header: "EMR Enabled", key: "emr_enabled", width: 13 },
            { header: "SMS Enabled", key: "sms_enabled", width: 13 },
            { header: "SMS Given", key: "sms_given", width: 12 },
            { header: "SMS Used", key: "sms_used", width: 12 },
            { header: "SMS Left", key: "sms_left", width: 12 },
            { header: "SMS Used In Range", key: "sms_used_in_range", width: 18 },
            { header: "SMS Status", key: "sms_status", width: 14 },
            { header: "Total Encounters", key: "total_encounters", width: 16 },
            { header: "CMS Appointments", key: "cms_appointments", width: 18 },
            { header: "HMS Visits", key: "hms_visits", width: 12 },
            { header: "CMS Pending", key: "cms_pending", width: 13 },
            { header: "CMS Confirmed", key: "cms_confirmed", width: 15 },
            { header: "CMS Booked", key: "cms_booked", width: 13 },
            { header: "CMS Completed", key: "cms_completed", width: 15 },
            { header: "CMS Cancelled", key: "cms_cancelled", width: 15 },
            { header: "HMS OPD New", key: "hms_opd_new", width: 13 },
            { header: "HMS OPD Old", key: "hms_opd_old", width: 13 },
            { header: "HMS Follow-up", key: "hms_followup", width: 14 },
            { header: "HMS Referral", key: "hms_referral", width: 13 },
            { header: "HMS Lab Only", key: "hms_lab_only", width: 13 },
            { header: "HMS Waiting", key: "hms_waiting", width: 13 },
            { header: "HMS In Consult", key: "hms_in_consult", width: 15 },
            { header: "HMS Lab", key: "hms_lab", width: 10 },
            { header: "HMS Completed", key: "hms_completed", width: 15 },
            { header: "HMS Cancelled", key: "hms_cancelled", width: 15 },
            { header: "Unique Patients", key: "unique_patients", width: 16 },
            { header: "New Patients", key: "new_patients", width: 14 },
            { header: "Repeat Patients", key: "repeat_patients", width: 15 },
            { header: "EMR Records Created", key: "emr_records_created", width: 20 },
            { header: "Last Activity Date", key: "last_activity_date", width: 18 },
        ], doctorStatsRows);

        addSheet(workbook, "Daily Doctor Stats", [
            { header: "Date", key: "date", width: 14 },
            { header: "Doctor ID", key: "doctor_id", width: 10 },
            { header: "Doctor", key: "doctor_name", width: 26 },
            { header: "Doctor Type", key: "doctor_type", width: 12 },
            { header: "Total Encounters", key: "total_encounters", width: 16 },
            { header: "CMS Appointments", key: "cms_appointments", width: 18 },
            { header: "HMS Visits", key: "hms_visits", width: 12 },
            { header: "Completed Total", key: "completed_total", width: 16 },
            { header: "Cancelled Total", key: "cancelled_total", width: 16 },
            { header: "Unique Patients", key: "unique_patients", width: 16 },
            { header: "EMR Records Created", key: "emr_records_created", width: 20 },
            { header: "SMS Used", key: "sms_used", width: 12 },
        ], dailyStatsRows);

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `doctor-stats-${safeFilePart(startDate)}-to-${safeFilePart(endDate)}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Export admin dashboard doctor stats error:", error);
        return NextResponse.json({ error: "Unable to export doctor stats." }, { status: 500 });
    }
}
