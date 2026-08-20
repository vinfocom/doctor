import prisma from "@/lib/prisma";

export type HmsReportSummary = {
    total_visits: number;
    opd_new: number;
    opd_old: number;
    followup: number;
    referral: number;
    lab_only: number;
    casualty: number;
    waiting: number;
    in_consult: number;
    lab: number;
    completed: number;
    cancelled: number;
    total_fee_charged: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    waived_amount: number;
    surcharge_amount: number;
    cash_amount: number;
    upi_amount: number;
    card_amount: number;
};

export type HmsDailyReportRow = {
    date: string;
} & HmsReportSummary;

export type HmsDoctorReportRow = {
    doctor_id: number;
    doctor_name: string;
    room_no: string | null;
    daily_capacity: number | null;
    total_visits: number;
    opd_new: number;
    opd_old: number;
    followup: number;
    referral: number;
    lab_only: number;
    waiting: number;
    in_consult: number;
    lab: number;
    completed: number;
    cancelled: number;
    capacity_used: number;
    beyond_capacity_count: number;
    total_fee_charged: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    surcharge_amount: number;
    cash_amount: number;
    upi_amount: number;
    card_amount: number;
};

export type HmsStaffReportRow = {
    user_id: number;
    staff_name: string;
    total_registrations: number;
    cancelled_visits: number;
    paid_amount: number;
    pending_amount: number;
    free_visits: number;
    waived_amount: number;
};

export type HmsPreRegistrationSummary = {
    total_tokens: number;
    converted_tokens: number;
    pending_tokens: number;
    doctor_selected_tokens: number;
    doctor_missing_tokens: number;
    conversion_rate: number;
};

export type HmsRegistrationReportRow = {
    visit_id: number;
    date: string;
    created_at: string | null;
    opd_no: string | null;
    token_no: number | null;
    uhid: string | null;
    patient_name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
    visit_type: string;
    status: string;
    doctor_name: string;
    room_no: string | null;
    referred_by_room_no: string | null;
    referral_route: string | null;
    fee_charged: number;
    estimated_base_fee: number;
    estimated_surcharge: number;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    override_reason: string | null;
    registered_by: string | null;
    cancelled_by: string | null;
};

export type HmsReports = {
    from_date: string;
    to_date: string;
    summary: HmsReportSummary;
    daily: HmsDailyReportRow[];
    doctors: HmsDoctorReportRow[];
    registrations: HmsRegistrationReportRow[];
    pending_payments: HmsRegistrationReportRow[];
    waivers: HmsRegistrationReportRow[];
    staff_activity: HmsStaffReportRow[];
    pre_registration: HmsPreRegistrationSummary;
};

type HospitalScopeRow = {
    code: string;
    admin_id: number;
};

type PolicyRow = {
    policies: unknown;
};

type PreRegistrationReportRow = {
    total_tokens: number | bigint | null;
    converted_tokens: number | bigint | null;
    pending_tokens: number | bigint | null;
    doctor_selected_tokens: number | bigint | null;
    doctor_missing_tokens: number | bigint | null;
};

type VisitReportRow = {
    visit_id: number;
    visit_date: Date | string;
    created_at: Date | string | null;
    visit_number: string | null;
    daily_token_number: number | null;
    visit_type: string;
    status: string;
    fee_charged: number | string;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    override_reason: string | null;
    patient_uhid: string | null;
    patient_name: string | null;
    patient_age: number | null;
    patient_gender: string | null;
    patient_phone: string | null;
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
    referred_by_room_no: string | null;
    daily_capacity: number | null;
    created_by_user_id: number | null;
    registered_by: string | null;
    cancelled_by_user_id: number | null;
    cancelled_by: string | null;
};

