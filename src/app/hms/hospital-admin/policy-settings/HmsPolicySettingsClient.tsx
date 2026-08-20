"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

const CAPACITY_CATEGORIES = ["NEW", "OLD_WITHIN_FOLLOWUP_VALIDITY", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"] as const;
const WEEKDAYS = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
];
const RESET_MODE_OPTIONS = [
    { value: "never", label: "Never reset - one continuous number forever" },
    { value: "reset_on_new_year", label: "Reset every January 1st" },
    { value: "carry_on_new_year", label: "Keep counting, but update the year shown" },
    { value: "reset_on_new_financial_year", label: "Reset every April 1st (financial year)" },
] as const;
const SEGMENT_TYPES = [
    { value: "static", label: "Static Text" },
    { value: "sequence", label: "Sequence Number" },
    { value: "calendar_year", label: "Calendar Year" },
    { value: "financial_year", label: "Financial Year" },
    { value: "date", label: "Date" },
    { value: "room_number", label: "Room Number" },
    { value: "separator", label: "Separator" },
] as const;
type SequenceType = "UHID" | "OPD" | "CASUALTY";
type IdFormatKey = "uhid" | "opd" | "casualty";
type ResetMode = (typeof RESET_MODE_OPTIONS)[number]["value"];
type SegmentType = (typeof SEGMENT_TYPES)[number]["value"];
type PatternSegment = {
    type: SegmentType;
    value?: string;
    sequence_type?: SequenceType;
    pad_to?: number;
    format?: string;
};
type IdFormatConfig = {
    uhid: PatternSegment[];
    opd: PatternSegment[];
    casualty: PatternSegment[];
    sequence_reset: Record<IdFormatKey, ResetMode>;
};

type PolicyForm = {
    registration_fee: string;
    consultation_fee: string;
    free_payment_enabled: boolean;
    fee_waiver_reason_required: boolean;
    surcharge_enabled: boolean;
    doctor_token_enabled: boolean;
    surcharge_amount: string;
    capacity_categories: string[];
    working_days: number[];
    reconsult_window_unit: string;
    same_doctor_window_days: string;
    same_doctor_count_visit_day: boolean;
    referred_doctor_window_days: string;
    referred_doctor_count_visit_day: boolean;
    id_format: IdFormatConfig;
};

type Holiday = {
    id: number;
    holiday_date: string;
    description: string | null;
};

type DoctorOption = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
};

type DoctorLeave = {
    leave_id: number;
    doctor_id: number;
    doctor_name: string | null;
    leave_date: string;
    reason: string | null;
};

const emptyPolicyForm: PolicyForm = {
    registration_fee: "",
    consultation_fee: "",
    free_payment_enabled: true,
    fee_waiver_reason_required: true,
    surcharge_enabled: true,
    doctor_token_enabled: false,
    surcharge_amount: "",
    capacity_categories: ["NEW", "OLD_OUTSIDE_FOLLOWUP_VALIDITY"],
    working_days: [0, 1, 2, 3, 4, 5, 6],
    reconsult_window_unit: "working_days",
    same_doctor_window_days: "3",
    same_doctor_count_visit_day: false,
    referred_doctor_window_days: "0",
    referred_doctor_count_visit_day: true,
    id_format: {
        uhid: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "UHID", pad_to: 6 },
        ],
        opd: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/OPD/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "OPD", pad_to: 6 },
        ],
        casualty: [
            { type: "static", value: "NAH" },
            { type: "separator", value: "/Cas/" },
            { type: "calendar_year", format: "YYYY" },
            { type: "separator", value: "/" },
            { type: "sequence", sequence_type: "CASUALTY", pad_to: 6 },
        ],
        sequence_reset: {
            uhid: "never",
            opd: "never",
            casualty: "never",
        },
    },
};

function normalizeResetMode(value: unknown): ResetMode {
    return RESET_MODE_OPTIONS.some((option) => option.value === value) ? value as ResetMode : "never";
}

function normalizeSegments(value: unknown, sequenceType: SequenceType, fallback: PatternSegment[]) {
    const rows = Array.isArray(value) ? value : fallback;
    return rows.map((row) => {
        const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
        const type = SEGMENT_TYPES.some((option) => option.value === item.type) ? item.type as SegmentType : "static";
        if (type === "sequence") {
            const padTo = Number(item.pad_to ?? 6);
            return {
                type,
                sequence_type: sequenceType,
                pad_to: Number.isInteger(padTo) && padTo >= 1 && padTo <= 12 ? padTo : 6,
            };
        }
        if (type === "calendar_year") return { type, format: item.format === "YY" ? "YY" : "YYYY" };
        if (type === "financial_year") return { type, format: item.format === "YY-YY" ? "YY-YY" : "YYYY-YY" };
        if (type === "date") {
            const format = String(item.format || "YYYYMMDD");
            return { type, format: format === "YYYY-MM-DD" || format === "DDMMYYYY" ? format : "YYYYMMDD" };
        }
        if (type === "room_number") return { type };
        return { type, value: String(item.value ?? (type === "separator" ? "/" : "")) };
    });
}

