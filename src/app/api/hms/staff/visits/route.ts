export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { allocateHmsSequence, extractIdFormatConfig, resolveHmsId, type HmsIdFormatConfig } from "@/lib/hms-id-format";

const ACTIVE_QUEUE_STATUSES = ["WAITING", "IN_CONSULT"] as const;
const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED"] as const;
const VISIT_TYPES = ["OPD_NEW", "OPD_OLD", "CASUALTY", "REFERRAL", "FOLLOWUP", "LAB_ONLY"] as const;
const PAYMENT_MODES = ["CASH", "UPI", "CARD", "FREE"] as const;
const PAYMENT_STATUSES = ["PENDING", "PAID"] as const;
const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const DEFAULT_CAPACITY_COUNT_CATEGORIES: CapacityCategory[] = ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"];

type VisitType = (typeof VISIT_TYPES)[number];
type PaymentMode = (typeof PAYMENT_MODES)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
type CapacityCategory = (typeof CAPACITY_CATEGORIES)[number];

type PolicyRow = {
    policies: unknown;
};

type ScheduleRow = {
    schedule_id: number;
    daily_capacity: number | null;
    capacity_count_categories: unknown;
    room_no: string | null;
};

type PatientScopeRow = {
    patient_id: number;
};

type DoctorScopeRow = {
    doctor_id: number;
};

type TempTokenScopeRow = {
    registration_id: number;
};

type CountRow = {
    visit_count: bigint | number;
};

type TotalRow = {
    total: bigint | number;
};

type HolidayRow = {
    holiday_date: Date | string;
};

type LeaveRow = {
    leave_id: number;
};

type PreviousVisitRow = {
    visit_id: number;
    visit_date: Date | string;
    doctor_id: number;
};

type ReceptionAccess = {
    hospital: NonNullable<Awaited<ReturnType<typeof getHmsSessionFromRequest>>>["hospitalContext"];
    staffId: number;
    assignedDoctorIds: number[];
};

type InsertIdRow = {
    id: bigint | number;
};

type CreatedVisitRow = {
    visit_id: number;
    hospital_id: number;
    hospital_group_code: string;
    admin_id: number;
    patient_id: number;
    doctor_id: number;
    referred_by_doctor_id: number | null;
    visit_date: Date | string;
    visit_type: string;
    visit_number: string | null;
    daily_token_number: number | null;
    status: string;
    fee_charged: string | number;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    override_reason: string | null;
    created_at: Date | string | null;
};

type VisitListRow = CreatedVisitRow & {
    patient_name: string | null;
    patient_uhid: string | null;
    patient_phone: string | null;
    patient_age: number | null;
    patient_gender: string | null;
    doctor_name: string | null;
    room_no: string | null;
};

type DoctorCounterRow = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    daily_capacity: number | null;
    total_visits: bigint | number;
    active_visits: bigint | number;
    waiting_visits: bigint | number;
    in_consult_visits: bigint | number;
    lab_visits: bigint | number;
    completed_visits: bigint | number;
    cancelled_visits: bigint | number;
    paid_visits: bigint | number;
    pending_visits: bigint | number;
};

type HospitalPolicies = {
    registration_fee?: unknown;
    consultation_fee?: unknown;
    fee_waiver_allowed?: unknown;
    free_payment?: {
        enabled?: unknown;
        require_waiver_reason?: unknown;
    };
    capacity_surcharge?: {
        enabled?: unknown;
        surcharge_amount?: unknown;
    };
    default_capacity_count_categories?: unknown;
    working_days?: unknown;
    reconsult_window_unit?: unknown;
    free_reconsult_windows?: unknown;
    id_format?: unknown;
};

