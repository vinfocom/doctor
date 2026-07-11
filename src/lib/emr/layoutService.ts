import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import type {
  EmrLayoutCustomField,
  EmrLayoutMarginConfig,
  EmrPrintPaperPreset,
  EmrLayoutSectionKey,
  EmrLayoutSettings,
  EmrLayoutVisibilityMap,
} from "@/lib/emr/types";

type LayoutRow = {
  id: number;
  doctor_id: number;
  clinic_id: number | null;
  section_order_json: unknown;
  section_visibility_json: unknown;
  print_visibility_json: unknown;
  complaint_display_mode: string | null;
  custom_fields_json: unknown;
  page_margin_json: unknown;
  pdf_margin_json: unknown;
  font_family: string | null;
  font_size: string | null;
  header_image_url: string | null;
  footer_image_url: string | null;
  clinic_logo_url: string | null;
  doctor_signature_url: string | null;
  header_height: string | null;
  footer_height: string | null;
  created_at: Date;
  updated_at: Date;
};

type LayoutCustomFieldRow = {
  id: number;
  layout_setting_id: number;
  field_key: string;
  field_label: string;
  field_type: "text" | "textarea" | "number" | "date" | "checkbox";
  placeholder: string | null;
  default_value: string | null;
  is_required: boolean | number;
  show_in_pad: boolean | number;
  show_in_print: boolean | number;
  sort_order: number;
};

const DEFAULT_SECTION_ORDER: EmrLayoutSectionKey[] = [
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
];

const DEFAULT_SECTION_VISIBILITY: EmrLayoutVisibilityMap = {
  vitals: true,
  complaints: true,
  diagnosis: true,
  examination_findings: true,
  investigation_findings: true,
  past_medical_history: true,
  family_history: true,
  surgical_history: true,
  treatment_history: true,
  allergies: true,
  personal_social_history: true,
  medicines: true,
  advice: true,
  tests: true,
  next_visit: true,
};

const DEFAULT_PRINT_VISIBILITY: EmrLayoutVisibilityMap = {
  vitals: true,
  complaints: true,
  diagnosis: true,
  examination_findings: true,
  investigation_findings: true,
  past_medical_history: true,
  family_history: true,
  surgical_history: true,
  treatment_history: true,
  allergies: true,
  personal_social_history: true,
  medicines: true,
  advice: true,
  tests: true,
  next_visit: true,
};

const DEFAULT_MARGIN_CONFIG: EmrLayoutMarginConfig = {
  top: "24px",
  right: "24px",
  bottom: "24px",
  left: "24px",
  unit: "mm",
  paper_preset: "blank_a4",
  offset_x: "0mm",
  offset_y: "0mm",
  header_space: "0mm",
  footer_space: "0mm",
  left_strip_space: "0mm",
  right_strip_space: "0mm",
  show_header_image: true,
  show_footer_image: true,
  show_clinic_logo: true,
  show_signature: true,
  show_prescription_number: false,
  show_prescription_validity: false,
  prescription_validity_value: null,
  prescription_validity_unit: "month",
  preprinted_scan_url: null,
};

const PRINT_PAPER_PRESETS = new Set<EmrPrintPaperPreset>([
  "blank_a4",
  "header_footer",
  "header_left_strip",
  "header_right_strip",
  "header_footer_left_strip",
  "header_footer_right_strip",
  "header_footer_left_right_strip",
  "header_only",
  "custom",
]);

function normalizeComplaintDisplayMode(value: unknown) {
  return value === "classic_inline" ? "classic_inline" : "paired_grid";
}

function normalizeMeasurement(
  value: string | null | undefined,
  fallback: string | null | undefined,
  unit: "mm" | "px" = "mm"
) {
  const raw = value?.trim();
  const fallbackValue = fallback?.trim() || null;

  if (!raw) {
    return fallbackValue;
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return `${raw}${unit}`;
  }

  if (/^-?\d+(\.\d+)?(mm|cm|px|pt|rem|em|%)$/i.test(raw)) {
    return raw.toLowerCase();
  }

  return fallbackValue;
}

function toBoolean(value: boolean | number | null | undefined) {
  return value === true || value === 1;
}

function safeParseJson(value: unknown) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

function normalizeCustomFieldKey(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || fallback;
}

function normalizeCustomFieldLabel(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized || fallback;
}