function normalizeIdFormat(value: unknown): IdFormatConfig {
    const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const reset = input.sequence_reset && typeof input.sequence_reset === "object"
        ? input.sequence_reset as Record<string, unknown>
        : {};
    return {
        uhid: normalizeSegments(input.uhid, "UHID", emptyPolicyForm.id_format.uhid),
        opd: normalizeSegments(input.opd, "OPD", emptyPolicyForm.id_format.opd),
        casualty: normalizeSegments(input.casualty, "CASUALTY", emptyPolicyForm.id_format.casualty),
        sequence_reset: {
            uhid: normalizeResetMode(reset.uhid),
            opd: normalizeResetMode(reset.opd),
            casualty: normalizeResetMode(reset.casualty),
        },
    };
}

function toForm(data: Partial<PolicyForm> & Record<string, unknown>): PolicyForm {
    const windows = Array.isArray(data.free_reconsult_windows) ? data.free_reconsult_windows as Array<Record<string, unknown>> : [];
    const sameDoctorWindow = windows.find((item) => item.scope === "same_doctor") || {};
    const referredDoctorWindow = windows.find((item) => item.scope === "referred_doctor") || {};

    return {
        registration_fee: String(data.registration_fee ?? ""),
        consultation_fee: String(data.consultation_fee ?? ""),
        free_payment_enabled: data.free_payment_enabled === true,
        fee_waiver_reason_required: data.fee_waiver_reason_required !== false,
        surcharge_enabled: data.surcharge_enabled === true,
        doctor_token_enabled: data.doctor_token_enabled === true,
        surcharge_amount: String(data.surcharge_amount ?? ""),
        capacity_categories: Array.isArray(data.capacity_categories)
            ? data.capacity_categories.map(String)
            : emptyPolicyForm.capacity_categories,
        working_days: Array.isArray(data.working_days) ? data.working_days.map(Number).filter((day) => Number.isInteger(day)) : emptyPolicyForm.working_days,
        reconsult_window_unit: String(data.reconsult_window_unit || "working_days"),
        same_doctor_window_days: String(sameDoctorWindow.window_days ?? "3"),
        same_doctor_count_visit_day: sameDoctorWindow.count_visit_day === true,
        referred_doctor_window_days: String(referredDoctorWindow.window_days ?? "0"),
        referred_doctor_count_visit_day: referredDoctorWindow.count_visit_day !== false,
        id_format: normalizeIdFormat(data.id_format),
    };
}

function validatePattern(segments: PatternSegment[], label: string) {
    if (!segments.length) return `${label} pattern needs at least one box.`;
    const sequenceCount = segments.filter((segment) => segment.type === "sequence").length;
    if (sequenceCount !== 1) return `${label} pattern must include exactly one Sequence Number box.`;
    const hasBlankText = segments.some((segment) =>
        (segment.type === "static" || segment.type === "separator") && !String(segment.value || "").trim()
    );
    if (hasBlankText) return `${label} pattern has an empty text box.`;
    return null;
}

function validateForm(form: PolicyForm) {
    const errors: Partial<Record<keyof PolicyForm, string>> = {};
    const registrationFee = Number(form.registration_fee);
    const consultationFee = Number(form.consultation_fee);
    const surchargeAmount = Number(form.surcharge_amount);
    const sameDoctorWindowDays = Number(form.same_doctor_window_days);
    const referredDoctorWindowDays = Number(form.referred_doctor_window_days);

    if (!Number.isFinite(registrationFee) || registrationFee < 0) errors.registration_fee = "Registration fee must be zero or more.";
    if (!Number.isFinite(consultationFee) || consultationFee < 0) errors.consultation_fee = "Consultation fee must be zero or more.";
    if (!Number.isFinite(surchargeAmount) || surchargeAmount < 0) errors.surcharge_amount = "Surcharge must be zero or more.";
    if (form.capacity_categories.length === 0) errors.capacity_categories = "Select at least one category.";
    if (form.working_days.length === 0) errors.working_days = "Select at least one working day.";
    if (!Number.isInteger(sameDoctorWindowDays) || sameDoctorWindowDays < 0) errors.same_doctor_window_days = "Window must be zero or more.";
    if (!Number.isInteger(referredDoctorWindowDays) || referredDoctorWindowDays < 0) errors.referred_doctor_window_days = "Window must be zero or more.";
    const patternError =
        validatePattern(form.id_format.uhid, "UHID") ||
        validatePattern(form.id_format.opd, "OPD") ||
        validatePattern(form.id_format.casualty, "Casualty");
    if (patternError) errors.id_format = patternError;

    return errors;
}

