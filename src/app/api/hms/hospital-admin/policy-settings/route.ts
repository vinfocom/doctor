export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const WINDOW_UNITS = ["working_days", "calendar_days"] as const;
const RESET_MODES = ["never", "reset_on_new_year", "carry_on_new_year", "reset_on_new_financial_year"] as const;

type CapacityCategory = (typeof CAPACITY_CATEGORIES)[number];
type WindowUnit = (typeof WINDOW_UNITS)[number];
type EditableSequenceType = "UHID" | "OPD" | "CASUALTY";
type ResetMode = (typeof RESET_MODES)[number];
type IdFormatSegment =
    | { type: "static"; value: string }
    | { type: "sequence"; sequence_type: EditableSequenceType; pad_to?: number }
    | { type: "calendar_year"; format?: "YYYY" | "YY" }
    | { type: "financial_year"; format?: "YYYY-YY" | "YY-YY" }
    | { type: "date"; format?: "YYYYMMDD" | "YYYY-MM-DD" | "DDMMYYYY" }
    | { type: "room_number" }
    | { type: "separator"; value: string };

type PolicyRow = {
    id: number;
    policies: unknown;
};

const DEFAULT_ID_FORMAT = {
    uhid: [
        { type: "static", value: "NAH" },
        { type: "separator", value: "/" },
        { type: "calendar_year", format: "YYYY" },
        { type: "separator", value: "/" },
        { type: "sequence", sequence_type: "UHID", pad_to: 6 },
    ] satisfies IdFormatSegment[],
    opd: [
        { type: "static", value: "NAH" },
        { type: "separator", value: "/OPD/" },
        { type: "calendar_year", format: "YYYY" },
        { type: "separator", value: "/" },
        { type: "sequence", sequence_type: "OPD", pad_to: 6 },
    ] satisfies IdFormatSegment[],
    casualty: [
        { type: "static", value: "NAH" },
        { type: "separator", value: "/Cas/" },
        { type: "calendar_year", format: "YYYY" },
        { type: "separator", value: "/" },
        { type: "sequence", sequence_type: "CASUALTY", pad_to: 6 },
    ] satisfies IdFormatSegment[],
    sequence_reset: {
        uhid: "never",
        opd: "never",
        casualty: "never",
    } satisfies Record<"uhid" | "opd" | "casualty", ResetMode>,
};

const DEFAULT_POLICY_PATCH = {
    registration_fee: 50,
    consultation_fee: 50,
    fee_waiver_allowed: true,
    free_payment: {
        enabled: true,
        require_waiver_reason: true,
    },
    capacity_surcharge: {
        enabled: true,
        surcharge_amount: 300,
    },
    doctor_token_enabled: false,
    default_capacity_count_categories: ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] satisfies CapacityCategory[],
        working_days: [0, 1, 2, 3, 4, 5, 6],
        reconsult_window_unit: "working_days" satisfies WindowUnit,
        free_reconsult_windows: [
            { scope: "referred_doctor", window_days: 0, count_visit_day: true },
            { scope: "same_doctor", window_days: 3, count_visit_day: false },
        ],
};

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

function parseMoney(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function parsePositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value: unknown) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeCapacityCategories(value: unknown) {
    if (!Array.isArray(value)) return null;
    const normalized = value.map((item) => String(item || "").trim().toUpperCase());
    if (normalized.length === 0) return null;
    if (normalized.some((item) => !CAPACITY_CATEGORIES.includes(item as CapacityCategory))) return null;
    return Array.from(new Set(normalized)) as CapacityCategory[];
}

function normalizeWorkingDays(value: unknown) {
    if (!Array.isArray(value)) return DEFAULT_POLICY_PATCH.working_days;
    const days = Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)));
    return days.length > 0 ? days.sort((left, right) => left - right) : DEFAULT_POLICY_PATCH.working_days;
}

