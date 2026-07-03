export type EmrMasterType =
  | "medicine"
  | "complaint"
  | "diagnosis"
  | "test"
  | "advice";

export type EmrMasterStatus = "pending" | "approved" | "rejected";

export type EmrPrescriptionStatus =
  | "draft"
  | "final"
  | "cancelled"
  | "abandoned";

export type EmrDurationUnit = "day" | "week" | "month" | "year" | "custom";

export type EmrClinicalHistorySection =
  | "examination_findings"
  | "investigation_findings"
  | "past_medical_history"
  | "family_history"
  | "surgical_history"
  | "treatment_history"
  | "allergies"
  | "personal_social_history";

export type EmrVitalsPayload = {
  bp?: string | null;
  pulse?: string | null;
  height?: string | null;
  weight?: string | null;
  temperature?: string | null;
  spo2?: string | null;
  bmi?: string | null;
};

export type EmrNamedItemPayload = {
  id?: number | null;
  name: string;
  normalized_name?: string | null;
  notes?: string | null;
  sort_order?: number;
};

export type EmrComplaintPayload = {
  id?: number | null;
  complaint_master_id?: number | null;
  name: string;
  normalized_name?: string | null;
  severity?: string | null;
  frequency?: string | null;
  duration_value?: number | null;
  duration_unit?: EmrDurationUnit | null;
  notes?: string | null;
  sort_order?: number;
};

export type EmrClinicalHistoryPayload = {
  section: EmrClinicalHistorySection;
  details: string;
  sort_order?: number;
};

export type EmrCustomFieldType = "text" | "textarea" | "number" | "date" | "checkbox";

export type EmrCustomFieldValuePayload = {
  field_key: string;
  field_label: string;
  field_type: EmrCustomFieldType;
  field_value?: string | null;
  sort_order?: number;
};

export type EmrMedicinePayload = {
  id?: number | null;
  medicine_master_id?: number | null;
  type?: string | null;
  medicine_name: string;
  normalized_name?: string | null;
  salt_composition?: string | null;
  strength?: string | null;
  dose?: string | null;
  timing?: string | null;
  frequency?: string | null;
  duration_value?: number | null;
  duration_unit?: EmrDurationUnit | null;
  duration_text?: string | null;
  notes?: string | null;
  sort_order?: number;
};

export type EmrDraftSavePayload = {
  visit_date?: string | Date | null;
  next_visit_date?: string | Date | null;
  clinic_id?: number | null;
  timezone?: string | null;
  vitals?: EmrVitalsPayload | null;
  complaints?: EmrComplaintPayload[];
  diagnosis?: EmrNamedItemPayload[];
  medicines?: EmrMedicinePayload[];
  tests?: EmrNamedItemPayload[];
  advice?: EmrNamedItemPayload[];
  clinical_history?: EmrClinicalHistoryPayload[];
  custom_fields?: EmrCustomFieldValuePayload[];
};

export type EmrFollowUpAppointmentSummary = {
  appointment_id: number;
  date: string;
  slot_time: string;
  clinic_id: number | null;
  clinic_name: string | null;
};

export type EmrPrescriptionRecord = {
  id: number;
  prescription_no: string;
  doctor_sequence_no: number | null;
  doctor_id: number;
  patient_id: number;
  appointment_id: number | null;
  clinic_id: number | null;
  visit_date: string;
  next_visit_date: string | null;
  timezone: string;
  status: EmrPrescriptionStatus;
  pdf_url: string | null;
  finalized_at: string | null;
  previous_version_id: number | null;
  copied_from_prescription_id: number | null;
  version_number: number;
  edit_reason: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: number | null;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
  follow_up_appointment: EmrFollowUpAppointmentSummary | null;
  vitals: EmrVitalsPayload | null;
  complaints: EmrComplaintPayload[];
  diagnosis: EmrNamedItemPayload[];
  medicines: EmrMedicinePayload[];
  tests: EmrNamedItemPayload[];
  advice: EmrNamedItemPayload[];
  clinical_history?: EmrClinicalHistoryPayload[];
  custom_fields?: EmrCustomFieldValuePayload[];
};

export type EmrPrescriptionHistoryItem = Pick<
  EmrPrescriptionRecord,
  | "id"
  | "prescription_no"
  | "visit_date"
  | "status"
  | "finalized_at"
  | "version_number"
  | "pdf_url"
  | "previous_version_id"
  | "edit_reason"
  | "copied_from_prescription_id"
  | "created_at"
  | "updated_at"
  | "follow_up_appointment"
>;

export type EmrDraftWarning = {
  code:
    | "duplicate_medicine"
    | "empty_dose_frequency"
    | "empty_duration"
    | "unresolved_medicine"
    | "allergy_match";
  level: "warning";
  message: string;
  medicine_name?: string;
  row_index?: number;
  related_allergy?: string;
};