function createSegment(type: SegmentType, sequenceType: SequenceType): PatternSegment {
    if (type === "sequence") return { type, sequence_type: sequenceType, pad_to: 6 };
    if (type === "calendar_year") return { type, format: "YYYY" };
    if (type === "financial_year") return { type, format: "YYYY-YY" };
    if (type === "date") return { type, format: "YYYYMMDD" };
    if (type === "room_number") return { type };
    return { type, value: type === "separator" ? "/" : "" };
}

function getFinancialYearSample(format: string | undefined) {
    return format === "YY-YY" ? "26-27" : "2026-27";
}

function getDateSample(format: string | undefined) {
    if (format === "YYYY-MM-DD") return "2026-08-11";
    if (format === "DDMMYYYY") return "11082026";
    return "20260811";
}

function getPreview(segments: PatternSegment[], sequenceType: SequenceType) {
    return segments.map((segment) => {
        if (segment.type === "static" || segment.type === "separator") return segment.value || "";
        if (segment.type === "sequence") return String(123).padStart(segment.pad_to || 1, "0");
        if (segment.type === "calendar_year") return segment.format === "YY" ? "26" : "2026";
        if (segment.type === "financial_year") return getFinancialYearSample(segment.format);
        if (segment.type === "date") return getDateSample(segment.format);
        if (segment.type === "room_number") return "12";
        return sequenceType;
    }).join("") || "-";
}