function normalizeWindowUnit(value: unknown): WindowUnit {
    const unit = String(value || "").trim();
    return WINDOW_UNITS.includes(unit as WindowUnit) ? unit as WindowUnit : DEFAULT_POLICY_PATCH.reconsult_window_unit as WindowUnit;
}

function normalizeFreeReconsultWindows(value: unknown) {
    const input = Array.isArray(value) ? value : DEFAULT_POLICY_PATCH.free_reconsult_windows;
    return DEFAULT_POLICY_PATCH.free_reconsult_windows.map((defaultWindow) => {
        const match = input.find((item) => {
            const row = parseJsonObject(item);
            return row.scope === defaultWindow.scope;
        });
        const row = parseJsonObject(match);
        return {
            scope: defaultWindow.scope,
            window_days: parsePositiveInt(row.window_days) ?? defaultWindow.window_days,
            count_visit_day: typeof row.count_visit_day === "boolean" ? row.count_visit_day : defaultWindow.count_visit_day,
        };
    });
}

function normalizeIdFormat(value: unknown) {
    const idFormat = parseJsonObject(value);
    const resetObject = parseJsonObject(idFormat.sequence_reset);
    return {
        uhid: normalizeIdSegments(idFormat.uhid, "UHID", DEFAULT_ID_FORMAT.uhid),
        opd: normalizeIdSegments(idFormat.opd, "OPD", DEFAULT_ID_FORMAT.opd),
        casualty: normalizeIdSegments(idFormat.casualty, "CASUALTY", DEFAULT_ID_FORMAT.casualty),
        sequence_reset: {
            uhid: normalizeResetMode(resetObject.uhid),
            opd: normalizeResetMode(resetObject.opd),
            casualty: normalizeResetMode(resetObject.casualty),
        },
    };
}

function normalizeResetMode(value: unknown): ResetMode {
    const resetMode = String(value || "").trim();
    return RESET_MODES.includes(resetMode as ResetMode) ? resetMode as ResetMode : "never";
}

function normalizeIdSegments(value: unknown, expectedSequenceType: EditableSequenceType, fallback: IdFormatSegment[]) {
    const input = Array.isArray(value) ? value : fallback;
    const segments: IdFormatSegment[] = [];
    let sequenceCount = 0;

    for (const rawSegment of input) {
        const segment = parseJsonObject(rawSegment);
        const type = String(segment.type || "").trim();

        if (type === "static" || type === "separator") {
            const text = String(segment.value ?? "");
            if (!text) continue;
            segments.push({ type, value: text });
        } else if (type === "sequence") {
            const sequenceType = String(segment.sequence_type || "").toUpperCase();
            const padTo = Number(segment.pad_to ?? 1);
            if (sequenceType !== expectedSequenceType || !Number.isInteger(padTo) || padTo < 1 || padTo > 12) {
                continue;
            }
            sequenceCount += 1;
            segments.push({ type: "sequence", sequence_type: expectedSequenceType, pad_to: padTo });
        } else if (type === "calendar_year") {
            segments.push({ type: "calendar_year", format: segment.format === "YY" ? "YY" : "YYYY" });
        } else if (type === "financial_year") {
            segments.push({ type: "financial_year", format: segment.format === "YY-YY" ? "YY-YY" : "YYYY-YY" });
        } else if (type === "date") {
            const format = String(segment.format || "YYYYMMDD");
            segments.push({
                type: "date",
                format: format === "YYYY-MM-DD" || format === "DDMMYYYY" ? format : "YYYYMMDD",
            });
        } else if (type === "room_number") {
            segments.push({ type: "room_number" });
        }
    }

    return segments.length > 0 && sequenceCount === 1 ? segments : fallback;
}