function mapLayoutCustomField(row: LayoutCustomFieldRow): EmrLayoutCustomField {
  return {
    id: row.id,
    field_key: row.field_key,
    field_label: normalizeCustomFieldLabel(row.field_label, "CUSTOM FIELD"),
    field_type: row.field_type,
    placeholder: row.placeholder,
    default_value: row.default_value,
    is_required: toBoolean(row.is_required),
    show_in_pad: toBoolean(row.show_in_pad),
    show_in_print: toBoolean(row.show_in_print),
    sort_order: row.sort_order,
  };
}

async function loadLayoutCustomFields(layoutSettingId: number) {
  const rows = await prisma.$queryRaw<LayoutCustomFieldRow[]>(
    Prisma.sql`
      SELECT
        id,
        layout_setting_id,
        field_key,
        field_label,
        field_type,
        placeholder,
        default_value,
        is_required,
        show_in_pad,
        show_in_print,
        sort_order
      FROM prescription_layout_custom_fields
      WHERE layout_setting_id = ${layoutSettingId}
      ORDER BY sort_order ASC, id ASC
    `
  );

  return rows.map(mapLayoutCustomField);
}

function normalizeSectionOrder(value: unknown): EmrLayoutSectionKey[] {
  const parsed = safeParseJson(value);
  if (!Array.isArray(parsed)) {
    return [...DEFAULT_SECTION_ORDER];
  }

  const allowed = new Set<EmrLayoutSectionKey>(DEFAULT_SECTION_ORDER);
  const ordered = parsed
    .filter((item): item is EmrLayoutSectionKey => typeof item === "string" && allowed.has(item as EmrLayoutSectionKey));

  const unique: EmrLayoutSectionKey[] = [];
  for (const item of ordered) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  }

  for (const section of DEFAULT_SECTION_ORDER) {
    if (!unique.includes(section)) {
      unique.push(section);
    }
  }

  return unique;
}

function normalizeVisibilityMap(
  value: unknown,
  defaults: EmrLayoutVisibilityMap
): EmrLayoutVisibilityMap {
  const parsed = safeParseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...defaults };
  }

  const next = { ...defaults };
  for (const section of DEFAULT_SECTION_ORDER) {
    const maybeValue = (parsed as Record<string, unknown>)[section];
    if (typeof maybeValue === "boolean") {
      next[section] = maybeValue;
    }
  }

  return next;
}

function normalizeMarginConfig(value: unknown): EmrLayoutMarginConfig {
  const parsed = safeParseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_MARGIN_CONFIG };
  }

  const next: EmrLayoutMarginConfig = { ...DEFAULT_MARGIN_CONFIG };
  for (const key of ["top", "right", "bottom", "left"] as const) {
    const maybeValue = (parsed as Record<string, unknown>)[key];
    next[key] = normalizeMeasurement(
      typeof maybeValue === "string" ? maybeValue : null,
      DEFAULT_MARGIN_CONFIG[key],
      "px"
    );
  }

  for (const key of [
    "offset_x",
    "offset_y",
    "header_space",
    "footer_space",
    "left_strip_space",
    "right_strip_space",
  ] as const) {
    const maybeValue = (parsed as Record<string, unknown>)[key];
    next[key] = normalizeMeasurement(
      typeof maybeValue === "string" ? maybeValue : null,
      DEFAULT_MARGIN_CONFIG[key],
      "mm"
    );
  }

  const maybeUnit = (parsed as Record<string, unknown>).unit;
  next.unit = maybeUnit === "mm" ? "mm" : DEFAULT_MARGIN_CONFIG.unit;

  const maybePaperPreset = (parsed as Record<string, unknown>).paper_preset;
  next.paper_preset =
    typeof maybePaperPreset === "string" && PRINT_PAPER_PRESETS.has(maybePaperPreset as EmrPrintPaperPreset)
      ? (maybePaperPreset as EmrPrintPaperPreset)
      : DEFAULT_MARGIN_CONFIG.paper_preset;

  for (const key of [
    "show_header_image",
    "show_footer_image",
    "show_clinic_logo",
    "show_signature",
    "show_prescription_number",
    "show_prescription_validity",
  ] as const) {
    const maybeValue = (parsed as Record<string, unknown>)[key];
    next[key] =
      typeof maybeValue === "boolean"
        ? maybeValue
        : DEFAULT_MARGIN_CONFIG[key];
  }

  const maybeValidityValue = (parsed as Record<string, unknown>).prescription_validity_value;
  next.prescription_validity_value =
    typeof maybeValidityValue === "number" &&
    Number.isFinite(maybeValidityValue) &&
    maybeValidityValue > 0
      ? Math.floor(maybeValidityValue)
      : DEFAULT_MARGIN_CONFIG.prescription_validity_value;

  const maybeValidityUnit = (parsed as Record<string, unknown>).prescription_validity_unit;
  next.prescription_validity_unit =
    maybeValidityUnit === "day" ||
    maybeValidityUnit === "week" ||
    maybeValidityUnit === "month" ||
    maybeValidityUnit === "year"
      ? maybeValidityUnit
      : DEFAULT_MARGIN_CONFIG.prescription_validity_unit;

  const maybePreprintedScanUrl = (parsed as Record<string, unknown>).preprinted_scan_url;
  next.preprinted_scan_url =
    typeof maybePreprintedScanUrl === "string" && maybePreprintedScanUrl.trim()
      ? maybePreprintedScanUrl.trim()
      : DEFAULT_MARGIN_CONFIG.preprinted_scan_url;

  return next;
}