const emptySummary = (): HmsReportSummary => ({
    total_visits: 0,
    opd_new: 0,
    opd_old: 0,
    followup: 0,
    referral: 0,
    lab_only: 0,
    casualty: 0,
    waiting: 0,
    in_consult: 0,
    lab: 0,
    completed: 0,
    cancelled: 0,
    total_fee_charged: 0,
    paid_amount: 0,
    pending_amount: 0,
    free_visits: 0,
    waived_amount: 0,
    surcharge_amount: 0,
    cash_amount: 0,
    upi_amount: 0,
    card_amount: 0,
});

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function toMoney(value: unknown) {
    const numberValue = Number(value || 0);
    return Number.isFinite(numberValue) ? Number(numberValue.toFixed(2)) : 0;
}

function toCount(value: number | bigint | null | undefined) {
    return Number(value || 0);
}

function toPercent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
}

function toDate(value: Date | string) {
    return String(value).slice(0, 10);
}

function toDateTime(value: Date | string | null) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
    return String(value).replace("T", " ").slice(0, 19);
}

function normalizeDateInput(value: string | null, fallback: string) {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return fallback;
}

export function todayYmdInIst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function baseFeeForVisit(visitType: string, registrationFee: number, consultationFee: number) {
    return ["OPD_NEW", "CASUALTY", "LAB_ONLY"].includes(visitType) ? registrationFee : consultationFee;
}

function addVisitToSummary(summary: HmsReportSummary, visit: HmsRegistrationReportRow) {
    const fee = toMoney(visit.fee_charged);
    const baseFee = toMoney(visit.estimated_base_fee);
    const surcharge = toMoney(visit.estimated_surcharge);

    summary.total_visits += 1;
    if (visit.visit_type === "OPD_NEW") summary.opd_new += 1;
    if (visit.visit_type === "OPD_OLD") summary.opd_old += 1;
    if (visit.visit_type === "FOLLOWUP") summary.followup += 1;
    if (visit.visit_type === "REFERRAL") summary.referral += 1;
    if (visit.visit_type === "LAB_ONLY") summary.lab_only += 1;
    if (visit.visit_type === "CASUALTY") summary.casualty += 1;
    if (visit.status === "WAITING") summary.waiting += 1;
    if (visit.status === "IN_CONSULT") summary.in_consult += 1;
    if (visit.status === "LAB") summary.lab += 1;
    if (visit.status === "COMPLETED") summary.completed += 1;
    if (visit.status === "CANCELLED") summary.cancelled += 1;

    summary.total_fee_charged = toMoney(summary.total_fee_charged + fee);
    summary.surcharge_amount = toMoney(summary.surcharge_amount + surcharge);

    if (visit.payment_mode === "FREE") {
        summary.free_visits += 1;
        summary.waived_amount = toMoney(summary.waived_amount + baseFee);
    }
    if (visit.payment_status === "PAID") summary.paid_amount = toMoney(summary.paid_amount + fee);
    if (visit.payment_status === "PENDING") summary.pending_amount = toMoney(summary.pending_amount + fee);
    if (visit.payment_mode === "CASH" && visit.payment_status === "PAID") summary.cash_amount = toMoney(summary.cash_amount + fee);
    if (visit.payment_mode === "UPI" && visit.payment_status === "PAID") summary.upi_amount = toMoney(summary.upi_amount + fee);
    if (visit.payment_mode === "CARD" && visit.payment_status === "PAID") summary.card_amount = toMoney(summary.card_amount + fee);
}