function validateIdSegments(value: unknown, expectedSequenceType: EditableSequenceType, label: string) {
    if (!Array.isArray(value) || value.length === 0) {
        return { error: `${label} pattern needs at least one box.`, segments: null };
    }

    const normalized = normalizeIdSegments(value, expectedSequenceType, []);
    const sequenceCount = normalized.filter((segment) => segment.type === "sequence").length;

    if (normalized.length === 0) {
        return { error: `${label} pattern has no valid boxes.`, segments: null };
    }

    if (sequenceCount !== 1) {
        return { error: `${label} pattern must include exactly one Sequence Number box.`, segments: null };
    }

    return { error: null, segments: normalized };
}

function mergeDefaultPolicies(policies: Record<string, unknown>) {
    const capacitySurcharge = parseJsonObject(policies.capacity_surcharge);
    const freePayment = parseJsonObject(policies.free_payment);

    return {
        ...policies,
        registration_fee: parseMoney(policies.registration_fee) ?? DEFAULT_POLICY_PATCH.registration_fee,
        consultation_fee: parseMoney(policies.consultation_fee) ?? DEFAULT_POLICY_PATCH.consultation_fee,
        fee_waiver_allowed: typeof policies.fee_waiver_allowed === "boolean" ? policies.fee_waiver_allowed : DEFAULT_POLICY_PATCH.fee_waiver_allowed,
        free_payment: {
            ...freePayment,
            enabled: typeof freePayment.enabled === "boolean" ? freePayment.enabled : policies.fee_waiver_allowed ?? DEFAULT_POLICY_PATCH.free_payment.enabled,
            require_waiver_reason: typeof freePayment.require_waiver_reason === "boolean" ? freePayment.require_waiver_reason : DEFAULT_POLICY_PATCH.free_payment.require_waiver_reason,
        },
        capacity_surcharge: {
            ...capacitySurcharge,
            enabled: typeof capacitySurcharge.enabled === "boolean" ? capacitySurcharge.enabled : DEFAULT_POLICY_PATCH.capacity_surcharge.enabled,
            surcharge_amount: parseMoney(capacitySurcharge.surcharge_amount) ?? DEFAULT_POLICY_PATCH.capacity_surcharge.surcharge_amount,
        },
        doctor_token_enabled: typeof policies.doctor_token_enabled === "boolean" ? policies.doctor_token_enabled : DEFAULT_POLICY_PATCH.doctor_token_enabled,
        default_capacity_count_categories: normalizeCapacityCategories(policies.default_capacity_count_categories) ?? DEFAULT_POLICY_PATCH.default_capacity_count_categories,
        working_days: normalizeWorkingDays(policies.working_days),
        reconsult_window_unit: normalizeWindowUnit(policies.reconsult_window_unit),
        free_reconsult_windows: normalizeFreeReconsultWindows(policies.free_reconsult_windows),
        id_format: normalizeIdFormat(policies.id_format),
    };
}