function normalizeCustomFieldsJson(value: unknown): EmrLayoutCustomField[] {
  const parsed = safeParseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((field) => field && typeof field === "object")
    .map((field, index) => {
      const current = field as Record<string, unknown>;
      const fieldLabel = normalizeCustomFieldLabel(
        typeof current.field_label === "string" ? current.field_label : null,
        `CUSTOM FIELD ${index + 1}`
      );
      return {
        field_key: normalizeCustomFieldKey(
          fieldLabel || (typeof current.field_key === "string" ? current.field_key : ""),
          `custom_field_${index + 1}`
        ),
        field_label: fieldLabel,
        field_type:
          current.field_type === "textarea" ||
          current.field_type === "number" ||
          current.field_type === "date" ||
          current.field_type === "checkbox"
            ? current.field_type
            : "text",
        placeholder:
          typeof current.placeholder === "string" ? current.placeholder : null,
        default_value:
          typeof current.default_value === "string" ? current.default_value : null,
        is_required: Boolean(current.is_required),
        show_in_pad: current.show_in_pad !== false,
        show_in_print: current.show_in_print !== false,
        sort_order: typeof current.sort_order === "number" ? current.sort_order : index,
      } satisfies EmrLayoutCustomField;
    });
}

async function mapLayoutRow(row: LayoutRow): Promise<EmrLayoutSettings> {
  const customFields = await loadLayoutCustomFields(row.id);
  const jsonCustomFields = normalizeCustomFieldsJson(row.custom_fields_json);

  return {
    id: row.id,
    doctor_id: row.doctor_id,
    clinic_id: row.clinic_id,
    section_order_json: normalizeSectionOrder(row.section_order_json),
    section_visibility_json: normalizeVisibilityMap(
      row.section_visibility_json,
      DEFAULT_SECTION_VISIBILITY
    ),
    print_visibility_json: normalizeVisibilityMap(
      row.print_visibility_json,
      DEFAULT_PRINT_VISIBILITY
    ),
    complaint_display_mode: normalizeComplaintDisplayMode(
      row.complaint_display_mode
    ),
    custom_fields_json: jsonCustomFields,
    page_margin_json: normalizeMarginConfig(row.page_margin_json),
    pdf_margin_json: normalizeMarginConfig(row.pdf_margin_json),
    font_family: row.font_family,
    font_size: row.font_size,
    header_image_url: row.header_image_url,
    footer_image_url: row.footer_image_url,
    clinic_logo_url: row.clinic_logo_url,
    doctor_signature_url: row.doctor_signature_url,
    header_height: row.header_height,
    footer_height: row.footer_height,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    custom_fields: customFields.length > 0 ? customFields : jsonCustomFields,
  };
}

export function getDefaultPrescriptionLayoutSettings(input?: {
  doctorId?: number;
  clinicId?: number | null;
}): EmrLayoutSettings {
  return {
    id: 0,
    doctor_id: input?.doctorId ?? 0,
    clinic_id: input?.clinicId ?? null,
    section_order_json: [...DEFAULT_SECTION_ORDER],
    section_visibility_json: { ...DEFAULT_SECTION_VISIBILITY },
    print_visibility_json: { ...DEFAULT_PRINT_VISIBILITY },
    complaint_display_mode: "paired_grid",
    custom_fields_json: [],
    page_margin_json: { ...DEFAULT_MARGIN_CONFIG },
    pdf_margin_json: { ...DEFAULT_MARGIN_CONFIG },
    font_family: "Georgia, serif",
    font_size: "14px",
    header_image_url: null,
    footer_image_url: null,
    clinic_logo_url: null,
    doctor_signature_url: null,
    header_height: "96px",
    footer_height: "72px",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    custom_fields: [],
  };
}