function serializeRegistration(row: VisitReportRow, registrationFee: number, consultationFee: number): HmsRegistrationReportRow {
    const fee = toMoney(row.fee_charged);
    const baseFee = baseFeeForVisit(row.visit_type, registrationFee, consultationFee);

    return {
        visit_id: Number(row.visit_id),
        date: toDate(row.visit_date),
        created_at: toDateTime(row.created_at),
        opd_no: row.visit_number,
        token_no: row.daily_token_number === null || row.daily_token_number === undefined ? null : Number(row.daily_token_number),
        uhid: row.patient_uhid,
        patient_name: row.patient_name || "Unnamed",
        age: row.patient_age === null ? null : Number(row.patient_age),
        gender: row.patient_gender,
        phone: row.patient_phone,
        visit_type: row.visit_type,
        status: row.status,
        doctor_name: row.doctor_name || "Doctor",
        room_no: row.room_no,
        referred_by_room_no: row.referred_by_room_no,
        referral_route:
            row.visit_type === "REFERRAL"
                ? [row.referred_by_room_no || "-", row.room_no || "-"].join(" → ")
                : null,
        fee_charged: fee,
        estimated_base_fee: baseFee,
        estimated_surcharge: row.payment_mode === "FREE" ? 0 : Math.max(0, toMoney(fee - baseFee)),
        payment_mode: row.payment_mode,
        payment_status: row.payment_status,
        fee_waived_reason: row.fee_waived_reason,
        override_reason: row.override_reason,
        registered_by: row.registered_by,
        cancelled_by: row.cancelled_by,
    };
}

