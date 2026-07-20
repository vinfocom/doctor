"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronUp,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  History,
  Loader2,
  PencilLine,
  PlusCircle,
  Plus,
  Save,
  ShieldAlert,
  Stethoscope,
  Trash2,
} from "lucide-react";
import PrintableComplaintGrid from "@/components/emr/PrintableComplaintGrid";
import PrintableComplaintStack from "@/components/emr/PrintableComplaintStack";
import { getPrintableComplaints } from "@/lib/emr/complaintFormatting";
import type {
  EmrComplaintPayload,
  EmrClinicalHistoryPayload,
  EmrClinicalHistorySection,
  EmrCustomFieldType,
  EmrCustomFieldValuePayload,
  EmrLayoutCustomField,
  EmrDraftSavePayload,
  EmrLayoutSectionKey,
  EmrLayoutSettings,
  EmrDraftWarning,
  EmrFollowUpAppointmentSummary,
  EmrMasterItem,
  EmrMedicinePayload,
  EmrNamedItemPayload,
  EmrPrescriptionHistoryItem,
  EmrPrescriptionRecord,
  EmrVitalsPayload,
} from "@/lib/emr/types";
import { normalizeMasterName } from "@/lib/emr/normalization";
import { convertTo12Hour, convertTo24Hour } from "@/lib/timeUtils";

type DraftContextResponse = {
  context: {
    featureEnabled: boolean;
    emrModule: string;
    imagePrescriptionModule: string;
    appointment: {
      appointment_id: number;
      appointment_date: string | null;
      start_time: string | null;
      end_time: string | null;
      status: string | null;
      booked_for: "SELF" | "OTHER" | string | null;
    };
    patient: {
      patient_id: number;
      full_name: string | null;
      phone: string | null;
      age: number | null;
      gender: string | null;
      allergies?: string[];
    } | null;
    clinic: {
      clinic_id: number;
      clinic_name: string | null;
    } | null;
    doctor: {
      doctor_id: number;
      doctor_name: string | null;
    } | null;
  };
  draft: EmrPrescriptionRecord | null;
  warnings: EmrDraftWarning[];
};

type SaveState = "idle" | "saving" | "saved" | "error";
type MasterKindRoute = "medicines" | "complaints" | "diagnosis" | "tests" | "advice";

type DraftEditorState = {
  vitals: Required<EmrVitalsPayload>;
  complaints: EmrComplaintPayload[];
  diagnosis: EmrNamedItemPayload[];
  medicines: EmrMedicinePayload[];
  tests: EmrNamedItemPayload[];
  advice: EmrNamedItemPayload[];
  clinical_history: EmrClinicalHistoryPayload[];
  custom_fields: EmrCustomFieldValuePayload[];
  next_visit_date: string;
};

type DoseMode = "full" | "half";

type HistoryGroup = {
  date: string;
  items: EmrPrescriptionHistoryItem[];
};

type ClinicOption = {
  clinic_id: number;
  clinic_name: string | null;
};

type PatientGenderValue = "Male" | "Female" | "Other" | "Prefer not to say";
type MasterCorrectionSuggestion = {
  masterSuggestion: EmrMasterItem | null;
  spellSuggestion: string | null;
};
type VitalInputKey =
  | "bp_systolic"
  | "bp_diastolic"
  | "pulse"
  | "height"
  | "weight"
  | "temperature"
  | "spo2";

const EMPTY_COMPLAINT_ROW: EmrComplaintPayload = {
  name: "",
  severity: "",
  frequency: "",
  duration_value: null,
  duration_unit: null,
  notes: "",
  sort_order: 0,
};

const EMPTY_MEDICINE_ROW: EmrMedicinePayload = {
  type: "",
  medicine_name: "",
  salt_composition: "",
  strength: "",
  dose: "",
  timing: "",
  frequency: "",
  duration_value: null,
  duration_unit: null,
  duration_text: "",
  notes: "",
  sort_order: 0,
};

const DOSE_PATTERNS = [
  ["1", "0", "0"],
  ["0", "0", "1"],
  ["1", "0", "1"],
  ["1", "1", "1"],
  ["1", "1", "1", "1"],
  ["1", "1", "0"],
  ["0", "1", "0"],
  ["0", "1", "1"],
  ["0", "0", "0", "1"],
] as const;

const DOSE_SEPARATOR = " . ";

const VITAL_INPUT_ORDER: VitalInputKey[] = [
  "pulse",
  "bp_systolic",
  "bp_diastolic",
  "spo2",
  "temperature",
  "height",
  "weight",
];

const DOSE_SUGGESTIONS = DOSE_PATTERNS.map((pattern) => pattern.join(DOSE_SEPARATOR)).concat("SOS");

const HALF_DOSE_SUGGESTIONS = DOSE_PATTERNS.map((pattern) =>
  pattern
    .map((token) => (token === "1" ? "1/2" : token))
    .join(DOSE_SEPARATOR)
).concat("SOS");

const TIMING_SUGGESTIONS = [
  "Before Food",
  "After Food",
  "Empty Stomach",
  "Bed Time",
];

const FREQUENCY_SUGGESTIONS = [
  "Daily",
  "Alternate Day",
  "Weekly",
  "Fortnight",
  "Monthly",
  "Stat",
  "SOS",
  "Weekly Twice",
  "Weekly Thrice",
];

const COMPLAINT_FREQUENCY_SUGGESTIONS = [
  "Continuous",
  "Intermittent",
  "Occasional",
  "Daily",
  "Alternate Day",
  "Weekly",
  "Twice Weekly",
  "Fortnightly",
  "Monthly",
  "Seasonal",
];

const COMPLAINT_SEVERITY_SUGGESTIONS = [
  "Mild",
  "Moderate",
  "Severe",
  "Very Severe",
];

const MEDICINE_TYPE_OPTIONS = [
  "TAB",
  "CAP",
  "SYRUP",
  "SUSPENSION",
  "INJ",
  "DROP",
  "CREAM",
  "OINTMENT",
  "GEL",
  "LOTION",
  "SPRAY",
  "SACHET",
  "POWDER",
];

const MEDICINE_UNIT_OPTIONS = ["mg", "mcg", "g", "ml", "IU", "%"];

const QUICK_FOLLOW_UP_OPTIONS = [
  { label: "After 7 days", days: 7 },
  { label: "After 15 days", days: 15 },
  { label: "After 1 month", days: 30 },
  { label: "After 2 months", days: 60 },
];

const CLINICAL_HISTORY_LABELS: Record<EmrClinicalHistorySection, string> = {
  examination_findings: "Examination Findings",
  investigation_findings: "Investigation Findings",
  past_medical_history: "Past Medical History",
  family_history: "Family History",
  surgical_history: "Surgical History",
  treatment_history: "Treatment History",
  allergies: "Allergies",
  personal_social_history: "Personal / Social History",
};

const CLINICAL_HISTORY_SECTIONS: EmrClinicalHistorySection[] = [
  "examination_findings",
  "investigation_findings",
  "past_medical_history",
  "family_history",
  "surgical_history",
  "treatment_history",
  "allergies",
  "personal_social_history",
];

const COLLAPSIBLE_CLINICAL_HISTORY_SECTIONS: EmrClinicalHistorySection[] = [
  ...CLINICAL_HISTORY_SECTIONS,
];

function getInitialClinicalHistoryExpansionState(
  sectionOrder: EmrLayoutSectionKey[]
): Partial<Record<EmrClinicalHistorySection, boolean>> {
  const lastNonCollapsibleIndex = sectionOrder.reduce((lastIndex, section, index) => {
    if (
      isClinicalHistorySection(section) &&
      COLLAPSIBLE_CLINICAL_HISTORY_SECTIONS.includes(section)
    ) {
      return lastIndex;
    }

    return index;
  }, -1);

  return Object.fromEntries(
    COLLAPSIBLE_CLINICAL_HISTORY_SECTIONS.map((section) => {
      const sectionIndex = sectionOrder.indexOf(section);
      return [section, sectionIndex !== -1 && sectionIndex <= lastNonCollapsibleIndex];
    })
  ) as Partial<Record<EmrClinicalHistorySection, boolean>>;
}

const ALLOWED_UI_ERROR_MESSAGES = new Set([
  "Patient name and phone are required to book the follow-up appointment.",
  "This medicine is already added in another row.",
]);

function toSafeUiErrorMessage(error: unknown, fallback: string) {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const normalized = raw.trim();

  if (!normalized) return fallback;
  if (ALLOWED_UI_ERROR_MESSAGES.has(normalized)) return normalized;

  if (
    normalized.includes("Invalid `prisma.") ||
    normalized.includes("Transaction API error") ||
    normalized.includes("constraint fails") ||
    normalized.includes("Cannot add or update a child row") ||
    normalized.includes("ECONN") ||
    normalized.includes("AggregateError") ||
    normalized.includes("Raw query failed") ||
    normalized.includes("`doctor_db`.") ||
    normalized.includes("\n")
  ) {
    return fallback;
  }

  return normalized.length > 180 ? fallback : normalized;
}

const PATIENT_GENDER_OPTIONS: Array<{
  value: PatientGenderValue;
  shortLabel: "M" | "F" | "O" | "PNS";
}> = [
  { value: "Male", shortLabel: "M" },
  { value: "Female", shortLabel: "F" },
  { value: "Other", shortLabel: "O" },
  { value: "Prefer not to say", shortLabel: "PNS" },
];