function serializeEditablePolicy(policies: Record<string, unknown>) {
    const merged = mergeDefaultPolicies(policies);
    const freePayment = parseJsonObject(merged.free_payment);
    const surcharge = parseJsonObject(merged.capacity_surcharge);
    const idFormat = normalizeIdFormat(merged.id_format);

    return {
        registration_fee: merged.registration_fee,
        consultation_fee: merged.consultation_fee,
        free_payment_enabled: freePayment.enabled === true,
        fee_waiver_reason_required: freePayment.require_waiver_reason === true,
        surcharge_enabled: surcharge.enabled === true,
        doctor_token_enabled: merged.doctor_token_enabled === true,
        surcharge_amount: surcharge.surcharge_amount,
        capacity_categories: merged.default_capacity_count_categories,
        working_days: merged.working_days,
        reconsult_window_unit: merged.reconsult_window_unit,
        free_reconsult_windows: merged.free_reconsult_windows,
        id_format: idFormat,
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT id, policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );

        const policies = mergeDefaultPolicies(parseJsonObject(rows[0]?.policies));

        return NextResponse.json({
            policy: serializeEditablePolicy(policies),
        });
    } catch (error) {
        console.error("Load HMS policy settings error:", error);
        return NextResponse.json({ error: "Unable to load policy settings." }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
        const registrationFee = parseMoney(body?.registration_fee);
        const consultationFee = parseMoney(body?.consultation_fee);
        const surchargeAmount = parseMoney(body?.surcharge_amount);
        const capacityCategories = normalizeCapacityCategories(body?.capacity_categories);
        const workingDays = normalizeWorkingDays(body?.working_days);
        const reconsultWindowUnit = normalizeWindowUnit(body?.reconsult_window_unit);
        const freeReconsultWindows = normalizeFreeReconsultWindows(body?.free_reconsult_windows);
        const bodyIdFormat = parseJsonObject(body?.id_format);
        const bodyReset = parseJsonObject(bodyIdFormat.sequence_reset);
        const uhidPattern = validateIdSegments(bodyIdFormat.uhid, "UHID", "UHID");
        const opdPattern = validateIdSegments(bodyIdFormat.opd, "OPD", "OPD");
        const casualtyPattern = validateIdSegments(bodyIdFormat.casualty, "CASUALTY", "Casualty");

        const fieldErrors: Record<string, string> = {};
        if (registrationFee === null) fieldErrors.registration_fee = "Registration fee must be zero or more.";
        if (consultationFee === null) fieldErrors.consultation_fee = "Consultation fee must be zero or more.";
        if (surchargeAmount === null) fieldErrors.surcharge_amount = "Surcharge amount must be zero or more.";
        if (!capacityCategories) fieldErrors.capacity_categories = "Select at least one valid capacity category.";
        if (uhidPattern.error) fieldErrors.id_format = uhidPattern.error;
        if (opdPattern.error) fieldErrors.id_format = opdPattern.error;
        if (casualtyPattern.error) fieldErrors.id_format = casualtyPattern.error;

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT id, policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );

        const current = mergeDefaultPolicies(parseJsonObject(rows[0]?.policies));
        const currentSurcharge = parseJsonObject(current.capacity_surcharge);
        const currentFreePayment = parseJsonObject(current.free_payment);

        const nextPolicies = {
            ...current,
            registration_fee: registrationFee,
            consultation_fee: consultationFee,
            fee_waiver_allowed: parseBoolean(body?.free_payment_enabled),
            free_payment: {
                ...currentFreePayment,
                enabled: parseBoolean(body?.free_payment_enabled),
                require_waiver_reason: parseBoolean(body?.fee_waiver_reason_required),
            },
            doctor_token_enabled: parseBoolean(body?.doctor_token_enabled),
            capacity_surcharge: {
                ...currentSurcharge,
                enabled: parseBoolean(body?.surcharge_enabled),
                surcharge_amount: surchargeAmount,
            },
            default_capacity_count_categories: capacityCategories,
            working_days: workingDays,
            reconsult_window_unit: reconsultWindowUnit,
            free_reconsult_windows: freeReconsultWindows,
            id_format: {
                uhid: uhidPattern.segments,
                opd: opdPattern.segments,
                casualty: casualtyPattern.segments,
                sequence_reset: {
                    uhid: normalizeResetMode(bodyReset.uhid),
                    opd: normalizeResetMode(bodyReset.opd),
                    casualty: normalizeResetMode(bodyReset.casualty),
                },
            },
        };

        if (rows[0]) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE hospital_policy_settings
                SET policies = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE hospital_id = ?
                `,
                JSON.stringify(nextPolicies),
                hospital.hospitalId
            );
        } else {
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO hospital_policy_settings (hospital_id, policies)
                VALUES (?, ?)
                `,
                hospital.hospitalId,
                JSON.stringify(nextPolicies)
            );
        }

        return NextResponse.json({
            policy: serializeEditablePolicy(nextPolicies),
        });
    } catch (error) {
        console.error("Save HMS policy settings error:", error);
        return NextResponse.json({ error: "Unable to save policy settings." }, { status: 500 });
    }
}