type FreeReconsultWindow = {
    scope: "same_doctor" | "referred_doctor";
    window_days: number;
    count_visit_day: boolean;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeOptionalText(value: unknown) {
    const text = normalizeText(value);
    return text || null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return null;

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function parseJsonArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return null;

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parsePositiveNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoundedPositiveInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseNonNegativeInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T) {
    const normalized = normalizeText(value).toUpperCase();
    return allowed.includes(normalized) ? normalized as T[number] : null;
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

    const date = new Date(`${text}T00:00:00+05:30`);
    if (Number.isNaN(date.getTime())) return null;

    return text;
}

function getTodayDateInIst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function getDayOfWeek(dateText: string) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function toNumber(value: bigint | number | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function getDailyTokenPeriodKey(doctorId: number, visitDate: string) {
    return `D${doctorId}:${visitDate.replace(/-/g, "")}`;
}

function serializeVisit(row: CreatedVisitRow, counter: { countedVisitsBeforeCreate: number; countedVisitsAfterCreate: number; dailyCapacity: number; capacityLimit?: number; surchargeApplied: boolean; capacityCountCategories: CapacityCategory[]; patientCategory?: CapacityCategory }) {
    return {
        visit_id: Number(row.visit_id),
        hospital_id: Number(row.hospital_id),
        hospital_group_code: row.hospital_group_code,
        admin_id: Number(row.admin_id),
        patient_id: Number(row.patient_id),
        doctor_id: Number(row.doctor_id),
        referred_by_doctor_id: row.referred_by_doctor_id ? Number(row.referred_by_doctor_id) : null,
        visit_date: typeof row.visit_date === "string" ? row.visit_date.slice(0, 10) : row.visit_date.toISOString().slice(0, 10),
        visit_type: row.visit_type,
        visit_number: row.visit_number,
        daily_token_number: row.daily_token_number === null || row.daily_token_number === undefined ? null : Number(row.daily_token_number),
        status: row.status,
        fee_charged: Number(row.fee_charged),
        payment_mode: row.payment_mode,
        payment_status: row.payment_status,
        fee_waived_reason: row.fee_waived_reason,
        override_reason: row.override_reason,
        created_at: row.created_at,
        counter,
    };
}

function serializeVisitList(row: VisitListRow) {
    return {
        ...serializeVisit(row, {
            countedVisitsBeforeCreate: 0,
            countedVisitsAfterCreate: 0,
            dailyCapacity: 0,
            surchargeApplied: false,
            capacityCountCategories: [],
        }),
        patient: {
            patient_id: Number(row.patient_id),
            full_name: row.patient_name,
            uhid: row.patient_uhid,
            phone: row.patient_phone,
            age: row.patient_age,
            gender: row.patient_gender,
        },
        doctor: {
            doctor_id: Number(row.doctor_id),
            doctor_name: row.doctor_name,
            room_no: row.room_no,
        },
    };
}

function readPolicies(value: unknown) {
    const policies = parseJsonObject(value) as HospitalPolicies | null;
    if (!policies) {
        throw new Error("Hospital policy settings are not configured.");
    }

    const registrationFee = parsePositiveNumber(policies.registration_fee);
    if (registrationFee === null) {
        throw new Error("Hospital registration fee is not configured.");
    }

    const consultationFee = parsePositiveNumber(policies.consultation_fee) ?? registrationFee;
    const freePayment = policies.free_payment || {};
    const surcharge = policies.capacity_surcharge || {};
    const surchargeAmount = parsePositiveNumber(surcharge.surcharge_amount);

    if (surcharge.enabled === true && surchargeAmount === null) {
        throw new Error("Hospital capacity surcharge amount is not configured.");
    }

    return {
        registrationFee,
        consultationFee,
        feeWaiverAllowed: freePayment.enabled === true || policies.fee_waiver_allowed === true,
        feeWaiverReasonRequired: freePayment.require_waiver_reason !== false,
        surchargeEnabled: surcharge.enabled === true,
        surchargeAmount: surchargeAmount || 0,
        defaultCapacityCountCategories: normalizeCapacityCategories(
            policies.default_capacity_count_categories,
            DEFAULT_CAPACITY_COUNT_CATEGORIES
        ),
        workingDays: normalizeWorkingDays(policies.working_days),
        reconsultWindowUnit: normalizeReconsultWindowUnit(policies.reconsult_window_unit),
        freeReconsultWindows: normalizeFreeReconsultWindows(policies.free_reconsult_windows),
        idFormat: extractIdFormatConfig(policies) as HmsIdFormatConfig | null,
    };
}

function normalizeCapacityCategories(value: unknown, fallback?: CapacityCategory[] | null) {
    const rawCategories = parseJsonArray(value);
    if (!rawCategories || rawCategories.length === 0) {
        if (fallback) return fallback;
        throw new Error("Capacity count categories are not configured for this doctor schedule.");
    }

    const categories = rawCategories.map((category) => normalizeEnum(category, CAPACITY_CATEGORIES));
    if (categories.some((category) => !category)) {
        if (fallback) return fallback;
        throw new Error("Capacity count categories contain an unsupported patient category.");
    }

    return Array.from(new Set(categories)) as CapacityCategory[];
}

function normalizeWorkingDays(value: unknown) {
    const rawDays = parseJsonArray(value);
    const days = rawDays
        ? Array.from(new Set(rawDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((left, right) => left - right)
        : [];
    return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function normalizeReconsultWindowUnit(value: unknown): "working_days" | "calendar_days" {
    const unit = normalizeText(value);
    return unit === "calendar_days" ? "calendar_days" : "working_days";
}

function normalizeFreeReconsultWindows(value: unknown): FreeReconsultWindow[] {
    const rawWindows = parseJsonArray(value);
    const defaults: FreeReconsultWindow[] = [
        { scope: "referred_doctor", window_days: 0, count_visit_day: true },
        { scope: "same_doctor", window_days: 3, count_visit_day: false },
    ];

    return defaults.map((defaultWindow) => {
        const row = rawWindows
            ?.map((item) => parseJsonObject(item))
            .find((item) => item?.scope === defaultWindow.scope);
        const windowDays = parseNonNegativeInt(row?.window_days);

        return {
            scope: defaultWindow.scope,
            window_days: windowDays ?? defaultWindow.window_days,
            count_visit_day: typeof row?.count_visit_day === "boolean" ? row.count_visit_day : defaultWindow.count_visit_day,
        };
    });
}

function addDays(dateText: string, days: number) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

function toDateOnlyString(value: Date | string) {
    return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function resolveCapacityCategoryFromVisitType(visitType: VisitType): CapacityCategory {
    if (visitType === "OPD_OLD") return "OLD_OUTSIDE_FOLLOWUP_VALIDITY";
    if (visitType === "FOLLOWUP" || visitType === "REFERRAL") return "OLD_WITHIN_FOLLOWUP_VALIDITY";
    return "NEW";
}

function resolveEffectiveCapacityCategory(input: {
    visitType: VisitType;
    eligiblePreviousVisit: PreviousVisitRow | null;
}) {
    if (input.visitType === "OPD_OLD" || input.visitType === "FOLLOWUP" || input.visitType === "REFERRAL") {
        return input.eligiblePreviousVisit
            ? "OLD_WITHIN_FOLLOWUP_VALIDITY"
            : "OLD_OUTSIDE_FOLLOWUP_VALIDITY";
    }

    return resolveCapacityCategoryFromVisitType(input.visitType);
}

function getWindowForVisitType(visitType: VisitType, windows: FreeReconsultWindow[]) {
    if (visitType === "OPD_OLD") return windows.find((window) => window.scope === "same_doctor") || null;
    if (visitType === "FOLLOWUP") return windows.find((window) => window.scope === "same_doctor") || null;
    if (visitType === "REFERRAL") return windows.find((window) => window.scope === "referred_doctor") || null;
    return null;
}

async function getHospitalHolidaySet(input: {
    db: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> };
    hospitalId: number;
    fromDate: string;
    toDate: string;
}) {
    const rows = await input.db.$queryRawUnsafe<HolidayRow[]>(
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
    db: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> };
    hospitalId: number;
    startDate: string;
    windowDays: number;
    countVisitDay: boolean;
    unit: "working_days" | "calendar_days";
    workingDays: number[];
}) {
    if (input.windowDays === 0) {
        return input.startDate;
    }

    if (input.unit === "calendar_days") {
        const offset = input.countVisitDay ? Math.max(0, input.windowDays - 1) : input.windowDays;
        return addDays(input.startDate, offset);
    }

    const searchTo = addDays(input.startDate, Math.max(14, input.windowDays * 3 + 14));
    const holidays = await getHospitalHolidaySet({
        db: input.db,
        hospitalId: input.hospitalId,
        fromDate: input.startDate,
        toDate: searchTo,
    });
    let counted = 0;
    let cursor = input.countVisitDay ? input.startDate : addDays(input.startDate, 1);

    for (let guard = 0; guard < 370; guard += 1) {
        if (isWorkingDate(cursor, input.workingDays, holidays)) {
            counted += 1;
            if (counted >= input.windowDays) return cursor;
        }
        cursor = addDays(cursor, 1);
    }

    throw new Error("Unable to resolve working-day reconsult window.");
}

async function findEligiblePreviousVisit(input: {
    db: { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> };
    hospitalId: number;
    adminId: number;
    hospitalCode: string;
    patientId: number;
    doctorId: number;
    referredByDoctorId?: number | null;
    referringPrescriptionId?: number | null;
    visitDate: string;
    visitType: VisitType;
    policies: ReturnType<typeof readPolicies>;
}) {
    const window = getWindowForVisitType(input.visitType, input.policies.freeReconsultWindows);
    if (!window) return null;

    const matchedDoctorId = input.visitType === "REFERRAL"
        ? input.referredByDoctorId
        : input.doctorId;
    if (!matchedDoctorId) return null;

    const rows = input.visitType === "REFERRAL"
        ? await input.db.$queryRawUnsafe<PreviousVisitRow[]>(
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
             AND p.id = ?
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
            input.doctorId,
            input.referringPrescriptionId,
            input.hospitalId,
            input.adminId,
            input.hospitalCode,
            input.patientId,
            input.visitDate,
            matchedDoctorId
        )
        : await input.db.$queryRawUnsafe<PreviousVisitRow[]>(
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
            input.hospitalId,
            input.adminId,
            input.hospitalCode,
            input.patientId,
            input.visitDate,
            matchedDoctorId
        );

    for (const row of rows) {
        const previousDate = toDateOnlyString(row.visit_date);
        const endDate = await resolveWindowEndDate({
            db: input.db,
            hospitalId: input.hospitalId,
            startDate: previousDate,
            windowDays: window.window_days,
            countVisitDay: window.count_visit_day,
            unit: input.policies.reconsultWindowUnit,
            workingDays: input.policies.workingDays,
        });

        if (input.visitDate >= previousDate && input.visitDate <= endDate) {
            return row;
        }
    }

    return null;
}

function resolveVisitNumberFormatKey(visitType: VisitType) {
    if (visitType === "LAB_ONLY") return null;
    if (visitType === "CASUALTY") return "casualty" as const;
    return "opd" as const;
}

function resolveBaseFee(input: {
    visitType: VisitType;
    registrationFee: number;
    consultationFee: number;
}) {
    if (input.visitType === "OPD_NEW" || input.visitType === "CASUALTY" || input.visitType === "LAB_ONLY") {
        return input.registrationFee;
    }

    return input.consultationFee;
}

async function requireReceptionSession(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) {
        return null;
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        return null;
    }

    return {
        hospital: session.hospitalContext,
        staffId: staff.staffId,
        assignedDoctorIds: await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId),
    } satisfies ReceptionAccess;
}

export async function GET(req: Request) {
    try {
        const access = await requireReceptionSession(req);
        if (!access) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }
        const { hospital, assignedDoctorIds } = access;

        const { searchParams } = new URL(req.url);
        const visitDate = normalizeDate(searchParams.get("date")) || getTodayDateInIst();
        const doctorId = searchParams.get("doctor_id") ? parsePositiveInt(searchParams.get("doctor_id")) : null;
        const page = parseBoundedPositiveInt(searchParams.get("page"), 1, 1, 100000);
        const pageSize = parseBoundedPositiveInt(searchParams.get("page_size"), 25, 10, 100);
        const offset = (page - 1) * pageSize;
        const orderMode = normalizeText(searchParams.get("order")).toLowerCase() === "recent" ? "recent" : "queue";

        if (searchParams.get("doctor_id") && !doctorId) {
            return NextResponse.json({ error: "Doctor filter must be valid." }, { status: 400 });
        }

        if (doctorId && !assignedDoctorIds.includes(doctorId)) {
            return NextResponse.json({ error: "Doctor is not assigned to this staff account." }, { status: 403 });
        }

        const visibleDoctorIds = doctorId ? [doctorId] : assignedDoctorIds;
        const doctorPlaceholders = visibleDoctorIds.length > 0 ? visibleDoctorIds.map(() => "?").join(", ") : "-1";
        const doctorFilterValues = visibleDoctorIds;
        const visitScopeSql = `
              v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.visit_date = ?
              AND v.doctor_id IN (${doctorPlaceholders})
        `;
        const visitScopeValues = [
            hospital.hospitalId,
            hospital.adminId,
            hospital.hospitalCode,
            visitDate,
            ...doctorFilterValues,
        ];
        const policyRows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );
        const policies = readPolicies(policyRows[0]?.policies);
        const dayOfWeek = getDayOfWeek(visitDate);
        const holidaySet = await getHospitalHolidaySet({
            db: prisma,
            hospitalId: hospital.hospitalId,
            fromDate: visitDate,
            toDate: visitDate,
        });
        const hospitalBookableDate = policies.workingDays.includes(dayOfWeek) && !holidaySet.has(visitDate);

        const countRows = await prisma.$queryRawUnsafe<TotalRow[]>(
            `
            SELECT COUNT(*) AS total
            FROM visits v
            WHERE ${visitScopeSql}
            `,
            ...visitScopeValues
        );
        const totalVisits = toNumber(countRows[0]?.total);
        const totalPages = Math.max(1, Math.ceil(totalVisits / pageSize));
        const orderSql = orderMode === "recent"
            ? "ORDER BY v.created_at DESC, v.visit_id DESC"
            : "ORDER BY FIELD(v.status, 'IN_CONSULT', 'WAITING', 'LAB', 'COMPLETED', 'CANCELLED'), v.visit_id ASC";

        const visits = await prisma.$queryRawUnsafe<VisitListRow[]>(
            `
                SELECT
                    v.visit_id,
                    v.hospital_id,
                    v.hospital_group_code,
                    v.admin_id,
                v.patient_id,
                v.doctor_id,
                v.referred_by_doctor_id,
                    v.visit_date,
                    v.visit_type,
                    v.visit_number,
                    v.daily_token_number,
                    v.status,
                v.fee_charged,
                v.payment_mode,
                v.payment_status,
                v.fee_waived_reason,
                v.override_reason,
                v.created_at,
                p.full_name AS patient_name,
                p.uhid AS patient_uhid,
                p.phone AS patient_phone,
                p.age AS patient_age,
                p.gender AS patient_gender,
                d.doctor_name,
                hd.room_no
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            INNER JOIN doctors d
              ON d.doctor_id = v.doctor_id
             AND d.admin_id = ?
            INNER JOIN hospital_doctors hd
              ON hd.hospital_id = ?
             AND hd.doctor_id = v.doctor_id
            WHERE ${visitScopeSql}
            ${orderSql}
            LIMIT ? OFFSET ?
            `,
            hospital.adminId,
            hospital.hospitalCode,
            hospital.adminId,
            hospital.hospitalId,
            ...visitScopeValues,
            pageSize,
            offset
        );

        const bookableDoctorIds = hospitalBookableDate ? visibleDoctorIds : [];
        const bookableDoctorPlaceholders = bookableDoctorIds.length > 0 ? bookableDoctorIds.map(() => "?").join(", ") : "-1";
        const counters = bookableDoctorIds.length === 0 ? [] : await prisma.$queryRawUnsafe<DoctorCounterRow[]>(
            `
            SELECT
                hd.doctor_id,
                d.doctor_name,
                hd.room_no,
                dcs.daily_capacity,
                COUNT(v.visit_id) AS total_visits,
                SUM(CASE WHEN v.status IN ('WAITING', 'IN_CONSULT') THEN 1 ELSE 0 END) AS active_visits,
                SUM(CASE WHEN v.status = 'WAITING' THEN 1 ELSE 0 END) AS waiting_visits,
                SUM(CASE WHEN v.status = 'IN_CONSULT' THEN 1 ELSE 0 END) AS in_consult_visits,
                SUM(CASE WHEN v.status = 'LAB' THEN 1 ELSE 0 END) AS lab_visits,
                SUM(CASE WHEN v.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_visits,
                SUM(CASE WHEN v.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_visits,
                SUM(CASE WHEN v.payment_status = 'PAID' THEN 1 ELSE 0 END) AS paid_visits,
                SUM(CASE WHEN v.payment_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_visits
            FROM hospital_doctors hd
            INNER JOIN doctors d
              ON d.doctor_id = hd.doctor_id
             AND d.admin_id = ?
             AND d.status = 'ACTIVE'
             AND d.active_from <= ?
             AND d.active_to >= ?
            INNER JOIN doctor_clinic_schedule dcs
              ON dcs.schedule_id = (
                SELECT latest_dcs.schedule_id
                FROM doctor_clinic_schedule latest_dcs
                WHERE latest_dcs.doctor_id = hd.doctor_id
                  AND latest_dcs.admin_id = ?
                  AND latest_dcs.scheduling_type = 'TOKEN_CAPACITY'
                  AND latest_dcs.day_of_week = ?
                  AND latest_dcs.effective_from <= ?
                  AND latest_dcs.effective_to >= ?
                ORDER BY latest_dcs.effective_from DESC, latest_dcs.schedule_id DESC
                LIMIT 1
              )
            LEFT JOIN doctor_leaves dl
              ON dl.doctor_id = hd.doctor_id
             AND dl.admin_id = ?
             AND dl.leave_date = ?
             AND dl.start_time IS NULL
             AND dl.end_time IS NULL
            LEFT JOIN visits v
              ON v.hospital_id = hd.hospital_id
             AND v.admin_id = ?
             AND v.hospital_group_code = ?
             AND v.doctor_id = hd.doctor_id
             AND v.visit_date = ?
            WHERE hd.hospital_id = ?
              AND hd.doctor_id IN (${bookableDoctorPlaceholders})
              AND dl.leave_id IS NULL
            GROUP BY hd.doctor_id, d.doctor_name, hd.room_no, dcs.daily_capacity
            ORDER BY d.doctor_name ASC, hd.doctor_id ASC
            `,
            hospital.adminId,
            visitDate,
            visitDate,
            hospital.adminId,
            dayOfWeek,
            visitDate,
            visitDate,
            hospital.adminId,
            visitDate,
            hospital.adminId,
            hospital.hospitalCode,
            visitDate,
            hospital.hospitalId,
            ...bookableDoctorIds
        );

        const doctorQueues = counters.map((counter) => ({
            doctor_id: Number(counter.doctor_id),
            doctor_name: counter.doctor_name,
            room_no: counter.room_no,
            daily_capacity: counter.daily_capacity,
            total_visits: toNumber(counter.total_visits),
            active_visits: toNumber(counter.active_visits),
            waiting_visits: toNumber(counter.waiting_visits),
            in_consult_visits: toNumber(counter.in_consult_visits),
            lab_visits: toNumber(counter.lab_visits),
            completed_visits: toNumber(counter.completed_visits),
            cancelled_visits: toNumber(counter.cancelled_visits),
            paid_visits: toNumber(counter.paid_visits),
            pending_visits: toNumber(counter.pending_visits),
            visits: visits.filter((visit) => Number(visit.doctor_id) === Number(counter.doctor_id)).map(serializeVisitList),
        }));

        return NextResponse.json({
            date: visitDate,
            activeStatuses: ACTIVE_QUEUE_STATUSES,
            terminalStatuses: TERMINAL_STATUSES,
            feePolicy: {
                registrationFee: policies.registrationFee,
                consultationFee: policies.consultationFee,
                feeWaiverAllowed: policies.feeWaiverAllowed,
                feeWaiverReasonRequired: policies.feeWaiverReasonRequired,
                surchargeEnabled: policies.surchargeEnabled,
                surchargeAmount: policies.surchargeAmount,
            },
            visits: visits.map(serializeVisitList),
            pagination: {
                page,
                page_size: pageSize,
                total: totalVisits,
                total_pages: totalPages,
            },
            doctorQueues,
            totals: {
                visits: doctorQueues.reduce((sum, queue) => sum + queue.total_visits, 0),
                active: doctorQueues.reduce((sum, queue) => sum + queue.active_visits, 0),
                waiting: doctorQueues.reduce((sum, queue) => sum + queue.waiting_visits, 0),
                paid: doctorQueues.reduce((sum, queue) => sum + queue.paid_visits, 0),
                pending: doctorQueues.reduce((sum, queue) => sum + queue.pending_visits, 0),
                cancelled: doctorQueues.reduce((sum, queue) => sum + queue.cancelled_visits, 0),
            },
        });
    } catch (error) {
        console.error("Load HMS visits error:", error);
        return NextResponse.json({ error: "Unable to load visits." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const access = await requireReceptionSession(req);
        if (!access) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }
        const { hospital, assignedDoctorIds } = access;

        const body = await req.json();
        const patientId = parsePositiveInt(body?.patient_id);
        const doctorId = parsePositiveInt(body?.doctor_id);
        const referredByDoctorId = body?.referred_by_doctor_id === null || body?.referred_by_doctor_id === undefined || body?.referred_by_doctor_id === ""
            ? null
            : parsePositiveInt(body.referred_by_doctor_id);
        const referringPrescriptionId = body?.referring_prescription_id === null || body?.referring_prescription_id === undefined || body?.referring_prescription_id === ""
            ? null
            : parsePositiveInt(body.referring_prescription_id);
        const visitDate = normalizeDate(body?.visit_date);
        const visitType = normalizeEnum(body?.visit_type, VISIT_TYPES);
        const paymentMode = normalizeEnum(body?.payment_mode, PAYMENT_MODES);
        const requestedPaymentStatus = normalizeEnum(body?.payment_status || "PENDING", PAYMENT_STATUSES);
        const feeWaivedReason = normalizeOptionalText(body?.fee_waived_reason);
        const overrideReason = normalizeOptionalText(body?.override_reason);
        const tempTokenRegistrationId = body?.temp_token_registration_id === null || body?.temp_token_registration_id === undefined
            ? null
            : parsePositiveInt(body.temp_token_registration_id);

        const fieldErrors: Record<string, string> = {};
        if (!patientId) fieldErrors.patient_id = "Valid patient is required.";
        if (!doctorId) fieldErrors.doctor_id = "Valid doctor is required.";
        if (visitType === "REFERRAL" && !referredByDoctorId) fieldErrors.referred_by_doctor_id = "Select the doctor who referred this patient.";
        if (referredByDoctorId && referredByDoctorId === doctorId) fieldErrors.referred_by_doctor_id = "Referring doctor must be different from the consulting doctor.";
        if (!visitDate) fieldErrors.visit_date = "Visit date must use YYYY-MM-DD format.";
        if (!visitType) fieldErrors.visit_type = "Visit type is required.";
        if (!paymentMode) fieldErrors.payment_mode = "Payment mode must be CASH, UPI, CARD, or FREE.";
        if (!requestedPaymentStatus) fieldErrors.payment_status = "Payment status must be PENDING or PAID.";
        if (tempTokenRegistrationId === null && body?.temp_token_registration_id !== null && body?.temp_token_registration_id !== undefined) {
            fieldErrors.temp_token_registration_id = "Temp token id must be valid.";
        }

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        if (!doctorId || !assignedDoctorIds.includes(doctorId)) {
            return NextResponse.json(
                { error: "Doctor is not assigned to this staff account.", fieldErrors: { doctor_id: "Select an assigned doctor." } },
                { status: 403 }
            );
        }

        const created = await prisma.$transaction(async (tx) => {
            const patientRows = await tx.$queryRawUnsafe<PatientScopeRow[]>(
                `
                SELECT patient_id
                FROM patients
                WHERE patient_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                `,
                patientId,
                hospital.adminId,
                hospital.hospitalCode
            );

            if (!patientRows[0]) {
                return { status: 400 as const, body: { error: "Patient does not belong to this hospital.", fieldErrors: { patient_id: "Patient does not belong to this hospital." } } };
            }

            if (referredByDoctorId) {
                const referringDoctorRows = await tx.$queryRawUnsafe<DoctorScopeRow[]>(
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
                    hospital.adminId,
                    hospital.hospitalId,
                    referredByDoctorId
                );

                if (!referringDoctorRows[0]) {
                    return { status: 400 as const, body: { error: "Referring doctor does not belong to this hospital.", fieldErrors: { referred_by_doctor_id: "Select a valid hospital doctor." } } };
                }
            }

            let resolvedReferringPrescriptionId = referringPrescriptionId;
            if (visitType === "REFERRAL" && referredByDoctorId) {
                const referringPrescriptionRows = await tx.$queryRawUnsafe<Array<{ id: number; visit_date: Date | string }>>(
                    `
                    SELECT p.id, p.visit_date
                    FROM prescriptions p
                    INNER JOIN patients pa
                      ON pa.patient_id = p.patient_id
                     AND pa.admin_id = ?
                     AND pa.hospital_group_code = ?
                    INNER JOIN doctors rd
                      ON rd.doctor_id = p.doctor_id
                     AND rd.admin_id = ?
                    INNER JOIN hospital_doctors rhd
                      ON rhd.hospital_id = ?
                     AND rhd.doctor_id = rd.doctor_id
                    INNER JOIN doctors cd
                      ON cd.doctor_id = p.referred_to_doctor_id
                     AND cd.admin_id = ?
                    INNER JOIN hospital_doctors chd
                      ON chd.hospital_id = ?
                     AND chd.doctor_id = cd.doctor_id
                    WHERE p.patient_id = ?
                      AND p.doctor_id = ?
                      AND p.referred_to_doctor_id = ?
                      AND p.status = 'final'
                      AND p.is_deleted = 0
                      ${resolvedReferringPrescriptionId ? "AND p.id = ?" : ""}
                    ORDER BY COALESCE(p.finalized_at, p.visit_date) DESC, p.id DESC
                    LIMIT 1
                    `,
                    hospital.adminId,
                    hospital.hospitalCode,
                    hospital.adminId,
                    hospital.hospitalId,
                    hospital.adminId,
                    hospital.hospitalId,
                    patientId,
                    referredByDoctorId,
                    doctorId,
                    ...(resolvedReferringPrescriptionId ? [resolvedReferringPrescriptionId] : [])
                );

                if (resolvedReferringPrescriptionId && !referringPrescriptionRows[0]) {
                    return { status: 400 as const, body: { error: "Referring prescription does not match this patient and doctor pair.", fieldErrors: { referring_prescription_id: "Select a valid referring prescription." } } };
                }
                resolvedReferringPrescriptionId = referringPrescriptionRows[0]?.id ? Number(referringPrescriptionRows[0].id) : null;
            }

            const dayOfWeek = getDayOfWeek(visitDate as string);
            const scheduleRows = await tx.$queryRawUnsafe<ScheduleRow[]>(
                `
                SELECT
                    dcs.schedule_id,
                    dcs.daily_capacity,
                    dcs.capacity_count_categories,
                    hd.room_no
                FROM hospital_doctors hd
                INNER JOIN doctors d
                  ON d.doctor_id = hd.doctor_id
                 AND d.admin_id = ?
                 AND d.status = 'ACTIVE'
                 AND d.active_from <= ?
                 AND d.active_to >= ?
                INNER JOIN doctor_clinic_schedule dcs
                  ON dcs.doctor_id = hd.doctor_id
                 AND dcs.admin_id = ?
                 AND dcs.scheduling_type = 'TOKEN_CAPACITY'
                 AND dcs.day_of_week = ?
                 AND dcs.effective_from <= ?
                 AND dcs.effective_to >= ?
                WHERE hd.hospital_id = ?
                  AND hd.doctor_id = ?
                ORDER BY dcs.effective_from DESC, dcs.schedule_id DESC
                LIMIT 1
                FOR UPDATE
                `,
                hospital.adminId,
                visitDate,
                visitDate,
                hospital.adminId,
                dayOfWeek,
                visitDate,
                visitDate,
                hospital.hospitalId,
                doctorId
            );

            const schedule = scheduleRows[0];
            if (!schedule) {
                return { status: 400 as const, body: { error: "TOKEN_CAPACITY schedule is not configured for this doctor and date.", fieldErrors: { doctor_id: "Doctor has no TOKEN_CAPACITY schedule for this date." } } };
            }

            const dailyCapacity = parsePositiveInt(schedule.daily_capacity);
            if (!dailyCapacity) {
                return { status: 400 as const, body: { error: "Daily capacity is not configured for this doctor schedule.", fieldErrors: { doctor_id: "Daily capacity is missing for this doctor schedule." } } };
            }

            const policyRows = await tx.$queryRawUnsafe<PolicyRow[]>(
                `
                SELECT policies
                FROM hospital_policy_settings
                WHERE hospital_id = ?
                LIMIT 1
                `,
                hospital.hospitalId
            );
            const policies = readPolicies(policyRows[0]?.policies);
            if (!policies.idFormat) {
                throw new Error("Hospital ID format policy is not configured.");
            }

            const holidaySet = await getHospitalHolidaySet({
                db: tx,
                hospitalId: hospital.hospitalId,
                fromDate: visitDate as string,
                toDate: visitDate as string,
            });
            if (!policies.workingDays.includes(dayOfWeek)) {
                return { status: 400 as const, body: { error: "Hospital is not configured as working on this date.", fieldErrors: { visit_date: "Selected date is not a hospital working day." } } };
            }
            if (holidaySet.has(visitDate as string)) {
                return { status: 400 as const, body: { error: "Hospital is closed on this date.", fieldErrors: { visit_date: "Selected date is a hospital holiday." } } };
            }

            const leaveRows = await tx.$queryRawUnsafe<LeaveRow[]>(
                `
                SELECT leave_id
                FROM doctor_leaves
                WHERE doctor_id = ?
                  AND admin_id = ?
                  AND leave_date = ?
                LIMIT 1
                `,
                doctorId,
                hospital.adminId,
                visitDate
            );
            if (leaveRows[0]) {
                return { status: 400 as const, body: { error: "Doctor is on leave on this date.", fieldErrors: { doctor_id: "Doctor is not bookable on the selected date." } } };
            }

            const capacityCountCategories = normalizeCapacityCategories(
                schedule.capacity_count_categories,
                policies.defaultCapacityCountCategories
            );
            const initialPatientCategory = resolveCapacityCategoryFromVisitType(visitType as VisitType);
            const shouldCheckFreeWindow = visitType === "OPD_OLD" || initialPatientCategory === "OLD_WITHIN_FOLLOWUP_VALIDITY";
            const eligiblePreviousVisit = shouldCheckFreeWindow
                ? await findEligiblePreviousVisit({
                    db: tx,
                    hospitalId: hospital.hospitalId,
                    adminId: hospital.adminId,
                    hospitalCode: hospital.hospitalCode,
                    patientId: patientId as number,
                    doctorId: doctorId as number,
                    referredByDoctorId,
                    referringPrescriptionId: resolvedReferringPrescriptionId,
                    visitDate: visitDate as string,
                    visitType: visitType as VisitType,
                    policies,
                })
                : null;
            const patientCategory = resolveEffectiveCapacityCategory({
                visitType: visitType as VisitType,
                eligiblePreviousVisit,
            });
            const storedVisitType: VisitType = visitType === "OPD_OLD" && paymentMode === "FREE" && eligiblePreviousVisit
                ? "FOLLOWUP"
                : visitType as VisitType;
            const needsWindowForFree = visitType === "OPD_OLD" || initialPatientCategory === "OLD_WITHIN_FOLLOWUP_VALIDITY";
            const shouldAutoWaiveReferral = visitType === "REFERRAL" && !!eligiblePreviousVisit && policies.feeWaiverAllowed;
            const effectivePaymentMode: PaymentMode = shouldAutoWaiveReferral
                ? "FREE"
                : paymentMode === "FREE" && needsWindowForFree && !eligiblePreviousVisit
                ? "CASH"
                : paymentMode as PaymentMode;
            const effectiveFeeWaivedReason = effectivePaymentMode === "FREE"
                ? feeWaivedReason || (visitType === "REFERRAL" ? "Referred doctor follow-up" : "Same doctor follow-up")
                : null;

            if (effectivePaymentMode === "FREE") {
                if (!policies.feeWaiverAllowed) {
                    return { status: 400 as const, body: { error: "Fee waiver is not allowed for this hospital.", fieldErrors: { payment_mode: "FREE is not enabled by hospital policy." } } };
                }
                if (policies.feeWaiverReasonRequired && !effectiveFeeWaivedReason) {
                    return { status: 400 as const, body: { error: "Fee waived reason is required.", fieldErrors: { fee_waived_reason: "Enter the fee waived reason." } } };
                }
            }

            if (tempTokenRegistrationId) {
                const tempTokenRows = await tx.$queryRawUnsafe<TempTokenScopeRow[]>(
                    `
                    SELECT registration_id
                    FROM hospital_registrations
                    WHERE registration_id = ?
                      AND hospital_group_code = ?
                      AND admin_id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    tempTokenRegistrationId,
                    hospital.hospitalCode,
                    hospital.adminId
                );

                if (!tempTokenRows[0]) {
                    return { status: 400 as const, body: { error: "Temp token was not found for this hospital.", fieldErrors: { temp_token_registration_id: "Temp token does not belong to this hospital." } } };
                }
            }

            const countPlaceholders = capacityCountCategories.map(() => "?").join(", ");
            const countRows = await tx.$queryRawUnsafe<CountRow[]>(
                `
                SELECT COUNT(*) AS visit_count
                FROM visits
                WHERE hospital_id = ?
                  AND doctor_id = ?
                  AND visit_date = ?
                  AND status <> 'CANCELLED'
                  AND (
                    CASE
                      WHEN visit_type IN ('OPD_NEW', 'CASUALTY', 'LAB_ONLY') THEN 'NEW'
                      WHEN visit_type IN ('FOLLOWUP', 'REFERRAL') THEN 'OLD_WITHIN_FOLLOWUP_VALIDITY'
                      ELSE 'OLD_OUTSIDE_FOLLOWUP_VALIDITY'
                    END
                  ) IN (${countPlaceholders})
                `,
                hospital.hospitalId,
                doctorId,
                visitDate,
                ...capacityCountCategories
            );
            const countedVisitsBeforeCreate = toNumber(countRows[0]?.visit_count);
            const currentVisitCountsForCapacity = capacityCountCategories.includes(patientCategory);
            const countedVisitsAfterCreate = countedVisitsBeforeCreate + (currentVisitCountsForCapacity ? 1 : 0);
            const capacityLimit = dailyCapacity;
            const surchargeApplied = currentVisitCountsForCapacity && policies.surchargeEnabled && countedVisitsAfterCreate > capacityLimit;
            const baseFee = resolveBaseFee({
                visitType: visitType as VisitType,
                registrationFee: policies.registrationFee,
                consultationFee: policies.consultationFee,
            });
            const feeCharged = effectivePaymentMode === "FREE"
                ? 0
                : baseFee + (surchargeApplied ? policies.surchargeAmount : 0);
            const paymentStatus: PaymentStatus = effectivePaymentMode === "FREE" ? "PAID" : requestedPaymentStatus as PaymentStatus;
            const formatKey = resolveVisitNumberFormatKey(visitType as VisitType);
            const visitNumber = formatKey
                ? await resolveHmsId({
                    db: tx,
                    hospitalId: hospital.hospitalId,
                    hospitalCode: hospital.hospitalCode,
                    idFormat: policies.idFormat,
                    formatKey,
                    roomNumber: schedule.room_no,
                })
                : null;
            const dailyTokenNumber = await allocateHmsSequence({
                db: tx,
                hospitalId: hospital.hospitalId,
                sequenceType: "TVTOKEN",
                periodKey: getDailyTokenPeriodKey(doctorId as number, visitDate as string),
            });
            if (!dailyTokenNumber) {
                throw new Error("Unable to allocate daily TV token.");
            }

            await tx.$executeRawUnsafe(
                `
                INSERT INTO visits (
                    hospital_id,
                    hospital_group_code,
                    admin_id,
                    patient_id,
                    doctor_id,
                    referred_by_doctor_id,
                    referring_prescription_id,
                    visit_date,
                    visit_type,
                    visit_number,
                    daily_token_number,
                    status,
                    fee_charged,
                    payment_mode,
                    payment_status,
                    fee_waived_reason,
                    override_reason,
                    created_by_user_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?, ?, ?, ?)
                `,
                hospital.hospitalId,
                hospital.hospitalCode,
                hospital.adminId,
                patientId,
                doctorId,
                storedVisitType === "REFERRAL" ? referredByDoctorId : null,
                storedVisitType === "REFERRAL" ? resolvedReferringPrescriptionId : null,
                visitDate,
                storedVisitType,
                visitNumber,
                dailyTokenNumber,
                feeCharged,
                effectivePaymentMode,
                paymentStatus,
                effectiveFeeWaivedReason,
                overrideReason,
                hospital.userId
            );

            const idRows = await tx.$queryRawUnsafe<InsertIdRow[]>("SELECT LAST_INSERT_ID() AS id");
            const visitId = Number(idRows[0]?.id || 0);
            if (!visitId) {
                throw new Error("Visit row was not created.");
            }

            if (tempTokenRegistrationId) {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE hospital_registrations
                    SET patient_id = ?,
                        visit_id = ?,
                        resolved_at = CURRENT_TIMESTAMP,
                        resolved_by_user_id = ?
                    WHERE registration_id = ?
                      AND hospital_group_code = ?
                      AND admin_id = ?
                    `,
                    patientId,
                    visitId,
                    hospital.userId,
                    tempTokenRegistrationId,
                    hospital.hospitalCode,
                    hospital.adminId
                );
            }

            const visitRows = await tx.$queryRawUnsafe<CreatedVisitRow[]>(
                `
                SELECT
                    visit_id,
                    hospital_id,
                    hospital_group_code,
                    admin_id,
                    patient_id,
                    doctor_id,
                    referred_by_doctor_id,
                    visit_date,
                    visit_type,
                    visit_number,
                    daily_token_number,
                    status,
                    fee_charged,
                    payment_mode,
                    payment_status,
                    fee_waived_reason,
                    override_reason,
                    created_at
                FROM visits
                WHERE visit_id = ?
                LIMIT 1
                `,
                visitId
            );

            const visit = visitRows[0];
            if (!visit) {
                throw new Error("Created visit could not be loaded.");
            }

            return {
                status: 201 as const,
                body: {
                    visit: serializeVisit(visit, {
                        countedVisitsBeforeCreate,
                        countedVisitsAfterCreate,
                        dailyCapacity,
                        capacityLimit,
                        surchargeApplied,
                        capacityCountCategories,
                        patientCategory,
                    }),
                    queue: {
                        activeStatuses: ACTIVE_QUEUE_STATUSES,
                        terminalStatuses: TERMINAL_STATUSES,
                    },
                },
            };
        });

        return NextResponse.json(created.body, { status: created.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create visit.";
        console.error("Create HMS visit error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