export async function buildHmsReports(input: {
    hospitalId: number;
    fromDate?: string | null;
    toDate?: string | null;
}): Promise<HmsReports> {
    const today = todayYmdInIst();
    const fromDate = normalizeDateInput(input.fromDate || null, today);
    const toDate = normalizeDateInput(input.toDate || null, fromDate);
    const startDate = fromDate <= toDate ? fromDate : toDate;
    const endDate = fromDate <= toDate ? toDate : fromDate;

    const policyRows = await prisma.$queryRawUnsafe<PolicyRow[]>(
        `
        SELECT policies
        FROM hospital_policy_settings
        WHERE hospital_id = ?
        LIMIT 1
        `,
        input.hospitalId
    );
    const policies = parseJsonObject(policyRows[0]?.policies);
    const registrationFee = toMoney(policies.registration_fee ?? 0);
    const consultationFee = toMoney(policies.consultation_fee ?? registrationFee);

    const hospitalRows = await prisma.$queryRawUnsafe<HospitalScopeRow[]>(
        `
        SELECT code, admin_id
        FROM hospitals
        WHERE hospital_id = ?
        LIMIT 1
        `,
        input.hospitalId
    );
    const hospital = hospitalRows[0];
    if (!hospital) {
        throw new Error("Hospital not found for reports.");
    }

    const rows = await prisma.$queryRawUnsafe<VisitReportRow[]>(
        `
        SELECT
            v.visit_id,
            v.visit_date,
            v.created_at,
            v.visit_number,
            v.daily_token_number,
            v.visit_type,
            v.status,
            v.fee_charged,
            v.payment_mode,
            v.payment_status,
            v.fee_waived_reason,
            v.override_reason,
            p.uhid AS patient_uhid,
            p.full_name AS patient_name,
            p.age AS patient_age,
            p.gender AS patient_gender,
            p.phone AS patient_phone,
            d.doctor_id,
            d.doctor_name,
            hd.room_no,
            ref_hd.room_no AS referred_by_room_no,
            dcs.daily_capacity,
            v.created_by_user_id,
            creator.name AS registered_by,
            v.cancelled_by_user_id,
            canceller.name AS cancelled_by
        FROM visits v
        INNER JOIN patients p
          ON p.patient_id = v.patient_id
        INNER JOIN doctors d
          ON d.doctor_id = v.doctor_id
        LEFT JOIN hospital_doctors hd
          ON hd.hospital_id = v.hospital_id
         AND hd.doctor_id = v.doctor_id
        LEFT JOIN hospital_doctors ref_hd
          ON ref_hd.hospital_id = v.hospital_id
         AND ref_hd.doctor_id = v.referred_by_doctor_id
        LEFT JOIN doctor_clinic_schedule dcs
          ON dcs.schedule_id = (
            SELECT latest_dcs.schedule_id
            FROM doctor_clinic_schedule latest_dcs
            WHERE latest_dcs.doctor_id = v.doctor_id
              AND latest_dcs.admin_id = v.admin_id
              AND latest_dcs.clinic_id IS NULL
              AND latest_dcs.scheduling_type = 'TOKEN_CAPACITY'
              AND latest_dcs.day_of_week = (DAYOFWEEK(v.visit_date) - 1)
              AND latest_dcs.effective_from <= v.visit_date
              AND latest_dcs.effective_to >= v.visit_date
            ORDER BY latest_dcs.effective_from DESC, latest_dcs.schedule_id DESC
            LIMIT 1
          )
        LEFT JOIN users creator
          ON creator.user_id = v.created_by_user_id
        LEFT JOIN users canceller
          ON canceller.user_id = v.cancelled_by_user_id
        WHERE v.hospital_id = ?
          AND v.visit_date BETWEEN ? AND ?
        ORDER BY v.visit_date DESC, v.created_at DESC, v.visit_id DESC
        `,
        input.hospitalId,
        startDate,
        endDate
    );

    const preRegistrationRows = await prisma.$queryRawUnsafe<PreRegistrationReportRow[]>(
        `
        SELECT
            COUNT(*) AS total_tokens,
            SUM(CASE WHEN resolved_at IS NOT NULL OR visit_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_tokens,
            SUM(CASE WHEN resolved_at IS NULL AND visit_id IS NULL THEN 1 ELSE 0 END) AS pending_tokens,
            SUM(CASE WHEN doctor_id IS NOT NULL THEN 1 ELSE 0 END) AS doctor_selected_tokens,
            SUM(CASE WHEN doctor_id IS NULL THEN 1 ELSE 0 END) AS doctor_missing_tokens
        FROM hospital_registrations
        WHERE hospital_group_code = ?
          AND admin_id = ?
          AND reg_date BETWEEN ? AND ?
        `,
        hospital.code,
        hospital.admin_id,
        startDate,
        endDate
    );
    const preRegistrationRow = preRegistrationRows[0];
    const totalPreRegistrationTokens = toCount(preRegistrationRow?.total_tokens);
    const convertedPreRegistrationTokens = toCount(preRegistrationRow?.converted_tokens);
    const preRegistration: HmsPreRegistrationSummary = {
        total_tokens: totalPreRegistrationTokens,
        converted_tokens: convertedPreRegistrationTokens,
        pending_tokens: toCount(preRegistrationRow?.pending_tokens),
        doctor_selected_tokens: toCount(preRegistrationRow?.doctor_selected_tokens),
        doctor_missing_tokens: toCount(preRegistrationRow?.doctor_missing_tokens),
        conversion_rate: toPercent(convertedPreRegistrationTokens, totalPreRegistrationTokens),
    };

    const rowsByVisitId = new Map(rows.map((row) => [Number(row.visit_id), row]));
    const registrations = rows.map((row) => serializeRegistration(row, registrationFee, consultationFee));
    const summary = emptySummary();
    const dailyMap = new Map<string, HmsDailyReportRow>();
    const doctorMap = new Map<number, HmsDoctorReportRow>();
    const staffMap = new Map<number, HmsStaffReportRow>();

    for (const visit of registrations) {
        addVisitToSummary(summary, visit);

        if (!dailyMap.has(visit.date)) {
            dailyMap.set(visit.date, { date: visit.date, ...emptySummary() });
        }
        addVisitToSummary(dailyMap.get(visit.date)!, visit);

        const sourceRow = rowsByVisitId.get(visit.visit_id);
        const doctorId = Number(sourceRow?.doctor_id || 0);
        if (!doctorMap.has(doctorId)) {
            doctorMap.set(doctorId, {
                doctor_id: doctorId,
                doctor_name: visit.doctor_name,
                room_no: visit.room_no,
                daily_capacity: sourceRow?.daily_capacity === null || sourceRow?.daily_capacity === undefined ? null : Number(sourceRow.daily_capacity),
                total_visits: 0,
                opd_new: 0,
                opd_old: 0,
                followup: 0,
                referral: 0,
                lab_only: 0,
                waiting: 0,
                in_consult: 0,
                lab: 0,
                completed: 0,
                cancelled: 0,
                capacity_used: 0,
                beyond_capacity_count: 0,
                total_fee_charged: 0,
                paid_amount: 0,
                pending_amount: 0,
                free_visits: 0,
                surcharge_amount: 0,
                cash_amount: 0,
                upi_amount: 0,
                card_amount: 0,
            });
        }
        const doctor = doctorMap.get(doctorId)!;
        doctor.total_visits += 1;
        if (visit.visit_type === "OPD_NEW") doctor.opd_new += 1;
        if (visit.visit_type === "OPD_OLD") doctor.opd_old += 1;
        if (visit.visit_type === "FOLLOWUP") doctor.followup += 1;
        if (visit.visit_type === "REFERRAL") doctor.referral += 1;
        if (visit.visit_type === "LAB_ONLY") doctor.lab_only += 1;
        if (visit.status === "WAITING") doctor.waiting += 1;
        if (visit.status === "IN_CONSULT") doctor.in_consult += 1;
        if (visit.status === "LAB") doctor.lab += 1;
        if (visit.status === "COMPLETED") doctor.completed += 1;
        if (visit.status === "CANCELLED") doctor.cancelled += 1;
        if (visit.status !== "CANCELLED") doctor.capacity_used += 1;
        if (visit.estimated_surcharge > 0) doctor.beyond_capacity_count += 1;
        doctor.total_fee_charged = toMoney(doctor.total_fee_charged + visit.fee_charged);
        doctor.surcharge_amount = toMoney(doctor.surcharge_amount + visit.estimated_surcharge);
        if (visit.payment_status === "PAID") doctor.paid_amount = toMoney(doctor.paid_amount + visit.fee_charged);
        if (visit.payment_status === "PENDING") doctor.pending_amount = toMoney(doctor.pending_amount + visit.fee_charged);
        if (visit.payment_mode === "FREE") doctor.free_visits += 1;
        if (visit.payment_mode === "CASH" && visit.payment_status === "PAID") doctor.cash_amount = toMoney(doctor.cash_amount + visit.fee_charged);
        if (visit.payment_mode === "UPI" && visit.payment_status === "PAID") doctor.upi_amount = toMoney(doctor.upi_amount + visit.fee_charged);
        if (visit.payment_mode === "CARD" && visit.payment_status === "PAID") doctor.card_amount = toMoney(doctor.card_amount + visit.fee_charged);

        if (sourceRow?.created_by_user_id) {
            const userId = Number(sourceRow.created_by_user_id);
            if (!staffMap.has(userId)) {
                staffMap.set(userId, {
                    user_id: userId,
                    staff_name: visit.registered_by || `User ${userId}`,
                    total_registrations: 0,
                    cancelled_visits: 0,
                    paid_amount: 0,
                    pending_amount: 0,
                    free_visits: 0,
                    waived_amount: 0,
                });
            }
            const staff = staffMap.get(userId)!;
            staff.total_registrations += 1;
            if (visit.status === "CANCELLED") staff.cancelled_visits += 1;
            if (visit.payment_status === "PAID") staff.paid_amount = toMoney(staff.paid_amount + visit.fee_charged);
            if (visit.payment_status === "PENDING") staff.pending_amount = toMoney(staff.pending_amount + visit.fee_charged);
            if (visit.payment_mode === "FREE") {
                staff.free_visits += 1;
                staff.waived_amount = toMoney(staff.waived_amount + visit.estimated_base_fee);
            }
        }
    }

    return {
        from_date: startDate,
        to_date: endDate,
        summary,
        daily: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
        doctors: Array.from(doctorMap.values()).sort((a, b) => a.doctor_name.localeCompare(b.doctor_name)),
        registrations,
        pending_payments: registrations.filter((visit) => visit.payment_status === "PENDING"),
        waivers: registrations.filter((visit) => visit.payment_mode === "FREE" || Boolean(visit.fee_waived_reason)),
        staff_activity: Array.from(staffMap.values()).sort((a, b) => a.staff_name.localeCompare(b.staff_name)),
        pre_registration: preRegistration,
    };
}