async function findExactLayoutScope(input: {
  doctorId: number;
  clinicId?: number | null;
}) {
  const rows = input.clinicId === null || input.clinicId === undefined
    ? await prisma.$queryRaw<LayoutRow[]>(
        Prisma.sql`
          SELECT *
          FROM prescription_layout_settings
          WHERE doctor_id = ${input.doctorId}
            AND clinic_id IS NULL
          ORDER BY id DESC
          LIMIT 1
        `
      )
    : await prisma.$queryRaw<LayoutRow[]>(
        Prisma.sql`
          SELECT *
          FROM prescription_layout_settings
          WHERE doctor_id = ${input.doctorId}
            AND clinic_id = ${input.clinicId}
          ORDER BY id DESC
          LIMIT 1
        `
      );

  return rows[0] ?? null;
}

export async function getPrescriptionLayoutSettings(input: {
  doctorId: number;
  clinicId?: number | null;
}) {
  const rows = await prisma.$queryRaw<LayoutRow[]>(
    Prisma.sql`
      SELECT *
      FROM prescription_layout_settings
      WHERE doctor_id = ${input.doctorId}
        AND (
          clinic_id = ${input.clinicId ?? null}
          OR clinic_id IS NULL
        )
      ORDER BY
        CASE WHEN clinic_id = ${input.clinicId ?? null} THEN 0 ELSE 1 END,
        id DESC
      LIMIT 1
    `
  );

  return rows[0] ? mapLayoutRow(rows[0]) : null;
}

export async function resolvePrescriptionLayoutSettings(input: {
  doctorId: number;
  clinicId?: number | null;
}) {
  const saved = await getPrescriptionLayoutSettings(input);
  if (!saved) {
    return getDefaultPrescriptionLayoutSettings(input);
  }

  return {
    ...getDefaultPrescriptionLayoutSettings(input),
    ...saved,
    section_order_json: normalizeSectionOrder(saved.section_order_json),
    section_visibility_json: normalizeVisibilityMap(
      saved.section_visibility_json,
      DEFAULT_SECTION_VISIBILITY
    ),
    print_visibility_json: normalizeVisibilityMap(
      saved.print_visibility_json,
      DEFAULT_PRINT_VISIBILITY
    ),
    complaint_display_mode: normalizeComplaintDisplayMode(
      saved.complaint_display_mode
    ),
    page_margin_json: normalizeMarginConfig(saved.page_margin_json),
    pdf_margin_json: normalizeMarginConfig(saved.pdf_margin_json),
    custom_fields_json: normalizeCustomFieldsJson(saved.custom_fields_json),
    custom_fields:
      saved.custom_fields.length > 0
        ? saved.custom_fields
        : normalizeCustomFieldsJson(saved.custom_fields_json),
  } satisfies EmrLayoutSettings;
}