export type EmrLayoutCustomField = {
  id?: number;
  field_key: string;
  field_label: string;
  field_type: EmrCustomFieldType;
  placeholder?: string | null;
  default_value?: string | null;
  is_required?: boolean;
  show_in_pad?: boolean;
  show_in_print?: boolean;
  sort_order?: number;
};

export type EmrLayoutSectionKey =
  | "vitals"
  | "complaints"
  | "diagnosis"
  | "examination_findings"
  | "investigation_findings"
  | "past_medical_history"
  | "family_history"
  | "surgical_history"
  | "treatment_history"
  | "allergies"
  | "personal_social_history"
  | "medicines"
  | "advice"
  | "tests"
  | "next_visit";

export type EmrLayoutVisibilityMap = Record<EmrLayoutSectionKey, boolean>;

export type EmrPrintPaperPreset =
  | "blank_a4"
  | "header_footer"
  | "header_left_strip"
  | "header_right_strip"
  | "header_footer_left_strip"
  | "header_footer_right_strip"
  | "header_footer_left_right_strip"
  | "header_only"
  | "custom";

export type EmrLayoutMarginConfig = {
  top?: string | null;
  right?: string | null;
  bottom?: string | null;
  left?: string | null;
  unit?: "mm" | null;
  paper_preset?: EmrPrintPaperPreset | null;
  offset_x?: string | null;
  offset_y?: string | null;
  header_space?: string | null;
  footer_space?: string | null;
  left_strip_space?: string | null;
  right_strip_space?: string | null;
  show_header_image?: boolean;
  show_footer_image?: boolean;
  show_clinic_logo?: boolean;
  show_signature?: boolean;
  show_prescription_number?: boolean;
  show_prescription_validity?: boolean;
  prescription_validity_value?: number | null;
  prescription_validity_unit?: "day" | "week" | "month" | "year" | null;
  preprinted_scan_url?: string | null;
};

export type EmrLayoutSettings = {
  id: number;
  doctor_id: number;
  clinic_id: number | null;
  section_order_json: EmrLayoutSectionKey[];
  section_visibility_json: EmrLayoutVisibilityMap;
  print_visibility_json: EmrLayoutVisibilityMap;
  custom_fields_json: EmrLayoutCustomField[];
  page_margin_json: EmrLayoutMarginConfig;
  pdf_margin_json: EmrLayoutMarginConfig;
  font_family: string | null;
  font_size: string | null;
  header_image_url: string | null;
  footer_image_url: string | null;
  clinic_logo_url: string | null;
  doctor_signature_url: string | null;
  header_height: string | null;
  footer_height: string | null;
  created_at: string;
  updated_at: string;
  custom_fields: EmrLayoutCustomField[];
};

export type EmrPrintablePrescription = {
  prescription: EmrPrescriptionRecord;
  doctor: {
    doctor_id: number;
    doctor_name: string | null;
    qualification: string | null;
    registration_no: string | null;
    specialization: string | null;
  };
  patient: {
    patient_id: number;
    full_name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
  };
  clinic: {
    clinic_id: number;
    clinic_name: string | null;
    phone: string | null;
    location: string | null;
  } | null;
  layout_settings: EmrLayoutSettings;
  pdf_hook: {
    pdf_url: string | null;
    source: "structured_sql";
    print_data_api: string;
  };
};

export type EmrPatientPrescriptionSummary = {
  prescription_id: number;
  patient_id: number;
  doctor_id: number;
  appointment_id: number | null;
  prescription_no: string;
  visit_date: string;
  finalized_at: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  pdf_url: string | null;
  version_number: number;
};

export type EmrPatientPrescriptionDetail = {
  prescription_id: number;
  patient_id: number;
  doctor_id: number;
  appointment_id: number | null;
  visit_date: string;
  finalized_at: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  vitals: EmrVitalsPayload | null;
  complaints: EmrComplaintPayload[];
  diagnosis: EmrNamedItemPayload[];
  medicines: EmrMedicinePayload[];
  advice: EmrNamedItemPayload[];
  tests_requested: EmrNamedItemPayload[];
  clinical_history?: EmrClinicalHistoryPayload[];
  custom_fields?: EmrCustomFieldValuePayload[];
  next_visit_date: string | null;
  follow_up_appointment: EmrFollowUpAppointmentSummary | null;
  pdf_url: string | null;
};

export type EmrAuditLogRecord = {
  id: string;
  action: string;
  doctor_id: number;
  patient_id: number | null;
  prescription_id: number | null;
  entity_type: string;
  entity_id: number | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export type EmrMasterItem = {
  id: number;
  name: string;
  normalized_name: string;
  status: EmrMasterStatus;
  created_by_doctor_id: number | null;
  usage_count: number;
  type: string | null;
  strength: string | null;
  salt_composition: string | null;
  company: string | null;
  created_at: string;
  updated_at: string;
};
