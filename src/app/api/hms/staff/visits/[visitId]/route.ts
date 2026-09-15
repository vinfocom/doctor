import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { allocateHmsSequence } from "@/lib/hms-id-format";

const VISIT_TYPES = ["OPD_NEW", "OPD_OLD", "CASUALTY", "REFERRAL", "FOLLOWUP", "LAB_ONLY"] as const;
const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;

type VisitType = (typeof VISIT_TYPES)[number];
type CapacityCategory = (typeof CAPACITY_CATEGORIES)[number];

type VisitRow = {
    visit_id: number;
    hospital_id: number;
    hospital_group_code: string;
    admin_id: number;
    patient_id: number;
    doctor_id: number;
    visit_date: Date | string;
    visit_type: string;
    visit_number: string | null;
    daily_token_number: number | null;
    status: string;
    fee_charged: number | string;
    payment_mode: string;
    payment_status: string;
};

type PatientRow = {
    patient_id: number;
    uhid: string | null;
    full_name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    address: string | null;
};

type PolicyRow = { policies: unknown };
type ScheduleRow = { daily_capacity: number | null; capacity_count_categories: unknown; room_no: string | null };
type CountRow = { visit_count: bigint | number };
type IdRow = { id: bigint | number };
type DoctorRow = { doctor_id: number };
type HolidayRow = { holiday_date: Date | string };
type RawDb = {
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

function text(value: unknown) {
    return String(value || "").trim();
}

function optionalText(value: unknown) {
    const valueText = text(value);
    return valueText || null;
}

function numberOrNull(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDate(value: unknown) {
    const valueText = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : null;
}

function normalizeGender(value: unknown) {
    const valueText = text(value).toUpperCase();
    return ["MALE", "FEMALE", "OTHER"].includes(valueText) ? valueText : null;
}

function toNumber(value: bigint | number | undefined) {
    return typeof value === "bigint" ? Number(value) : Number(value || 0);
}

function parseObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function normalizeCategories(value: unknown, fallback: CapacityCategory[]): CapacityCategory[] {
    let values = Array.isArray(value) ? value : [];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            values = Array.isArray(parsed) ? parsed : [];
        } catch {
            values = [];
        }
    }
    const categories = values.filter((item): item is CapacityCategory => CAPACITY_CATEGORIES.includes(String(item) as CapacityCategory));
    return categories.length > 0 ? categories : fallback;
}

function getDayOfWeek(dateText: string) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function visitCategory(visitType: string): CapacityCategory {
    if (["OPD_NEW", "CASUALTY", "LAB_ONLY"].includes(visitType)) return "NEW";
    if (["FOLLOWUP", "REFERRAL"].includes(visitType)) return "OLD_WITHIN_FOLLOWUP_VALIDITY";
    return "OLD_OUTSIDE_FOLLOWUP_VALIDITY";
}

function getDailyTokenPeriodKey(doctorId: number, visitDate: string) {
    return `D${doctorId}:${visitDate.replace(/-/g, "")}`;
}

function parsePolicies(value: unknown) {
    const policies = parseObject(value);
    if (!policies) throw new Error("Hospital policy settings are not configured.");

    const registrationFee = numberOrNull(policies.registration_fee);
    if (registrationFee === null) throw new Error("Hospital registration fee is not configured.");
    const consultationFee = numberOrNull(policies.consultation_fee) ?? registrationFee;
    const surcharge = parseObject(policies.capacity_surcharge) || {};
    const surchargeAmount = numberOrNull(surcharge.surcharge_amount) || 0;
    const workingDays = Array.isArray(policies.working_days)
        ? policies.working_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];

    return {
        registrationFee,
        consultationFee,
        surchargeEnabled: surcharge.enabled === true,
        surchargeAmount,
        workingDays,
        defaultCategories: normalizeCategories(policies.default_capacity_count_categories, ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"]),
    };
}

async function getHolidaySet(db: RawDb, hospitalId: number, dateText: string) {
    const rows = await db.$queryRawUnsafe<HolidayRow[]>(
        `SELECT holiday_date FROM hospital_holidays WHERE hospital_id = ? AND holiday_date BETWEEN ? AND ?`,
        hospitalId,
        dateText,
        dateText
    );
    return new Set(rows.map((row) => typeof row.holiday_date === "string" ? row.holiday_date.slice(0, 10) : row.holiday_date.toISOString().slice(0, 10)));
}

async function requireReceptionAccess(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") return null;
    if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) return null;
    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") return null;
    return {
        hospital: session.hospitalContext,
        assignedDoctorIds: await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId),
    };
}

