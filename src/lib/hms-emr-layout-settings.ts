import {
  getDefaultPrescriptionLayoutSettings,
} from "@/lib/emr/layoutService";
import type { EmrLayoutSettings } from "@/lib/emr/types";
import {
  createHmsPrintLayout,
  listHmsPrintLayoutDoctors,
  resolveHmsPrintLayoutForDoctor,
  type HmsPrintLayoutTargetType,
} from "@/lib/hms-print-layout-service";

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

function normalizeId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTargetType(value: unknown): HmsPrintLayoutTargetType | null {
  const target = String(value || "").trim().toUpperCase();
  if (target === "ALL_DOCTORS" || target === "SPECIFIC_DOCTOR" || target === "DOCTOR_GROUP") return target;
  return null;
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeId).filter((id): id is number => Boolean(id))));
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function mergeMissingLayoutSections(settings: EmrLayoutSettings, defaults: EmrLayoutSettings): EmrLayoutSettings {
  const sectionOrder = Array.isArray(settings.section_order_json) ? settings.section_order_json : [];
  const mergedOrder = [
    ...sectionOrder,
    ...defaults.section_order_json.filter((section) => !sectionOrder.includes(section)),
  ];

  return {
    ...settings,
    section_order_json: mergedOrder,
    section_visibility_json: {
      ...defaults.section_visibility_json,
      ...(settings.section_visibility_json || {}),
    },
    print_visibility_json: {
      ...defaults.print_visibility_json,
      ...(settings.print_visibility_json || {}),
    },
    voice_input_enabled: settings.voice_input_enabled === true,
  };
}

export async function getHmsEmrLayoutSettings(input: {
  hospitalId: number;
  doctorId?: number | null;
}) {
  const doctorId = input.doctorId || 0;
  const defaults = getDefaultPrescriptionLayoutSettings({ doctorId, clinicId: null });
  const resolved = await resolveHmsPrintLayoutForDoctor({ hospitalId: input.hospitalId, doctorId });
  const layoutConfig = parseJsonObject(resolved?.layout_config_json);
  const storedSettings = parseJsonObject(layoutConfig.emr_layout_settings) as Partial<EmrLayoutSettings>;

  const settings = mergeMissingLayoutSections({
    ...defaults,
    ...storedSettings,
    doctor_id: doctorId,
    clinic_id: null,
    custom_fields: Array.isArray(storedSettings.custom_fields) ? storedSettings.custom_fields : defaults.custom_fields,
  } as EmrLayoutSettings, defaults);

  return {
    settings,
    defaults,
    hmsLayout: resolved,
  };
}

export async function buildHmsEmrLayoutScope(hospitalId: number, doctorId?: number | null) {
  const doctors = await listHmsPrintLayoutDoctors(hospitalId);
  const doctor = doctors.find((item) => item.doctor_id === doctorId) || null;

  return {
    doctor: doctor
      ? {
          doctor_id: doctor.doctor_id,
          doctor_name: doctor.doctor_name,
        }
      : null,
    clinics: [],
    hmsDoctors: doctors,
  };
}

export async function saveHmsEmrLayoutSettings(input: {
  hospitalId: number;
  userId: number;
  body: Record<string, unknown>;
}) {
  const targetType = normalizeTargetType(input.body.target_type);
  const doctorIds = uniqueIds(input.body.doctor_ids);
  const layoutName = normalizeText(input.body.layout_name);
  const description = normalizeText(input.body.description) || null;

  const fieldErrors: Record<string, string> = {};
  if (!layoutName) fieldErrors.layout_name = "Layout name is required.";
  if (!targetType) fieldErrors.target_type = "Choose who this layout applies to.";
  if (targetType === "SPECIFIC_DOCTOR" && doctorIds.length !== 1) fieldErrors.doctor_ids = "Choose exactly one doctor.";
  if (targetType === "DOCTOR_GROUP" && doctorIds.length < 2) fieldErrors.doctor_ids = "Choose at least two doctors.";
  if (Object.keys(fieldErrors).length > 0 || !targetType) {
    return { fieldErrors, result: null };
  }

  const defaults = getDefaultPrescriptionLayoutSettings({ doctorId: doctorIds[0] || 0, clinicId: null });
  const emrLayoutSettings = mergeMissingLayoutSections({
    clinic_id: null,
    section_order_json: input.body.section_order_json,
    section_visibility_json: input.body.section_visibility_json,
    print_visibility_json: input.body.print_visibility_json,
    complaint_display_mode: input.body.complaint_display_mode,
    custom_fields_json: input.body.custom_fields_json,
    page_margin_json: input.body.page_margin_json,
    pdf_margin_json: input.body.pdf_margin_json,
    font_family: input.body.font_family,
    font_size: input.body.font_size,
    header_image_url: input.body.header_image_url,
    footer_image_url: input.body.footer_image_url,
    clinic_logo_url: input.body.clinic_logo_url,
    doctor_signature_url: input.body.doctor_signature_url,
    header_height: input.body.header_height,
    footer_height: input.body.footer_height,
    voice_input_enabled: input.body.voice_input_enabled === true,
    custom_fields: input.body.custom_fields,
  } as EmrLayoutSettings, defaults);

  const headerConfig = {
    reception_header: {
      show_uhid: true,
      show_opd: true,
      show_room_no: input.body.reception_show_room_no !== false,
      show_name: true,
      show_age_sex: true,
      show_fee: input.body.reception_show_fee !== false,
      show_mobile_no: input.body.reception_show_mobile_no !== false,
      show_visited_on: true,
      show_printed_on: true,
      title_font_size_px: normalizeNumber(input.body.reception_title_font_size_px, 16, 12, 28),
      body_font_size_px: normalizeNumber(input.body.reception_body_font_size_px, 12, 9, 18),
    },
    header_height: input.body.header_height,
    page_header_space: parseJsonObject(input.body.page_margin_json).header_space,
  };

  const result = await createHmsPrintLayout({
    hospitalId: input.hospitalId,
    userId: input.userId,
    layoutName,
    description,
    targetType,
    doctorIds: targetType === "ALL_DOCTORS" ? [] : doctorIds,
    headerConfig,
    layoutConfig: {
      emr_layout_settings: emrLayoutSettings,
    },
  });

  const savedSettings: EmrLayoutSettings = {
    ...defaults,
    ...emrLayoutSettings,
    doctor_id: doctorIds[0] || 0,
    clinic_id: null,
    custom_fields: Array.isArray(emrLayoutSettings.custom_fields) ? emrLayoutSettings.custom_fields : [],
  } as EmrLayoutSettings;

  return { fieldErrors: {}, result, settings: savedSettings };
}