type SaltCompositionPart = {
  name: string;
  value: string;
  unit: string;
};

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateDdMmYyyy(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(`${toDateInputValue(value)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeFollowUpDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const candidate = new Date(`${year}-${month}-${day}T12:00:00`);
    return Number.isNaN(candidate.getTime()) ? "" : `${year}-${month}-${day}`;
  }

  const parts = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) return "";

  const [, day, month, year] = parts;
  const candidate = new Date(`${year}-${month}-${day}T12:00:00`);
  if (Number.isNaN(candidate.getTime())) return "";
  if (
    candidate.getUTCFullYear() !== Number(year) ||
    candidate.getUTCMonth() + 1 !== Number(month) ||
    candidate.getUTCDate() !== Number(day)
  ) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function formatDateInputDraft(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatHistoryTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function toUpperDisplayValue(value: string | null | undefined, fallback = "-") {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : fallback;
}

function toUpperListDisplay(items: Array<{ name: string }>) {
  return items.map((item) => item.name.trim().toUpperCase()).filter(Boolean).join(", ");
}

function toUpperClinicalHistoryDisplay(
  items: EmrClinicalHistoryPayload[],
  section: EmrClinicalHistorySection
) {
  return items
    .filter((item) => item.section === section)
    .map((item) => item.details.trim().toUpperCase())
    .filter(Boolean)
    .join(", ");
}

function formatCustomFieldValueForDisplay(
  fieldType: EmrCustomFieldType,
  value: string | null | undefined
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  if (fieldType === "date") {
    return formatDateDdMmYyyy(normalized) || normalized;
  }

  if (fieldType === "checkbox") {
    return /^(true|1|yes|on)$/i.test(normalized) ? "YES" : "";
  }

  return normalized.toUpperCase();
}

function getCustomFieldValue(
  values: EmrCustomFieldValuePayload[],
  fieldKey: string
) {
  return values.find((item) => item.field_key === fieldKey)?.field_value ?? "";
}

function buildCustomFieldValues(
  values: EmrCustomFieldValuePayload[],
  definitions: EmrLayoutCustomField[]
) {
  return definitions.map((field, index) => {
    const existing = values.find((item) => item.field_key === field.field_key);
    return {
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: field.field_type,
      field_value: existing?.field_value ?? field.default_value ?? "",
      sort_order: existing?.sort_order ?? field.sort_order ?? index,
    };
  });
}

function getVitalsSummaryEntries(vitals: Required<EmrVitalsPayload> | EmrVitalsPayload | null) {
  if (!vitals) return [];

  return [
    { key: "PULSE", value: vitals.pulse?.trim(), unit: "bpm" },
    { key: "BP", value: vitals.bp?.trim(), unit: "mmHg" },
    { key: "SPO2", value: vitals.spo2?.trim(), unit: "%" },
    { key: "TEMP", value: vitals.temperature?.trim(), unit: "°F" },
    { key: "HEIGHT", value: vitals.height?.trim(), unit: "cm" },
    { key: "WEIGHT", value: vitals.weight?.trim(), unit: "kg" },
    { key: "BMI", value: vitals.bmi?.trim(), unit: "kg/m²" },
  ].filter((entry) => Boolean(entry.value));
}

function formatFollowUpAppointmentSummary(
  summary: EmrFollowUpAppointmentSummary | null | undefined
) {
  if (!summary?.date || !summary.slot_time) {
    return "";
  }

  return [
    formatDateDdMmYyyy(summary.date),
    to12HourLabel(summary.slot_time).toUpperCase(),
    summary.clinic_name?.trim() ? summary.clinic_name.trim().toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatEmrDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone: "UTC",
  });
}

function isClinicalHistorySection(
  section: EmrLayoutSectionKey
): section is EmrClinicalHistorySection {
  return CLINICAL_HISTORY_SECTIONS.includes(section as EmrClinicalHistorySection);
}

function toUpperText(value: string | null | undefined, fallback = "-") {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : fallback;
}

function normalizePatientGender(value: string | null | undefined): PatientGenderValue | "" {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  if (normalized === "other") return "Other";
  if (normalized === "prefer not to say") return "Prefer not to say";
  return "";
}

function buildQuickFollowUpBaseDate(input?: {
  visitDate?: string | null;
  appointmentDate?: string | null;
}) {
  const baseDateValue =
    toDateInputValue(input?.visitDate) ||
    toDateInputValue(input?.appointmentDate) ||
    new Date().toISOString().slice(0, 10);

  return new Date(`${baseDateValue}T12:00:00`);
}

function getPatientGenderShortLabel(value: string | null | undefined) {
  const normalized = normalizePatientGender(value);
  return PATIENT_GENDER_OPTIONS.find((option) => option.value === normalized)?.shortLabel ?? null;
}

function formatPatientNameWithMeta(patient: DraftContextResponse["context"]["patient"]) {
  const name = patient?.full_name?.trim() || "Patient";
  const age = patient?.age;
  const genderLabel = getPatientGenderShortLabel(patient?.gender);

  const metaParts = [
    Number.isFinite(age ?? NaN) && (age ?? 0) > 0 ? `${age}y` : null,
    genderLabel,
  ].filter(Boolean);

  return (metaParts.length > 0 ? `${name} (${metaParts.join(", ")})` : name).toUpperCase();
}

function parsePositiveNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatAvailableDate(value: string) {
  if (!value) return "";

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function to12HourLabel(value: string) {
  if (!value) return "";
  return /AM|PM/i.test(value) ? value : convertTo12Hour(value);
}

function addMinutesToTimeString(time: string, minutesToAdd: number) {
  const baseTime = /AM|PM/i.test(time) ? convertTo24Hour(time) : time;
  const [hours, minutes] = baseTime.split(":").map(Number);
  const next = new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0));
  next.setUTCMinutes(next.getUTCMinutes() + minutesToAdd);
  const nextHours = String(next.getUTCHours()).padStart(2, "0");
  const nextMinutes = String(next.getUTCMinutes()).padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}

function getNextAvailableDate(targetDate: string, availableDates: string[]) {
  if (!targetDate) return "";
  if (availableDates.includes(targetDate)) return targetDate;
  return availableDates.find((value) => value >= targetDate) ?? "";
}

function calculateBmi(height: string | null | undefined, weight: string | null | undefined) {
  const heightCm = parsePositiveNumber(height);
  const weightKg = parsePositiveNumber(weight);

  if (!heightCm || !weightKg) {
    return "";
  }

  const heightInMeters = heightCm / 100;
  const bmi = weightKg / (heightInMeters * heightInMeters);

  if (!Number.isFinite(bmi) || bmi <= 0) {
    return "";
  }

  return bmi.toFixed(2);
}

function applyCalculatedBmi(vitals: Required<EmrVitalsPayload>) {
  return {
    ...vitals,
    bmi: calculateBmi(vitals.height, vitals.weight),
  };
}

function sanitizeBloodPressurePart(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 3);
}

function sanitizeWeightInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDotIndex = cleaned.indexOf(".");
  const normalized =
    firstDotIndex === -1
      ? cleaned
      : `${cleaned.slice(0, firstDotIndex + 1)}${cleaned
          .slice(firstDotIndex + 1)
          .replace(/\./g, "")}`;

  return normalized.slice(0, 5);
}

function sanitizeVitalInput(
  field: keyof DraftEditorState["vitals"],
  value: string
) {
  switch (field) {
    case "pulse":
    case "height":
    case "spo2":
      return value.replace(/[^\d]/g, "").slice(0, 3);
    case "weight":
      return sanitizeWeightInput(value);
    default:
      return value;
  }
}

function parseBloodPressure(value: string | null | undefined) {
  if (!value) {
    return { systolic: "", diastolic: "" };
  }

  const [rawSystolic = "", rawDiastolic = ""] = value.split("/");
  return {
    systolic: sanitizeBloodPressurePart(rawSystolic.trim()),
    diastolic: sanitizeBloodPressurePart(rawDiastolic.trim()),
  };
}

function buildBloodPressureValue(systolic: string, diastolic: string) {
  const left = sanitizeBloodPressurePart(systolic);
  const right = sanitizeBloodPressurePart(diastolic);

  if (!left && !right) {
    return "";
  }

  if (left && right) {
    return `${left}/${right}`;
  }

  return left || right;
}

function getSelectOptions(options: string[], currentValue: string | null | undefined) {
  const normalized = currentValue?.trim() ?? "";
  if (!normalized || options.includes(normalized)) {
    return options;
  }

  return [normalized, ...options];
}

function getDoseModeFromValue(value: string | null | undefined): DoseMode {
  return value?.includes("1/2") ? "half" : "full";
}

function getDoseSuggestionsForMode(mode: DoseMode) {
  return mode === "half" ? HALF_DOSE_SUGGESTIONS : DOSE_SUGGESTIONS;
}

function transformDoseForMode(value: string | null | undefined, mode: DoseMode) {
  const normalized = (value?.trim() ?? "").replace(/\s*-\s*/g, DOSE_SEPARATOR);
  if (!normalized) return "";

  const sourceSuggestions = mode === "half" ? DOSE_SUGGESTIONS : HALF_DOSE_SUGGESTIONS;
  const targetSuggestions = getDoseSuggestionsForMode(mode);
  const matchedIndex = sourceSuggestions.indexOf(normalized);

  if (matchedIndex >= 0) {
    return targetSuggestions[matchedIndex];
  }

  if (normalized === "SOS") {
    return normalized;
  }

  return normalized;
}

function parseCompactDoseTokens(value: string) {
  const compact = value.replace(/\s+/g, "").replace(/-/g, ".");
  if (!compact || /[^0-9/.]/.test(compact)) return null;

  if (compact.includes(".")) {
    const separatedTokens = compact.split(".").filter(Boolean);
    if (
      separatedTokens.length === 0 ||
      separatedTokens.some((token) => !/^\d+(?:\/\d+)?$/.test(token))
    ) {
      return null;
    }

    return separatedTokens;
  }

  const tokens: string[] = [];
  for (let cursor = 0; cursor < compact.length; ) {
    const fractionMatch = compact.slice(cursor).match(/^(\d)\/(\d)/);
    if (fractionMatch) {
      tokens.push(`${fractionMatch[1]}/${fractionMatch[2]}`);
      cursor += fractionMatch[0].length;
      continue;
    }

    const current = compact[cursor];
    if (/\d/.test(current)) {
      tokens.push(current);
      cursor += 1;
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

function formatDoseInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const tokens = parseCompactDoseTokens(trimmed);
  return tokens ? tokens.join(DOSE_SEPARATOR) : trimmed;
}

function composeStrength(value: string, unit: string) {
  const trimmedValue = value.trim();
  const trimmedUnit = unit.trim();

  if (!trimmedValue && !trimmedUnit) {
    return "";
  }

  return [trimmedValue, trimmedUnit.toUpperCase()].filter(Boolean).join(" ");
}

function composeSaltComposition(parts: SaltCompositionPart[]) {
  return parts
    .map((part) => {
      const segments = [
        part.name.trim().toUpperCase(),
        part.value.trim(),
        part.unit.trim().toUpperCase(),
      ].filter(Boolean);

      return segments.join(" ");
    })
    .filter(Boolean)
    .join(" + ");
}

function getMedicineIdentity(medicine: EmrMedicinePayload) {
  return (
    medicine.medicine_master_id?.toString() ||
    medicine.normalized_name ||
    normalizeMasterName(medicine.medicine_name)
  );
}

function hasComplaintContent(complaint: EmrComplaintPayload) {
  return Boolean(complaint.name?.trim());
}

function applyComplaintSuggestionToRow(
  row: EmrComplaintPayload,
  item: EmrMasterItem
): EmrComplaintPayload {
  return {
    ...row,
    complaint_master_id: item.id,
    name: item.name,
    normalized_name: item.normalized_name,
  };
}

function clearComplaintSelectionDetails(
  row: EmrComplaintPayload,
  nextName: string
): EmrComplaintPayload {
  return {
    ...row,
    name: nextName,
    complaint_master_id: null,
    normalized_name: normalizeMasterName(nextName) || null,
  };
}

function applyMedicineSuggestionToRow(
  row: EmrMedicinePayload,
  item: EmrMasterItem
): EmrMedicinePayload {
  return {
    ...row,
    medicine_master_id: item.id,
    medicine_name: item.name,
    normalized_name: item.normalized_name,
    type: item.type ?? row.type,
    strength: item.strength ?? row.strength,
    salt_composition: item.salt_composition ?? row.salt_composition,
  };
}

function clearMedicineSelectionDetails(
  row: EmrMedicinePayload,
  nextMedicineName: string
): EmrMedicinePayload {
  return {
    ...row,
    medicine_name: nextMedicineName,
    medicine_master_id: null,
    normalized_name: null,
    type: "",
    strength: "",
    salt_composition: "",
  };
}

function isMedicineResolved(medicine: EmrMedicinePayload) {
  if (!medicine.medicine_name?.trim()) {
    return false;
  }

  return Boolean(
    medicine.medicine_master_id ||
      medicine.type?.trim() ||
      medicine.strength?.trim() ||
      medicine.salt_composition?.trim()
  );
}

function mapDraftToEditorState(draft: EmrPrescriptionRecord): DraftEditorState {
  return {
    vitals: applyCalculatedBmi({
      bp: draft.vitals?.bp ?? "",
      pulse: draft.vitals?.pulse ?? "",
      height: draft.vitals?.height ?? "",
      weight: draft.vitals?.weight ?? "",
      temperature: draft.vitals?.temperature ?? "",
      spo2: draft.vitals?.spo2 ?? "",
      bmi: draft.vitals?.bmi ?? "",
    }),
    complaints:
      draft.complaints.length > 0 ? draft.complaints : [{ ...EMPTY_COMPLAINT_ROW }],
    diagnosis: draft.diagnosis ?? [],
    medicines:
      draft.medicines.length > 0
        ? draft.medicines.map((medicine) => ({
            ...medicine,
            dose: formatDoseInput(medicine.dose ?? ""),
          }))
        : [{ ...EMPTY_MEDICINE_ROW }],
    tests: draft.tests ?? [],
    advice: draft.advice ?? [],
    clinical_history: draft.clinical_history ?? [],
    custom_fields: draft.custom_fields ?? [],
    next_visit_date: toDateInputValue(draft.next_visit_date),
  };
}

function buildDraftPayload(
  draft: EmrPrescriptionRecord,
  editorState: DraftEditorState
): EmrDraftSavePayload {
  return {
    clinic_id: draft.clinic_id,
    visit_date: draft.visit_date,
    next_visit_date: editorState.next_visit_date || null,
    timezone: draft.timezone,
    vitals: editorState.vitals,
    complaints: editorState.complaints
      .filter((complaint) => hasComplaintContent(complaint))
      .map((complaint, index) => ({
        ...complaint,
        normalized_name: normalizeMasterName(complaint.name) || null,
        sort_order: index,
      })),
    diagnosis: editorState.diagnosis,
    medicines: editorState.medicines.map((medicine, index) => ({
      ...medicine,
      sort_order: index,
      dose: formatDoseInput(medicine.dose ?? ""),
      duration_text:
        medicine.duration_text?.trim() ||
        (medicine.duration_value && medicine.duration_unit
          ? `${medicine.duration_value} ${medicine.duration_unit}`
          : ""),
    })),
    tests: editorState.tests,
    advice: editorState.advice,
    clinical_history: editorState.clinical_history.map((item, index) => ({
      section: item.section,
      details: item.details.trim(),
      sort_order: item.sort_order ?? index,
    })),
    custom_fields: editorState.custom_fields.map((field, index) => ({
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: field.field_type,
      field_value: field.field_value?.trim() ?? "",
      sort_order: field.sort_order ?? index,
    })),
  };
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      style={{ textTransform: "uppercase" }}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function getDurationLabel(value: number, unit: NonNullable<EmrMedicinePayload["duration_unit"]>) {
  const base =
    unit === "day"
      ? "Day"
      : unit === "week"
        ? "Week"
        : unit === "month"
          ? "Month"
          : unit === "year"
            ? "Year"
            : "Custom";

  if (unit === "custom") {
    return `${value}`;
  }

  return `${value} ${value === 1 ? base : `${base}s`}`;
}

function buildDurationSuggestions(rawValue: number | null | undefined) {
  if (!rawValue || rawValue <= 0) return [];
  return (["day", "week", "month", "year"] as const).map((unit) => ({
    unit,
    label: getDurationLabel(rawValue, unit),
  }));
}

function getFloatingPanelStyle(anchorElement: HTMLElement | null, width?: number): CSSProperties {
  if (!anchorElement || typeof window === "undefined") {
    return {
      position: "fixed",
      left: -9999,
      top: -9999,
      width: width ?? 0,
      visibility: "hidden",
      zIndex: 60,
    };
  }

  const rect = anchorElement.getBoundingClientRect();
  return {
    position: "fixed",
    top: rect.bottom + 4,
    left: rect.left,
    width: width ?? rect.width,
    zIndex: 60,
  };
}

function useFloatingPanelStyle(anchorElement: HTMLElement | null, open: boolean, width?: number) {
  const [style, setStyle] = useState<CSSProperties>(() =>
    getFloatingPanelStyle(anchorElement, width)
  );

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      setStyle(getFloatingPanelStyle(anchorElement, width));
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorElement, open, width]);

  useEffect(() => {
    if (!open) {
      setStyle(getFloatingPanelStyle(anchorElement, width));
    }
  }, [anchorElement, open, width]);

  return style;
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function SuggestionDropdown({
  suggestions,
  typedValue,
  loading,
  onSelect,
  onAdd,
  anchorElement,
}: {
  suggestions: EmrMasterItem[];
  typedValue: string;
  loading: boolean;
  onSelect: (item: EmrMasterItem) => void;
  onAdd?: () => void;
  anchorElement: HTMLElement | null;
}) {
  const showAdd = Boolean(onAdd) && typedValue.trim().length >= 1;
  const panelStyle = useFloatingPanelStyle(anchorElement, true);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      style={panelStyle}
      className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-xl"
    >
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
          <Loader2 className="animate-spin" size={14} />
          Loading suggestions...
        </div>
      ) : (
        <>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              className="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-3 text-left text-sm hover:bg-indigo-50"
            >
              <span className="min-w-0">
                <span className="block font-medium uppercase text-gray-900">{item.name}</span>
                {item.salt_composition ? (
                  <span className="block text-xs uppercase text-gray-500">
                    {item.salt_composition}
                  </span>
                ) : null}
              </span>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {item.status}
              </span>
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAdd}
              className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              <PlusCircle size={14} />
              + Add {typedValue.trim()}
            </button>
          )}
          {!showAdd && suggestions.length === 0 && typedValue.trim().length < 1 ? (
            <div className="px-3 py-3 text-sm text-gray-500">Type at least 1 letter</div>
          ) : null}
        </>
      )}
    </div>,
    document.body
  );
}

function FreeWriteSuggestionInput({
  value,
  suggestions,
  placeholder,
  ariaLabel,
  onChange,
  onCommit,
  inputRef,
  onAdvance,
}: {
  value: string;
  suggestions: string[];
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => string;
  inputRef?: React.Ref<HTMLInputElement>;
  onAdvance?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelStyle = useFloatingPanelStyle(anchorRef.current, open);
  const normalizedValue = value.trim().toLowerCase();
  const filteredSuggestions = suggestions.filter((suggestion) => {
    if (!normalizedValue) return true;
    return suggestion.toLowerCase().includes(normalizedValue);
  });

  const commitValue = useCallback(() => {
    if (!onCommit) return;
    const nextValue = onCommit(value);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }, [onChange, onCommit, value]);

  return (
    <div ref={anchorRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commitValue();
          window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitValue();
            setOpen(false);
            onAdvance?.();
          }
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none focus:border-indigo-400"
        placeholder={placeholder}
        aria-label={ariaLabel}
        title={ariaLabel}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400 hover:text-slate-600"
        aria-label={`Toggle ${ariaLabel} suggestions`}
        title={`Toggle ${ariaLabel} suggestions`}
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && filteredSuggestions.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <div
              style={panelStyle}
              className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(suggestion);
                    setOpen(false);
                    onAdvance?.();
                  }}
                  className="flex w-full items-center border-b border-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-indigo-50 last:border-b-0"
                >
                  {suggestion}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function AddMasterItemModal({
  open,
  kind,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: MasterKindRoute;
  initialName: string;
  onClose: () => void;
  onCreated: (item: EmrMasterItem) => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState(MEDICINE_TYPE_OPTIONS[0]);
  const [strengthValue, setStrengthValue] = useState("");
  const [strengthUnit, setStrengthUnit] = useState("mg");
  const [saltCompositionParts, setSaltCompositionParts] = useState<SaltCompositionPart[]>([
    { name: "", value: "", unit: "mg" },
  ]);
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correction, setCorrection] = useState<MasterCorrectionSuggestion>({
    masterSuggestion: null,
    spellSuggestion: null,
  });
  const [dismissedSuggestionSignature, setDismissedSuggestionSignature] = useState("");
  const correctionQuery = useDebouncedValue(name, 250);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setType(MEDICINE_TYPE_OPTIONS[0]);
    setStrengthValue("");
    setStrengthUnit("mg");
    setSaltCompositionParts([{ name: "", value: "", unit: "mg" }]);
    setCompany("");
    setSaving(false);
    setError("");
    setCorrectionLoading(false);
    setCorrection({
      masterSuggestion: null,
      spellSuggestion: null,
    });
    setDismissedSuggestionSignature("");
  }, [initialName, open]);

  const isMedicine = kind === "medicines";

  useEffect(() => {
    if (!open || isMedicine) {
      setCorrection({
        masterSuggestion: null,
        spellSuggestion: null,
      });
      setCorrectionLoading(false);
      return;
    }

    const trimmedName = correctionQuery.trim();
    if (trimmedName.length < 3) {
      setCorrection({
        masterSuggestion: null,
        spellSuggestion: null,
      });
      setCorrectionLoading(false);
      return;
    }

    let active = true;
    const loadCorrection = async () => {
      try {
        setCorrectionLoading(true);
        const res = await fetch(
          `/api/emr/master/${kind}/correction?q=${encodeURIComponent(trimmedName)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as
          | MasterCorrectionSuggestion
          | { error?: string };

        if (!active) return;
        if (!res.ok) {
          setCorrection({
            masterSuggestion: null,
            spellSuggestion: null,
          });
          return;
        }

        setCorrection({
          masterSuggestion:
            "masterSuggestion" in data ? data.masterSuggestion ?? null : null,
          spellSuggestion:
            "spellSuggestion" in data ? data.spellSuggestion ?? null : null,
        });
      } catch {
        if (!active) return;
        setCorrection({
          masterSuggestion: null,
          spellSuggestion: null,
        });
      } finally {
        if (active) {
          setCorrectionLoading(false);
        }
      }
    };

    void loadCorrection();
    return () => {
      active = false;
    };
  }, [correctionQuery, isMedicine, kind, open]);

  const correctionSignature = [
    normalizeMasterName(name),
    correction.masterSuggestion?.id ?? "",
    correction.spellSuggestion ?? "",
  ].join("|");
  const showCorrectionSuggestion =
    !isMedicine &&
    correctionSignature !== dismissedSuggestionSignature &&
    (Boolean(correction.masterSuggestion) || Boolean(correction.spellSuggestion));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900">
          Add {isMedicine ? "Medicine" : "Master Item"}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          This item will be added here.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                />
          </label>
          {!isMedicine ? (
            <>
              {correctionLoading ? (
                <div className="min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  Checking suggestion...
                </div>
              ) : (
                <div className="min-h-[44px]">
                  {showCorrectionSuggestion ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-600">Did you mean</span>
                        <span className="font-semibold text-slate-900">
                          {correction.masterSuggestion
                            ? correction.masterSuggestion.name.toUpperCase()
                            : correction.spellSuggestion?.toUpperCase()}
                          ?
                        </span>
                        {correction.masterSuggestion ? (
                          <button
                            type="button"
                            onClick={() => {
                              onCreated(correction.masterSuggestion as EmrMasterItem);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Check size={12} />
                            Use Existing
                          </button>
                        ) : correction.spellSuggestion ? (
                          <button
                            type="button"
                            onClick={() => {
                              setName(correction.spellSuggestion ?? "");
                              setDismissedSuggestionSignature("");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Check size={12} />
                            Use Suggestion
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setDismissedSuggestionSignature(correctionSignature)}
                          className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          Keep Typed
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
          {isMedicine ? (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Type</span>
                <input
                  type="text"
                  list="medicine-type-options"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                  placeholder="TAB"
                />
                <datalist id="medicine-type-options">
                  {MEDICINE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-500">Strength value</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={strengthValue}
                    onChange={(event) => setStrengthValue(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                    placeholder="500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-500">Strength unit</span>
                  <input
                    type="text"
                    list="medicine-strength-unit-options"
                    value={strengthUnit}
                    onChange={(event) => setStrengthUnit(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                    placeholder="MG"
                  />
                  <datalist id="medicine-strength-unit-options">
                    {MEDICINE_UNIT_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </label>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">Salt composition</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSaltCompositionParts((current) => [
                        ...current,
                        { name: "", value: "", unit: "mg" },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Plus size={12} />
                    Add Salt
                  </button>
                </div>
                <div className="space-y-2">
                  {saltCompositionParts.map((part, partIndex) => (
                    <div
                      key={`salt-part-${partIndex}`}
                      className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_120px_110px_44px]"
                    >
                      <input
                        type="text"
                        value={part.name}
                        onChange={(event) =>
                          setSaltCompositionParts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === partIndex
                                ? { ...entry, name: event.target.value }
                                : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                        placeholder="Salt name"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={part.value}
                        onChange={(event) =>
                          setSaltCompositionParts((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === partIndex
                                ? { ...entry, value: event.target.value }
                                : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                        placeholder="Value"
                      />
                      <div>
                        <input
                          type="text"
                          list={`salt-unit-options-${partIndex}`}
                          value={part.unit}
                          onChange={(event) =>
                            setSaltCompositionParts((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === partIndex
                                  ? { ...entry, unit: event.target.value }
                                  : entry
                              )
                            )
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase"
                          placeholder="MG"
                        />
                        <datalist id={`salt-unit-options-${partIndex}`}>
                          {MEDICINE_UNIT_OPTIONS.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSaltCompositionParts((current) =>
                            current.length === 1
                              ? [{ name: "", value: "", unit: current[0]?.unit || "mg" }]
                              : current.filter((_, entryIndex) => entryIndex !== partIndex)
                          )
                        }
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        aria-label="Remove salt row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Company</span>
                <input
                  type="text"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </>
          ) : null}
        </div>
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                setError("");
                const composedStrength = composeStrength(strengthValue, strengthUnit);
                const composedSaltComposition = composeSaltComposition(saltCompositionParts);
                const res = await fetch(`/api/emr/master/${kind}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    name,
                    type: isMedicine ? type : undefined,
                    strength: isMedicine ? composedStrength : undefined,
                    salt_composition: isMedicine ? composedSaltComposition : undefined,
                    company: isMedicine ? company : undefined,
                  }),
                });
                const data = (await res.json()) as { item?: EmrMasterItem; error?: string };
                if (!res.ok || !data.item) {
                  throw new Error(data.error || "Failed to add item");
                }
                onCreated(data.item);
                onClose();
              } catch (err) {
                setError(
                  toSafeUiErrorMessage(err, "Could not add the item right now. Please try again.")
                );
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
}

function TagEditorSection({
  title,
  items,
  onChange,
  placeholder,
  kind,
}: {
  title: string;
  items: EmrNamedItemPayload[];
  onChange: (items: EmrNamedItemPayload[]) => void;
  placeholder: string;
  kind: MasterKindRoute;
}) {
  const [draftValue, setDraftValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<EmrMasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const inputAnchorRef = useRef<HTMLDivElement | null>(null);
  const debouncedValue = useDebouncedValue(draftValue, 350);
  const hasNamedItem = useCallback(
    (value: string | null | undefined) => {
      const normalizedValue = normalizeMasterName(value);
      if (!normalizedValue) {
        return false;
      }

      return items.some(
        (item) =>
          normalizeMasterName(item.normalized_name || item.name) === normalizedValue
      );
    },
    [items]
  );

  const addNamedItem = useCallback(
    (item: EmrMasterItem) => {
      if (hasNamedItem(item.normalized_name || item.name)) {
        setDraftValue("");
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      onChange([
        ...items,
        {
          id: item.id,
          name: item.name,
          normalized_name: item.normalized_name,
          sort_order: items.length,
        },
      ]);
      setDraftValue("");
      setSuggestions([]);
      setShowDropdown(false);
    },
    [hasNamedItem, items, onChange]
  );

  const handleAddAction = useCallback(() => {
    const value = draftValue.trim();
    if (!value) return;

    if (hasNamedItem(value)) {
      setDraftValue("");
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const normalizedValue = normalizeMasterName(value);
    const exactSuggestion = suggestions.find(
      (item) => normalizeMasterName(item.name) === normalizedValue
    );

    if (exactSuggestion) {
      addNamedItem(exactSuggestion);
      return;
    }

    setShowDropdown(false);
    setShowAddModal(true);
  }, [addNamedItem, draftValue, hasNamedItem, suggestions]);

  useEffect(() => {
    let active = true;
    const loadSuggestions = async () => {
      if (debouncedValue.trim().length < 1) {
        setSuggestions([]);
        return;
      }
      try {
        setLoading(true);
        const res = await fetch(
          `/api/suggestions/${kind}?q=${encodeURIComponent(debouncedValue.trim())}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as { suggestions?: EmrMasterItem[] };
        if (!active) return;
        setSuggestions(data.suggestions ?? []);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [debouncedValue, kind]);

  return (
    <SectionCard title={title}>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${item.name}-${index}`}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm uppercase text-indigo-800"
          >
            {item.name}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, current) => current !== index))}
              className="text-indigo-500 hover:text-indigo-700"
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
      <div ref={inputAnchorRef} className="relative mt-4 flex gap-2">
        <input
          type="text"
          value={draftValue}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            window.setTimeout(() => setShowDropdown(false), 150);
          }}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setShowDropdown(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddAction();
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={handleAddAction}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <Plus size={14} />
          Add
        </button>
        {showDropdown && (
          <SuggestionDropdown
            suggestions={suggestions}
            typedValue={draftValue}
            loading={loading}
            anchorElement={inputAnchorRef.current}
            onSelect={(item) => {
              addNamedItem(item);
            }}
          />
        )}
      </div>
      <AddMasterItemModal
        open={showAddModal}
        kind={kind}
        initialName={draftValue.trim()}
        onClose={() => setShowAddModal(false)}
        onCreated={(item) => {
          if (hasNamedItem(item.normalized_name || item.name)) {
            setDraftValue("");
            return;
          }

          onChange([
            ...items,
            {
              id: item.id,
              name: item.name,
              normalized_name: item.normalized_name,
              sort_order: items.length,
            },
          ]);
          setDraftValue("");
        }}
      />
    </SectionCard>
  );
}

function ClinicalHistorySection({
  section,
  items,
  onChange,
  compact = false,
  onCollapse,
}: {
  section: EmrClinicalHistorySection;
  items: EmrClinicalHistoryPayload[];
  onChange: (items: EmrClinicalHistoryPayload[]) => void;
  compact?: boolean;
  onCollapse?: () => void;
}) {
  const [draftValue, setDraftValue] = useState("");
  const sectionItems = items.filter((item) => item.section === section);
  const otherItems = items.filter((item) => item.section !== section);

  const addItem = useCallback(() => {
    const details = draftValue.trim();
    if (!details) return;

    onChange([
      ...otherItems,
      ...sectionItems,
      {
        section,
        details,
        sort_order: sectionItems.length,
      },
    ]);
    setDraftValue("");
  }, [draftValue, onChange, otherItems, section, sectionItems]);

  const removeItem = useCallback(
    (index: number) => {
      onChange([
        ...otherItems,
        ...sectionItems
          .filter((_, currentIndex) => currentIndex !== index)
          .map((item, sortOrder) => ({ ...item, sort_order: sortOrder })),
      ]);
    },
    [onChange, otherItems, sectionItems]
  );

  const content = (
    <>
      <div className="flex flex-wrap gap-2">
        {sectionItems.map((item, index) => (
          <span
            key={`${section}-${item.details}-${index}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm uppercase text-slate-700"
          >
            {item.details}
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-slate-500 hover:text-slate-800"
              aria-label={`Remove ${CLINICAL_HISTORY_LABELS[section]} note`}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={`Add ${CLINICAL_HISTORY_LABELS[section].toLowerCase()} and press Enter`}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </>
  );

  if (!compact) {
    return (
      <section
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        style={{ textTransform: "uppercase" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
            {CLINICAL_HISTORY_LABELS[section]}
          </h2>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Collapse ${CLINICAL_HISTORY_LABELS[section]}`}
              title={`Collapse ${CLINICAL_HISTORY_LABELS[section]}`}
            >
              <ChevronUp size={14} />
            </button>
          ) : null}
        </div>
        <div className="mt-3">{content}</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-900">
          {CLINICAL_HISTORY_LABELS[section]}
        </h3>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Collapse ${CLINICAL_HISTORY_LABELS[section]}`}
            title={`Collapse ${CLINICAL_HISTORY_LABELS[section]}`}
          >
            <ChevronUp size={14} />
          </button>
        ) : null}
      </div>
      <div className="mt-3">{content}</div>
    </section>
  );
}

function CustomFieldSection({
  field,
  value,
  onChange,
  readOnly = false,
}: {
  field: EmrLayoutCustomField;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const placeholder = field.placeholder?.trim() || `Enter ${field.field_label.toLowerCase()}`;

  if (readOnly) {
    const displayValue = formatCustomFieldValueForDisplay(field.field_type, value);
    if (!displayValue) return null;

    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {field.field_label}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{displayValue}</p>
      </div>
    );
  }

  return (
    <SectionCard title={field.field_label}>
      {field.field_type === "textarea" ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:border-indigo-400"
        />
      ) : field.field_type === "checkbox" ? (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={/^(true|1|yes|on)$/i.test(value)}
            onChange={(event) => onChange(event.target.checked ? "true" : "")}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>{field.field_label.toUpperCase()}</span>
        </label>
      ) : (
        <input
          type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.field_type === "date" ? undefined : placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:border-indigo-400"
        />
      )}
    </SectionCard>
  );
}

export default function DoctorAppointmentPadPage() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = params?.appointmentId;
  const prescriptionIdParam = searchParams?.get("prescriptionId") ?? "";
  const [loading, setLoading] = useState(true);
  const [contextData, setContextData] = useState<DraftContextResponse | null>(null);
  const [editorState, setEditorState] = useState<DraftEditorState | null>(null);
  const [warnings, setWarnings] = useState<EmrDraftWarning[]>([]);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [copyingPrescriptionId, setCopyingPrescriptionId] = useState<number | null>(null);
  const [revisionSourceId, setRevisionSourceId] = useState<number | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [discardingDraftId, setDiscardingDraftId] = useState<number | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState<EmrLayoutSettings | null>(null);
  const [quickFollowUpDays, setQuickFollowUpDays] = useState("");
  const [alsoBookAppointment, setAlsoBookAppointment] = useState(false);
  const [bookingClinicId, setBookingClinicId] = useState("");
  const [clinicOptions, setClinicOptions] = useState<ClinicOption[]>([]);
  const [clinicOptionsLoading, setClinicOptionsLoading] = useState(false);
  const [availableBookingDates, setAvailableBookingDates] = useState<string[]>([]);
  const [bookingDatesLoading, setBookingDatesLoading] = useState(false);
  const [availableBookingSlots, setAvailableBookingSlots] = useState<string[]>([]);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [bookingSlotDuration, setBookingSlotDuration] = useState(30);
  const [selectedBookingSlot, setSelectedBookingSlot] = useState("");
  const [bookingNotice, setBookingNotice] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [bookedFollowUpSummary, setBookedFollowUpSummary] =
    useState<EmrFollowUpAppointmentSummary | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [nextVisitInputValue, setNextVisitInputValue] = useState("");
  const [patientAgeInput, setPatientAgeInput] = useState("");
  const [patientGenderInput, setPatientGenderInput] = useState<PatientGenderValue | "">("");
  const [patientMetaSaving, setPatientMetaSaving] = useState(false);
  const [patientMetaError, setPatientMetaError] = useState("");
  const [expandedClinicalHistorySections, setExpandedClinicalHistorySections] = useState<
    Partial<Record<EmrClinicalHistorySection, boolean>>
  >({});
  const clinicalHistoryDefaultsAppliedRef = useRef(false);
  const [activeComplaintSuggestionIndex, setActiveComplaintSuggestionIndex] =
    useState<number | null>(null);
  const [activeComplaintDurationSuggestionIndex, setActiveComplaintDurationSuggestionIndex] =
    useState<number | null>(null);
  const [complaintSuggestions, setComplaintSuggestions] = useState<EmrMasterItem[]>([]);
  const [complaintSuggestionLoading, setComplaintSuggestionLoading] = useState(false);
  const [complaintAddModalIndex, setComplaintAddModalIndex] = useState<number | null>(null);
  const [activeMedicineSuggestionIndex, setActiveMedicineSuggestionIndex] =
    useState<number | null>(null);
  const [activeDurationSuggestionIndex, setActiveDurationSuggestionIndex] =
    useState<number | null>(null);
  const [doseModes, setDoseModes] = useState<Record<number, DoseMode>>({});
  const [medicineSuggestions, setMedicineSuggestions] = useState<EmrMasterItem[]>([]);
  const [medicineSuggestionLoading, setMedicineSuggestionLoading] = useState(false);
  const [medicineAddModalIndex, setMedicineAddModalIndex] = useState<number | null>(null);
  const complaintTypedValue =
    activeComplaintSuggestionIndex === null || !editorState
      ? ""
      : editorState.complaints[activeComplaintSuggestionIndex]?.name || "";
  const debouncedComplaintQuery = useDebouncedValue(complaintTypedValue, 350);
  const medicineTypedValue =
    activeMedicineSuggestionIndex === null || !editorState
      ? ""
      : editorState.medicines[activeMedicineSuggestionIndex]?.medicine_name || "";
  const debouncedMedicineQuery = useDebouncedValue(medicineTypedValue, 350);
  const complaintAnchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const complaintNameInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const complaintSeverityInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const complaintFrequencyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const complaintDurationInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const complaintDurationAnchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const medicineAnchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const medicineNameInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const doseInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timingInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const frequencyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const durationInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const durationAnchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const vitalInputRefs = useRef<Partial<Record<VitalInputKey, HTMLInputElement | null>>>({});
  const historyStripRef = useRef<HTMLDivElement | null>(null);
  const historyGroupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prescriptionContentRef = useRef<HTMLDivElement | null>(null);
  const pendingHistoryScrollPrescriptionIdRef = useRef<number | null>(null);
  const historyStripScrollLeftRef = useRef(0);
  const historyStripInitializedRef = useRef(false);
  const [historyCanScrollOlder, setHistoryCanScrollOlder] = useState(false);
  const [historyCanScrollNewer, setHistoryCanScrollNewer] = useState(false);
  const [activeHistoryGroupIndex, setActiveHistoryGroupIndex] = useState(0);
  const activeComplaintDurationAnchor =
    activeComplaintDurationSuggestionIndex === null
      ? null
      : complaintDurationAnchorRefs.current[activeComplaintDurationSuggestionIndex];
  const activeComplaintDurationPanelStyle = useFloatingPanelStyle(
    activeComplaintDurationAnchor,
    activeComplaintDurationSuggestionIndex !== null
  );
  const activeDurationAnchor =
    activeDurationSuggestionIndex === null ? null : durationAnchorRefs.current[activeDurationSuggestionIndex];
  const activeDurationPanelStyle = useFloatingPanelStyle(
    activeDurationAnchor,
    activeDurationSuggestionIndex !== null
  );

  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const queuedSaveTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef<DraftEditorState | null>(null);
  const lastSerializedRef = useRef("");
  const hasHydratedRef = useRef(false);

  const orderedHistoryGroups = useMemo(
    () => [...historyGroups].sort((left, right) => left.date.localeCompare(right.date)),
    [historyGroups]
  );
  const historyStripStorageKey = useMemo(
    () => `emr-history-strip:${appointmentId}`,
    [appointmentId]
  );

  const getActiveHistoryGroupIndex = useCallback(() => {
    const container = historyStripRef.current;
    if (!container || orderedHistoryGroups.length === 0) return 0;

    const currentScrollLeft = container.scrollLeft;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);

    if (currentScrollLeft <= 8) {
      return 0;
    }

    if (currentScrollLeft >= maxScrollLeft - 8) {
      return Math.max(orderedHistoryGroups.length - 1, 0);
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    historyGroupRefs.current.forEach((element, index) => {
      if (!element) return;
      const distance = Math.abs(element.offsetLeft - currentScrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, [orderedHistoryGroups.length]);

  const updateHistoryStripNavigation = useCallback(() => {
    const container = historyStripRef.current;
    if (!container) {
      setHistoryCanScrollOlder(false);
      setHistoryCanScrollNewer(false);
      setActiveHistoryGroupIndex(0);
      return;
    }

    const nextIndex = getActiveHistoryGroupIndex();
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    setActiveHistoryGroupIndex(nextIndex);
    setHistoryCanScrollOlder(container.scrollLeft > 8);
    setHistoryCanScrollNewer(container.scrollLeft < maxScrollLeft - 8);
  }, [getActiveHistoryGroupIndex, orderedHistoryGroups.length]);

  const scrollHistoryStrip = useCallback(
    (direction: "older" | "newer") => {
      const container = historyStripRef.current;
      if (!container) return;

      const targetIndex =
        direction === "older"
          ? Math.max(0, activeHistoryGroupIndex - 1)
          : Math.min(orderedHistoryGroups.length - 1, activeHistoryGroupIndex + 1);
      const targetElement = historyGroupRefs.current[targetIndex];
      if (!targetElement) return;

      container.scrollTo({
        left: targetElement.offsetLeft,
        behavior: "smooth",
      });

      window.setTimeout(updateHistoryStripNavigation, 260);
    },
    [activeHistoryGroupIndex, orderedHistoryGroups.length, updateHistoryStripNavigation]
  );

  const serializePayload = (draft: EmrPrescriptionRecord, state: DraftEditorState) =>
    JSON.stringify(buildDraftPayload(draft, state));

  const isReadOnly = contextData?.draft?.status === "final";
  const hasActiveDraft = Boolean(contextData?.draft && editorState);
  const patientAllergies = useMemo(
    () => contextData?.context.patient?.allergies ?? [],
    [contextData?.context.patient?.allergies]
  );
  const allergyWarnings = useMemo(() => {
    if (!editorState || patientAllergies.length === 0) return [];

    const allergyTokens = patientAllergies.map((item) => item.toLowerCase().trim()).filter(Boolean);
    if (allergyTokens.length === 0) return [];

    return editorState.medicines.flatMap((medicine, index) => {
      const haystack = `${medicine.medicine_name} ${medicine.salt_composition ?? ""}`.toLowerCase();
      const matchedAllergy = allergyTokens.find((token) => haystack.includes(token));
      if (!matchedAllergy) return [];

      return [
        {
          code: "allergy_match" as const,
          level: "warning" as const,
          message: `Possible allergy match for ${medicine.medicine_name}: matched patient allergy "${matchedAllergy}"`,
          medicine_name: medicine.medicine_name,
          row_index: index,
          related_allergy: matchedAllergy,
        },
      ];
    });
  }, [editorState, patientAllergies]);

  const activeWarnings = useMemo(
    () => [...warnings, ...allergyWarnings],
    [allergyWarnings, warnings]
  );

  const isDuplicateMedicineInDraft = useCallback(
    (rowIndex: number, medicine: EmrMedicinePayload) => {
      const currentIdentity = getMedicineIdentity(medicine);
      if (!currentIdentity) return false;

      return (editorState?.medicines ?? []).some((row, currentRowIndex) => {
        if (currentRowIndex === rowIndex) return false;
        return getMedicineIdentity(row) === currentIdentity;
      });
    },
    [editorState?.medicines]
  );

  const hydrateFromResponse = useCallback((data: DraftContextResponse) => {
    setContextData(data);
    setPatientAgeInput(
      data.context.patient?.age && data.context.patient.age > 0
        ? String(data.context.patient.age)
        : ""
    );
    setPatientGenderInput(normalizePatientGender(data.context.patient?.gender));
    setPatientMetaError("");
    if (data.draft) {
      const nextState = mapDraftToEditorState(data.draft);
      setEditorState(nextState);
      setWarnings(data.warnings ?? []);
      latestStateRef.current = nextState;
      lastSerializedRef.current = serializePayload(data.draft, nextState);
      setBookedFollowUpSummary(data.draft.follow_up_appointment ?? null);
      clinicalHistoryDefaultsAppliedRef.current = false;
    } else {
      setEditorState(null);
      setWarnings([]);
      latestStateRef.current = null;
      lastSerializedRef.current = "";
      setBookedFollowUpSummary(null);
      setExpandedClinicalHistorySections({});
      clinicalHistoryDefaultsAppliedRef.current = false;
    }
    dirtyRef.current = false;
    hasHydratedRef.current = true;
    setQuickFollowUpDays("");
    setAlsoBookAppointment(false);
    setBookingClinicId(data.context.clinic?.clinic_id ? String(data.context.clinic.clinic_id) : "");
    setClinicOptions([]);
    setAvailableBookingDates([]);
    setAvailableBookingSlots([]);
    setSelectedBookingSlot("");
    setBookingNotice("");
    setBookingError("");
    setBookingSuccess("");
    setSaveState(data.draft?.status === "final" ? "saved" : "idle");
    setSaveMessage(data.draft?.status === "final" ? "Finalized" : "");
  }, []);

  const updateComplaintField = useCallback(
    <K extends keyof EmrComplaintPayload>(
      rowIndex: number,
      field: K,
      value: EmrComplaintPayload[K]
    ) => {
      setEditorState((current) =>
        current
          ? {
              ...current,
              complaints: current.complaints.map((row, currentRowIndex) =>
                currentRowIndex === rowIndex
                  ? field === "name"
                    ? (() => {
                        const nextName = String(value ?? "");
                        const nextNormalizedName = normalizeMasterName(nextName);
                        const currentLinkedName = normalizeMasterName(
                          row.normalized_name || row.name
                        );

                        if (!nextNormalizedName) {
                          return clearComplaintSelectionDetails(row, nextName);
                        }

                        if (
                          row.complaint_master_id &&
                          currentLinkedName &&
                          nextNormalizedName !== currentLinkedName
                        ) {
                          return clearComplaintSelectionDetails(row, nextName);
                        }

                        return {
                          ...row,
                          name: nextName,
                          normalized_name: nextNormalizedName || null,
                        };
                      })()
                    : { ...row, [field]: value }
                  : row
              ),
            }
          : current
      );
    },
    []
  );

  const focusComplaintRowField = useCallback(
    (rowIndex: number, field: "severity" | "frequency" | "duration") => {
      const target =
        field === "severity"
          ? complaintSeverityInputRefs.current[rowIndex]
          : field === "frequency"
            ? complaintFrequencyInputRefs.current[rowIndex]
            : complaintDurationInputRefs.current[rowIndex];

      if (!target) return;

      window.setTimeout(() => {
        target.focus();
        target.select?.();
      }, 0);
    },
    []
  );

  const updateMedicineField = useCallback(
    <K extends keyof EmrMedicinePayload>(
      rowIndex: number,
      field: K,
      value: EmrMedicinePayload[K]
    ) => {
      setEditorState((current) =>
        current
          ? {
              ...current,
              medicines: current.medicines.map((row, currentRowIndex) =>
                currentRowIndex === rowIndex
                  ? field === "medicine_name"
                    ? (() => {
                        const nextMedicineName = String(value ?? "");
                        const nextNormalizedName = normalizeMasterName(nextMedicineName);
                        const currentLinkedName = normalizeMasterName(
                          row.normalized_name || row.medicine_name
                        );

                        if (!nextNormalizedName) {
                          return clearMedicineSelectionDetails(row, nextMedicineName);
                        }

                        if (
                          row.medicine_master_id &&
                          currentLinkedName &&
                          nextNormalizedName !== currentLinkedName
                        ) {
                          return clearMedicineSelectionDetails(row, nextMedicineName);
                        }

                        return { ...row, medicine_name: nextMedicineName };
                      })()
                    : { ...row, [field]: value }
                  : row
              ),
            }
          : current
      );
    },
    []
  );

  const focusMedicineRowField = useCallback(
    (
      rowIndex: number,
      field: "dose" | "timing" | "frequency" | "duration"
    ) => {
      const target =
        field === "dose"
          ? doseInputRefs.current[rowIndex]
          : field === "timing"
            ? timingInputRefs.current[rowIndex]
            : field === "frequency"
              ? frequencyInputRefs.current[rowIndex]
              : durationInputRefs.current[rowIndex];

      if (!target) return;

      window.setTimeout(() => {
        target.focus();
        target.select?.();
      }, 0);
    },
    []
  );

  const updateVitalField = useCallback(
    (field: keyof DraftEditorState["vitals"], value: string) => {
      if (field === "bmi") return;
      const sanitizedValue = sanitizeVitalInput(field, value);

      setEditorState((current) =>
        current
          ? {
              ...current,
              vitals: applyCalculatedBmi({
                ...current.vitals,
                [field]: sanitizedValue,
              }),
            }
          : current
      );
    },
    []
  );

  const updateBloodPressurePart = useCallback(
    (part: "systolic" | "diastolic", value: string) => {
      setEditorState((current) => {
        if (!current) return current;

        const currentBp = parseBloodPressure(current.vitals.bp);
        const nextBp =
          part === "systolic"
            ? buildBloodPressureValue(value, currentBp.diastolic)
            : buildBloodPressureValue(currentBp.systolic, value);

        return {
          ...current,
          vitals: applyCalculatedBmi({
            ...current.vitals,
            bp: nextBp,
          }),
        };
      });
    },
    []
  );

  const bookingFor = contextData?.context.appointment.booked_for === "OTHER" ? "OTHER" : "SELF";
  const patientInfo = contextData?.context.patient ?? null;
  const patientHasCompleteDemographics = Boolean(
    patientInfo &&
      Number.isFinite(patientInfo.age ?? NaN) &&
      (patientInfo.age ?? 0) > 0 &&
      normalizePatientGender(patientInfo.gender)
  );
  const patientTitleName = patientInfo?.full_name?.trim() || "Patient";
  const shouldShowPrescriptionTitle = Boolean(patientInfo);
  const hasBookableFollowUpDate = Boolean(
    editorState?.next_visit_date && availableBookingDates.includes(editorState.next_visit_date)
  );
  const persistedFollowUpSummary =
    bookedFollowUpSummary ?? contextData?.draft?.follow_up_appointment ?? null;

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = shouldShowPrescriptionTitle
      ? `Rx-${patientTitleName} | Dapto`
      : "Dapto";

    return () => {
      document.title = "Dapto";
    };
  }, [patientTitleName, shouldShowPrescriptionTitle]);

  const finalizedNextVisitSummary = useMemo(() => {
    if (!editorState?.next_visit_date) {
      return "NOT SCHEDULED";
    }

    const formattedDate = formatDateDdMmYyyy(editorState.next_visit_date);
    if (!formattedDate) {
      return "NOT SCHEDULED";
    }

    if (persistedFollowUpSummary && persistedFollowUpSummary.date === editorState.next_visit_date) {
      return formatFollowUpAppointmentSummary(persistedFollowUpSummary) || formattedDate;
    }

    return formattedDate;
  }, [editorState?.next_visit_date, persistedFollowUpSummary]);

  useEffect(() => {
    setNextVisitInputValue(formatDateDdMmYyyy(editorState?.next_visit_date));
  }, [editorState?.next_visit_date]);

  const applyFollowUpDate = useCallback(
    (nextDate: string, options?: { clearQuickSelection?: boolean }) => {
      if (options?.clearQuickSelection) {
        setQuickFollowUpDays("");
      }

      setSelectedBookingSlot("");
      setBookingSuccess("");
      setBookingError("");
      setNextVisitInputValue(formatDateDdMmYyyy(nextDate));
      setEditorState((current) =>
        current
          ? {
              ...current,
              next_visit_date: nextDate,
            }
          : current
      );
    },
    []
  );

  const handleSavePatientDemographics = useCallback(async () => {
    if (!appointmentId || !patientInfo) {
      return;
    }

    const trimmedAge = patientAgeInput.trim();
    const parsedAge = trimmedAge ? Number(trimmedAge) : NaN;
    if (!trimmedAge || !Number.isInteger(parsedAge) || parsedAge <= 0 || parsedAge > 149) {
      setPatientMetaError("Enter a valid age between 1 and 149.");
      return;
    }

    if (!patientGenderInput) {
      setPatientMetaError("Select gender.");
      return;
    }

    setPatientMetaSaving(true);
    setPatientMetaError("");

    try {
      const response = await fetch(`/api/patients/${patientInfo.patient_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appointment_id: Number(appointmentId),
          age: parsedAge,
          gender: patientGenderInput,
        }),
      });

      const data = (await response.json()) as {
        patient?: {
          age: number | null;
          gender: string | null;
        };
        error?: string;
      };

      if (!response.ok || !data.patient) {
        throw new Error(data.error || "Failed to update patient age and gender");
      }

      const nextGender = normalizePatientGender(data.patient.gender);
      setPatientAgeInput(
        data.patient.age && data.patient.age > 0 ? String(data.patient.age) : ""
      );
      setPatientGenderInput(nextGender);
      setContextData((current) =>
        current && current.context.patient
          ? {
              ...current,
              context: {
                ...current.context,
                patient: {
                  ...current.context.patient,
                  age: data.patient?.age ?? null,
                  gender: nextGender || null,
                },
              },
            }
          : current
      );
    } catch (saveError) {
      setPatientMetaError(
        toSafeUiErrorMessage(
          saveError,
          "Could not update age and gender right now. Please try again."
        )
      );
    } finally {
      setPatientMetaSaving(false);
    }
  }, [appointmentId, patientAgeInput, patientGenderInput, patientInfo]);

  const fetchClinicOptions = useCallback(async () => {
    setClinicOptionsLoading(true);
    setBookingError("");

    try {
      const response = await fetch("/api/clinics", { cache: "no-store" });
      const data = (await response.json()) as {
        clinics?: Array<{ clinic_id: number; clinic_name: string | null }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to load clinics");
      }

      const nextClinics = (data.clinics ?? []).map((clinic) => ({
        clinic_id: clinic.clinic_id,
        clinic_name: clinic.clinic_name,
      }));

      setClinicOptions(nextClinics);
      setBookingClinicId((current) => {
        if (current && nextClinics.some((clinic) => String(clinic.clinic_id) === current)) {
          return current;
        }

        const contextClinicId = contextData?.context.clinic?.clinic_id;
        if (
          contextClinicId &&
          nextClinics.some((clinic) => clinic.clinic_id === contextClinicId)
        ) {
          return String(contextClinicId);
        }

        return nextClinics[0] ? String(nextClinics[0].clinic_id) : "";
      });
    } catch (err) {
      setClinicOptions([]);
      setBookingError(
        toSafeUiErrorMessage(err, "Could not load clinics right now. Please try again.")
      );
    } finally {
      setClinicOptionsLoading(false);
    }
  }, [contextData?.context.clinic?.clinic_id]);

  const fetchAvailableBookingDates = useCallback(async () => {
    if (!alsoBookAppointment || !bookingClinicId) {
      setAvailableBookingDates([]);
      setBookingNotice("");
      return;
    }

    setBookingDatesLoading(true);
    setBookingError("");

    try {
      const params = new URLSearchParams({ clinicId: bookingClinicId });
      const response = await fetch(`/api/slots/available-dates?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        availableDates?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to load available follow-up dates");
      }

      const nextDates = Array.isArray(data.availableDates) ? data.availableDates : [];
      setAvailableBookingDates(nextDates);

      if (nextDates.length === 0) {
        setAvailableBookingSlots([]);
        setSelectedBookingSlot("");
        setBookingNotice("No slot-bearing follow-up dates are available for the selected clinic.");
        return;
      }

      const currentDate = editorState?.next_visit_date ?? "";
      if (!currentDate) {
        setBookingNotice("Select a follow-up date to see available time slots.");
        return;
      }

      if (!nextDates.includes(currentDate)) {
        setAvailableBookingSlots([]);
        setSelectedBookingSlot("");
        const nearestDate = getNextAvailableDate(currentDate, nextDates);
        if (quickFollowUpDays && nearestDate) {
          applyFollowUpDate(nearestDate);
        }
        setBookingNotice(
          nearestDate
            ? `Selected follow-up date has no available schedule. Nearest bookable date is ${formatAvailableDate(nearestDate)}.`
            : "Selected follow-up date has no available schedule for booking."
        );
      } else {
        setBookingNotice("");
      }
    } catch (err) {
      setAvailableBookingDates([]);
      setAvailableBookingSlots([]);
      setSelectedBookingSlot("");
      setBookingError(
        toSafeUiErrorMessage(
          err,
          "Could not load follow-up dates right now. Please try again."
        )
      );
    } finally {
      setBookingDatesLoading(false);
    }
  }, [alsoBookAppointment, applyFollowUpDate, bookingClinicId, editorState?.next_visit_date, quickFollowUpDays]);

  const fetchAvailableBookingSlots = useCallback(async () => {
    if (
      !alsoBookAppointment ||
      !bookingClinicId ||
      !editorState?.next_visit_date ||
      !availableBookingDates.includes(editorState.next_visit_date)
    ) {
      setAvailableBookingSlots([]);
      setSelectedBookingSlot("");
      return;
    }

    setBookingSlotsLoading(true);
    setBookingError("");

    try {
      const params = new URLSearchParams({
        clinicId: bookingClinicId,
        date: editorState.next_visit_date,
      });

      const response = await fetch(`/api/slots?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        slots?: string[];
        slot_duration?: number;
        error?: string;
        leaveBlocked?: boolean;
        leaveReason?: string | null;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to load follow-up time slots");
      }

      setAvailableBookingSlots(Array.isArray(data.slots) ? data.slots : []);
      setBookingSlotDuration(data.slot_duration || 30);
      setSelectedBookingSlot((current) =>
        data.slots?.includes(current) ? current : ""
      );

      if (data.leaveBlocked) {
        setBookingNotice(
          data.leaveReason
            ? `Doctor is unavailable on this date: ${data.leaveReason}`
            : "Doctor is unavailable on this date."
        );
      } else if (!data.slots || data.slots.length === 0) {
        setBookingNotice("No appointment slots are available on the selected follow-up date.");
      } else {
        setBookingNotice("");
      }
    } catch (err) {
      setAvailableBookingSlots([]);
      setSelectedBookingSlot("");
      setBookingError(
        toSafeUiErrorMessage(
          err,
          "Could not load follow-up time slots right now. Please try again."
        )
      );
    } finally {
      setBookingSlotsLoading(false);
    }
  }, [
    alsoBookAppointment,
    availableBookingDates,
    bookingClinicId,
    editorState?.next_visit_date,
  ]);

  const handleBookFollowUpAppointment = useCallback(async () => {
    if (!contextData?.context.patient || !editorState?.next_visit_date || !bookingClinicId || !selectedBookingSlot) {
      return;
    }

    const patientName = contextData.context.patient.full_name?.trim() ?? "";
    const patientPhone = contextData.context.patient.phone?.trim() ?? "";

    if (!patientName || !patientPhone) {
      setBookingError("Patient name and phone are required to book the follow-up appointment.");
      return;
    }

    setBookingSubmitting(true);
    setBookingError("");
    setBookingSuccess("");

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_phone: patientPhone,
          patient_name: patientName,
          booking_for: bookingFor,
          clinic_id: Number(bookingClinicId),
          appointment_date: editorState.next_visit_date,
          start_time: selectedBookingSlot,
          end_time: addMinutesToTimeString(selectedBookingSlot, bookingSlotDuration),
        }),
      });

      const data = (await response.json()) as {
        appointment_id?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to book follow-up appointment");
      }

      if (!data.appointment_id || !contextData?.draft?.id) {
        throw new Error("Follow-up appointment was created, but EMR could not link it.");
      }

      const followUpLinkResponse = await fetch(
        `/api/emr/appointments/${appointmentId}/follow-up-booking`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prescription_id: contextData.draft.id,
            follow_up_appointment_id: data.appointment_id,
          }),
        }
      );

      const followUpLinkData = (await followUpLinkResponse.json()) as {
        follow_up_appointment?: EmrFollowUpAppointmentSummary;
        error?: string;
      };

      if (!followUpLinkResponse.ok || !followUpLinkData.follow_up_appointment) {
        throw new Error(
          followUpLinkData.error ||
            "Follow-up appointment was booked, but EMR could not save the follow-up details."
        );
      }

      setBookedFollowUpSummary({
        ...followUpLinkData.follow_up_appointment,
      });
      setBookingSuccess(
        `Follow-up appointment booked for ${formatAvailableDate(editorState.next_visit_date)} at ${to12HourLabel(selectedBookingSlot)}.`
      );
      void fetchAvailableBookingSlots();
    } catch (err) {
      setBookingError(
        toSafeUiErrorMessage(
          err,
          "Could not book the follow-up appointment right now. Please try again."
        )
      );
    } finally {
      setBookingSubmitting(false);
    }
  }, [
    appointmentId,
    bookingClinicId,
    bookingFor,
    bookingSlotDuration,
    contextData?.context.patient,
    contextData?.draft?.id,
    editorState?.next_visit_date,
    fetchAvailableBookingSlots,
    selectedBookingSlot,
  ]);

  const loadDraftData = useCallback(
    async (targetPrescriptionId?: string | null) => {
      if (!appointmentId) return null;

      const query = targetPrescriptionId
        ? `?prescriptionId=${encodeURIComponent(targetPrescriptionId)}`
        : "";
      const res = await fetch(`/api/emr/appointments/${appointmentId}/draft${query}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as DraftContextResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load EMR draft");
      }

      setBookedFollowUpSummary(null);
      hydrateFromResponse(data);
      return data;
    },
    [appointmentId, hydrateFromResponse]
  );

  const createDraftData = useCallback(async () => {
    if (!appointmentId) return null;

    const res = await fetch(`/api/emr/appointments/${appointmentId}/draft`, {
      method: "POST",
    });
    const data = (await res.json()) as DraftContextResponse & { error?: string };

    if (!res.ok) {
      throw new Error(data?.error || "Failed to create EMR draft");
    }

    if (!data.draft) {
      throw new Error("Failed to create EMR draft");
    }

    setBookedFollowUpSummary(null);
    hydrateFromResponse(data);
    return data;
  }, [appointmentId, hydrateFromResponse]);

  const loadHistoryData = useCallback(async () => {
    if (!appointmentId) return;

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const res = await fetch(`/api/emr/appointments/${appointmentId}/history`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        history?: HistoryGroup[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Failed to load prescription history");
      }

      setHistoryGroups(data.history ?? []);
    } catch (err) {
      setHistoryError(
        toSafeUiErrorMessage(
          err,
          "Could not load prescription history right now. Please try again."
        )
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [appointmentId]);

  const handleCreatePrescription = useCallback(async () => {
    if (!appointmentId || creatingDraft) return;

    try {
      setCreatingDraft(true);
      setSaveState("saving");
      setSaveMessage("Creating draft...");
      await createDraftData();
      await loadHistoryData();
      router.replace(`/dashboard/doctor/appointments/${appointmentId}/pad`, {
        scroll: false,
      });
      setSaveState("saved");
      setSaveMessage("Draft created");
    } catch (err) {
      setSaveState("error");
      setSaveMessage(
        toSafeUiErrorMessage(
          err,
          "Could not create the prescription draft right now. Please try again."
        )
      );
    } finally {
      setCreatingDraft(false);
    }
  }, [appointmentId, createDraftData, creatingDraft, loadHistoryData, router]);

  const handleDiscardDraft = useCallback(
    async (prescriptionId: number) => {
      if (!appointmentId || discardingDraftId !== null) return;

      const confirmed = window.confirm(
        "Discard this draft prescription? It will be removed from active editing and marked cancelled."
      );
      if (!confirmed) return;

      try {
        setDiscardingDraftId(prescriptionId);
        setSaveState("saving");
        setSaveMessage("Discarding draft...");
        setRevisionError("");

        const res = await fetch(`/api/emr/appointments/${appointmentId}/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prescriptionId,
            reason: "Discarded from EMR pad",
          }),
        });
        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          throw new Error(data.error || "Failed to discard draft");
        }

        const isCurrentViewedDraft = contextData?.draft?.id === prescriptionId;
        await loadHistoryData();

        if (isCurrentViewedDraft || !prescriptionIdParam) {
          router.replace(`/dashboard/doctor/appointments/${appointmentId}/pad`, {
            scroll: false,
          });
          await loadDraftData(null);
        }

        setSaveState("saved");
        setSaveMessage("Draft discarded");
      } catch (err) {
        setSaveState("error");
        setSaveMessage(
          toSafeUiErrorMessage(err, "Could not discard the draft right now. Please try again.")
        );
      } finally {
        setDiscardingDraftId(null);
      }
    },
    [
      appointmentId,
      contextData?.draft?.id,
      discardingDraftId,
      loadDraftData,
      loadHistoryData,
      prescriptionIdParam,
      router,
    ]
  );

  useEffect(() => {
    if (!appointmentId) return;

    let active = true;
    const loadDraft = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await loadDraftData(prescriptionIdParam || null);

        if (!active) return;
        if (!data) {
          throw new Error("Failed to load EMR draft");
        }
      } catch (err) {
        if (!active) return;
        setError(
          toSafeUiErrorMessage(
            err,
            "Could not open the prescription pad right now. Please try again."
          )
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDraft();
    return () => {
      active = false;
    };
  }, [appointmentId, loadDraftData, prescriptionIdParam]);

  useEffect(() => {
    if (!alsoBookAppointment || clinicOptions.length > 0 || clinicOptionsLoading) return;
    void fetchClinicOptions();
  }, [alsoBookAppointment, clinicOptions.length, clinicOptionsLoading, fetchClinicOptions]);

  useEffect(() => {
    if (!alsoBookAppointment) {
      setAvailableBookingDates([]);
      setAvailableBookingSlots([]);
      setSelectedBookingSlot("");
      setBookingNotice("");
      setBookingError("");
      setBookingSuccess("");
      return;
    }

    void fetchAvailableBookingDates();
  }, [alsoBookAppointment, bookingClinicId, fetchAvailableBookingDates]);

  useEffect(() => {
    if (!alsoBookAppointment) return;
    void fetchAvailableBookingSlots();
  }, [alsoBookAppointment, editorState?.next_visit_date, fetchAvailableBookingSlots]);

  useEffect(() => {
    if (!appointmentId) return;

    let active = true;
    const loadHistory = async () => {
      try {
        if (!active) return;
        await loadHistoryData();
      } catch (err) {
        if (!active) return;
        setHistoryError(
          toSafeUiErrorMessage(
            err,
            "Could not load prescription history right now. Please try again."
          )
        );
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();
    return () => {
      active = false;
    };
  }, [appointmentId, loadHistoryData]);

  useLayoutEffect(() => {
    const container = historyStripRef.current;
    if (!container || historyLoading || historyGroups.length === 0) return;

    const scrollToLatest = () => {
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollLeft = maxScrollLeft;
      historyStripScrollLeftRef.current = maxScrollLeft;
      historyStripInitializedRef.current = true;
      updateHistoryStripNavigation();
    };

    const restoreScrollPosition = () => {
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const targetScrollLeft = Math.min(historyStripScrollLeftRef.current, maxScrollLeft);
      container.scrollLeft = targetScrollLeft;
      historyStripScrollLeftRef.current = targetScrollLeft;
      historyStripInitializedRef.current = true;
      updateHistoryStripNavigation();
    };

    const restoreStoredScrollPosition = () => {
      if (typeof window === "undefined") return false;

      try {
        const storedValue = window.sessionStorage.getItem(historyStripStorageKey);
        if (!storedValue) return false;

        const parsedValue = Number(storedValue);
        if (!Number.isFinite(parsedValue) || parsedValue < 0) return false;

        historyStripScrollLeftRef.current = parsedValue;
        restoreScrollPosition();
        return true;
      } catch {
        return false;
      }
    };

    if (historyStripInitializedRef.current) {
      restoreScrollPosition();
    } else if (!restoreStoredScrollPosition()) {
      scrollToLatest();
    }

    const firstFrame = window.requestAnimationFrame(() => {
      if (historyStripInitializedRef.current) {
        restoreScrollPosition();
        window.requestAnimationFrame(restoreScrollPosition);
      } else {
        scrollToLatest();
        window.requestAnimationFrame(scrollToLatest);
      }
    });
    const timeoutA = window.setTimeout(
      historyStripInitializedRef.current ? restoreScrollPosition : scrollToLatest,
      80
    );
    const timeoutB = window.setTimeout(
      historyStripInitializedRef.current ? restoreScrollPosition : scrollToLatest,
      220
    );

    const handleResize = () => {
      restoreScrollPosition();
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            restoreScrollPosition();
          })
        : null;

    resizeObserver?.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(timeoutA);
      window.clearTimeout(timeoutB);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [
    historyGroups,
    historyLoading,
    historyStripStorageKey,
    updateHistoryStripNavigation,
  ]);

  useEffect(() => {
    const container = historyStripRef.current;
    if (!container || historyLoading || orderedHistoryGroups.length === 0) {
      updateHistoryStripNavigation();
      return;
    }

    updateHistoryStripNavigation();

    const handleScroll = () => {
      historyStripScrollLeftRef.current = container.scrollLeft;
      try {
        window.sessionStorage.setItem(
          historyStripStorageKey,
          String(container.scrollLeft)
        );
      } catch {
        // Ignore storage failures and keep in-memory behavior.
      }
      updateHistoryStripNavigation();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [
    historyLoading,
    historyStripStorageKey,
    orderedHistoryGroups.length,
    updateHistoryStripNavigation,
  ]);

  useEffect(() => {
    if (!contextData?.context.doctor?.doctor_id) return;

    let active = true;
    const loadLayoutSettings = async () => {
      try {
        const query = contextData.context.clinic?.clinic_id
          ? `?clinicId=${contextData.context.clinic.clinic_id}`
          : "";
        const res = await fetch(`/api/emr/layout-settings${query}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { settings?: EmrLayoutSettings };
        if (!active || !res.ok || !data.settings) return;
        setLayoutSettings(data.settings);
      } catch {
        if (active) {
          setLayoutSettings(null);
        }
      }
    };

    void loadLayoutSettings();
    return () => {
      active = false;
    };
  }, [contextData?.context.clinic?.clinic_id, contextData?.context.doctor?.doctor_id]);

  useEffect(() => {
    latestStateRef.current = editorState;
    if (!contextData?.draft || !editorState || !hasHydratedRef.current || isReadOnly) return;

    const nextSerialized = serializePayload(contextData.draft, editorState);
    if (nextSerialized === lastSerializedRef.current) {
      dirtyRef.current = false;
      return;
    }

    dirtyRef.current = true;
  }, [contextData, editorState, isReadOnly]);

  useEffect(() => {
    let active = true;
    const loadComplaintSuggestions = async () => {
      if (
        activeComplaintSuggestionIndex === null ||
        debouncedComplaintQuery.trim().length < 1
      ) {
        setComplaintSuggestions([]);
        return;
      }

      try {
        setComplaintSuggestionLoading(true);
        const res = await fetch(
          `/api/suggestions/complaints?q=${encodeURIComponent(
            debouncedComplaintQuery.trim()
          )}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as { suggestions?: EmrMasterItem[] };
        if (!active) return;
        const nextSuggestions = data.suggestions ?? [];
        setComplaintSuggestions(nextSuggestions);

        if (activeComplaintSuggestionIndex !== null) {
          const normalizedQuery = normalizeMasterName(debouncedComplaintQuery);
          const exactSuggestion = nextSuggestions.find(
            (item) => normalizeMasterName(item.normalized_name || item.name) === normalizedQuery
          );

          if (exactSuggestion) {
            setEditorState((current) => {
              if (!current) return current;

              const row = current.complaints[activeComplaintSuggestionIndex];
              if (!row) return current;

              const currentNormalizedName = normalizeMasterName(row.name);
              if (
                !currentNormalizedName ||
                currentNormalizedName !== normalizedQuery ||
                row.complaint_master_id
              ) {
                return current;
              }

              return {
                ...current,
                complaints: current.complaints.map((complaint, index) =>
                  index === activeComplaintSuggestionIndex
                    ? applyComplaintSuggestionToRow(complaint, exactSuggestion)
                    : complaint
                ),
              };
            });
          }
        }
      } finally {
        if (active) setComplaintSuggestionLoading(false);
      }
    };

    void loadComplaintSuggestions();
    return () => {
      active = false;
    };
  }, [activeComplaintSuggestionIndex, debouncedComplaintQuery]);

  useEffect(() => {
    let active = true;
    const loadMedicineSuggestions = async () => {
      if (
        activeMedicineSuggestionIndex === null ||
        debouncedMedicineQuery.trim().length < 1
      ) {
        setMedicineSuggestions([]);
        return;
      }

      try {
        setMedicineSuggestionLoading(true);
        const res = await fetch(
          `/api/suggestions/medicines?q=${encodeURIComponent(
            debouncedMedicineQuery.trim()
          )}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as { suggestions?: EmrMasterItem[] };
        if (!active) return;
        const nextSuggestions = data.suggestions ?? [];
        setMedicineSuggestions(nextSuggestions);

        if (activeMedicineSuggestionIndex !== null) {
          const normalizedQuery = normalizeMasterName(debouncedMedicineQuery);
          const exactSuggestion = nextSuggestions.find(
            (item) => normalizeMasterName(item.normalized_name || item.name) === normalizedQuery
          );

          if (exactSuggestion) {
            setEditorState((current) => {
              if (!current) return current;

              const row = current.medicines[activeMedicineSuggestionIndex];
              if (!row) return current;

              const currentNormalizedName = normalizeMasterName(row.medicine_name);
              if (
                !currentNormalizedName ||
                currentNormalizedName !== normalizedQuery ||
                row.medicine_master_id
              ) {
                return current;
              }

              const duplicateSelection = current.medicines.some((medicine, index) => {
                if (index === activeMedicineSuggestionIndex) return false;
                return getMedicineIdentity(medicine) === exactSuggestion.id.toString();
              });

              if (duplicateSelection) {
                return current;
              }

              return {
                ...current,
                medicines: current.medicines.map((medicine, index) =>
                  index === activeMedicineSuggestionIndex
                    ? applyMedicineSuggestionToRow(medicine, exactSuggestion)
                    : medicine
                ),
              };
            });
          }
        }
      } finally {
        if (active) setMedicineSuggestionLoading(false);
      }
    };

    void loadMedicineSuggestions();
    return () => {
      active = false;
    };
  }, [activeMedicineSuggestionIndex, debouncedMedicineQuery]);

  const saveDraft = useCallback(async () => {
    if (!appointmentId || !contextData?.draft || !latestStateRef.current || isReadOnly) return;

    const payload = buildDraftPayload(contextData.draft, latestStateRef.current);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerializedRef.current) {
      dirtyRef.current = false;
      return;
    }

    if (inFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    if (queuedSaveTimerRef.current !== null) {
      window.clearTimeout(queuedSaveTimerRef.current);
      queuedSaveTimerRef.current = null;
    }

    inFlightRef.current = true;
    setSaveState("saving");
    setSaveMessage("Saving...");

    try {
      const res = await fetch(`/api/emr/appointments/${appointmentId}/draft`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: serialized,
      });
      const data = (await res.json()) as {
        draft?: EmrPrescriptionRecord;
        warnings?: EmrDraftWarning[];
        error?: string;
        save_state?: "saved" | "busy";
      };

      if (!res.ok || !data.draft) {
        throw new Error(data?.error || "Failed to autosave draft");
      }

        if (data.save_state === "busy") {
          setWarnings(data.warnings ?? []);
          dirtyRef.current = true;
          setSaveState("idle");
          setSaveMessage("Saving...");
          queuedSaveRef.current = true;
          return;
        }

      setContextData((current) =>
        current
          ? {
              ...current,
              draft: data.draft as EmrPrescriptionRecord,
            }
          : current
      );
      setWarnings(data.warnings ?? []);
      lastSerializedRef.current = serialized;
      dirtyRef.current = false;
      setSaveState("saved");
      setSaveMessage("Saved");
    } catch (err) {
      dirtyRef.current = true;
      setSaveState("error");
      setSaveMessage(
        toSafeUiErrorMessage(
          err,
          "Could not save the draft right now. Changes will retry automatically."
        )
      );
    } finally {
      inFlightRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        queuedSaveTimerRef.current = window.setTimeout(() => {
          queuedSaveTimerRef.current = null;
          if (dirtyRef.current) {
            void saveDraft();
          }
        }, 1200);
      }
    }
  }, [appointmentId, contextData, isReadOnly]);

  const handleFinalizePrescription = useCallback(async () => {
    if (
      !appointmentId ||
      !contextData?.draft ||
      !latestStateRef.current ||
      isReadOnly ||
      isFinalizing
    ) {
      return;
    }

    setIsFinalizing(true);
    setSaveState("saving");
    setSaveMessage("Saving before finalizing...");

    try {
      const payload = buildDraftPayload(contextData.draft, latestStateRef.current);
      const serialized = JSON.stringify(payload);

      const saveRes = await fetch(`/api/emr/appointments/${appointmentId}/draft`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: serialized,
      });
      const savedData = (await saveRes.json()) as {
        draft?: EmrPrescriptionRecord;
        warnings?: EmrDraftWarning[];
        error?: string;
      };

      if (!saveRes.ok || !savedData.draft) {
        throw new Error(savedData.error || "Failed to save draft before finalizing");
      }

      lastSerializedRef.current = serialized;
      dirtyRef.current = false;

      const finalizeRes = await fetch(
        `/api/emr/appointments/${appointmentId}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const finalizeData = (await finalizeRes.json()) as DraftContextResponse & {
        error?: string;
      };

      if (!finalizeRes.ok || !finalizeData.draft) {
        throw new Error(finalizeData.error || "Failed to finalize prescription");
      }

      hydrateFromResponse(finalizeData);
      setSaveState("saved");
      setSaveMessage("Finalized");
      router.replace(
        `/dashboard/doctor/appointments/${appointmentId}/pad?prescriptionId=${finalizeData.draft.id}`,
        { scroll: false }
      );
    } catch (err) {
      setSaveState("error");
      setSaveMessage(
        toSafeUiErrorMessage(
          err,
          "Could not finalize the prescription right now. Please try again."
        )
      );
    } finally {
      setIsFinalizing(false);
    }
  }, [
    appointmentId,
    contextData,
    hydrateFromResponse,
    isFinalizing,
    isReadOnly,
    router,
  ]);

  const handleCopyPreviousPrescription = useCallback(
    async (sourcePrescriptionId: number) => {
      if (!appointmentId || copyingPrescriptionId !== null) return;

      try {
        setCopyingPrescriptionId(sourcePrescriptionId);
        setSaveState("saving");
        setSaveMessage("Copying previous prescription...");

        const res = await fetch(
          `/api/emr/appointments/${appointmentId}/copy-previous`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sourcePrescriptionId }),
          }
        );
        const data = (await res.json()) as DraftContextResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error || "Failed to copy previous prescription");
        }

        hydrateFromResponse(data);
        setSaveState("saved");
        setSaveMessage("Previous prescription copied into current draft");
        router.replace(`/dashboard/doctor/appointments/${appointmentId}/pad`, {
          scroll: false,
        });
      } catch (err) {
        setSaveState("error");
        setSaveMessage(
          toSafeUiErrorMessage(
            err,
            "Could not copy the previous prescription right now. Please try again."
          )
        );
      } finally {
        setCopyingPrescriptionId(null);
      }
    },
    [appointmentId, copyingPrescriptionId, hydrateFromResponse, router]
  );

  const handleCreateRevisionDraft = useCallback(
    async (sourcePrescriptionId: number, editReason: string) => {
      if (!appointmentId || revisionSubmitting) return;

      try {
        setRevisionSubmitting(true);
        setRevisionError("");
        setSaveState("saving");
        setSaveMessage("Creating revision draft...");

        const res = await fetch(
          `/api/emr/appointments/${appointmentId}/revisions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sourcePrescriptionId,
              editReason,
            }),
          }
        );
        const data = (await res.json()) as DraftContextResponse & { error?: string };

        if (!res.ok) {
          throw new Error(data.error || "Failed to create prescription revision");
        }

        hydrateFromResponse(data);
        setSaveState("saved");
        setSaveMessage("Revision draft created");
        setRevisionReason("");
        setRevisionSourceId(null);
        router.replace(`/dashboard/doctor/appointments/${appointmentId}/pad`, {
          scroll: false,
        });
      } catch (err) {
        const message = toSafeUiErrorMessage(
          err,
          "Could not create the revision draft right now. Please try again."
        );
        setRevisionError(message);
        setSaveState("error");
        setSaveMessage(message);
      } finally {
        setRevisionSubmitting(false);
      }
    },
    [appointmentId, hydrateFromResponse, revisionSubmitting, router]
  );

  const visibleSectionOrder = layoutSettings
    ? layoutSettings.section_order_json.filter(
        (section) => layoutSettings.section_visibility_json[section]
      )
    : ([
        "vitals",
        "complaints",
        "diagnosis",
        "examination_findings",
        "investigation_findings",
        "past_medical_history",
        "family_history",
        "surgical_history",
        "treatment_history",
        "allergies",
        "personal_social_history",
        "medicines",
        "advice",
        "tests",
        "next_visit",
      ] as EmrLayoutSectionKey[]);
  const initialClinicalHistoryExpansion = useMemo(
    () => getInitialClinicalHistoryExpansionState(visibleSectionOrder),
    [visibleSectionOrder]
  );

  const visiblePadCustomFields = useMemo(
    () =>
      [...(layoutSettings?.custom_fields ?? [])]
        .filter((field) => field.show_in_pad !== false)
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)),
    [layoutSettings?.custom_fields]
  );
  const visiblePrintCustomFields = useMemo(
    () =>
      [...(layoutSettings?.custom_fields ?? [])]
        .filter((field) => field.show_in_print !== false)
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)),
    [layoutSettings?.custom_fields]
  );

  const printableSectionVisibility = layoutSettings?.print_visibility_json ?? null;

  useEffect(() => {
    if (!editorState || visiblePadCustomFields.length === 0) return;

    setEditorState((current) => {
      if (!current) return current;

      const nextValues = buildCustomFieldValues(current.custom_fields, visiblePadCustomFields);
      if (JSON.stringify(current.custom_fields) === JSON.stringify(nextValues)) {
        return current;
      }

      return {
        ...current,
        custom_fields: nextValues,
      };
    });
  }, [editorState, visiblePadCustomFields]);

  useEffect(() => {
    if (!editorState || clinicalHistoryDefaultsAppliedRef.current) return;

    setExpandedClinicalHistorySections(initialClinicalHistoryExpansion);
    clinicalHistoryDefaultsAppliedRef.current = true;
  }, [editorState, initialClinicalHistoryExpansion]);

  useEffect(() => {
    const pendingPrescriptionId = pendingHistoryScrollPrescriptionIdRef.current;
    if (!pendingPrescriptionId || contextData?.draft?.id !== pendingPrescriptionId) return;

    prescriptionContentRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    pendingHistoryScrollPrescriptionIdRef.current = null;
  }, [contextData?.draft?.id]);

  const focusNextVitalInput = useCallback((currentKey: VitalInputKey) => {
    const currentIndex = VITAL_INPUT_ORDER.indexOf(currentKey);
    if (currentIndex === -1) return;

    const nextKey = VITAL_INPUT_ORDER[currentIndex + 1];
    if (!nextKey) return;

    const nextInput = vitalInputRefs.current[nextKey];
    if (!nextInput) return;

    nextInput.focus();
    nextInput.select();
  }, []);

  const openPrescriptionFromHistory = useCallback(
    (prescriptionId: number) => {
      pendingHistoryScrollPrescriptionIdRef.current = prescriptionId;
      const currentScrollLeft = historyStripRef.current?.scrollLeft ?? 0;
      historyStripScrollLeftRef.current = currentScrollLeft;
      try {
        window.sessionStorage.setItem(
          historyStripStorageKey,
          String(currentScrollLeft)
        );
      } catch {
        // Ignore storage failures and fall back to in-memory behavior.
      }
      router.replace(
        `/dashboard/doctor/appointments/${appointmentId}/pad?prescriptionId=${prescriptionId}`,
        { scroll: false }
      );
    },
    [appointmentId, historyStripStorageKey, router]
  );

  const renderConfiguredSection = (section: EmrLayoutSectionKey) => {
    switch (section) {
      case "vitals":
        const bloodPressure = parseBloodPressure(editorState?.vitals.bp);
        return (
          <SectionCard key={section} title="Vitals">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-slate-700">
                <label className="order-2 flex items-center gap-2">
                  <span className="font-semibold text-slate-700">
                    BP
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      ref={(node) => {
                        vitalInputRefs.current.bp_systolic = node;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={bloodPressure.systolic}
                      onChange={(event) =>
                        updateBloodPressurePart("systolic", event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        focusNextVitalInput("bp_systolic");
                      }}
                      className="h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-center font-semibold text-slate-900 outline-none focus:border-indigo-400"
                      placeholder="120"
                    />
                    <span className="font-semibold text-slate-400">/</span>
                    <input
                      ref={(node) => {
                        vitalInputRefs.current.bp_diastolic = node;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={bloodPressure.diastolic}
                      onChange={(event) =>
                        updateBloodPressurePart("diastolic", event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        focusNextVitalInput("bp_diastolic");
                      }}
                      className="h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-center font-semibold text-slate-900 outline-none focus:border-indigo-400"
                      placeholder="80"
                    />
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      mmHg
                    </span>
                  </div>
                </label>
                {(
                  [
                    ["pulse", "Pulse", "bpm"],
                    ["spo2", "SpO2", "%"],
                    ["temperature", "Temp", "°F"],
                    ["height", "Height", "cm"],
                    ["weight", "Weight", "kg"],
                  ] as Array<[keyof DraftEditorState["vitals"], string, string]>
                ).map(([key, label, suffix]) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 ${
                      key === "pulse"
                        ? "order-1"
                        : key === "spo2"
                          ? "order-3"
                          : key === "temperature"
                            ? "order-4"
                            : key === "height"
                              ? "order-5"
                              : "order-6"
                    }`}
                  >
                    <span className="font-semibold text-slate-700">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={(node) => {
                          vitalInputRefs.current[key as Exclude<VitalInputKey, "bp_systolic" | "bp_diastolic">] =
                            node;
                        }}
                        type="text"
                        inputMode={key === "weight" ? "decimal" : "numeric"}
                        maxLength={
                          key === "weight"
                            ? 5
                            : key === "pulse" || key === "height" || key === "spo2"
                              ? 3
                              : undefined
                        }
                        value={editorState?.vitals[key] ?? ""}
                        onChange={(event) => updateVitalField(key, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          focusNextVitalInput(
                            key as Exclude<VitalInputKey, "bp_systolic" | "bp_diastolic">
                          );
                        }}
                        className="h-9 w-16 rounded-md border border-slate-200 bg-white px-2 text-center font-semibold text-slate-900 outline-none focus:border-indigo-400"
                      />
                      <span className="text-xs text-slate-500">{suffix}</span>
                    </div>
                  </label>
                ))}
                <p className="order-7 flex items-center gap-2 font-semibold text-slate-700">
                  BMI{" "}
                  <span className="font-bold text-slate-900">
                    {editorState?.vitals.bmi || "--"}
                  </span>{" "}
                  <span className="text-slate-500">kg/m2</span>
                </p>
              </div>
              <div className="hidden rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
                  Auto BMI
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {editorState?.vitals.bmi || "--"}
                    </p>
                    <p className="text-xs text-slate-500">kg/m² from height and weight</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Calculated
                  </span>
                </div>
              </div>
              <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Visit Snapshot
                </p>
                <div className="mt-2 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-900">Patient:</span>{" "}
                    {contextData?.context.patient?.full_name || "Patient"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Date:</span>{" "}
                    {contextData?.draft?.visit_date
                      ? new Date(contextData.draft.visit_date).toLocaleDateString("en-IN")
                      : "--"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Status:</span>{" "}
                    {contextData?.draft?.status || "--"}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        );
      case "complaints":
        return (
          <SectionCard key={section} title="Complaints">
            <div className="relative overflow-x-auto overflow-y-visible rounded-2xl border border-slate-200">
              <table className="min-w-[860px] w-full table-fixed overflow-visible">
                <thead className="bg-slate-100">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-900">
                    <th className="w-[34%] px-2 py-2">Complaint</th>
                    <th className="w-[18%] px-2 py-2">Severity</th>
                    <th className="w-[20%] px-2 py-2">Frequency</th>
                    <th className="w-[18%] px-2 py-2">Duration</th>
                    <th className="w-12 px-2 py-2 text-center">#</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {(editorState?.complaints ?? []).map((complaint, index) => (
                    <tr key={`complaint-${index}`} className="align-top">
                      <td className="px-2 py-2">
                        <div
                          ref={(element) => {
                            complaintAnchorRefs.current[index] = element;
                          }}
                          className="relative"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              ref={(element) => {
                                complaintNameInputRefs.current[index] = element;
                              }}
                              type="text"
                              value={complaint.name}
                              onFocus={() => setActiveComplaintSuggestionIndex(index)}
                              onBlur={() => {
                                window.setTimeout(
                                  () =>
                                    setActiveComplaintSuggestionIndex((current) =>
                                      current === index ? null : current
                                    ),
                                  150
                                );
                              }}
                              onChange={(event) =>
                                updateComplaintField(index, "name", event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  setActiveComplaintSuggestionIndex(null);
                                  focusComplaintRowField(index, "severity");
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs uppercase"
                              placeholder="Type complaint name to search"
                            />
                            {complaint.name?.trim() && !complaint.complaint_master_id ? (
                              <button
                                type="button"
                                onClick={() => setComplaintAddModalIndex(index)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                aria-label="Add complaint to master"
                                title="Add complaint"
                              >
                                <PlusCircle size={16} />
                              </button>
                            ) : null}
                          </div>
                          {activeComplaintSuggestionIndex === index && (
                            <SuggestionDropdown
                              suggestions={complaintSuggestions}
                              typedValue={complaint.name}
                              loading={complaintSuggestionLoading}
                              anchorElement={complaintAnchorRefs.current[index]}
                              onSelect={(item) => {
                                setEditorState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        complaints: current.complaints.map((row, rowIndex) =>
                                          rowIndex === index
                                            ? applyComplaintSuggestionToRow(row, item)
                                            : row
                                        ),
                                      }
                                    : current
                                );
                                setComplaintSuggestions([]);
                                setActiveComplaintSuggestionIndex(null);
                                focusComplaintRowField(index, "severity");
                              }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <FreeWriteSuggestionInput
                          inputRef={(element) => {
                            complaintSeverityInputRefs.current[index] = element;
                          }}
                          value={complaint.severity ?? ""}
                          suggestions={getSelectOptions(
                            COMPLAINT_SEVERITY_SUGGESTIONS,
                            complaint.severity
                          )}
                          placeholder="Severity"
                          ariaLabel="Complaint severity"
                          onChange={(value) => updateComplaintField(index, "severity", value)}
                          onAdvance={() => focusComplaintRowField(index, "frequency")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <FreeWriteSuggestionInput
                          inputRef={(element) => {
                            complaintFrequencyInputRefs.current[index] = element;
                          }}
                          value={complaint.frequency ?? ""}
                          suggestions={getSelectOptions(
                            COMPLAINT_FREQUENCY_SUGGESTIONS,
                            complaint.frequency
                          )}
                          placeholder="Frequency"
                          ariaLabel="Complaint frequency"
                          onChange={(value) => updateComplaintField(index, "frequency", value)}
                          onAdvance={() => focusComplaintRowField(index, "duration")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div
                          ref={(element) => {
                            complaintDurationAnchorRefs.current[index] = element;
                          }}
                          className="relative"
                        >
                          <input
                            ref={(element) => {
                              complaintDurationInputRefs.current[index] = element;
                            }}
                            type="number"
                            min={1}
                            step={1}
                            value={complaint.duration_value ?? ""}
                            onFocus={() => {
                              if (complaint.duration_value) {
                                setActiveComplaintDurationSuggestionIndex(index);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (["-", "+", "e", "E", "."].includes(event.key)) {
                                event.preventDefault();
                              }
                            }}
                            onBlur={() => {
                              window.setTimeout(
                                () =>
                                  setActiveComplaintDurationSuggestionIndex((current) =>
                                    current === index ? null : current
                                  ),
                                150
                              );
                            }}
                            onChange={(event) => {
                              const rawValue = event.target.value;
                              const nextValue = rawValue ? Math.max(1, Number(rawValue)) : null;
                              updateComplaintField(index, "duration_value", nextValue);
                              updateComplaintField(
                                index,
                                "duration_unit",
                                nextValue ? complaint.duration_unit : null
                              );
                              setActiveComplaintDurationSuggestionIndex(nextValue ? index : null);
                            }}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                            placeholder="1"
                          />
                          {activeComplaintDurationSuggestionIndex === index &&
                          complaint.duration_value ? (
                            typeof document !== "undefined"
                              ? createPortal(
                                  <div
                                    style={activeComplaintDurationPanelStyle}
                                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                                  >
                                    {buildDurationSuggestions(complaint.duration_value).map(
                                      (option) => (
                                        <button
                                          key={option.unit}
                                          type="button"
                                          onMouseDown={(event) => event.preventDefault()}
                                          onClick={() => {
                                            updateComplaintField(index, "duration_unit", option.unit);
                                            setActiveComplaintDurationSuggestionIndex(null);
                                          }}
                                          className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 last:border-b-0"
                                        >
                                          <span>{option.label}</span>
                                          {complaint.duration_unit === option.unit ? (
                                            <Check size={14} className="text-indigo-600" />
                                          ) : null}
                                        </button>
                                      )
                                    )}
                                  </div>,
                                  document.body
                                )
                              : null
                          ) : null}
                        </div>
                        {complaint.duration_value && complaint.duration_unit ? (
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {getDurationLabel(complaint.duration_value, complaint.duration_unit)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setEditorState((current) =>
                              current
                                ? {
                                    ...current,
                                    complaints:
                                      current.complaints.length === 1
                                        ? [{ ...EMPTY_COMPLAINT_ROW }]
                                        : current.complaints.filter((_, rowIndex) => rowIndex !== index),
                                  }
                                : current
                            )
                          }
                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                          title="Remove complaint row"
                          aria-label="Remove complaint row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditorState((current) =>
                  current
                    ? {
                        ...current,
                        complaints: [...current.complaints, { ...EMPTY_COMPLAINT_ROW }],
                      }
                    : current
                )
              }
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <Plus size={14} />
              Add Complaint Row
            </button>
            <AddMasterItemModal
              open={complaintAddModalIndex !== null}
              kind="complaints"
              initialName={
                complaintAddModalIndex === null
                  ? ""
                  : editorState?.complaints[complaintAddModalIndex]?.name || ""
              }
              onClose={() => setComplaintAddModalIndex(null)}
              onCreated={(item) => {
                if (complaintAddModalIndex === null) return;
                setEditorState((current) =>
                  current
                    ? {
                        ...current,
                        complaints: current.complaints.map((row, rowIndex) =>
                          rowIndex === complaintAddModalIndex
                            ? applyComplaintSuggestionToRow(row, item)
                            : row
                        ),
                      }
                    : current
                );
                setComplaintAddModalIndex(null);
              }}
            />
          </SectionCard>
        );
      case "diagnosis":
        return (
          <TagEditorSection
            key={section}
            title="Diagnosis"
            items={editorState?.diagnosis ?? []}
            onChange={(items) =>
              setEditorState((current) => (current ? { ...current, diagnosis: items } : current))
            }
            placeholder="Add diagnosis and press Enter"
            kind="diagnosis"
          />
        );
      case "examination_findings":
      case "investigation_findings":
      case "past_medical_history":
      case "family_history":
      case "surgical_history":
      case "treatment_history":
      case "allergies":
      case "personal_social_history":
        if (COLLAPSIBLE_CLINICAL_HISTORY_SECTIONS.includes(section)) {
          const isExpanded = expandedClinicalHistorySections[section] ?? false;

          if (!isExpanded) {
            return (
              <section
                key={`collapsed-${section}`}
                className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedClinicalHistorySections((current) => ({
                        ...current,
                        [section]: true,
                      }))
                    }
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
                  >
                    <Plus size={14} />
                    {CLINICAL_HISTORY_LABELS[section]}
                  </button>
                </div>
              </section>
            );
          }
        }

        return (
          <ClinicalHistorySection
            key={section}
            section={section}
            items={editorState?.clinical_history ?? []}
            onCollapse={() =>
              setExpandedClinicalHistorySections((current) => ({
                ...current,
                [section]: false,
              }))
            }
            onChange={(items) =>
              setEditorState((current) =>
                current ? { ...current, clinical_history: items } : current
              )
            }
          />
        );
      case "medicines":
        return (
          <SectionCard key={section} title="Medicines">
            <div className="relative overflow-x-auto overflow-y-visible rounded-2xl border border-slate-200">
              <table className="min-w-[1040px] w-full table-fixed overflow-visible">
                <thead className="bg-slate-100">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-900">
                    <th className="w-16 px-2 py-3">Type</th>
                    <th className="w-[26%] px-2 py-3">Medicine</th>
                    <th className="w-44 px-2 py-3">Dose</th>
                    <th className="w-36 px-2 py-3">When</th>
                    <th className="w-32 px-2 py-3">Frequency</th>
                    <th className="w-24 px-2 py-3">Duration</th>
                    <th className="w-32 px-2 py-3">Notes / Instructions</th>
                    <th className="w-12 px-2 py-3 text-center">#</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {(editorState?.medicines ?? []).map((medicine, index) => {
                    const isUnresolvedMedicine =
                      Boolean(medicine.medicine_name?.trim()) && !isMedicineResolved(medicine);
                    const isDuplicateMedicine = isDuplicateMedicineInDraft(index, medicine);
                    const doseMode = doseModes[index] ?? getDoseModeFromValue(medicine.dose);
                    const doseOptions = getSelectOptions(
                      getDoseSuggestionsForMode(doseMode),
                      medicine.dose
                    );
                    const filteredMedicineSuggestions = medicineSuggestions.filter((item) => {
                      const suggestionIdentity =
                        item.id?.toString() || item.normalized_name || normalizeMasterName(item.name);

                      return !(editorState?.medicines ?? []).some((row, rowIndex) => {
                        if (rowIndex === index) return false;
                        return getMedicineIdentity(row) === suggestionIdentity;
                      });
                    });

                    return (
                    <tr
                      key={`medicine-${index}`}
                      className={`align-top ${
                        isUnresolvedMedicine || isDuplicateMedicine ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="px-2 py-3">
                        <input
                          type="text"
                          value={medicine.type ?? ""}
                          onChange={(event) => updateMedicineField(index, "type", event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs uppercase"
                          placeholder="TAB."
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div
                          ref={(element) => {
                            medicineAnchorRefs.current[index] = element;
                          }}
                          className="relative"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              ref={(element) => {
                                medicineNameInputRefs.current[index] = element;
                              }}
                              type="text"
                              value={medicine.medicine_name}
                              onFocus={() => setActiveMedicineSuggestionIndex(index)}
                              onBlur={() => {
                                window.setTimeout(
                                  () => setActiveMedicineSuggestionIndex((current) => (current === index ? null : current)),
                                  150
                                );
                              }}
                              onChange={(event) => updateMedicineField(index, "medicine_name", event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  setActiveMedicineSuggestionIndex(null);
                                  focusMedicineRowField(index, "dose");
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs uppercase"
                              placeholder="Type medicine name to search"
                            />
                            {isUnresolvedMedicine && !isDuplicateMedicine ? (
                              <button
                                type="button"
                                onClick={() => setMedicineAddModalIndex(index)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                aria-label="Add new medicine details"
                                title="Add medicine"
                              >
                                <PlusCircle size={16} />
                              </button>
                            ) : null}
                          </div>
                          {activeMedicineSuggestionIndex === index && (
                            <SuggestionDropdown
                              suggestions={filteredMedicineSuggestions}
                              typedValue={medicine.medicine_name}
                              loading={medicineSuggestionLoading}
                              anchorElement={medicineAnchorRefs.current[index]}
                              onSelect={(item) => {
                                const duplicateSelection =
                                  (editorState?.medicines ?? []).some((row, rowIndex) => {
                                    if (rowIndex === index) return false;
                                    return getMedicineIdentity(row) === item.id?.toString();
                                  });

                                if (duplicateSelection) {
                                  setSaveState("error");
                                  setSaveMessage("This medicine is already added in another row.");
                                  setActiveMedicineSuggestionIndex(null);
                                  return;
                                }
                                setEditorState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        medicines: current.medicines.map((row, rowIndex) =>
                                          rowIndex === index
                                            ? applyMedicineSuggestionToRow(row, item)
                                            : row
                                        ),
                                      }
                                    : current
                                );
                                setMedicineSuggestions([]);
                                setActiveMedicineSuggestionIndex(null);
                                focusMedicineRowField(index, "dose");
                              }}
                            />
                          )}
                        </div>
                        {isMedicineResolved(medicine) && medicine.salt_composition?.trim() ? (
                          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            ({medicine.salt_composition.trim()})
                          </p>
                        ) : (
                          <p className="hidden mt-2 text-xs uppercase text-slate-400">
                            Search medicine by name. If it does not exist, use “+ Add” and enter salt composition, strength, and type once.
                          </p>
                        )}
                        {isDuplicateMedicine ? (
                          <p className="mt-2 text-xs font-medium text-amber-700">
                            This medicine is already added in another row.
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={doseMode}
                            onChange={(event) => {
                              const nextMode = event.target.value as DoseMode;
                              setDoseModes((current) => ({ ...current, [index]: nextMode }));
                              const nextDose = transformDoseForMode(medicine.dose, nextMode);
                              if (nextDose !== (medicine.dose ?? "")) {
                                updateMedicineField(index, "dose", nextDose);
                              }
                            }}
                            className="w-12 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-2 text-[10px] font-medium text-slate-500"
                            aria-label="Dose mode"
                            title="Dose mode"
                          >
                            <option value="full">F</option>
                            <option value="half">H</option>
                          </select>
                          <div className="min-w-0 flex-1">
                            <FreeWriteSuggestionInput
                              inputRef={(element) => {
                                doseInputRefs.current[index] = element;
                              }}
                              value={medicine.dose ?? ""}
                              suggestions={doseOptions}
                              placeholder="Dose"
                              ariaLabel="Dose"
                              onChange={(value) => updateMedicineField(index, "dose", value)}
                              onCommit={formatDoseInput}
                              onAdvance={() => focusMedicineRowField(index, "timing")}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <FreeWriteSuggestionInput
                          inputRef={(element) => {
                            timingInputRefs.current[index] = element;
                          }}
                          value={medicine.timing ?? ""}
                          suggestions={getSelectOptions(TIMING_SUGGESTIONS, medicine.timing)}
                          placeholder="When"
                          ariaLabel="When"
                          onChange={(value) => updateMedicineField(index, "timing", value)}
                          onAdvance={() => focusMedicineRowField(index, "frequency")}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <FreeWriteSuggestionInput
                          inputRef={(element) => {
                            frequencyInputRefs.current[index] = element;
                          }}
                          value={medicine.frequency ?? ""}
                          suggestions={getSelectOptions(FREQUENCY_SUGGESTIONS, medicine.frequency)}
                          placeholder="Frequency"
                          ariaLabel="Frequency"
                          onChange={(value) => updateMedicineField(index, "frequency", value)}
                          onAdvance={() => focusMedicineRowField(index, "duration")}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div
                          ref={(element) => {
                            durationAnchorRefs.current[index] = element;
                          }}
                          className="relative"
                        >
                          <input
                            ref={(element) => {
                              durationInputRefs.current[index] = element;
                            }}
                            type="number"
                            min={1}
                            step={1}
                            value={medicine.duration_value ?? ""}
                            onFocus={() => {
                              if (medicine.duration_value) {
                                setActiveDurationSuggestionIndex(index);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (["-", "+", "e", "E", "."].includes(event.key)) {
                                event.preventDefault();
                              }
                            }}
                            onBlur={() => {
                              window.setTimeout(
                                () => setActiveDurationSuggestionIndex((current) => (current === index ? null : current)),
                                150
                              );
                            }}
                            onChange={(event) => {
                              const rawValue = event.target.value;
                              const nextValue = rawValue ? Math.max(1, Number(rawValue)) : null;
                              updateMedicineField(index, "duration_value", nextValue);
                              updateMedicineField(index, "duration_unit", nextValue ? medicine.duration_unit : null);
                              setActiveDurationSuggestionIndex(nextValue ? index : null);
                            }}
                            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                            placeholder="1"
                          />
                          {activeDurationSuggestionIndex === index && medicine.duration_value ? (
                            typeof document !== "undefined"
                              ? createPortal(
                                  <div
                                    style={activeDurationPanelStyle}
                                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                                  >
                                    {buildDurationSuggestions(medicine.duration_value).map((option) => (
                                      <button
                                        key={option.unit}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          updateMedicineField(index, "duration_unit", option.unit);
                                          setActiveDurationSuggestionIndex(null);
                                        }}
                                        className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 last:border-b-0"
                                      >
                                        <span>{option.label}</span>
                                        {medicine.duration_unit === option.unit ? (
                                          <Check size={14} className="text-indigo-600" />
                                        ) : null}
                                      </button>
                                    ))}
                                  </div>,
                                  document.body
                                )
                              : null
                          ) : null}
                        </div>
                        {medicine.duration_value && medicine.duration_unit ? (
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {getDurationLabel(medicine.duration_value, medicine.duration_unit)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <input
                          type="text"
                          value={medicine.notes ?? ""}
                          onChange={(event) => updateMedicineField(index, "notes", event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                          placeholder="Notes"
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setEditorState((current) =>
                              current
                                ? {
                                    ...current,
                                    medicines:
                                      current.medicines.length === 1
                                        ? [{ ...EMPTY_MEDICINE_ROW }]
                                        : current.medicines.filter((_, rowIndex) => rowIndex !== index),
                                  }
                                : current
                            )
                          }
                          className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100"
                          title="Remove medicine row"
                          aria-label="Remove medicine row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditorState((current) =>
                  current
                    ? {
                        ...current,
                        medicines: [...current.medicines, { ...EMPTY_MEDICINE_ROW }],
                      }
                    : current
                )
              }
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <Plus size={14} />
              Add Medicine Row
            </button>
          </SectionCard>
        );
      case "advice":
        return (
          <TagEditorSection
            key={section}
            title="Advice"
            items={editorState?.advice ?? []}
            onChange={(items) =>
              setEditorState((current) => (current ? { ...current, advice: items } : current))
            }
            placeholder="Add advice and press Enter"
            kind="advice"
          />
        );
      case "tests":
        return (
          <TagEditorSection
            key={section}
            title="Tests Requested"
            items={editorState?.tests ?? []}
            onChange={(items) =>
              setEditorState((current) => (current ? { ...current, tests: items } : current))
            }
            placeholder="Add test and press Enter"
            kind="tests"
          />
        );
      case "next_visit":
        return (
          <SectionCard key={section} title="Next Visit">
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={alsoBookAppointment}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAlsoBookAppointment(checked);
                    setBookingError("");
                    setBookingSuccess("");
                    setSelectedBookingSlot("");
                    if (!checked) {
                      setBookingNotice("");
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Also book appointment
              </label>
              <div className="grid gap-4 md:grid-cols-[220px_220px] md:items-start">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Follow-up date</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                  value={nextVisitInputValue}
                  onChange={(event) => {
                    setNextVisitInputValue(formatDateInputDraft(event.target.value));
                  }}
                  onBlur={() => {
                    const normalizedDate = normalizeFollowUpDateInput(nextVisitInputValue);
                    if (!nextVisitInputValue.trim()) {
                      applyFollowUpDate("", { clearQuickSelection: true });
                      setBookingNotice("");
                      return;
                    }

                    if (!normalizedDate) {
                      setNextVisitInputValue(formatDateDdMmYyyy(editorState?.next_visit_date));
                      return;
                    }

                    applyFollowUpDate(normalizedDate, { clearQuickSelection: true });
                    if (
                      alsoBookAppointment &&
                      availableBookingDates.length > 0 &&
                      !availableBookingDates.includes(normalizedDate)
                    ) {
                      const nearestDate = getNextAvailableDate(
                        normalizedDate,
                        availableBookingDates
                      );
                      setBookingNotice(
                        nearestDate
                          ? `Selected date has no schedule. Nearest bookable date is ${formatAvailableDate(nearestDate)}.`
                          : "Selected date has no schedule for booking."
                      );
                    } else {
                      setBookingNotice("");
                    }
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Quick follow-up</span>
                <select
                  value={quickFollowUpDays}
                  onChange={(event) => {
                    const selectedValue = event.target.value;
                    setQuickFollowUpDays(selectedValue);
                    setSelectedBookingSlot("");
                    setBookingSuccess("");
                    setBookingError("");
                    const selectedDays = Number(selectedValue);
                    if (!selectedDays) {
                      return;
                    }

                    const baseDate = buildQuickFollowUpBaseDate({
                      visitDate: contextData?.draft?.visit_date,
                      appointmentDate:
                        contextData?.context.appointment.appointment_date,
                    });
                    baseDate.setUTCDate(baseDate.getUTCDate() + selectedDays);
                    const computedDate = baseDate.toISOString().slice(0, 10);
                    if (alsoBookAppointment && availableBookingDates.length > 0) {
                      const resolvedDate = getNextAvailableDate(
                        computedDate,
                        availableBookingDates
                      );
                      if (resolvedDate) {
                        applyFollowUpDate(resolvedDate);
                        setBookingNotice(
                          resolvedDate === computedDate
                            ? ""
                            : `Quick follow-up moved to the nearest bookable date: ${formatAvailableDate(resolvedDate)}.`
                        );
                        return;
                      }

                      setBookingNotice(
                        "No bookable slot dates are available for this quick follow-up option."
                      );
                    }

                    applyFollowUpDate(computedDate);
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">Select quick follow-up</option>
                  {QUICK_FOLLOW_UP_OPTIONS.map((option) => (
                    <option key={option.label} value={option.days}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
              {alsoBookAppointment ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <div className="grid gap-4 md:grid-cols-[220px_220px_220px]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-500">Clinic</span>
                      <select
                        value={bookingClinicId}
                        onChange={(event) => {
                          setBookingClinicId(event.target.value);
                          setSelectedBookingSlot("");
                          setBookingNotice("");
                          setBookingError("");
                          setBookingSuccess("");
                        }}
                        disabled={clinicOptionsLoading}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      >
                        <option value="">
                          {clinicOptionsLoading ? "Loading clinics..." : "Select clinic"}
                        </option>
                        {clinicOptions.map((clinic) => (
                          <option key={clinic.clinic_id} value={clinic.clinic_id}>
                            {clinic.clinic_name || `Clinic #${clinic.clinic_id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-500">Available slot date</span>
                      <select
                        value={editorState?.next_visit_date ?? ""}
                        onChange={(event) => applyFollowUpDate(event.target.value, { clearQuickSelection: true })}
                        disabled={!bookingClinicId || bookingDatesLoading || availableBookingDates.length === 0}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      >
                        <option value="">
                          {bookingDatesLoading
                            ? "Loading dates..."
                            : availableBookingDates.length > 0
                              ? "Select slot date"
                              : "No slot dates"}
                        </option>
                        {availableBookingDates.map((value) => (
                          <option key={value} value={value}>
                            {formatAvailableDate(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-500">Available slot</span>
                      <select
                        value={selectedBookingSlot}
                        onChange={(event) => {
                          setSelectedBookingSlot(event.target.value);
                          setBookingError("");
                          setBookingSuccess("");
                        }}
                        disabled={!hasBookableFollowUpDate || bookingSlotsLoading || availableBookingSlots.length === 0}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      >
                        <option value="">
                          {bookingSlotsLoading
                            ? "Loading slots..."
                            : availableBookingSlots.length > 0
                              ? "Select slot"
                              : "No slots"}
                        </option>
                        {availableBookingSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {to12HourLabel(slot)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleBookFollowUpAppointment()}
                      disabled={
                        bookingSubmitting ||
                        !bookingClinicId ||
                        !hasBookableFollowUpDate ||
                        !selectedBookingSlot
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bookingSubmitting ? <Loader2 className="animate-spin" size={14} /> : <PlusCircle size={14} />}
                      Book appointment
                    </button>
                    {bookingNotice ? (
                      <p className="text-xs text-amber-700">{bookingNotice}</p>
                    ) : null}
                    {bookingError ? (
                      <p className="text-xs text-red-600">{bookingError}</p>
                    ) : null}
                    {bookingSuccess ? (
                      <p className="text-xs text-emerald-700">{bookingSuccess}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        );
      default:
        return null;
    }
  };

  const renderFinalizedSummarySection = (section: EmrLayoutSectionKey) => {
    if (!editorState || !printableSectionVisibility) return null;

    switch (section) {
      case "vitals":
        return printableSectionVisibility.vitals &&
          getVitalsSummaryEntries(editorState.vitals).length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Vitals</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {getVitalsSummaryEntries(editorState.vitals).map((entry) => (
                <span key={entry.key} className="whitespace-nowrap">
                  <span className="font-semibold uppercase text-gray-500">{entry.key}</span>{" "}
                  <span className="font-medium text-gray-900">{entry.value}</span>
                  {entry.unit ? (
                    <span className="ml-1 text-xs text-gray-500">{entry.unit}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null;
      case "complaints": {
        const complaintDisplayMode =
          layoutSettings?.complaint_display_mode ?? "paired_grid";
        const printableComplaints = getPrintableComplaints(
          editorState.complaints,
          complaintDisplayMode
        );
        return printableSectionVisibility.complaints && editorState.complaints.length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Complaints</p>
            {complaintDisplayMode === "classic_inline" ? (
              <p className="mt-1 text-sm text-gray-700">
                {printableComplaints.join(", ")}
              </p>
            ) : complaintDisplayMode === "single_line_stacked" ? (
              <PrintableComplaintStack
                className="mt-1"
                complaints={editorState.complaints}
              />
            ) : (
              <PrintableComplaintGrid className="mt-1" complaints={editorState.complaints} />
            )}
          </div>
        ) : null;
      }
      case "diagnosis":
        return printableSectionVisibility.diagnosis && editorState.diagnosis.length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Diagnosis</p>
            <p className="mt-1 text-sm text-gray-700">{toUpperListDisplay(editorState.diagnosis)}</p>
          </div>
        ) : null;
      case "medicines":
        return printableSectionVisibility.medicines && editorState.medicines.length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Medicines</p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-900">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Dose</th>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Frequency</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {editorState.medicines.map((medicine, index) => (
                    <tr key={`final-summary-${index}`} className="align-top text-sm text-gray-700">
                      <td className="px-3 py-2">{toUpperDisplayValue(medicine.type)}</td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-900">
                          {[medicine.medicine_name?.trim(), medicine.strength?.trim()]
                            .filter(Boolean)
                            .join(" ")
                            .toUpperCase() || "-"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {toUpperDisplayValue(medicine.salt_composition)}
                        </p>
                      </td>
                      <td className="px-3 py-2">{toUpperDisplayValue(medicine.dose)}</td>
                      <td className="px-3 py-2">{toUpperDisplayValue(medicine.timing)}</td>
                      <td className="px-3 py-2">{toUpperDisplayValue(medicine.frequency)}</td>
                      <td className="px-3 py-2">
                        {toUpperDisplayValue(
                          medicine.duration_text ||
                            (medicine.duration_value && medicine.duration_unit
                              ? getDurationLabel(medicine.duration_value, medicine.duration_unit)
                              : "")
                        )}
                      </td>
                      <td className="px-3 py-2">{toUpperDisplayValue(medicine.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null;
      case "advice":
        return printableSectionVisibility.advice && editorState.advice.length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Advice</p>
            <p className="mt-1 text-sm text-gray-700">{toUpperListDisplay(editorState.advice)}</p>
          </div>
        ) : null;
      case "tests":
        return printableSectionVisibility.tests && editorState.tests.length > 0 ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Tests Requested</p>
            <p className="mt-1 text-sm text-gray-700">{toUpperListDisplay(editorState.tests)}</p>
          </div>
        ) : null;
      case "next_visit":
        return printableSectionVisibility.next_visit &&
          finalizedNextVisitSummary !== "NOT SCHEDULED" ? (
          <div key={`summary-${section}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Next Visit</p>
            <p className="mt-1 text-sm text-gray-700">{toUpperText(finalizedNextVisitSummary)}</p>
          </div>
        ) : null;
      default:
        if (isClinicalHistorySection(section)) {
          const displayValue = toUpperClinicalHistoryDisplay(editorState.clinical_history, section);
          if (!printableSectionVisibility[section] || !displayValue) return null;

          return (
            <div key={`summary-${section}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                {CLINICAL_HISTORY_LABELS[section]}
              </p>
              <p className="mt-1 text-sm text-gray-700">{displayValue}</p>
            </div>
          );
        }

        return null;
    }
  };

  useEffect(() => {
    if (!contextData || !editorState || !dirtyRef.current || isReadOnly) return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [contextData, editorState, isReadOnly, saveDraft]);

  useEffect(() => {
    if (isReadOnly) return;
    const interval = window.setInterval(() => {
      if (!dirtyRef.current || inFlightRef.current || queuedSaveTimerRef.current !== null) return;
      void saveDraft();
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isReadOnly, saveDraft]);

  useEffect(() => {
    return () => {
      if (queuedSaveTimerRef.current !== null) {
        window.clearTimeout(queuedSaveTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">
            Loading prescription...
          </p>
        </div>
      </div>
    );
  }

  if (error || !contextData) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5" size={20} />
            <div>
              <p className="font-semibold">Unable to open prescription</p>
              <p className="mt-1 text-sm">{error || "Unable to load prescription"}</p>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard/doctor/appointments"
          className="inline-flex rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to appointments
        </Link>
      </div>
    );
  }

  const activeDraft = contextData.draft;

  return (
    <div className="mx-auto max-w-[1440px] space-y-4">
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              <Stethoscope size={14} />
              {hasActiveDraft ? (isReadOnly ? "Final Prescription" : "Draft") : "No Active Draft"}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Prescription for{" "}
              {contextData.context.patient?.full_name || "Patient"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                saveState === "saved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : saveState === "saving"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : saveState === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              <Save size={14} />
              {saveMessage || (hasActiveDraft ? "Not saved yet" : "Draft not started")}
            </div>
            {hasActiveDraft && !isReadOnly && activeDraft ? (
              <>
                <button
                  type="button"
                  disabled={discardingDraftId === activeDraft.id}
                  onClick={() => void handleDiscardDraft(activeDraft.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {discardingDraftId === activeDraft.id ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {discardingDraftId === activeDraft.id ? "Discarding..." : "Discard Draft"}
                </button>
                <button
                  type="button"
                  disabled={isFinalizing}
                  onClick={() => setShowFinalizeConfirm(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinalizing ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  {isFinalizing ? "Finalizing..." : "Finalize Prescription"}
                </button>
              </>
            ) : hasActiveDraft && activeDraft ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleCreatePrescription()}
                  disabled={creatingDraft}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingDraft ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  {creatingDraft ? "Creating..." : "Create Prescription"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionError("");
                    setRevisionReason(activeDraft.edit_reason ?? "");
                    setRevisionSourceId(activeDraft.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
                >
                  <PencilLine size={16} />
                  Edit as Revision
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `/dashboard/doctor/prescriptions/${activeDraft.id}/print`,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  <FileText size={16} />
                  Print View
                </button>
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <Check size={16} />
                  Finalized and read-only
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleCreatePrescription()}
                disabled={creatingDraft}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingDraft ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                {creatingDraft ? "Creating..." : "Create Prescription"}
              </button>
            )}
            <Link
              href="/dashboard/doctor/appointments"
              className="inline-flex rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to appointments
            </Link>
            {prescriptionIdParam ? (
              <button
                type="button"
                onClick={() =>
                  router.replace(`/dashboard/doctor/appointments/${appointmentId}/pad`, {
                    scroll: false,
                  })
                }
                className="inline-flex rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Open current draft
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Doctor
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            Dr. {contextData.context.doctor?.doctor_name || "Doctor"}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Patient
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {formatPatientNameWithMeta(contextData.context.patient)}
          </p>
          {!patientHasCompleteDemographics && patientInfo ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={patientAgeInput}
                onChange={(event) => {
                  setPatientAgeInput(event.target.value.replace(/[^\d]/g, "").slice(0, 3));
                  if (patientMetaError) {
                    setPatientMetaError("");
                  }
                }}
                placeholder="Age"
                className="h-8 w-16 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-800 outline-none focus:border-indigo-400"
              />
              <select
                value={patientGenderInput}
                onChange={(event) => {
                  setPatientGenderInput(event.target.value as PatientGenderValue | "");
                  if (patientMetaError) {
                    setPatientMetaError("");
                  }
                }}
                className="h-8 rounded-md border border-gray-200 px-2 pr-7 text-xs font-medium text-gray-800 outline-none focus:border-indigo-400"
              >
                <option value="">Gender</option>
                {PATIENT_GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.shortLabel}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleSavePatientDemographics()}
                disabled={patientMetaSaving}
                title="Save patient age and gender"
                aria-label="Save patient age and gender"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {patientMetaSaving ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <Save size={13} />
                )}
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-gray-500">
            {contextData.context.patient?.phone || "Phone not available"}
          </p>
          {patientMetaError ? (
            <p className="mt-1 text-[11px] font-medium text-red-600">{patientMetaError}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Clinic
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {contextData.context.clinic?.clinic_name || "Clinic not set"}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Last Saved
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {activeDraft ? formatEmrDateTime(activeDraft.last_saved_at) ?? "Not saved yet" : "No active draft"}
          </p>
        </div>
      </div>

      <SectionCard title="Past Prescriptions">
        <div className="space-y-3">
          {historyLoading ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
              Loading prescription history...
            </div>
          ) : historyError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {historyError}
            </div>
          ) : historyGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-5 text-sm text-gray-500">
              No previous prescriptions found.
            </div>
          ) : (
            <>
            <div ref={historyStripRef} className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-start gap-6">
                {orderedHistoryGroups.map((group, groupIndex) => (
                    <div
                      key={group.date}
                      ref={(element) => {
                        historyGroupRefs.current[groupIndex] = element;
                      }}
                      className="flex shrink-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
                    >
                      <div className="space-y-1 px-1">
                        <p className="text-sm font-bold text-gray-900">
                          {new Date(`${group.date}T00:00:00`).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          {group.items.length} prescription{group.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        {[...group.items]
                          .sort((left, right) => {
                            const leftTime = left.finalized_at ?? left.updated_at ?? left.created_at;
                            const rightTime = right.finalized_at ?? right.updated_at ?? right.created_at;
                            return new Date(leftTime).getTime() - new Date(rightTime).getTime();
                          })
                          .map((item) => {
                          const isCurrentViewed = contextData?.draft?.id === item.id;
                          const isCopying = copyingPrescriptionId === item.id;
                          const canCopy = item.status === "final";
                          const draftSequence =
                            item.status === "draft"
                              ? group.items
                                  .slice(0, group.items.findIndex((entry) => entry.id === item.id) + 1)
                                  .filter((entry) => entry.status === "draft").length
                              : null;
                          const badgeLabel =
                            item.status === "draft" && draftSequence
                              ? `Draft ${draftSequence}`
                              : item.status;
                          const historyTimeLabel = item.finalized_at
                            ? `Finalized ${formatHistoryTimestamp(item.finalized_at) || ""}`.trim()
                            : item.updated_at
                              ? `Saved ${formatHistoryTimestamp(item.updated_at) || ""}`.trim()
                              : item.created_at
                                ? `Created ${formatHistoryTimestamp(item.created_at) || ""}`.trim()
                                : null;
                          const followUpLabel = formatFollowUpAppointmentSummary(
                            item.follow_up_appointment
                          );
                          const previewText =
                            item.status === "final"
                              ? "Final prescription snapshot"
                              : "Current draft snapshot";

                          return (
                            <div
                              key={item.id}
                              className={`w-[250px] shrink-0 rounded-2xl border p-3 transition-colors ${
                                isCurrentViewed
                                  ? "border-indigo-300 bg-indigo-50/70 shadow-sm"
                                  : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => openPrescriptionFromHistory(item.id)}
                                disabled={isCurrentViewed}
                                className="w-full text-left disabled:cursor-not-allowed"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                      item.status === "final"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {badgeLabel}
                                  </span>
                                  {isCurrentViewed ? (
                                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                                      Open
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm font-semibold text-gray-900">
                                  Visit {new Date(item.visit_date).toLocaleDateString("en-IN")}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-500">
                                  {historyTimeLabel || "Timeline unavailable"} | V{item.version_number}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-500">
                                  {item.previous_version_id ? "Revision entry" : previewText}
                                  {item.edit_reason ? ` | ${item.edit_reason}` : ""}
                                </p>
                                {followUpLabel ? (
                                  <p className="mt-1 text-[11px] font-medium text-indigo-700">
                                    Follow-up {followUpLabel}
                                  </p>
                                ) : null}
                              </button>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openPrescriptionFromHistory(item.id)}
                                  disabled={isCurrentViewed}
                                  title="View prescription"
                                  aria-label="View prescription"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Eye size={12} />
                                </button>
                                {item.status === "draft" ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleDiscardDraft(item.id)}
                                    disabled={discardingDraftId === item.id}
                                    title="Discard draft"
                                    aria-label="Discard draft"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {discardingDraftId === item.id ? (
                                      <Loader2 className="animate-spin" size={12} />
                                    ) : (
                                      <Trash2 size={12} />
                                    )}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void handleCopyPreviousPrescription(item.id)}
                                  disabled={!canCopy || isCopying}
                                  title="Copy previous prescription"
                                  aria-label="Copy previous prescription"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isCopying ? <Loader2 className="animate-spin" size={12} /> : <Copy size={12} />}
                                </button>
                                {item.status === "final" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRevisionError("");
                                      setRevisionReason(item.edit_reason ?? "");
                                      setRevisionSourceId(item.id);
                                    }}
                                    title="Edit as revision"
                                    aria-label="Edit as revision"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  >
                                    <PencilLine size={12} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            </>
          )}
        </div>
      </SectionCard>

      <div ref={prescriptionContentRef} className="space-y-4">
          {!hasActiveDraft ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    No active draft for this appointment
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    Review the past finalized prescriptions above, or create a fresh prescription when you are ready to write.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {hasActiveDraft ? (
            <>
              {activeWarnings.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 text-amber-700" size={18} />
                    <div>
                      <p className="font-semibold text-amber-900">Draft warnings</p>
                      <ul className="mt-2 space-y-1 text-sm text-amber-800">
                        {activeWarnings.map((warning, index) => (
                          <li key={`${warning.code}-${index}`}>{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {isReadOnly ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 text-emerald-700" size={18} />
                    <div>
                      <p className="font-semibold text-emerald-900">Read-only prescription</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        This prescription is locked.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {isReadOnly ? (
                <SectionCard title="Prescription">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Patient</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {formatPatientNameWithMeta(contextData.context.patient)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Visit Details</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {toUpperText(new Date(contextData.draft!.visit_date).toLocaleDateString("en-IN"))}
                </p>
                <p className="text-sm text-gray-600">
                  {toUpperText(`Finalized ${formatEmrDateTime(contextData.draft!.finalized_at) ?? "just now"}`)}
                </p>
              </div>
            </div>
            {visibleSectionOrder.map((section) => renderFinalizedSummarySection(section))}
            {visiblePrintCustomFields.map((field) => {
              const displayValue = formatCustomFieldValueForDisplay(
                field.field_type,
                getCustomFieldValue(editorState!.custom_fields, field.field_key)
              );
              if (!displayValue) return null;

              return (
                <div key={`summary-custom-${field.field_key}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {field.field_label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    {displayValue}
                  </p>
                </div>
              );
            })}
              </div>
            </SectionCard>
          ) : null}

              {!isReadOnly ? (
                <>
                  {visibleSectionOrder.map((section) => renderConfiguredSection(section))}

                  {visiblePadCustomFields.map((field) => (
                    <CustomFieldSection
                      key={field.field_key}
                      field={field}
                      value={getCustomFieldValue(editorState?.custom_fields ?? [], field.field_key)}
                      onChange={(value) =>
                        setEditorState((current) =>
                          current
                            ? {
                                ...current,
                                custom_fields: buildCustomFieldValues(
                                  current.custom_fields.map((item) =>
                                    item.field_key === field.field_key
                                      ? { ...item, field_value: value }
                                      : item
                                  ),
                                  visiblePadCustomFields
                                ),
                              }
                            : current
                        )
                      }
                    />
                  ))}

                  <AddMasterItemModal
                    open={medicineAddModalIndex !== null}
                    kind="medicines"
                    initialName={medicineAddModalIndex === null ? "" : editorState?.medicines[medicineAddModalIndex]?.medicine_name || ""}
                    onClose={() => setMedicineAddModalIndex(null)}
                    onCreated={(item) => {
                      if (medicineAddModalIndex === null) return;
                            setEditorState((current) =>
                              current
                                ? {
                                    ...current,
                                    medicines: current.medicines.map((row, rowIndex) =>
                                      rowIndex === medicineAddModalIndex
                                        ? applyMedicineSuggestionToRow(row, item)
                                        : row
                                    ),
                                  }
                                : current
                      );
                      setMedicineAddModalIndex(null);
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      {showFinalizeConfirm ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Finalize prescription</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will save and lock the prescription.
            </p>
            {activeWarnings.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Please review these warnings before finalizing:</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {activeWarnings.map((warning, index) => (
                    <li key={`finalize-warning-${warning.code}-${index}`}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isFinalizing}
                onClick={async () => {
                  setShowFinalizeConfirm(false);
                  await handleFinalizePrescription();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isFinalizing ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                Confirm Finalize
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {revisionSourceId !== null ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Create prescription revision</h3>
            <p className="mt-2 text-sm text-gray-600">
              The finalized prescription will remain unchanged. A new draft revision will be created and linked through version history.
            </p>
            <label className="mt-5 block space-y-2">
              <span className="text-sm font-medium text-gray-700">Edit reason</span>
              <textarea
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                placeholder="Example: corrected dose frequency for evening medicine"
              />
            </label>
            {revisionError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {revisionError}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (revisionSubmitting) return;
                  setRevisionSourceId(null);
                  setRevisionReason("");
                  setRevisionError("");
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revisionSubmitting || !revisionReason.trim()}
                onClick={() => void handleCreateRevisionDraft(revisionSourceId, revisionReason)}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {revisionSubmitting ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <PencilLine size={14} />
                )}
                {revisionSubmitting ? "Creating..." : "Create Revision Draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