export async function PATCH(req: Request, context: { params: Promise<{ visitId: string }> }) {
    try {
        const access = await requireReceptionAccess(req);
        if (!access) return NextResponse.json({ error: "Reception access is required." }, { status: 403 });

        const visitId = positiveInt((await context.params).visitId);
        if (!visitId) return NextResponse.json({ error: "Valid visit is required." }, { status: 400 });

        const body = await req.json();
        const patientId = positiveInt(body?.patient_id);
        const doctorId = positiveInt(body?.doctor_id);
        const fullName = text(body?.full_name);
        const age = Number(body?.age);
        const gender = normalizeGender(body?.gender);
        const phone = optionalText(body?.phone)?.replace(/\D/g, "") || null;
        const city = optionalText(body?.city);
        const location = optionalText(body?.location);
        const address = optionalText(body?.address);
        const requestedFee = numberOrNull(body?.fee_charged);
        const errors: Record<string, string> = {};

        if (!patientId) errors.patient_id = "Valid patient is required.";
        if (!doctorId) errors.doctor_id = "Select a doctor.";
        if (!fullName || fullName.length > 255) errors.full_name = "Enter a valid patient name.";
        if (!Number.isInteger(age) || age < 0 || age > 150) errors.age = "Age must be a whole number from 0 to 150.";
        if (!gender) errors.gender = "Gender is required.";
        if (phone && !/^\d{10}$/.test(phone)) errors.phone = "Enter a 10 digit phone number.";
        if (city && city.length > 100) errors.city = "City must be 100 characters or fewer.";
        if (location && location.length > 255) errors.location = "Location must be 255 characters or fewer.";
        if (address && address.length > 500) errors.address = "Address must be 500 characters or fewer.";
        if (requestedFee === null) errors.fee_charged = "Enter a valid fee amount.";
        if (Object.keys(errors).length > 0) return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors: errors }, { status: 400 });
        if (patientId === null || doctorId === null || requestedFee === null) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors: errors }, { status: 400 });
        }
        if (!access.assignedDoctorIds.includes(doctorId)) return NextResponse.json({ error: "Doctor is not assigned to this staff account." }, { status: 403 });

        const updated = await prisma.$transaction(async (tx) => {
            const visitRows = await tx.$queryRawUnsafe<VisitRow[]>(
                `SELECT visit_id, hospital_id, hospital_group_code, admin_id, patient_id, doctor_id, visit_date, visit_type, visit_number, daily_token_number, status, fee_charged, payment_mode, payment_status
                 FROM visits
                 WHERE visit_id = ? AND hospital_id = ? AND admin_id = ? AND hospital_group_code = ?
                 LIMIT 1 FOR UPDATE`,
                visitId,
                access.hospital.hospitalId,
                access.hospital.adminId,
                access.hospital.hospitalCode
            );
            const visit = visitRows[0];
            if (!visit) return { error: "Visit does not belong to this hospital.", status: 404 };
            if (visit.status !== "WAITING") return { error: "Only waiting visits can be edited.", status: 409 };
            if (!access.assignedDoctorIds.includes(Number(visit.doctor_id))) return { error: "This visit is no longer assigned to this staff account.", status: 403 };

            const prescriptionRows = await tx.$queryRawUnsafe<IdRow[]>(`SELECT id FROM prescriptions WHERE visit_id = ? LIMIT 1`, visitId);
            if (prescriptionRows[0]) return { error: "This visit already has EMR activity and cannot be edited.", status: 409 };

            const patientRows = await tx.$queryRawUnsafe<PatientRow[]>(
                `SELECT patient_id FROM patients WHERE patient_id = ? AND admin_id = ? AND hospital_group_code = ? LIMIT 1 FOR UPDATE`,
                patientId,
                access.hospital.adminId,
                access.hospital.hospitalCode
            );
            if (!patientRows[0] || Number(patientId) !== Number(visit.patient_id)) return { error: "Patient does not match this visit.", status: 400 };

            const doctorRows = await tx.$queryRawUnsafe<DoctorRow[]>(
                `SELECT d.doctor_id
                 FROM hospital_doctors hd INNER JOIN doctors d ON d.doctor_id = hd.doctor_id
                 WHERE hd.hospital_id = ? AND hd.doctor_id = ? AND d.admin_id = ? AND d.status = 'ACTIVE'
                   AND d.active_from <= ? AND d.active_to >= ? LIMIT 1`,
                access.hospital.hospitalId,
                doctorId,
                access.hospital.adminId,
                visit.visit_date,
                visit.visit_date
            );
            if (!doctorRows[0]) return { error: "Selected doctor is not active for this visit date.", status: 400 };

            const visitDate = typeof visit.visit_date === "string" ? visit.visit_date.slice(0, 10) : visit.visit_date.toISOString().slice(0, 10);
            const dayOfWeek = getDayOfWeek(visitDate);
            const scheduleRows = await tx.$queryRawUnsafe<ScheduleRow[]>(
                `SELECT dcs.daily_capacity, dcs.capacity_count_categories, hd.room_no
                 FROM hospital_doctors hd
                 INNER JOIN doctor_clinic_schedule dcs ON dcs.doctor_id = hd.doctor_id
                   AND dcs.admin_id = ? AND dcs.scheduling_type = 'TOKEN_CAPACITY' AND dcs.day_of_week = ?
                   AND dcs.effective_from <= ? AND dcs.effective_to >= ?
                 WHERE hd.hospital_id = ? AND hd.doctor_id = ?
                 ORDER BY dcs.effective_from DESC, dcs.schedule_id DESC LIMIT 1 FOR UPDATE`,
                access.hospital.adminId,
                dayOfWeek,
                visitDate,
                visitDate,
                access.hospital.hospitalId,
                doctorId
            );
            const schedule = scheduleRows[0];
            if (!schedule || !schedule.daily_capacity) return { error: "Doctor schedule is not configured for this date.", status: 400 };

            const policyRows = await tx.$queryRawUnsafe<PolicyRow[]>(`SELECT policies FROM hospital_policy_settings WHERE hospital_id = ? LIMIT 1`, access.hospital.hospitalId);
            const policies = parsePolicies(policyRows[0]?.policies);
            const holidaySet = await getHolidaySet(tx, access.hospital.hospitalId, visitDate);
            if (!policies.workingDays.includes(dayOfWeek) || holidaySet.has(visitDate)) return { error: "Hospital is closed on this date.", status: 400 };

            const leaveRows = await tx.$queryRawUnsafe<IdRow[]>(`SELECT leave_id AS id FROM doctor_leaves WHERE doctor_id = ? AND admin_id = ? AND leave_date = ? LIMIT 1`, doctorId, access.hospital.adminId, visitDate);
            if (leaveRows[0]) return { error: "Doctor is on leave on this date.", status: 400 };

            const categories = normalizeCategories(schedule.capacity_count_categories, policies.defaultCategories);
            const countPlaceholders = categories.map(() => "?").join(", ");
            const countRows = await tx.$queryRawUnsafe<CountRow[]>(
                `SELECT COUNT(*) AS visit_count FROM visits
                 WHERE hospital_id = ? AND admin_id = ? AND hospital_group_code = ? AND doctor_id = ? AND visit_date = ? AND visit_id <> ? AND status <> 'CANCELLED'
                   AND (CASE WHEN visit_type IN ('OPD_NEW', 'CASUALTY', 'LAB_ONLY') THEN 'NEW' WHEN visit_type IN ('FOLLOWUP', 'REFERRAL') THEN 'OLD_WITHIN_FOLLOWUP_VALIDITY' ELSE 'OLD_OUTSIDE_FOLLOWUP_VALIDITY' END) IN (${countPlaceholders})`,
                access.hospital.hospitalId,
                access.hospital.adminId,
                access.hospital.hospitalCode,
                doctorId,
                visitDate,
                visitId,
                ...categories
            );
            const countedAfter = toNumber(countRows[0]?.visit_count) + (categories.includes(visitCategory(visit.visit_type)) ? 1 : 0);
            const surcharge = policies.surchargeEnabled && countedAfter > Number(schedule.daily_capacity) ? policies.surchargeAmount : 0;
            const baseFee = ["OPD_NEW", "CASUALTY", "LAB_ONLY"].includes(visit.visit_type) ? policies.registrationFee : policies.consultationFee;
            const calculatedFee = baseFee + surcharge;
            const nextToken = Number(visit.doctor_id) === doctorId
                ? visit.daily_token_number
                : await allocateHmsSequence({
                    db: tx,
                    hospitalId: access.hospital.hospitalId,
                    sequenceType: "TVTOKEN",
                    periodKey: getDailyTokenPeriodKey(doctorId, visitDate),
                });

            await tx.$executeRawUnsafe(
                `UPDATE patients SET full_name = ?, phone = ?, age = ?, gender = ?, city = ?, location = ?, address = ?
                 WHERE patient_id = ? AND admin_id = ? AND hospital_group_code = ?`,
                fullName,
                phone,
                age,
                gender,
                city,
                location,
                address,
                patientId,
                access.hospital.adminId,
                access.hospital.hospitalCode
            );
            await tx.$executeRawUnsafe(
                `UPDATE visits SET doctor_id = ?, daily_token_number = ?, fee_charged = ? WHERE visit_id = ? AND status = 'WAITING'`,
                doctorId,
                nextToken,
                requestedFee ?? calculatedFee,
                visitId
            );

            const resultRows = await tx.$queryRawUnsafe<VisitRow[]>(`SELECT visit_id, hospital_id, hospital_group_code, admin_id, patient_id, doctor_id, visit_date, visit_type, visit_number, daily_token_number, status, fee_charged, payment_mode, payment_status FROM visits WHERE visit_id = ? LIMIT 1`, visitId);
            return { visit: resultRows[0], calculatedFee };
        });

        if ("error" in updated) return NextResponse.json({ error: updated.error }, { status: updated.status });
        return NextResponse.json({ visit: updated.visit, calculated_fee: updated.calculatedFee });
    } catch (error) {
        console.error("Update HMS waiting visit error:", error);
        return NextResponse.json({ error: "Unable to update waiting visit." }, { status: 500 });
    }
}