function PatternBuilder({
    title,
    info,
    sequenceType,
    segments,
    resetMode,
    onSegmentsChange,
    onResetModeChange,
}: {
    title: string;
    info: string;
    formatKey: IdFormatKey;
    sequenceType: SequenceType;
    segments: PatternSegment[];
    resetMode: ResetMode;
    onSegmentsChange: (segments: PatternSegment[]) => void;
    onResetModeChange: (resetMode: ResetMode) => void;
}) {
    const updateSegment = (index: number, patch: Partial<PatternSegment>) => {
        onSegmentsChange(segments.map((segment, rowIndex) => rowIndex === index ? { ...segment, ...patch } : segment));
    };

    const changeSegmentType = (index: number, type: SegmentType) => {
        onSegmentsChange(segments.map((segment, rowIndex) => rowIndex === index ? createSegment(type, sequenceType) : segment));
    };

    const moveSegment = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= segments.length) return;
        const next = [...segments];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        onSegmentsChange(next);
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-gray-950">
                        <HmsLabelWithInfo label={`${title} Pattern`} info={info} />
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">Preview</p>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-sm font-bold text-gray-950">
                        {getPreview(segments, sequenceType)}
                    </p>
                </div>
            </div>

            <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Reset</span>
                <select
                    value={resetMode}
                    onChange={(event) => onResetModeChange(event.target.value as ResetMode)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                >
                    {RESET_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </label>

            <div className="mt-3 space-y-2">
                {segments.map((segment, index) => (
                    <div key={`${title}-${index}-${segment.type}`} className="rounded-lg border border-gray-200 p-2">
                        <div className="flex items-center gap-2">
                            <select
                                value={segment.type}
                                onChange={(event) => changeSegmentType(index, event.target.value as SegmentType)}
                                className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
                            >
                                {SEGMENT_TYPES.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => moveSegment(index, -1)}
                                disabled={index === 0}
                                className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                aria-label="Move segment up"
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => moveSegment(index, 1)}
                                disabled={index === segments.length - 1}
                                className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                aria-label="Move segment down"
                            >
                                <ChevronDown size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSegmentsChange(segments.filter((_, rowIndex) => rowIndex !== index))}
                                className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                                aria-label="Remove segment"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <SegmentFields
                            segment={segment}
                            sequenceType={sequenceType}
                            onChange={(patch) => updateSegment(index, patch)}
                        />
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={() => onSegmentsChange([...segments, createSegment("separator", sequenceType)])}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"
            >
                <Plus size={14} />
                Add Box
            </button>
        </div>
    );
}

function SegmentFields({
    segment,
    sequenceType,
    onChange,
}: {
    segment: PatternSegment;
    sequenceType: SequenceType;
    onChange: (patch: Partial<PatternSegment>) => void;
}) {
    if (segment.type === "static" || segment.type === "separator") {
        return (
            <input
                type="text"
                value={segment.value || ""}
                onChange={(event) => onChange({ value: event.target.value })}
                placeholder={segment.type === "static" ? "Example: NAH" : "Example: /"}
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
            />
        );
    }

    if (segment.type === "sequence") {
        return (
            <div className="mt-2 grid grid-cols-[1fr_90px] gap-2">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-700">
                    {sequenceType}
                </div>
                <input
                    type="number"
                    min="1"
                    max="12"
                    value={segment.pad_to || 1}
                    onChange={(event) => onChange({ pad_to: Number(event.target.value) })}
                    className="rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
                    aria-label="Sequence padding"
                />
            </div>
        );
    }

    if (segment.type === "calendar_year") {
        return (
            <select
                value={segment.format || "YYYY"}
                onChange={(event) => onChange({ format: event.target.value })}
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
            >
                <option value="YYYY">2026</option>
                <option value="YY">26</option>
            </select>
        );
    }

    if (segment.type === "financial_year") {
        return (
            <select
                value={segment.format || "YYYY-YY"}
                onChange={(event) => onChange({ format: event.target.value })}
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
            >
                <option value="YYYY-YY">2026-27</option>
                <option value="YY-YY">26-27</option>
            </select>
        );
    }

    if (segment.type === "date") {
        return (
            <select
                value={segment.format || "YYYYMMDD"}
                onChange={(event) => onChange({ format: event.target.value })}
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-black"
            >
                <option value="YYYYMMDD">20260811</option>
                <option value="YYYY-MM-DD">2026-08-11</option>
                <option value="DDMMYYYY">11082026</option>
            </select>
        );
    }

    return (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
            Uses the doctor&apos;s room number. Preview uses 12.
        </div>
    );
}

export default function HmsPolicySettingsClient() {
    const [form, setForm] = useState<PolicyForm>(emptyPolicyForm);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [holidayForm, setHolidayForm] = useState({ holiday_date: "", description: "" });
    const [doctors, setDoctors] = useState<DoctorOption[]>([]);
    const [doctorLeaves, setDoctorLeaves] = useState<DoctorLeave[]>([]);
    const [doctorLeaveForm, setDoctorLeaveForm] = useState({ doctor_id: "", leave_date: "", reason: "" });
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({});
    const [holidayErrors, setHolidayErrors] = useState<Partial<Record<keyof typeof holidayForm, string>>>({});
    const [doctorLeaveErrors, setDoctorLeaveErrors] = useState<Partial<Record<keyof typeof doctorLeaveForm, string>>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingHoliday, setSavingHoliday] = useState(false);
    const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null);
    const [savingDoctorLeave, setSavingDoctorLeave] = useState(false);
    const [deletingDoctorLeaveId, setDeletingDoctorLeaveId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const clearError = useCallback(() => setError(""), []);
    const clearSuccess = useCallback(() => setSuccess(""), []);

    useHmsAutoDismissMessage(error, clearError, 7500);
    useHmsAutoDismissMessage(success, clearSuccess, 5000);

    const loadPolicy = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/hms/hospital-admin/policy-settings", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load policy settings.");
                return;
            }

            setForm(toForm(data.policy || {}));
            setFieldErrors({});
        } catch {
            setError("Unable to load policy settings. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadHolidays = useCallback(async () => {
        try {
            const response = await fetch("/api/hms/hospital-admin/holidays", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load holidays.");
                return;
            }
            setHolidays(Array.isArray(data.holidays) ? data.holidays : []);
        } catch {
            setError("Unable to load holidays. Check your connection and try again.");
        }
    }, []);

    const loadDoctors = useCallback(async () => {
        try {
            const response = await fetch("/api/hms/hospital-admin/doctors", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load doctors.");
                return;
            }
            setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        } catch {
            setError("Unable to load doctors. Check your connection and try again.");
        }
    }, []);

    const loadDoctorLeaves = useCallback(async () => {
        try {
            const response = await fetch("/api/hms/hospital-admin/doctor-leaves", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to load doctor leaves.");
                return;
            }
            setDoctorLeaves(Array.isArray(data.leaves) ? data.leaves : []);
        } catch {
            setError("Unable to load doctor leaves. Check your connection and try again.");
        }
    }, []);

    useEffect(() => {
        void loadPolicy();
        void loadHolidays();
        void loadDoctors();
        void loadDoctorLeaves();
    }, [loadDoctorLeaves, loadDoctors, loadHolidays, loadPolicy]);

    const updateField = (field: keyof PolicyForm, value: string | boolean | string[] | number[] | IdFormatConfig) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
        setSuccess("");
    };

    const toggleCategory = (status: string) => {
        const next = form.capacity_categories.includes(status)
            ? form.capacity_categories.filter((item) => item !== status)
            : [...form.capacity_categories, status];
        updateField("capacity_categories", next);
    };

    const toggleWorkingDay = (day: number) => {
        const next = form.working_days.includes(day)
            ? form.working_days.filter((item) => item !== day)
            : [...form.working_days, day].sort((left, right) => left - right);
        updateField("working_days", next);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        const nextErrors = validateForm(form);
        setFieldErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setError("Please correct the highlighted fields.");
            return;
        }

        setSaving(true);

        try {
            const response = await fetch("/api/hms/hospital-admin/policy-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    registration_fee: Number(form.registration_fee),
                    consultation_fee: Number(form.consultation_fee),
                    free_payment_enabled: form.free_payment_enabled,
                    fee_waiver_reason_required: form.fee_waiver_reason_required,
                    surcharge_enabled: form.surcharge_enabled,
                    doctor_token_enabled: form.doctor_token_enabled,
                    surcharge_amount: Number(form.surcharge_amount),
                    capacity_categories: form.capacity_categories,
                    working_days: form.working_days,
                    reconsult_window_unit: form.reconsult_window_unit,
                    free_reconsult_windows: [
                        {
                            scope: "same_doctor",
                            window_days: Number(form.same_doctor_window_days),
                            count_visit_day: form.same_doctor_count_visit_day,
                        },
                        {
                            scope: "referred_doctor",
                            window_days: Number(form.referred_doctor_window_days),
                            count_visit_day: form.referred_doctor_count_visit_day,
                        },
                    ],
                    id_format: form.id_format,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to save policy settings.");
                setFieldErrors(data.fieldErrors || {});
                return;
            }

            setForm(toForm(data.policy || {}));
            setFieldErrors({});
            setSuccess("Policy settings saved.");
        } catch {
            setError("Unable to save policy settings. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    const saveHoliday = async () => {
        setError("");
        setSuccess("");
        const nextErrors: Partial<Record<keyof typeof holidayForm, string>> = {};
        if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayForm.holiday_date)) nextErrors.holiday_date = "Date is required.";
        if (holidayForm.description.length > 255) nextErrors.description = "Description must be 255 characters or fewer.";
        setHolidayErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSavingHoliday(true);
        try {
            const response = await fetch("/api/hms/hospital-admin/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    holiday_date: holidayForm.holiday_date,
                    description: holidayForm.description.trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to save holiday.");
                setHolidayErrors(data.fieldErrors || {});
                return;
            }
            setHolidayForm({ holiday_date: "", description: "" });
            setHolidayErrors({});
            setSuccess("Holiday saved.");
            await loadHolidays();
        } catch {
            setError("Unable to save holiday. Check your connection and try again.");
        } finally {
            setSavingHoliday(false);
        }
    };

    const deleteHoliday = async (holidayId: number) => {
        setError("");
        setSuccess("");
        setDeletingHolidayId(holidayId);
        try {
            const response = await fetch(`/api/hms/hospital-admin/holidays/${holidayId}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to delete holiday.");
                return;
            }
            setHolidays((prev) => prev.filter((holiday) => holiday.id !== holidayId));
            setSuccess("Holiday deleted.");
        } catch {
            setError("Unable to delete holiday. Check your connection and try again.");
        } finally {
            setDeletingHolidayId(null);
        }
    };

    const saveDoctorLeave = async () => {
        setError("");
        setSuccess("");
        const nextErrors: Partial<Record<keyof typeof doctorLeaveForm, string>> = {};
        if (!doctorLeaveForm.doctor_id) nextErrors.doctor_id = "Doctor is required.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(doctorLeaveForm.leave_date)) nextErrors.leave_date = "Date is required.";
        if (doctorLeaveForm.reason.length > 255) nextErrors.reason = "Reason must be 255 characters or fewer.";
        setDoctorLeaveErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSavingDoctorLeave(true);
        try {
            const response = await fetch("/api/hms/hospital-admin/doctor-leaves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor_id: Number(doctorLeaveForm.doctor_id),
                    leave_date: doctorLeaveForm.leave_date,
                    reason: doctorLeaveForm.reason.trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to save doctor leave.");
                setDoctorLeaveErrors(data.fieldErrors || {});
                return;
            }
            setDoctorLeaveForm({ doctor_id: "", leave_date: "", reason: "" });
            setDoctorLeaveErrors({});
            setSuccess("Doctor leave saved.");
            await loadDoctorLeaves();
        } catch {
            setError("Unable to save doctor leave. Check your connection and try again.");
        } finally {
            setSavingDoctorLeave(false);
        }
    };

    const deleteDoctorLeave = async (leaveId: number) => {
        setError("");
        setSuccess("");
        setDeletingDoctorLeaveId(leaveId);
        try {
            const response = await fetch(`/api/hms/hospital-admin/doctor-leaves/${leaveId}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.error || "Unable to delete doctor leave.");
                return;
            }
            setDoctorLeaves((prev) => prev.filter((leave) => leave.leave_id !== leaveId));
            setSuccess("Doctor leave deleted.");
        } catch {
            setError("Unable to delete doctor leave. Check your connection and try again.");
        } finally {
            setDeletingDoctorLeaveId(null);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hospital Admin</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">Policy Settings</h1>
                </div>
                <button
                    type="button"
                    onClick={() => void loadPolicy()}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {error && <HmsStatusAlert tone="error" message={error} onDismiss={clearError} />}
            {success && <HmsStatusAlert tone="success" message={success} onDismiss={clearSuccess} />}

            {loading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    Loading policy settings
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white">
                    <div className="grid gap-4 border-b border-gray-100 p-4 lg:grid-cols-3">
                        <NumberField label="Registration Fee" value={form.registration_fee} error={fieldErrors.registration_fee} onChange={(value) => updateField("registration_fee", value)} />
                        <NumberField label="Consultation Fee" value={form.consultation_fee} error={fieldErrors.consultation_fee} onChange={(value) => updateField("consultation_fee", value)} />
                        <NumberField label="Surcharge Amount" info="The extra amount added after the selected doctor's own daily capacity is crossed." value={form.surcharge_amount} error={fieldErrors.surcharge_amount} onChange={(value) => updateField("surcharge_amount", value)} />
                    </div>

                    <div className="space-y-4 border-b border-gray-100 p-4">
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-950">UHID / OPD Pattern Settings</h2>
                            <p className="mt-1 text-xs text-gray-500">Build each number from boxes. The preview shows how the next printed value will look.</p>
                        </div>
                        {fieldErrors.id_format && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{fieldErrors.id_format}</p>}
                        <div className="grid gap-4 xl:grid-cols-3">
                            <PatternBuilder
                                title="UHID"
                                info="Patient ID generated once when a patient is registered."
                                formatKey="uhid"
                                sequenceType="UHID"
                                segments={form.id_format.uhid}
                                resetMode={form.id_format.sequence_reset.uhid}
                                onSegmentsChange={(segments) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        uhid: segments,
                                    })
                                }
                                onResetModeChange={(resetMode) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        sequence_reset: { ...form.id_format.sequence_reset, uhid: resetMode },
                                    })
                                }
                            />
                            <PatternBuilder
                                title="OPD"
                                info="Visit number printed for OPD registrations."
                                formatKey="opd"
                                sequenceType="OPD"
                                segments={form.id_format.opd}
                                resetMode={form.id_format.sequence_reset.opd}
                                onSegmentsChange={(segments) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        opd: segments,
                                    })
                                }
                                onResetModeChange={(resetMode) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        sequence_reset: { ...form.id_format.sequence_reset, opd: resetMode },
                                    })
                                }
                            />
                            <PatternBuilder
                                title="Casualty"
                                info="Visit number printed for casualty registrations."
                                formatKey="casualty"
                                sequenceType="CASUALTY"
                                segments={form.id_format.casualty}
                                resetMode={form.id_format.sequence_reset.casualty}
                                onSegmentsChange={(segments) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        casualty: segments,
                                    })
                                }
                                onResetModeChange={(resetMode) =>
                                    updateField("id_format", {
                                        ...form.id_format,
                                        sequence_reset: { ...form.id_format.sequence_reset, casualty: resetMode },
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 border-b border-gray-100 p-4 lg:grid-cols-2">
                        <Toggle
                            label="FREE Payment Enabled"
                            info="Lets Reception choose FREE when a patient should not be charged."
                            checked={form.free_payment_enabled}
                            onChange={(checked) => updateField("free_payment_enabled", checked)}
                        />
                        <Toggle
                            label="Waiver Reason Required"
                            info="Makes staff enter a reason whenever payment is marked FREE."
                            checked={form.fee_waiver_reason_required}
                            onChange={(checked) => updateField("fee_waiver_reason_required", checked)}
                        />
                        <Toggle
                            label="Capacity Surcharge Enabled"
                            info="Adds the extra charge after a doctor crosses the daily patient limit."
                            checked={form.surcharge_enabled}
                            onChange={(checked) => updateField("surcharge_enabled", checked)}
                        />
                        <Toggle
                            label="Doctor-wise Token on OPD Slip"
                            info="Prints the selected doctor's daily token number on the registration slip and doctor queue. The number restarts for each doctor every day."
                            checked={form.doctor_token_enabled}
                            onChange={(checked) => updateField("doctor_token_enabled", checked)}
                        />
                    </div>

                    <div className="p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                            <HmsLabelWithInfo
                                label="Capacity Categories"
                                info="Choose which patient types should count toward a doctor's daily limit and extra charge. Cancelled visits are never counted."
                            />
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {CAPACITY_CATEGORIES.map((status) => {
                                const active = form.capacity_categories.includes(status);
                                return (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={() => toggleCategory(status)}
                                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                            active
                                                ? "border-black bg-black text-white"
                                                : "border-gray-200 text-gray-700 hover:bg-gray-50"
                                        }`}
                                    >
                                        {status}
                                    </button>
                                );
                            })}
                        </div>
                        {fieldErrors.capacity_categories && <p className="mt-2 text-xs text-red-600">{fieldErrors.capacity_categories}</p>}
                    </div>

                    <div className="grid gap-4 border-t border-gray-100 p-4 lg:grid-cols-2">
                        <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                                <HmsLabelWithInfo
                                    label="Working Days"
                                    info="The regular days your hospital is open. Patients cannot be registered on closed days."
                                />
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {WEEKDAYS.map((day) => {
                                    const active = form.working_days.includes(day.value);
                                    return (
                                        <button
                                            key={day.value}
                                            type="button"
                                            onClick={() => toggleWorkingDay(day.value)}
                                            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                                                active
                                                    ? "border-black bg-black text-white"
                                                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {fieldErrors.working_days && <p className="mt-2 text-xs text-red-600">{fieldErrors.working_days}</p>}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                                <HmsLabelWithInfo
                                    label="Reconsult Window Unit"
                                    info="Choose whether follow-up validity counts only open hospital days or every date on the calendar."
                                />
                            </label>
                            <select
                                value={form.reconsult_window_unit}
                                onChange={(event) => updateField("reconsult_window_unit", event.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                            >
                                <option value="working_days">working_days</option>
                                <option value="calendar_days">calendar_days</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 p-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                            <HmsLabelWithInfo
                                label="Hospital Holidays"
                                info="Special closed dates such as festivals or maintenance days. Patients cannot be registered on these dates."
                            />
                        </p>
                        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                            <div>
                                <input
                                    type="date"
                                    value={holidayForm.holiday_date}
                                    onChange={(event) => {
                                        setHolidayForm((prev) => ({ ...prev, holiday_date: event.target.value }));
                                        setHolidayErrors((prev) => ({ ...prev, holiday_date: undefined }));
                                    }}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${holidayErrors.holiday_date ? "border-red-300" : "border-gray-200"}`}
                                />
                                {holidayErrors.holiday_date && <p className="mt-1 text-xs text-red-600">{holidayErrors.holiday_date}</p>}
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={holidayForm.description}
                                    onChange={(event) => {
                                        setHolidayForm((prev) => ({ ...prev, description: event.target.value }));
                                        setHolidayErrors((prev) => ({ ...prev, description: undefined }));
                                    }}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${holidayErrors.description ? "border-red-300" : "border-gray-200"}`}
                                />
                                {holidayErrors.description && <p className="mt-1 text-xs text-red-600">{holidayErrors.description}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => void saveHoliday()}
                                disabled={savingHoliday}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                            >
                                {savingHoliday ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                Add
                            </button>
                        </div>
                        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                            {holidays.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-gray-500">No holidays configured.</div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <tbody>
                                        {holidays.map((holiday) => (
                                            <tr key={holiday.id} className="border-t border-gray-100 first:border-t-0">
                                                <td className="px-3 py-2 font-medium text-gray-900">{holiday.holiday_date}</td>
                                                <td className="px-3 py-2 text-gray-600">{holiday.description || "-"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => void deleteHoliday(holiday.id)}
                                                        disabled={deletingHolidayId === holiday.id}
                                                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                    >
                                                        {deletingHolidayId === holiday.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 p-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                            <HmsLabelWithInfo
                                label="Doctor Leave Setup"
                                info="Mark a doctor unavailable for a full date. Reception cannot register patients for that doctor on that leave date."
                            />
                        </p>
                        <div className="grid gap-3 lg:grid-cols-[220px_180px_minmax(0,1fr)_auto]">
                            <div>
                                <select
                                    value={doctorLeaveForm.doctor_id}
                                    onChange={(event) => {
                                        setDoctorLeaveForm((prev) => ({ ...prev, doctor_id: event.target.value }));
                                        setDoctorLeaveErrors((prev) => ({ ...prev, doctor_id: undefined }));
                                    }}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${doctorLeaveErrors.doctor_id ? "border-red-300" : "border-gray-200"}`}
                                >
                                    <option value="">Select doctor</option>
                                    {doctors.map((doctor) => (
                                        <option key={doctor.doctor_id} value={doctor.doctor_id}>
                                            {doctor.room_no ? `${doctor.room_no} - ` : ""}Dr. {doctor.doctor_name || `Doctor ${doctor.doctor_id}`}
                                        </option>
                                    ))}
                                </select>
                                {doctorLeaveErrors.doctor_id && <p className="mt-1 text-xs text-red-600">{doctorLeaveErrors.doctor_id}</p>}
                            </div>
                            <div>
                                <input
                                    type="date"
                                    value={doctorLeaveForm.leave_date}
                                    onChange={(event) => {
                                        setDoctorLeaveForm((prev) => ({ ...prev, leave_date: event.target.value }));
                                        setDoctorLeaveErrors((prev) => ({ ...prev, leave_date: undefined }));
                                    }}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${doctorLeaveErrors.leave_date ? "border-red-300" : "border-gray-200"}`}
                                />
                                {doctorLeaveErrors.leave_date && <p className="mt-1 text-xs text-red-600">{doctorLeaveErrors.leave_date}</p>}
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={doctorLeaveForm.reason}
                                    onChange={(event) => {
                                        setDoctorLeaveForm((prev) => ({ ...prev, reason: event.target.value }));
                                        setDoctorLeaveErrors((prev) => ({ ...prev, reason: undefined }));
                                    }}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${doctorLeaveErrors.reason ? "border-red-300" : "border-gray-200"}`}
                                    placeholder="Reason"
                                />
                                {doctorLeaveErrors.reason && <p className="mt-1 text-xs text-red-600">{doctorLeaveErrors.reason}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => void saveDoctorLeave()}
                                disabled={savingDoctorLeave}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                            >
                                {savingDoctorLeave ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                Add
                            </button>
                        </div>
                        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                            {doctorLeaves.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-gray-500">No doctor leaves configured.</div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <tbody>
                                        {doctorLeaves.map((leave) => (
                                            <tr key={leave.leave_id} className="border-t border-gray-100 first:border-t-0">
                                                <td className="px-3 py-2 font-medium text-gray-900">
                                                    Dr. {leave.doctor_name || `Doctor ${leave.doctor_id}`}
                                                </td>
                                                <td className="px-3 py-2 font-medium text-gray-900">{leave.leave_date}</td>
                                                <td className="px-3 py-2 text-gray-600">{leave.reason || "-"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => void deleteDoctorLeave(leave.leave_id)}
                                                        disabled={deletingDoctorLeaveId === leave.leave_id}
                                                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                    >
                                                        {deletingDoctorLeaveId === leave.leave_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 border-t border-gray-100 p-4 lg:grid-cols-2">
                        <div className="rounded-lg border border-gray-200 p-3">
                            <NumberField label="Same Doctor Window Days" info="How long a patient can return to the same doctor and still be treated as a valid follow-up." value={form.same_doctor_window_days} error={fieldErrors.same_doctor_window_days} onChange={(value) => updateField("same_doctor_window_days", value)} />
                            <div className="mt-3">
                                <Toggle label="Same Doctor Counts Visit Day" info="Turn on to count the first visit day as day 1. Turn off to start counting from the next day." checked={form.same_doctor_count_visit_day} onChange={(checked) => updateField("same_doctor_count_visit_day", checked)} />
                            </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 p-3">
                            <NumberField label="Referred Doctor Window Days" info="How long a patient can see a referred doctor and still be treated as a valid referral follow-up." value={form.referred_doctor_window_days} error={fieldErrors.referred_doctor_window_days} onChange={(value) => updateField("referred_doctor_window_days", value)} />
                            <div className="mt-3">
                                <Toggle label="Referred Doctor Counts Visit Day" info="Turn on to count the referral day as day 1. Turn off to start counting from the next day." checked={form.referred_doctor_count_visit_day} onChange={(checked) => updateField("referred_doctor_count_visit_day", checked)} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end border-t border-gray-100 p-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save Policy
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function NumberField({ label, info, value, error, onChange }: { label: string; info?: string; value: string; error?: string; onChange: (value: string) => void }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
                <HmsLabelWithInfo label={label} info={info} />
            </label>
            <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${error ? "border-red-300" : "border-gray-200"}`}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

function Toggle({ label, info, checked, onChange }: { label: string; info?: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
            <span className="text-sm font-semibold text-gray-800">
                <HmsLabelWithInfo label={label} info={info} />
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="h-4 w-4 accent-black"
            />
        </label>
    );
}
