export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";

type PolicyRow = { policies: unknown };
type PreviousVisitRow = { visit_id: number; visit_date: Date | string; doctor_id: number };
type HolidayRow = { holiday_date: Date | string };
type PatientRow = { patient_id: number };
type DoctorScopeRow = { doctor_id: number };

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return Number.isNaN(new Date(`${text}T00:00:00+05:30`).getTime()) ? null : text;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function parseJsonArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseNonNegativeInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toDateOnlyString(value: Date | string) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function getDayOfWeek(dateText: string) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(dateText: string, days: number) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function normalizeWorkingDays(value: unknown) {
    const rawDays = parseJsonArray(value);
    const days = rawDays
        ? Array.from(new Set(rawDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((left, right) => left - right)
        : [];
    return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function normalizeReconsultWindowUnit(value: unknown): "working_days" | "calendar_days" {
    return normalizeText(value) === "calendar_days" ? "calendar_days" : "working_days";
}

function readReconsultWindow(policies: Record<string, unknown>, scope: "same_doctor" | "referred_doctor") {
    const defaults = scope === "referred_doctor"
        ? { window_days: 0, count_visit_day: true }
        : { window_days: 3, count_visit_day: false };
    const windows = parseJsonArray(policies.free_reconsult_windows);
    const row = windows
        ?.map((item) => parseJsonObject(item))
        .find((item) => item?.scope === scope);
    return {
        windowDays: parseNonNegativeInt(row?.window_days) ?? defaults.window_days,
        countVisitDay: typeof row?.count_visit_day === "boolean" ? row.count_visit_day : defaults.count_visit_day,
    };
}

async function getHospitalHolidaySet(input: { hospitalId: number; fromDate: string; toDate: string }) {
    const rows = await prisma.$queryRawUnsafe<HolidayRow[]>(
        `
        SELECT holiday_date
        FROM hospital_holidays
        WHERE hospital_id = ?
          AND holiday_date BETWEEN ? AND ?
        `,
        input.hospitalId,
        input.fromDate,
        input.toDate
    );
    return new Set(rows.map((row) => toDateOnlyString(row.holiday_date)));
}

function isWorkingDate(dateText: string, workingDays: number[], holidays: Set<string>) {
    return workingDays.includes(getDayOfWeek(dateText)) && !holidays.has(dateText);
}

async function resolveWindowEndDate(input: {
    hospitalId: number;
    startDate: string;
    windowDays: number;
    countVisitDay: boolean;
    unit: "working_days" | "calendar_days";
    workingDays: number[];
}) {
    if (input.windowDays === 0) return input.startDate;
    if (input.unit === "calendar_days") {
        const offset = input.countVisitDay ? Math.max(0, input.windowDays - 1) : input.windowDays;
        return addDays(input.startDate, offset);
    }

    const searchTo = addDays(input.startDate, Math.max(14, input.windowDays * 3 + 14));
    const holidays = await getHospitalHolidaySet({ hospitalId: input.hospitalId, fromDate: input.startDate, toDate: searchTo });
    let counted = 0;
    let cursor = input.countVisitDay ? input.startDate : addDays(input.startDate, 1);

    for (let guard = 0; guard < 370; guard += 1) {
        if (isWorkingDate(cursor, input.workingDays, holidays)) {
            counted += 1;
            if (counted >= input.windowDays) return cursor;
        }
        cursor = addDays(cursor, 1);
    }
    throw new Error("Unable to resolve same-doctor follow-up window.");
}

export async function POST(req: Request) {
    try {
        const session = await getHmsSessionFromRequest(req);
        if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }
        const staff = await getHmsStaffProfile(session.hospitalContext);
        if (staff?.staffType !== "REGISTRATION") {
            return NextResponse.json({ error: "Registration staff access is required." }, { status: 403 });
        }

        const body = await req.json();
        const patientId = parsePositiveInt(body?.patient_id);
        const doctorId = parsePositiveInt(body?.doctor_id);
        const visitType = normalizeText(body?.visit_type) === "REFERRAL" ? "REFERRAL" : "OPD_OLD";
        const referredByDoctorId = parsePositiveInt(body?.referred_by_doctor_id);
        const visitDate = normalizeDate(body?.visit_date);
        const fieldErrors: Record<string, string> = {};
        if (!patientId) fieldErrors.patient_id = "Select an existing patient.";
        if (!doctorId) fieldErrors.doctor_id = "Select a doctor.";
        if (visitType === "REFERRAL" && !referredByDoctorId) fieldErrors.referred_by_doctor_id = "Select the doctor who referred this patient.";
        if (visitType === "REFERRAL" && referredByDoctorId === doctorId) fieldErrors.referred_by_doctor_id = "Referring doctor must be different from consulting doctor.";
        if (!visitDate) fieldErrors.visit_date = "Visit date must be valid.";
        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }
        const checkedVisitDate = visitDate as string;

        const assignedDoctorIds = await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId);
        if (!doctorId || !assignedDoctorIds.includes(doctorId)) {
            return NextResponse.json({ error: "Doctor is not assigned to this staff account.", fieldErrors: { doctor_id: "Select an assigned doctor." } }, { status: 403 });
        }

        if (visitType === "REFERRAL" && referredByDoctorId) {
            const referringDoctorRows = await prisma.$queryRawUnsafe<DoctorScopeRow[]>(
                `
                SELECT d.doctor_id
                FROM hospital_doctors hd
                INNER JOIN doctors d
                  ON d.doctor_id = hd.doctor_id
                 AND d.admin_id = ?
                WHERE hd.hospital_id = ?
                  AND hd.doctor_id = ?
                LIMIT 1
                `,
                session.hospitalContext.adminId,
                session.hospitalContext.hospitalId,
                referredByDoctorId
            );
            if (!referringDoctorRows[0]) {
                return NextResponse.json({ error: "Referring doctor does not belong to this hospital.", fieldErrors: { referred_by_doctor_id: "Select a valid hospital doctor." } }, { status: 400 });
            }
        }

        const patientRows = await prisma.$queryRawUnsafe<PatientRow[]>(
            `
            SELECT patient_id
            FROM patients
            WHERE patient_id = ?
              AND admin_id = ?
              AND hospital_group_code = ?
            LIMIT 1
            `,
            patientId,
            session.hospitalContext.adminId,
            session.hospitalContext.hospitalCode
        );
        if (!patientRows[0]) {
            return NextResponse.json({ error: "Patient does not belong to this hospital.", fieldErrors: { patient_id: "Select this hospital's patient." } }, { status: 400 });
        }

        const policyRows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            "SELECT policies FROM hospital_policy_settings WHERE hospital_id = ? LIMIT 1",
            session.hospitalContext.hospitalId
        );
        const policies = parseJsonObject(policyRows[0]?.policies);
        if (!policies) throw new Error("Hospital policy settings are not configured.");
        const window = readReconsultWindow(policies, visitType === "REFERRAL" ? "referred_doctor" : "same_doctor");
        const workingDays = normalizeWorkingDays(policies.working_days);
        const unit = normalizeReconsultWindowUnit(policies.reconsult_window_unit);

        const previousVisits = visitType === "REFERRAL"
            ? await prisma.$queryRawUnsafe<PreviousVisitRow[]>(
                `
                SELECT DISTINCT v.visit_id, v.visit_date, v.doctor_id
                FROM visits v
                INNER JOIN prescriptions p
                  ON p.visit_id = v.visit_id
                 AND p.doctor_id = v.doctor_id
                 AND p.patient_id = v.patient_id
                 AND p.status = 'final'
                 AND p.is_deleted = 0
                 AND p.referred_to_doctor_id = ?
                WHERE v.hospital_id = ?
                  AND v.admin_id = ?
                  AND v.hospital_group_code = ?
                  AND v.patient_id = ?
                  AND v.status <> 'CANCELLED'
                  AND v.visit_date <= ?
                  AND v.doctor_id = ?
                ORDER BY v.visit_date DESC, v.visit_id DESC
                LIMIT 10
                `,
                doctorId,
                session.hospitalContext.hospitalId,
                session.hospitalContext.adminId,
                session.hospitalContext.hospitalCode,
                patientId,
                checkedVisitDate,
                referredByDoctorId
            )
            : await prisma.$queryRawUnsafe<PreviousVisitRow[]>(
                `
                SELECT visit_id, visit_date, doctor_id
                FROM visits
                WHERE hospital_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                  AND patient_id = ?
                  AND status <> 'CANCELLED'
                  AND visit_date <= ?
                  AND doctor_id = ?
                ORDER BY visit_date DESC, visit_id DESC
                LIMIT 10
                `,
                session.hospitalContext.hospitalId,
                session.hospitalContext.adminId,
                session.hospitalContext.hospitalCode,
                patientId,
                checkedVisitDate,
                doctorId
            );

        for (const row of previousVisits) {
            const previousDate = toDateOnlyString(row.visit_date);
            const validUntil = await resolveWindowEndDate({
                hospitalId: session.hospitalContext.hospitalId,
                startDate: previousDate,
                windowDays: window.windowDays,
                countVisitDay: window.countVisitDay,
                unit,
                workingDays,
            });
            if (checkedVisitDate >= previousDate && checkedVisitDate <= validUntil) {
                return NextResponse.json({
                    eligible: true,
                    reason: visitType === "REFERRAL" ? "Referral window valid." : "Same doctor follow-up valid.",
                    previous_visit_id: Number(row.visit_id),
                    previous_visit_date: previousDate,
                    valid_until: validUntil,
                    window_days: window.windowDays,
                    count_visit_day: window.countVisitDay,
                });
            }
        }

        return NextResponse.json({
            eligible: false,
            reason: visitType === "REFERRAL"
                ? "No referral found inside the valid window."
                : "No same-doctor follow-up found inside the valid window.",
            window_days: window.windowDays,
            count_visit_day: window.countVisitDay,
        });
    } catch (error) {
        console.error("Check HMS follow-up eligibility error:", error);
        return NextResponse.json({ error: "Unable to check follow-up eligibility." }, { status: 500 });
    }
}