export async function savePrescriptionLayoutSettings(input: {
  doctorId: number;
  clinicId?: number | null;
  sectionOrderJson?: unknown;
  sectionVisibilityJson?: unknown;
  printVisibilityJson?: unknown;
  complaintDisplayMode?: unknown;
  customFieldsJson?: unknown;
  pageMarginJson?: unknown;
  pdfMarginJson?: unknown;
  fontFamily?: string | null;
  fontSize?: string | null;
  headerImageUrl?: string | null;
  footerImageUrl?: string | null;
  clinicLogoUrl?: string | null;
  doctorSignatureUrl?: string | null;
  headerHeight?: string | null;
  footerHeight?: string | null;
  customFields?: EmrLayoutCustomField[];
}) {
  const normalizedSectionOrder = normalizeSectionOrder(input.sectionOrderJson);
  const normalizedSectionVisibility = normalizeVisibilityMap(
    input.sectionVisibilityJson,
    DEFAULT_SECTION_VISIBILITY
  );
  const normalizedPrintVisibility = normalizeVisibilityMap(
    input.printVisibilityJson,
    DEFAULT_PRINT_VISIBILITY
  );
  const normalizedComplaintDisplayMode = normalizeComplaintDisplayMode(
    input.complaintDisplayMode
  );
  const normalizedCustomFields =
    input.customFields ?? normalizeCustomFieldsJson(input.customFieldsJson);
  const normalizedPageMargins = normalizeMarginConfig(input.pageMarginJson);
  const normalizedPdfMargins = normalizeMarginConfig(input.pdfMarginJson);
  const normalizedHeaderHeight = normalizeMeasurement(
    input.headerHeight,
    getDefaultPrescriptionLayoutSettings().header_height,
    "px"
  );
  const normalizedFooterHeight = normalizeMeasurement(
    input.footerHeight,
    getDefaultPrescriptionLayoutSettings().footer_height,
    "px"
  );
  const normalizedFontSize = normalizeMeasurement(
    input.fontSize,
    getDefaultPrescriptionLayoutSettings().font_size,
    "px"
  );

  const existing = await findExactLayoutScope({
    doctorId: input.doctorId,
    clinicId: input.clinicId ?? null,
  });

  if (existing) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE prescription_layout_settings
        SET
          section_order_json = ${JSON.stringify(normalizedSectionOrder)},
          section_visibility_json = ${JSON.stringify(normalizedSectionVisibility)},
          print_visibility_json = ${JSON.stringify(normalizedPrintVisibility)},
          complaint_display_mode = ${normalizedComplaintDisplayMode},
          custom_fields_json = ${JSON.stringify(normalizedCustomFields)},
          page_margin_json = ${JSON.stringify(normalizedPageMargins)},
          pdf_margin_json = ${JSON.stringify(normalizedPdfMargins)},
          font_family = ${input.fontFamily ?? null},
          font_size = ${normalizedFontSize},
          header_image_url = ${input.headerImageUrl ?? null},
          footer_image_url = ${input.footerImageUrl ?? null},
          clinic_logo_url = ${input.clinicLogoUrl ?? null},
          doctor_signature_url = ${input.doctorSignatureUrl ?? null},
          header_height = ${normalizedHeaderHeight},
          footer_height = ${normalizedFooterHeight},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
      `
    );
  } else {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_layout_settings (
          doctor_id,
          clinic_id,
          section_order_json,
          section_visibility_json,
          print_visibility_json,
          complaint_display_mode,
          custom_fields_json,
          page_margin_json,
          pdf_margin_json,
          font_family,
          font_size,
          header_image_url,
          footer_image_url,
          clinic_logo_url,
          doctor_signature_url,
          header_height,
          footer_height,
          created_at,
          updated_at
        )
        VALUES (
          ${input.doctorId},
          ${input.clinicId ?? null},
          ${JSON.stringify(normalizedSectionOrder)},
          ${JSON.stringify(normalizedSectionVisibility)},
          ${JSON.stringify(normalizedPrintVisibility)},
          ${normalizedComplaintDisplayMode},
          ${JSON.stringify(normalizedCustomFields)},
          ${JSON.stringify(normalizedPageMargins)},
          ${JSON.stringify(normalizedPdfMargins)},
          ${input.fontFamily ?? null},
          ${normalizedFontSize},
          ${input.headerImageUrl ?? null},
          ${input.footerImageUrl ?? null},
          ${input.clinicLogoUrl ?? null},
          ${input.doctorSignatureUrl ?? null},
          ${normalizedHeaderHeight},
          ${normalizedFooterHeight},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );
  }

  const saved = await findExactLayoutScope({
    doctorId: input.doctorId,
    clinicId: input.clinicId ?? null,
  });

  if (!saved) {
    throw new Error("Failed to load saved layout settings");
  }

  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM prescription_layout_custom_fields
      WHERE layout_setting_id = ${saved.id}
    `
  );

  for (const [index, field] of normalizedCustomFields.entries()) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO prescription_layout_custom_fields (
          layout_setting_id,
          field_key,
          field_label,
          field_type,
          placeholder,
          default_value,
          is_required,
          show_in_pad,
          show_in_print,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (
          ${saved.id},
          ${field.field_key},
          ${field.field_label},
          ${field.field_type},
          ${field.placeholder ?? null},
          ${field.default_value ?? null},
          ${field.is_required ? 1 : 0},
          ${field.show_in_pad === false ? 0 : 1},
          ${field.show_in_print === false ? 0 : 1},
          ${field.sort_order ?? index},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    );
  }

  return resolvePrescriptionLayoutSettings({
    doctorId: input.doctorId,
    clinicId: input.clinicId,
  });
}
