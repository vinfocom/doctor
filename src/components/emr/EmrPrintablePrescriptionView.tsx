"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type CSSProperties } from "react";
import EmrPrintActions from "@/components/emr/EmrPrintActions";
import type {
  EmrClinicalHistorySection,
  EmrLayoutSectionKey,
  EmrPrintablePrescription,
} from "@/lib/emr";

type PrintLanguage =
  | "en"
  | "hi"
  | "bn"
  | "mr"
  | "gu"
  | "ta"
  | "te"
  | "kn"
  | "ml"
  | "bho"
  | "pa";

const LANGUAGE_OPTIONS: Array<{ value: PrintLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "bn", label: "Bengali" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "bho", label: "Bhojpuri" },
  { value: "pa", label: "Punjabi" },
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

const MEDICINE_PRINT_GRID_COLUMNS = "0.75fr 2.4fr 1.4fr 1fr 1fr 0.9fr 1fr";

const DOSE_SEPARATOR = " . ";

function formatCustomFieldPrintValue(
  fieldType: "text" | "textarea" | "number" | "date" | "checkbox",
  value: string | null | undefined
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  if (fieldType === "date") {
    return formatDateDdMmYyyy(normalized) || normalized.toUpperCase();
  }

  if (fieldType === "checkbox") {
    return /^(true|1|yes|on)$/i.test(normalized) ? "YES" : "";
  }

  return normalized.toUpperCase();
}

function getClinicalHistoryHeading(
  section: EmrClinicalHistorySection,
  language: PrintLanguage
) {
  return (
    CLINICAL_HISTORY_HEADING_TRANSLATIONS[section]?.[language] ??
    CLINICAL_HISTORY_LABELS[section]
  );
}

const UI_TRANSLATIONS: Record<
  PrintLanguage,
  Record<
    | "visitDate"
    | "phone"
    | "vitals"
    | "complaints"
    | "diagnosis"
    | "medicines"
    | "advice"
    | "testsRequested"
    | "nextVisit"
    | "type"
    | "medicine"
    | "dose"
    | "when"
    | "frequency"
    | "duration"
    | "notes"
    | "noneRecorded"
    | "noMedicinesRecorded"
    | "notScheduled"
    | "doctorSignature"
    | "printLanguage",
    string
  >
> = {
  en: {
    visitDate: "Visit Date",
    phone: "Phone",
    vitals: "Vitals",
    complaints: "Complaints",
    diagnosis: "Diagnosis",
    medicines: "Rx",
    advice: "Advice",
    testsRequested: "Tests Requested",
    nextVisit: "Next Visit",
    type: "Type",
    medicine: "Medicine",
    dose: "Dose",
    when: "When",
    frequency: "Frequency",
    duration: "Duration",
    notes: "Notes",
    noneRecorded: "NONE RECORDED",
    noMedicinesRecorded: "No medicines recorded",
    notScheduled: "NOT SCHEDULED",
    doctorSignature: "Doctor Signature / Stamp",
    printLanguage: "Print language",
  },
  hi: {
    visitDate: "जांच तिथि",
    phone: "फोन",
    vitals: "वाइटल्स",
    complaints: "शिकायतें",
    diagnosis: "निदान",
    medicines: "Rx",
    advice: "सलाह",
    testsRequested: "जांचें",
    nextVisit: "अगली मुलाकात",
    type: "प्रकार",
    medicine: "दवा",
    dose: "खुराक",
    when: "कब",
    frequency: "आवृत्ति",
    duration: "अवधि",
    notes: "निर्देश",
    noneRecorded: "कोई प्रविष्टि नहीं",
    noMedicinesRecorded: "कोई दवा दर्ज नहीं",
    notScheduled: "निर्धारित नहीं",
    doctorSignature: "डॉक्टर हस्ताक्षर / मुहर",
    printLanguage: "प्रिंट भाषा",
  },
  bn: {
    visitDate: "ভিজিটের তারিখ",
    phone: "ফোন",
    vitals: "ভাইটালস",
    complaints: "অভিযোগ",
    diagnosis: "রোগ নির্ণয়",
    medicines: "Rx",
    advice: "পরামর্শ",
    testsRequested: "পরীক্ষা",
    nextVisit: "পরবর্তী ভিজিট",
    type: "ধরণ",
    medicine: "ওষুধ",
    dose: "ডোজ",
    when: "কখন",
    frequency: "বার",
    duration: "মেয়াদ",
    notes: "নির্দেশ",
    noneRecorded: "কোনও তথ্য নেই",
    noMedicinesRecorded: "কোনও ওষুধ লেখা নেই",
    notScheduled: "নির্ধারিত নয়",
    doctorSignature: "ডাক্তারের স্বাক্ষর / সিল",
    printLanguage: "প্রিন্ট ভাষা",
  },
  mr: {
    visitDate: "\u092d\u0947\u091f \u0924\u093e\u0930\u0940\u0916",
    phone: "\u092b\u094b\u0928",
    vitals: "\u0935\u093e\u0907\u091f\u0932\u094d\u0938",
    complaints: "\u0924\u0915\u094d\u0930\u093e\u0930\u0940",
    diagnosis: "\u0928\u093f\u0926\u093e\u0928",
    medicines: "Rx",
    advice: "\u0938\u0932\u094d\u0932\u093e",
    testsRequested: "\u091a\u093e\u091a\u0923\u094d\u092f\u093e",
    nextVisit: "\u092a\u0941\u0922\u0940\u0932 \u092d\u0947\u091f",
    type: "\u092a\u094d\u0930\u0915\u093e\u0930",
    medicine: "\u0914\u0937\u0927",
    dose: "\u0921\u094b\u0938",
    when: "\u0915\u0927\u0940",
    frequency: "\u0935\u093e\u0930\u0902\u0935\u093e\u0930\u0924\u093e",
    duration: "\u0915\u093e\u0932\u093e\u0935\u0927\u0940",
    notes: "\u0938\u0942\u091a\u0928\u093e",
    noneRecorded: "\u0915\u093e\u0939\u0940\u091a \u0928\u094b\u0902\u0926 \u0928\u093e\u0939\u0940",
    noMedicinesRecorded: "\u0914\u0937\u0927 \u0928\u094b\u0902\u0926\u0935\u0932\u0947 \u0928\u093e\u0939\u0940",
    notScheduled: "\u0928\u093f\u092f\u094b\u091c\u093f\u0924 \u0928\u093e\u0939\u0940",
    doctorSignature: "\u0921\u0949\u0915\u094d\u091f\u0930 \u0938\u094d\u0935\u093e\u0915\u094d\u0937\u0930\u0940 / \u0936\u093f\u0915\u094d\u0915\u093e",
    printLanguage: "\u092a\u094d\u0930\u093f\u0902\u091f \u092d\u093e\u0937\u093e",
  },
  gu: {
    visitDate: "\u0ab5\u0abf\u0a9d\u0abf\u0a9f \u0aa4\u0abe\u0ab0\u0ac0\u0a96",
    phone: "\u0aab\u0acb\u0aa8",
    vitals: "\u0ab5\u0abe\u0a87\u0a9f\u0ab2\u0acd\u0ab8",
    complaints: "\u0aab\u0ab0\u0abf\u0aaf\u0abe\u0aa6\u0acb",
    diagnosis: "\u0aa8\u0abf\u0aa6\u0abe\u0aa8",
    medicines: "Rx",
    advice: "\u0ab8\u0ab2\u0abe\u0ab9",
    testsRequested: "\u0a9a\u0abe\u0a95\u0ab8\u0aa3\u0ac0\u0a93",
    nextVisit: "\u0a86\u0a97\u0ab3\u0aa8\u0ac0 \u0aad\u0ac7\u0a9f",
    type: "\u0aaa\u0acd\u0ab0\u0a95\u0abe\u0ab0",
    medicine: "\u0aa6\u0ab5\u0abe",
    dose: "\u0aa1\u0acb\u0a9d",
    when: "\u0a95\u0acd\u0aaf\u0abe\u0ab0\u0ac7",
    frequency: "\u0ab5\u0abe\u0ab0\u0a82\u0ab5\u0abe\u0ab0",
    duration: "\u0a97\u0abe\u0ab3\u0acb",
    notes: "\u0ab8\u0ac2\u0a9a\u0aa8\u0abe",
    noneRecorded: "\u0a95\u0acb\u0a88 \u0aa8\u0acb\u0a82\u0aa7 \u0aa8\u0aa5\u0ac0",
    noMedicinesRecorded: "\u0a95\u0acb\u0a88 \u0aa6\u0ab5\u0abe \u0aa8\u0acb\u0a82\u0aa7\u0abe\u0a88 \u0aa8\u0aa5\u0ac0",
    notScheduled: "\u0aa8\u0a95\u0acd\u0a95\u0ac0 \u0aa8\u0aa5\u0ac0",
    doctorSignature: "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0 \u0ab8\u0ab9\u0ac0 / \u0ab8\u0acd\u0a9f\u0abe\u0aae\u0acd\u0aaa",
    printLanguage: "\u0aaa\u0acd\u0ab0\u0abf\u0aa8\u0acd\u0a9f \u0aad\u0abe\u0ab7\u0abe",
  },
  ta: {
    visitDate: "\u0baa\u0bbe\u0bb0\u0bcd\u0bb5\u0bc8 \u0ba4\u0bc7\u0ba4\u0bbf",
    phone: "\u0ba4\u0bca\u0bb2\u0bc8\u0baa\u0bc7\u0b9a\u0bbf",
    vitals: "\u0b89\u0b9f\u0bb2\u0bcd \u0ba8\u0bbf\u0bb2\u0bc8\u0b95\u0bb3\u0bcd",
    complaints: "\u0baa\u0bc1\u0b95\u0bbe\u0bb0\u0bcd\u0b95\u0bb3\u0bcd",
    diagnosis: "\u0ba8\u0bcb\u0baf\u0bcd \u0b95\u0aa3\u0bcd\u0b9f\u0bb1\u0bbf\u0ba4\u0bb2\u0bcd",
    medicines: "Rx",
    advice: "\u0b86\u0bb2\u0bcb\u0b9a\u0ba9\u0bc8",
    testsRequested: "\u0baa\u0bb0\u0bbf\u0b9a\u0bcb\u0ba4\u0ba9\u0bc8\u0b95\u0bb3\u0bcd",
    nextVisit: "\u0b85\u0b9f\u0bc1\u0ba4\u0bcd\u0ba4 \u0baa\u0bbe\u0bb0\u0bcd\u0bb5\u0bc8",
    type: "\u0bb5\u0b95\u0bc8",
    medicine: "\u0bae\u0bb0\u0bc1\u0ba8\u0bcd\u0ba4\u0bc1",
    dose: "\u0ba4\u0bcb\u0bb8\u0bcd",
    when: "\u0b8e\u0baa\u0bcd\u0baa\u0bcb\u0ba4\u0bc1",
    frequency: "\u0b85\u0b9f\u0bbf\u0b95\u0bcd\u0b95\u0b9f\u0bbf",
    duration: "\u0b95\u0bbe\u0bb2\u0bb5\u0bbf\u0b9f\u0bae\u0bcd",
    notes: "\u0b95\u0bc1\u0bb1\u0bbf\u0baa\u0bcd\u0baa\u0bc1",
    noneRecorded: "\u0b8e\u0ba4\u0bc1\u0bb5\u0bc1\u0bae\u0bcd \u0baa\u0ba4\u0bbf\u0bb5\u0bc1 \u0b87\u0bb2\u0bcd\u0bb2\u0bc8",
    noMedicinesRecorded: "\u0bae\u0bb0\u0bc1\u0ba8\u0bcd\u0ba4\u0bc1 \u0baa\u0ba4\u0bbf\u0bb5\u0bc1 \u0b87\u0bb2\u0bcd\u0bb2\u0bc8",
    notScheduled: "\u0ba4\u0bbf\u0bb2\u0bcd\u0bb2\u0bc8",
    doctorSignature: "\u0bae\u0bb0\u0bc1\u0ba4\u0bcd\u0ba4\u0bc1\u0bb5\u0bb0\u0bcd \u0b95\u0bc8\u0baf\u0bc6\u0bb4\u0bc1\u0ba4\u0bcd\u0ba4\u0bc1 / \u0bae\u0bc1\u0ba4\u0bcd\u0ba4\u0bbf\u0bb0\u0bc8",
    printLanguage: "\u0b85\u0b9a\u0bcd\u0b9a\u0bc1 \u0baa\u0bbe\u0bb7\u0bc8",
  },
  te: {
    visitDate: "\u0c35\u0c3f\u0c1c\u0c3f\u0c1f\u0c4d \u0c24\u0c47\u0c26\u0c40",
    phone: "\u0c2b\u0c4b\u0c28\u0c4d",
    vitals: "\u0c35\u0c48\u0c1f\u0c32\u0c4d\u0c38\u0c4d",
    complaints: "\u0c2b\u0c3f\u0c30\u0c4d\u0c2f\u0c3e\u0c26\u0c41\u0c32\u0c41",
    diagnosis: "\u0c28\u0c3f\u0c26\u0c3e\u0c28\u0c02",
    medicines: "Rx",
    advice: "\u0c38\u0c32\u0c39\u0c3e",
    testsRequested: "\u0c2a\u0c30\u0c40\u0c15\u0c4d\u0c37\u0c32\u0c41",
    nextVisit: "\u0c24\u0c26\u0c41\u0c2a\u0c30\u0c3f \u0c35\u0c3f\u0c1c\u0c3f\u0c1f\u0c4d",
    type: "\u0c30\u0c15\u0c02",
    medicine: "\u0c2e\u0c02\u0c26\u0c41",
    dose: "\u0c21\u0c4b\u0c38\u0c4d",
    when: "\u0c0e\u0c2a\u0c4d\u0c2a\u0c41\u0c21\u0c41",
    frequency: "\u0c0e\u0c28\u0c4d\u0c28\u0c3f \u0c38\u0c3e\u0c30\u0c4d\u0c32\u0c41",
    duration: "\u0c35\u0c4d\u0c2f\u0c35\u0c27\u0c3f",
    notes: "\u0c17\u0c2e\u0c28\u0c3f\u0c15",
    noneRecorded: "\u0c0f\u0c2e\u0c40 \u0c28\u0c4b\u0c1f\u0c4d \u0c1a\u0c47\u0c2f\u0c32\u0c47\u0c26\u0c41",
    noMedicinesRecorded: "\u0c2e\u0c02\u0c26\u0c41\u0c32\u0c41 \u0c28\u0c4b\u0c1f\u0c4d \u0c1a\u0c47\u0c2f\u0c32\u0c47\u0c26\u0c41",
    notScheduled: "\u0c28\u0c3f\u0c30\u0c4d\u0c23\u0c2f\u0c3f\u0c02\u0c1a\u0c32\u0c47\u0c26\u0c41",
    doctorSignature: "\u0c21\u0c3e\u0c15\u0c4d\u0c1f\u0c30\u0c4d \u0c38\u0c39\u0c3f / \u0c2e\u0c41\u0c26\u0c4d\u0c30",
    printLanguage: "\u0c2a\u0c4d\u0c30\u0c3f\u0c02\u0c1f\u0c4d \u0c2d\u0c3e\u0c37",
  },
  kn: {
    visitDate: "\u0cad\u0cc7\u0c9f\u0cbf \u0ca6\u0cbf\u0ca8\u0cbe\u0c82\u0c95",
    phone: "\u0cab\u0ccb\u0ca8\u0ccd",
    vitals: "\u0cb5\u0cc8\u0c9f\u0cb2\u0ccd\u0cb8\u0ccd",
    complaints: "\u0ca6\u0cc2\u0cb0\u0cc1\u0c97\u0cb3\u0cc1",
    diagnosis: "\u0cb0\u0ccb\u0c97\u0ca8\u0cbf\u0ca6\u0cbe\u0ca8",
    medicines: "Rx",
    advice: "\u0cb8\u0cb2\u0cb9\u0cc6",
    testsRequested: "\u0caa\u0cb0\u0cc0\u0c95\u0ccd\u0cb7\u0cc6\u0c97\u0cb3\u0cc1",
    nextVisit: "\u0cae\u0cc1\u0c82\u0ca6\u0cbf\u0ca8 \u0cad\u0cc7\u0c9f\u0cbf",
    type: "\u0caa\u0ccd\u0cb0\u0c95\u0cbe\u0cb0",
    medicine: "\u0c94\u0cb7\u0ca7",
    dose: "\u0ca1\u0ccb\u0cb8\u0ccd",
    when: "\u0caf\u0cbe\u0cb5\u0cbe\u0c97",
    frequency: "\u0c8e\u0cb7\u0ccd\u0c9f\u0cc1 \u0cb8\u0cbe\u0cb0\u0cbf",
    duration: "\u0c85\u0cb5\u0ca7\u0cbf",
    notes: "\u0c9f\u0cbf\u0caa\u0ccd\u0cab\u0ca3\u0cbf",
    noneRecorded: "\u0caf\u0cbe\u0cb5\u0cc1\u0ca6\u0cc2 \u0ca6\u0cbe\u0c96\u0cb2\u0cc6\u0cb8\u0cbf\u0cb2\u0ccd\u0cb2",
    noMedicinesRecorded: "\u0c94\u0cb7\u0ca7 \u0ca6\u0cbe\u0c96\u0cb2\u0cc6\u0cb8\u0cbf\u0cb2\u0ccd\u0cb2",
    notScheduled: "\u0ca8\u0cbf\u0c97\u0ca6\u0cbf\u0caa\u0ca1\u0cbf\u0cb8\u0cb2\u0cbe\u0c97\u0cbf\u0cb2\u0ccd\u0cb2",
    doctorSignature: "\u0ca1\u0cbe\u0c95\u0ccd\u0c9f\u0cb0\u0ccd \u0cb8\u0cb9\u0cbf / \u0cae\u0cc1\u0ca6\u0ccd\u0cb0\u0cc6",
    printLanguage: "\u0cae\u0cc1\u0ca6\u0ccd\u0cb0\u0ca3 \u0cad\u0cbe\u0cb7\u0cc6",
  },
  ml: {
    visitDate: "\u0d38\u0d28\u0d4d\u0d26\u0d30\u0d4d\u0d36\u0d28 \u0d24\u0d40\u0d2f\u0d24\u0d3f",
    phone: "\u0d2b\u0d4b\u0d7a",
    vitals: "\u0d35\u0d48\u0d31\u0d32\u0d4d\u200d\u0d38\u0d4d",
    complaints: "\u0d2a\u0d30\u0d3e\u0d24\u0d3f\u0d15\u0d33\u0d4d",
    diagnosis: "\u0d30\u0d4b\u0d17\u0d28\u0d3f\u0d30\u0d4d\u200d\u0d23\u0d2f\u0d02",
    medicines: "Rx",
    advice: "\u0d09\u0d2a\u0d26\u0d47\u0d36\u0d02",
    testsRequested: "\u0d2a\u0d30\u0d3f\u0d36\u0d4b\u0d27\u0d28\u0d15\u0d33\u0d4d",
    nextVisit: "\u0d05\u0d1f\u0d41\u0d24\u0d4d\u0d24 \u0d38\u0d28\u0d4d\u0d26\u0d30\u0d4d\u0d36\u0d28\u0d02",
    type: "\u0d24\u0d30\u0d02",
    medicine: "\u0d2e\u0d30\u0d41\u0d28\u0d4d\u0d28\u0d41",
    dose: "\u0d21\u0d4b\u0d38\u0d4d",
    when: "\u0d0e\u0d2a\u0d4d\u0d2a\u0d4b\u0d7a",
    frequency: "\u0d0e\u0d24\u0d4d\u0d30 \u0d24\u0d35\u0d23",
    duration: "\u0d15\u0d3e\u0d32\u0d2f\u0d33\u0d35\u0d4d",
    notes: "\u0d15\u0d41\u0d31\u0d3f\u0d2a\u0d4d\u0d2a\u0d41",
    noneRecorded: "\u0d12\u0d28\u0d4d\u0d28\u0d41\u0d02 \u0d30\u0d47\u0d16\u0d2a\u0d4d\u0d2a\u0d46\u0d1f\u0d41\u0d24\u0d3f\u0d2f\u0d3f\u0d9f\u0d4d\u0d1f\u0d3f\u0d32\u0d4d\u0d32",
    noMedicinesRecorded: "\u0d2e\u0d30\u0d41\u0d28\u0d4d\u0d28\u0d41 \u0d30\u0d47\u0d16\u0d2a\u0d4d\u0d2a\u0d46\u0d1f\u0d41\u0d24\u0d3f\u0d2f\u0d3f\u0d9f\u0d4d\u0d1f\u0d3f\u0d32\u0d4d\u0d32",
    notScheduled: "\u0d28\u0d3f\u0d36\u0d4d\u0d1a\u0d2f\u0d3f\u0d1a\u0d4d\u0d9a\u0d3f\u0d9f\u0d4d\u0d1f\u0d3f\u0d32\u0d4d\u0d32",
    doctorSignature: "\u0d21\u0d4b\u0d15\u0d4d\u0d1f\u0d31\u0d41\u0d1f\u0d46 \u0d12\u0d2a\u0d4d\u0d2a\u0d4d / \u0d38\u0d4d\u0d31\u0d3e\u0d2e\u0d4d\u0d2a\u0d4d",
    printLanguage: "\u0d2a\u0d4d\u0d30\u0d3f\u0d7b\u0d1f\u0d4d \u0d2d\u0d3e\u0d37",
  },
  bho: {
    visitDate: "\u092d\u0947\u0902\u091f \u0915\u0947 \u0924\u093e\u0930\u0940\u0916",
    phone: "\u092b\u094b\u0928",
    vitals: "\u0936\u0930\u0940\u0930 \u0915\u0947 \u092e\u093e\u092a",
    complaints: "\u0924\u0915\u0932\u0940\u092b",
    diagnosis: "\u092c\u0940\u092e\u093e\u0930\u0940 \u0915\u0947 \u0928\u093e\u092e",
    medicines: "Rx",
    advice: "\u0938\u0932\u093e\u0939",
    testsRequested: "\u091c\u093e\u0902\u091a",
    nextVisit: "\u0905\u0917\u0932\u093e \u092d\u0947\u0902\u091f",
    type: "\u092a\u094d\u0930\u0915\u093e\u0930",
    medicine: "\u0926\u0935\u093e",
    dose: "\u0916\u0941\u0930\u093e\u0915",
    when: "\u0915\u092c",
    frequency: "\u0915\u0924\u0928\u093e \u092c\u093e\u0930",
    duration: "\u0915\u093f\u0924\u0928\u093e \u0926\u093f\u0928",
    notes: "\u091c\u093e\u0928\u0915\u093e\u0930\u0940",
    noneRecorded: "\u0915\u0941\u091b\u094b \u0932\u093f\u0916\u0932 \u0928\u093e\u0939\u0940\u0902",
    noMedicinesRecorded: "\u0915\u094b\u0908 \u0926\u0935\u093e \u0932\u093f\u0916\u0932 \u0928\u093e\u0939\u0940\u0902",
    notScheduled: "\u0920\u0939\u0930\u093e\u0935\u0932 \u0928\u093e\u0939\u0940\u0902",
    doctorSignature: "\u0921\u093e\u0915\u094d\u091f\u0930 \u0915\u0947 \u0939\u0938\u094d\u0924\u093e\u0915\u094d\u0937\u0930 / \u092e\u0941\u0939\u0930",
    printLanguage: "\u092a\u094d\u0930\u093f\u0902\u091f \u092d\u093e\u0937\u093e",
  },
  pa: {
    visitDate: "\u0a2e\u0a41\u0a32\u0a3e\u0a15\u0a3e\u0a24 \u0a26\u0a40 \u0a24\u0a3e\u0a30\u0a40\u0a16",
    phone: "\u0a2b\u0a4b\u0a28",
    vitals: "\u0a35\u0a3e\u0a08\u0a1f\u0a32\u0a4d\u0a38",
    complaints: "\u0a36\u0a3f\u0a15\u0a3e\u0a07\u0a24\u0a3e\u0a02",
    diagnosis: "\u0a28\u0a3f\u0a26\u0a3e\u0a28",
    medicines: "Rx",
    advice: "\u0a38\u0a32\u0a3e\u0a39",
    testsRequested: "\u0a1f\u0a48\u0a38\u0a1f",
    nextVisit: "\u0a05\u0a17\u0a32\u0a40 \u0a2e\u0a41\u0a32\u0a3e\u0a15\u0a3e\u0a24",
    type: "\u0a15\u0a3f\u0a38\u0a2e",
    medicine: "\u0a26\u0a35\u0a3e\u0a08",
    dose: "\u0a16\u0a41\u0a30\u0a3e\u0a15",
    when: "\u0a15\u0a26\u0a4b\u0a02",
    frequency: "\u0a15\u0a3f\u0a70\u0a28\u0a40 \u0a35\u0a3e\u0a30",
    duration: "\u0a2e\u0a3f\u0a06\u0a26",
    notes: "\u0a39\u0a26\u0a3e\u0a07\u0a24",
    noneRecorded: "\u0a15\u0a41\u0a1d \u0a35\u0a40 \u0a26\u0a30\u0a1c\u0a3c \u0a28\u0a39\u0a40\u0a02",
    noMedicinesRecorded: "\u0a15\u0a4b\u0a08 \u0a26\u0a35\u0a3e\u0a08 \u0a26\u0a30\u0a1c\u0a3c \u0a28\u0a39\u0a40\u0a02",
    notScheduled: "\u0a24\u0a48 \u0a28\u0a39\u0a40\u0a02",
    doctorSignature: "\u0a21\u0a3e\u0a15\u0a1f\u0a30 \u0a26\u0a47 \u0a26\u0a38\u0a24\u0a16\u0a24 / \u0a2e\u0a41\u0a39\u0a30",
    printLanguage: "\u0a2a\u0a4d\u0a30\u0a3f\u0a70\u0a1f \u0a2d\u0a3e\u0a36\u0a3e",
  },
};

const CLINICAL_HISTORY_HEADING_TRANSLATIONS: Record<
  EmrClinicalHistorySection,
  Record<PrintLanguage, string>
> = {
  past_medical_history: {
    en: "Past Medical History",
    hi: "पिछला चिकित्सीय इतिहास",
    bn: "পূর্বের চিকিৎসার ইতিহাস",
    mr: "पूर्व वैद्यकीय इतिहास",
    gu: "ભૂતકાળનો તબીબી ઇતિહાસ",
    ta: "முந்தைய மருத்துவ வரலாறு",
    te: "గత వైద్య చరిత్ర",
    kn: "ಹಿಂದಿನ ವೈದ್ಯಕೀಯ ಇತಿಹಾಸ",
    ml: "മുൻ ചികിത്സാ ചരിത്രം",
    bho: "पिछला इलाज के इतिहास",
    pa: "ਪਿਛਲਾ ਇਲਾਜੀ ਇਤਿਹਾਸ",
  },
  family_history: {
    en: "Family History",
    hi: "पारिवारिक इतिहास",
    bn: "পারিবারিক ইতিহাস",
    mr: "कौटुंबिक इतिहास",
    gu: "કુટુંબ ઇતિહાસ",
    ta: "குடும்ப வரலாறு",
    te: "కుటుంబ చరిత్ర",
    kn: "ಕುಟುಂಬ ಇತಿಹಾಸ",
    ml: "കുടുംബ ചരിത്രം",
    bho: "परिवार के इतिहास",
    pa: "ਪਰਿਵਾਰਕ ਇਤਿਹਾਸ",
  },
  surgical_history: {
    en: "Surgical History",
    hi: "शल्य चिकित्सा इतिहास",
    bn: "অস্ত্রোপচারের ইতিহাস",
    mr: "शस्त्रक्रियेचा इतिहास",
    gu: "શસ્ત્રક્રિયા ઇતિહાસ",
    ta: "அறுவை சிகிச்சை வரலாறு",
    te: "శస్త్రచికిత్స చరిత్ర",
    kn: "ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ ಇತಿಹಾಸ",
    ml: "ശസ്ത്രക്രിയ ചരിത്രം",
    bho: "ऑपरेशन के इतिहास",
    pa: "ਸਰਜਰੀ ਇਤਿਹਾਸ",
  },
  treatment_history: {
    en: "Treatment History",
    hi: "उपचार इतिहास",
    bn: "চিকিৎসার ইতিহাস",
    mr: "उपचार इतिहास",
    gu: "સારવાર ઇતિહાસ",
    ta: "சிகிச்சை வரலாறு",
    te: "చికిత్స చరిత్ర",
    kn: "ಚಿಕಿತ್ಸೆ ಇತಿಹಾಸ",
    ml: "ചികിത്സാ ചരിത്രം",
    bho: "इलाज के इतिहास",
    pa: "ਇਲਾਜ ਇਤਿਹਾਸ",
  },
  allergies: {
    en: "Allergies",
    hi: "एलर्जी",
    bn: "অ্যালার্জি",
    mr: "अॅलर्जी",
    gu: "એલર્જી",
    ta: "ஒவ்வாமை",
    te: "అలర్జీలు",
    kn: "ಅಲರ್ಜಿಗಳು",
    ml: "അലർജി",
    bho: "एलर्जी",
    pa: "ਐਲਰਜੀ",
  },
  personal_social_history: {
    en: "Personal / Social History",
    hi: "व्यक्तिगत / सामाजिक इतिहास",
    bn: "ব্যক্তিগত / সামাজিক ইতিহাস",
    mr: "वैयक्तिक / सामाजिक इतिहास",
    gu: "વ્યક્તિગત / સામાજિક ઇતિહાસ",
    ta: "தனிப்பட்ட / சமூக வரலாறு",
    te: "వ్యక్తిగత / సామాజిక చరిత్ర",
    kn: "ವೈಯಕ್ತಿಕ / ಸಾಮಾಜಿಕ ಇತಿಹಾಸ",
    ml: "വ്യക്തിഗത / സാമൂഹിക ചരിത്രം",
    bho: "व्यक्तिगत / सामाजिक इतिहास",
    pa: "ਨਿੱਜੀ / ਸਮਾਜਿਕ ਇਤਿਹਾਸ",
  },
  examination_findings: {
    en: "Examination Findings",
    hi: "जांच निष्कर्ष",
    bn: "পরীক্ষার ফলাফল",
    mr: "तपासणी निष्कर्ष",
    gu: "તપાસના નિષ્કર્ષ",
    ta: "பரிசோதனை கண்டறிதல்கள்",
    te: "పరీక్షలో కనుగొన్న వివరాలు",
    kn: "ಪರಿಶೀಲನೆ ಕಂಡುಬಂದ ವಿವರಗಳು",
    ml: "പരിശോധന കണ്ടെത്തലുകൾ",
    bho: "जांच के निष्कर्ष",
    pa: "ਜਾਂਚ ਦੇ ਨਤੀਜੇ",
  },
  investigation_findings: {
    en: "Investigation Findings",
    hi: "जांच रिपोर्ट निष्कर्ष",
    bn: "তদন্তের ফলাফল",
    mr: "तपास अहवाल निष्कर्ष",
    gu: "તપાસ રિપોર્ટ નિષ્કર્ષ",
    ta: "ஆய்வு அறிக்கை கண்டறிதல்கள்",
    te: "పరీక్షా నివేదిక వివరాలు",
    kn: "ಪರಿಶೋಧನಾ ವರದಿ ವಿವರಗಳು",
    ml: "പരിശോധന റിപ്പോർട്ട് കണ്ടെത്തലുകൾ",
    bho: "जांच रिपोर्ट के निष्कर्ष",
    pa: "ਜਾਂਚ ਰਿਪੋਰਟ ਦੇ ਨਤੀਜੇ",
  },
};

const PRESCRIPTION_VALIDITY_NOTE_TRANSLATIONS: Record<PrintLanguage, string> = {
  en: "This prescription is valid for one more visit till",
  hi: "यह प्रिस्क्रिप्शन एक और विजिट तक मान्य है",
  bn: "এই প্রেসক্রিপশন আরও একবার ভিজিট পর্যন্ত বৈধ",
  mr: "ही प्रिस्क्रिप्शन आणखी एका भेटीपर्यंत वैध आहे",
  gu: "આ પ્રિસ્ક્રિપ્શન વધુ એક મુલાકાત સુધી માન્ય છે",
  ta: "இந்த பரிந்துரை மேலும் ஒரு வருகை வரை செல்லுபடியாகும்",
  te: "ఈ ప్రిస్క్రిప్షన్ మరో ఒక విజిట్ వరకు చెల్లుతుంది",
  kn: "ಈ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಇನ್ನೊಂದು ಭೇಟಿವರೆಗೆ ಮಾನ್ಯವಾಗಿದೆ",
  ml: "ഈ പ്രിസ്ക്രിപ്ഷൻ ഇനി ഒരു സന്ദർശനം വരെ സാധുവാണ്",
  bho: "ई प्रिस्क्रिप्शन एगो आउर विजिट ले मान्य बा",
  pa: "ਇਹ ਪ੍ਰਿਸਕ੍ਰਿਪਸ਼ਨ ਹੋਰ ਇਕ ਮੁਲਾਕਾਤ ਤੱਕ ਵੈਧ ਹੈ",
};

const CONTROLLED_TIMING_TRANSLATIONS: Record<
  string,
  Partial<Record<Exclude<PrintLanguage, "en">, string>>
> = {
  "before food": {
    hi: "खाने से पहले",
    bn: "খাবারের আগে",
  },
  "after food": {
    hi: "खाने के बाद",
    bn: "খাবারের পরে",
  },
  "empty stomach": {
    hi: "खाली पेट",
    bn: "খালি পেটে",
  },
  "bed time": {
    hi: "सोने से पहले",
    bn: "ঘুমের আগে",
  },
};

const CONTROLLED_FREQUENCY_TRANSLATIONS: Record<
  string,
  Partial<Record<Exclude<PrintLanguage, "en">, string>>
> = {
  daily: {
    hi: "रोज़ाना",
    bn: "প্রতিদিন",
  },
  weekly: {
    hi: "साप्ताहिक",
    bn: "সাপ্তাহিক",
  },
  monthly: {
    hi: "मासिक",
    bn: "মাসিক",
  },
  sos: {
    hi: "ज़रूरत पड़ने पर",
    bn: "প্রয়োজন হলে",
  },
};

const DURATION_UNIT_TRANSLATIONS: Record<
  string,
  Partial<Record<Exclude<PrintLanguage, "en">, string>>
> = {
  day: {
    hi: "दिन",
    bn: "দিন",
  },
  week: {
    hi: "सप्ताह",
    bn: "সপ্তাহ",
  },
  month: {
    hi: "महीना",
    bn: "মাস",
  },
  year: {
    hi: "साल",
    bn: "বছর",
  },
};

const DOSE_SLOT_LABELS: Partial<Record<
  PrintLanguage,
  {
    morning: string;
    afternoon: string;
    evening: string;
    night: string;
    halfDose: string;
    fullDose: string;
  }
>> = {
  en: {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    night: "Night",
    halfDose: "Half dose",
    fullDose: "Full dose",
  },
  hi: {
    morning: "\u0938\u0941\u092c\u0939",
    afternoon: "\u0926\u094b\u092a\u0939\u0930",
    evening: "\u0936\u093e\u092e",
    night: "\u0930\u093e\u0924",
    halfDose: "\u0906\u0927\u0940 \u0916\u0941\u0930\u093e\u0915",
    fullDose: "\u092a\u0942\u0930\u0940 \u0916\u0941\u0930\u093e\u0915",
  },
  bn: {
    morning: "\u09b8\u0995\u09be\u09b2",
    afternoon: "\u09a6\u09c1\u09aa\u09c1\u09b0",
    evening: "\u09b8\u09a8\u09cd\u09a7\u09cd\u09af\u09be",
    night: "\u09b0\u09be\u09a4",
    halfDose: "\u0986\u09a7\u09be \u09a1\u09cb\u099c",
    fullDose: "\u09aa\u09c2\u09b0\u09cd\u09a3 \u09a1\u09cb\u099c",
  },
};

Object.assign(CONTROLLED_TIMING_TRANSLATIONS["before food"], {
  mr: "\u0916\u093e\u0923\u094d\u092f\u093e\u0906\u0927\u0940",
  gu: "\u0a96\u0abe\u0ab5\u0abe \u0aaa\u0ab9\u0ac7\u0ab2\u0abe",
  ta: "\u0b89\u0ba3\u0bb5\u0bc1\u0b95\u0bcd\u0b95\u0bc1 \u0bae\u0bc1\u0ba9\u0bcd",
  te: "\u0c06\u0c39\u0c3e\u0c30\u0c02 \u0c15\u0c02\u0c1f\u0c47 \u0c2e\u0c41\u0c02\u0c26\u0c41",
  kn: "\u0c8a\u0c9f\u0c95\u0ccd\u0c95\u0cbf\u0c82\u0ca4 \u0cae\u0cc1\u0c82\u0c9a\u0cc6",
  ml: "\u0d06\u0d39\u0d3e\u0d30\u0d24\u0d4d\u0d24\u0d3f\u0d28\u0d4d \u0d2e\u0d41\u0d2e\u0d4d\u0d2a\u0d4d",
  bho: "\u0916\u093e\u0928\u093e \u0916\u093e\u090f \u0938\u0947 \u092a\u0939\u093f\u0932\u0947",
  pa: "\u0a16\u0a3e\u0a23 \u0a24\u0a4b\u0a02 \u0a2a\u0a39\u0a3f\u0a32\u0a3e\u0a02",
});
Object.assign(CONTROLLED_TIMING_TRANSLATIONS["after food"], {
  mr: "\u0916\u093e\u0932\u094d\u092f\u093e\u0928\u0902\u0924\u0930",
  gu: "\u0a96\u0abe\u0ab5\u0abe \u0aaa\u0a9b\u0ac0",
  ta: "\u0b89\u0ba3\u0bb5\u0bc1\u0b95\u0bcd\u0b95\u0bc1 \u0baa\u0bbf\u0ba9\u0bcd",
  te: "\u0c06\u0c39\u0c3e\u0c30\u0c02 \u0c24\u0c30\u0c4d\u0c35\u0c3e\u0c24",
  kn: "\u0c8a\u0c9f\u0ca6 \u0ca8\u0c82\u0ca4\u0cb0",
  ml: "\u0d06\u0d39\u0d3e\u0d30\u0d24\u0d4d\u0d24\u0d3f\u0d28\u0d4d \u0d36\u0d47\u0d37\u0d02",
  bho: "\u0916\u093e\u0928\u093e \u0916\u093e\u090f \u0915\u0947 \u092c\u093e\u0926",
  pa: "\u0a16\u0a3e\u0a23 \u0a24\u0a4b\u0a02 \u0a2c\u0a3e\u0a05\u0a26",
});
Object.assign(CONTROLLED_TIMING_TRANSLATIONS["empty stomach"], {
  mr: "\u0916\u093e\u0932\u0940 \u092a\u094b\u091f\u0940",
  gu: "\u0a96\u0abe\u0ab2\u0ac0 \u0aaa\u0ac7\u0a9f\u0ac7",
  ta: "\u0b95\u0bbe\u0bb2\u0bbf \u0bb5\u0baf\u0bbf\u0bb1\u0bcd\u0bb1\u0bbf\u0bb2\u0bcd",
  te: "\u0c16\u0c3e\u0c33\u0c40 \u0c15\u0c21\u0c41\u0c2a\u0c41\u0c24\u0c4b",
  kn: "\u0c96\u0cbe\u0cb2\u0cbf \u0cb9\u0cca\u0c9f\u0ccd\u0c9f\u0cc6\u0caf\u0cb2\u0ccd\u0cb2\u0cbf",
  ml: "\u0d12\u0d34\u0d3f\u0d1e\u0d4d\u0d1e \u0d35\u0d2f\u0d31\u0d4d\u0d31\u0d3f\u0d32\u0d4d",
  bho: "\u0916\u093e\u0932\u0940 \u092a\u0947\u091f",
  pa: "\u0a16\u0a3e\u0a32\u0a40 \u0a2a\u0a47\u0a1f",
});
Object.assign(CONTROLLED_TIMING_TRANSLATIONS["bed time"], {
  mr: "\u091d\u094b\u092a\u0923\u094d\u092f\u093e\u0906\u0927\u0940",
  gu: "\u0ab8\u0ac2\u0ab5\u0abe \u0aaa\u0ab9\u0ac7\u0ab2\u0abe",
  ta: "\u0ba4\u0bc2\u0b99\u0bcd\u0b95 \u0baa\u0bcb\u0bb5\u0ba4\u0bb1\u0bcd\u0b95\u0bc1 \u0bae\u0bc1\u0ba9\u0bcd",
  te: "\u0c28\u0c3f\u0c26\u0c4d\u0c30\u0c15\u0c41 \u0c2e\u0c41\u0c02\u0c26\u0c41",
  kn: "\u0ca8\u0cbf\u0ca6\u0ccd\u0cb0\u0cc6\u0c97\u0cc6 \u0cae\u0cc1\u0c82\u0c9a\u0cc6",
  ml: "\u0d09\u0d31\u0d19\u0d4d\u0d19\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d3f\u0d28\u0d4d \u0d2e\u0d41\u0d2e\u0d4d\u0d2a\u0d4d",
  bho: "\u0938\u094b\u090f \u0938\u0947 \u092a\u0939\u093f\u0932\u0947",
  pa: "\u0a38\u0a4c\u0a23 \u0a24\u0a4b\u0a02 \u0a2a\u0a39\u0a3f\u0a32\u0a3e\u0a02",
});

Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS.daily, {
  mr: "\u0926\u0930\u0930\u094b\u091c",
  gu: "\u0aa6\u0ab0\u0ab0\u0acb\u0a9c",
  ta: "\u0ba4\u0bbf\u0ba9\u0bae\u0bc1\u0bae\u0bcd",
  te: "\u0c30\u0c4b\u0c1c\u0c42",
  kn: "\u0ca6\u0cbf\u0ca8\u0cb5\u0cc2",
  ml: "\u0d26\u0d3f\u0d35\u0d38\u0d35\u0d41\u0d02",
  bho: "\u0930\u094b\u091c",
  pa: "\u0a39\u0a30 \u0a30\u0a4b\u0a1c\u0a3c",
});
Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS.weekly, {
  mr: "\u0926\u0930 \u0906\u0920\u0935\u0921\u094d\u092f\u093e\u0932\u093e",
  gu: "\u0aa6\u0ab0 \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0ac7",
  ta: "\u0bb5\u0bbe\u0bb0\u0bbe\u0ba8\u0bcd\u0ba4\u0bbf\u0bb0",
  te: "\u0c35\u0c3e\u0c30\u0c3e\u0c28\u0c3f\u0c15\u0c4a\u0c15\u0c38\u0c3e\u0c30\u0c3f",
  kn: "\u0cb5\u0cbe\u0cb0\u0c95\u0ccd\u0c95\u0cca\u0cae\u0ccd\u0cae\u0cc6",
  ml: "\u0d06\u0d34\u0d4d\u0d1a\u0d24\u0d4b\u0d31\u0d41\u0d02",
  bho: "\u0939\u0930 \u0939\u092a\u094d\u0924\u093e",
  pa: "\u0a39\u0a30 \u0a39\u0a2b\u0a3c\u0a24\u0a47",
});
Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS.monthly, {
  mr: "\u0926\u0930 \u092e\u0939\u093f\u0928\u094d\u092f\u093e\u0932\u093e",
  gu: "\u0aa6\u0ab0 \u0aae\u0ab9\u0abf\u0aa8\u0ac7",
  ta: "\u0bae\u0bbe\u0ba4\u0bbe\u0ba8\u0bcd\u0ba4\u0bbf\u0bb0",
  te: "\u0c28\u0c46\u0cb2\u0c15\u0c4a\u0c15\u0c38\u0c3e\u0c30\u0c3f",
  kn: "\u0ca4\u0cbf\u0c82\u0c97\u0cb3\u0cbf\u0c97\u0cca\u0cae\u0ccd\u0cae\u0cc6",
  ml: "\u0d2e\u0d3e\u0d38\u0d24\u0d4b\u0d31\u0d41\u0d02",
  bho: "\u0939\u0930 \u092e\u0939\u0940\u0928\u093e",
  pa: "\u0a39\u0a30 \u0a2e\u0a39\u0a40\u0a28\u0a47",
});
Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS.sos, {
  mr: "\u0917\u0930\u091c\u0947\u0928\u0941\u0938\u093e\u0930",
  gu: "\u0a9c\u0ab0\u0ac2\u0ab0 \u0aaa\u0aa1\u0ac7 \u0aa4\u0acd\u0aaf\u0abe\u0ab0\u0ac7",
  ta: "\u0ba4\u0bc7\u0bb5\u0bc8\u0baa\u0bcd\u0baa\u0b9f\u0bcd\u0b9f\u0bbe\u0bb2\u0bcd",
  te: "\u0c05\u0c35\u0c38\u0c30\u0c02 \u0c09\u0c02\u0c1f\u0c47",
  kn: "\u0c85\u0c97\u0ca4\u0ccd\u0caf\u0cb5\u0cbf\u0ca6\u0ccd\u0ca6\u0cbe\u0c97",
  ml: "\u0d06\u0d35\u0d36\u0d4d\u0d2f\u0d2e\u0d41\u0d23\u0d4d\u0d1f\u0d46\u0d19\u0d4d\u0d15\u0d3f\u0d32\u0d4d",
  bho: "\u091c\u0930\u0942\u0930\u0924 \u092a\u0921\u093c\u0947 \u092a\u0930",
  pa: "\u0a1c\u0a26\u0a4b\u0a02 \u0a32\u0a4b\u0a5c \u0a2a\u0a35\u0a47",
});
Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS, {
  stat: {
    hi: "तुरंत",
    bn: "তৎক্ষণাৎ",
    mr: "तात्काळ",
    gu: "તરત જ",
    ta: "உடனே",
    te: "వెంటనే",
    kn: "ತಕ್ಷಣ",
    ml: "ഉടനെ",
    bho: "तुरंत",
    pa: "ਤੁਰੰਤ",
  },
});
Object.assign(CONTROLLED_FREQUENCY_TRANSLATIONS, {
  "alternate day": {
    hi: "एक दिन छोड़कर",
    bn: "একদিন অন্তর",
    mr: "एक दिवस आड",
    gu: "એક દિવસ છોડીને",
    ta: "ஒரு நாள் விட்டு ஒரு நாள்",
    te: "ఒక రోజు విడిచి ఒక రోజు",
    kn: "ಒಂದು ದಿನ ಬಿಟ್ಟು ಒಂದು ದಿನ",
    ml: "ഒരു ദിവസം ഇടവിട്ട്",
    bho: "एक दिन छोड़ के",
    pa: "ਇੱਕ ਦਿਨ ਛੱਡ ਕੇ",
  },
  fortnight: {
    hi: "पंद्रह दिन में एक बार",
    bn: "পাক্ষিক",
    mr: "पंधरा दिवसातून एकदा",
    gu: "પંદર દિવસે એક વાર",
    ta: "பதினைந்து நாளுக்கு ஒருமுறை",
    te: "పదిహేను రోజులకు ఒకసారి",
    kn: "ಹದಿನೈದು ದಿನಕ್ಕೊಮ್ಮೆ",
    ml: "പതിനഞ്ച് ദിവസത്തിലൊരിക്കൽ",
    bho: "पंद्रह दिन पर एक बेर",
    pa: "ਪੰਦਰਾਂ ਦਿਨਾਂ ਵਿੱਚ ਇੱਕ ਵਾਰ",
  },
  "weekly twice": {
    hi: "सप्ताह में दो बार",
    bn: "সপ্তাহে দুইবার",
    mr: "आठवड्यातून दोनदा",
    gu: "અઠવાડિયામાં બે વાર",
    ta: "வாரத்தில் இரண்டு முறை",
    te: "వారానికి రెండు సార్లు",
    kn: "ವಾರಕ್ಕೆ ಎರಡು ಬಾರಿ",
    ml: "ആഴ്ചയിൽ രണ്ട് പ്രാവശ്യം",
    bho: "हप्ता में दू बेर",
    pa: "ਹਫ਼ਤੇ ਵਿੱਚ ਦੋ ਵਾਰ",
  },
  "weekly thrice": {
    hi: "सप्ताह में तीन बार",
    bn: "সপ্তাহে তিনবার",
    mr: "आठवड्यातून तीनदा",
    gu: "અઠવાડિયામાં ત્રણ વાર",
    ta: "வாரத்தில் மூன்று முறை",
    te: "వారానికి మూడు సార్లు",
    kn: "ವಾರಕ್ಕೆ ಮೂರು ಬಾರಿ",
    ml: "ആഴ്ചയിൽ മൂന്ന് പ്രാവശ്യം",
    bho: "हप्ता में तीन बेर",
    pa: "ਹਫ਼ਤੇ ਵਿੱਚ ਤਿੰਨ ਵਾਰ",
  },
});

Object.assign(DURATION_UNIT_TRANSLATIONS.day, {
  mr: "\u0926\u093f\u0935\u0938",
  gu: "\u0aa6\u0abf\u0ab5\u0ab8",
  ta: "\u0ba8\u0bbe\u0bb3\u0bcd",
  te: "\u0c30\u0c4b\u0c1c\u0c41",
  kn: "\u0ca6\u0cbf\u0ca8",
  ml: "\u0d26\u0d3f\u0d35\u0d38\u0d02",
  bho: "\u0926\u093f\u0928",
  pa: "\u0a26\u0a3f\u0a28",
});
Object.assign(DURATION_UNIT_TRANSLATIONS.week, {
  mr: "\u0906\u0920\u0935\u0921\u093e",
  gu: "\u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0ac1\u0a82",
  ta: "\u0bb5\u0bbe\u0bb0\u0bae\u0bcd",
  te: "\u0c35\u0c3e\u0c30\u0c02",
  kn: "\u0cb5\u0cbe\u0cb0",
  ml: "\u0d06\u0d34\u0d4d\u0d1a",
  bho: "\u0939\u092a\u094d\u0924\u093e",
  pa: "\u0a39\u0a2b\u0a3c\u0a24\u0a3e",
});
Object.assign(DURATION_UNIT_TRANSLATIONS.month, {
  mr: "\u092e\u0939\u093f\u0928\u093e",
  gu: "\u0aae\u0ab9\u0abf\u0aa8\u0acb",
  ta: "\u0bae\u0bbe\u0ba4\u0bae\u0bcd",
  te: "\u0c28\u0c46\u0cb2",
  kn: "\u0ca4\u0cbf\u0c82\u0c97\u0cb3\u0cc1",
  ml: "\u0d2e\u0d3e\u0d38\u0d02",
  bho: "\u092e\u0939\u0940\u0928\u093e",
  pa: "\u0a2e\u0a39\u0a40\u0a28\u0a3e",
});
Object.assign(DURATION_UNIT_TRANSLATIONS.year, {
  mr: "\u0935\u0930\u094d\u0937",
  gu: "\u0ab5\u0ab0\u0acd\u0ab7",
  ta: "\u0b86\u0ba3\u0bcd\u0b9f\u0bc1",
  te: "\u0c38\u0c02\u0c35\u0c24\u0d4d\u0d38\u0c30\u0c02",
  kn: "\u0cb5\u0cb0\u0ccd\u0cb7",
  ml: "\u0d35\u0d7c\u0d37\u0d02",
  bho: "\u0938\u093e\u0932",
  pa: "\u0a38\u0a3e\u0a32",
});

Object.assign(DOSE_SLOT_LABELS, {
  mr: {
    morning: "\u0938\u0915\u093e\u0933\u0940",
    afternoon: "\u0926\u0941\u092a\u093e\u0930\u0940",
    evening: "\u0938\u0902\u0927\u094d\u092f\u093e\u0915\u093e\u0933\u0940",
    night: "\u0930\u093e\u0924\u094d\u0930\u0940",
    halfDose: "\u0905\u0930\u094d\u0927\u093e \u0921\u094b\u0938",
    fullDose: "\u092a\u0942\u0930\u094d\u0923 \u0921\u094b\u0938",
  },
  gu: {
    morning: "\u0ab8\u0ab5\u0abe\u0ab0\u0ac7",
    afternoon: "\u0aac\u0aaa\u0acb\u0ab0\u0ac7",
    evening: "\u0ab8\u0abe\u0a82\u0a9c\u0ac7",
    night: "\u0ab0\u0abe\u0aa4\u0ac7",
    halfDose: "\u0a85\u0aa7\u0acb \u0aa1\u0acb\u0a9d",
    fullDose: "\u0aaa\u0ac2\u0ab0\u0acb \u0aa1\u0acb\u0a9d",
  },
  ta: {
    morning: "\u0b95\u0bbe\u0bb2\u0bc8",
    afternoon: "\u0baa\u0bbf\u0bb1\u0bcd\u0baa\u0b95\u0bb2\u0bcd",
    evening: "\u0bae\u0bbe\u0bb2\u0bc8",
    night: "\u0b87\u0bb0\u0bb5\u0bc1",
    halfDose: "\u0b85\u0bb0\u0bc8 \u0baa\u0b99\u0bcd\u0b95\u0bc1 \u0baa\u0bcb\u0ba4\u0bcd\u0ba4\u0bc1",
    fullDose: "\u0bae\u0bc1\u0bb4\u0bc1 \u0baa\u0b99\u0bcd\u0b95\u0bc1 \u0baa\u0bcb\u0ba4\u0bcd\u0ba4\u0bc1",
  },
  te: {
    morning: "\u0c09\u0c26\u0c2f\u0c02",
    afternoon: "\u0c2e\u0c27\u0c4d\u0c2f\u0c3e\u0c39\u0c4d\u0c28\u0c02",
    evening: "\u0c38\u0c3e\u0c2f\u0c02\u0c24\u0c4d\u0c30\u0c02",
    night: "\u0c30\u0c3e\u0c24\u0c4d\u0c30\u0c3f",
    halfDose: "\u0c05\u0c30\u0c27 \u0c21\u0c4b\u0c38\u0c4d",
    fullDose: "\u0c2a\u0c42\u0c30\u0c4d\u0c24\u0c3f \u0c21\u0c4b\u0c38\u0c4d",
  },
  kn: {
    morning: "\u0cac\u0cc6\u0cb3\u0a97\u0ccd\u0c97\u0cc6",
    afternoon: "\u0cae\u0ca7\u0ccd\u0caf\u0cbe\u0cb9\u0ccd\u0ca8",
    evening: "\u0cb8\u0c82\u0ca7\u0ccd\u0caf\u0cc6",
    night: "\u0cb0\u0cbe\u0ca4\u0ccd\u0cb0\u0cbf",
    halfDose: "\u0c85\u0cb0\u0ccd\u0ca7 \u0ca1\u0ccb\u0cb8\u0ccd",
    fullDose: "\u0caa\u0cc2\u0cb0\u0ccd\u0ca3 \u0ca1\u0ccb\u0cb8\u0ccd",
  },
  ml: {
    morning: "\u0d30\u0d3e\u0d35\u0d3f\u0d32\u0d46",
    afternoon: "\u0d09\u0d1a\u0d4d\u0d1a\u0d15\u0d4d\u0d15\u0d4d",
    evening: "\u0d35\u0d47\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d47\u0d30\u0d02",
    night: "\u0d30\u0d3e\u0d24\u0d4d\u0d30\u0d3f",
    halfDose: "\u0d05\u0d30 \u0d21\u0d4b\u0d38\u0d4d",
    fullDose: "\u0d2e\u0d41\u0d34\u0d41\u0d35\u0d7b \u0d21\u0d4b\u0d38\u0d4d",
  },
  bho: {
    morning: "\u0938\u0935\u0947\u0930\u0947",
    afternoon: "\u0926\u0941\u092a\u0939\u0930\u093f\u092f\u093e",
    evening: "\u0938\u0902\u091d\u093e",
    night: "\u0930\u093e\u0924",
    halfDose: "\u0906\u0927\u093e \u0921\u094b\u091c",
    fullDose: "\u092a\u0942\u0930\u093e \u0921\u094b\u091c",
  },
  pa: {
    morning: "\u0a38\u0a35\u0a47\u0a30",
    afternoon: "\u0a26\u0a41\u0a2a\u0a39\u0a3f\u0a30",
    evening: "\u0a36\u0a3e\u0a2e",
    night: "\u0a30\u0a3e\u0a24",
    halfDose: "\u0a05\u0a71\u0a27\u0a40 \u0a16\u0a41\u0a30\u0a3e\u0a15",
    fullDose: "\u0a2a\u0a42\u0a30\u0a40 \u0a16\u0a41\u0a30\u0a3e\u0a15",
  },
} satisfies Record<Exclude<PrintLanguage, "en" | "hi" | "bn">, {
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
  halfDose: string;
  fullDose: string;
}>);

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function formatDateDdMmYyyy(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function toUpperDisplayValue(value: string | null | undefined, fallback = "-") {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : fallback;
}

function toUpperListDisplay(items: Array<{ name: string }>) {
  return items.map((item) => item.name.trim().toUpperCase()).filter(Boolean).join(", ");
}

function toUpperText(value: string | null | undefined, fallback = "-") {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : fallback;
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

function formatDoseInput(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const tokens = parseCompactDoseTokens(trimmed);
  return tokens ? tokens.join(DOSE_SEPARATOR) : trimmed;
}

function getClinicalHistoryDetails(
  prescription: EmrPrintablePrescription["prescription"],
  section: EmrClinicalHistorySection
) {
  return (prescription.clinical_history ?? [])
    .filter((item) => item.section === section)
    .map((item) => item.details.trim())
    .filter(Boolean);
}

function getVitalsSummaryEntries(
  vitals: Record<string, string | null | undefined> | null | undefined,
  language: PrintLanguage
) {
  if (!vitals) return [];

  return [
    {
      key: VITAL_LABEL_TRANSLATIONS.PULSE[language].toUpperCase(),
      value: vitals.pulse?.trim(),
      unit: "bpm",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.BP[language].toUpperCase(),
      value: vitals.bp?.trim(),
      unit: "mmHg",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.SPO2[language].toUpperCase(),
      value: vitals.spo2?.trim(),
      unit: "%",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.TEMP[language].toUpperCase(),
      value: vitals.temperature?.trim(),
      unit: "°F",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.HEIGHT[language].toUpperCase(),
      value: vitals.height?.trim(),
      unit: "cm",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.WEIGHT[language].toUpperCase(),
      value: vitals.weight?.trim(),
      unit: "kg",
    },
    {
      key: VITAL_LABEL_TRANSLATIONS.BMI[language].toUpperCase(),
      value: vitals.bmi?.trim(),
      unit: "kg/m2",
    },
  ].filter((entry) => Boolean(entry.value));
}

function formatPatientSummary(patient: {
  full_name: string | null;
  age: number | null;
  gender: string | null;
}) {
  const name = patient.full_name?.trim() || "Patient";
  const gender = patient.gender?.trim();
  const genderShort =
    gender?.toLowerCase() === "male"
      ? "M"
      : gender?.toLowerCase() === "female"
        ? "°F"
        : gender?.toLowerCase() === "other"
          ? "O"
          : gender?.toLowerCase() === "prefer not to say"
            ? "PNS"
            : null;

  const meta = [
    patient.age && patient.age > 0 ? `${patient.age}y` : null,
    genderShort,
  ].filter(Boolean);

  return (meta.length > 0 ? `${name} (${meta.join(", ")})` : name).toUpperCase();
}

const PRESCRIPTION_NUMBER_LABEL_TRANSLATIONS: Record<PrintLanguage, string> = {
  en: "Prescription No.",
  hi: "प्रिस्क्रिप्शन नंबर",
  bn: "প্রেসক্রিপশন নম্বর",
  mr: "प्रिस्क्रिप्शन क्रमांक",
  gu: "પ્રિસ્ક્રિપ્શન નંબર",
  ta: "பரிந்துரை எண்",
  te: "ప్రిస్క్రిప్షన్ నంబర్",
  kn: "ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸಂಖ್ಯೆ",
  ml: "പ്രിസ്ക്രിപ്ഷൻ നമ്പർ",
  bho: "प्रिस्क्रिप्शन नंबर",
  pa: "ਪ੍ਰਿਸਕ੍ਰਿਪਸ਼ਨ ਨੰਬਰ",
};

const DOSE_SPECIAL_TRANSLATIONS: Record<
  string,
  Partial<Record<Exclude<PrintLanguage, "en">, string>>
> = {
  sos: {
    hi: "ज़रूरत पड़ने पर",
    bn: "প্রয়োজন হলে",
    mr: "गरजेनुसार",
    gu: "જરૂર પડે ત્યારે",
    ta: "தேவைப்பட்டால்",
    te: "అవసరం ఉంటే",
    kn: "ಅಗತ್ಯವಿದ್ದಾಗ",
    ml: "ആവശ്യമുണ്ടെങ്കിൽ",
    bho: "जरूरत पड़े पर",
    pa: "ਜਦੋਂ ਲੋੜ ਪਵੇ",
  },
};

const VITAL_LABEL_TRANSLATIONS: Record<
  "PULSE" | "BP" | "SPO2" | "TEMP" | "HEIGHT" | "WEIGHT" | "BMI",
  Record<PrintLanguage, string>
> = {
  PULSE: {
    en: "Pulse",
    hi: "नाड़ी",
    bn: "পালস",
    mr: "नाडी",
    gu: "નાડી",
    ta: "நாடி",
    te: "నాడి",
    kn: "ನಾಡಿ",
    ml: "നാടി",
    bho: "नाड़ी",
    pa: "ਨਬਜ਼",
  },
  BP: {
    en: "BP",
    hi: "बीपी",
    bn: "বিপি",
    mr: "बीपी",
    gu: "બીપી",
    ta: "பிபி",
    te: "బీపీ",
    kn: "ಬಿಪಿ",
    ml: "ബി.പി",
    bho: "बीपी",
    pa: "ਬੀਪੀ",
  },
  SPO2: {
    en: "SpO2",
    hi: "एसपीओ2",
    bn: "এসপিও2",
    mr: "एसपीओ2",
    gu: "એસપીઓ2",
    ta: "எஸ்பிஓ2",
    te: "ఎస్పీఓ2",
    kn: "ಎಸ್‌ಪಿಒ2",
    ml: "എസ്‌പിഒ2",
    bho: "एसपीओ2",
    pa: "ਐਸਪੀਓ2",
  },
  TEMP: {
    en: "Temp",
    hi: "तापमान",
    bn: "তাপমাত্রা",
    mr: "तापमान",
    gu: "તાપમાન",
    ta: "வெப்பநிலை",
    te: "ఉష్ణోగ్రత",
    kn: "ತಾಪಮಾನ",
    ml: "താപനില",
    bho: "तापमान",
    pa: "ਤਾਪਮਾਨ",
  },
  HEIGHT: {
    en: "Height",
    hi: "लंबाई",
    bn: "উচ্চতা",
    mr: "उंची",
    gu: "ઊંચાઈ",
    ta: "உயரம்",
    te: "ఎత్తు",
    kn: "ಎತ್ತರ",
    ml: "ഉയരം",
    bho: "लंबाई",
    pa: "ਕੱਦ",
  },
  WEIGHT: {
    en: "Weight",
    hi: "वजन",
    bn: "ওজন",
    mr: "वजन",
    gu: "વજન",
    ta: "எடை",
    te: "బరువు",
    kn: "ತೂಕ",
    ml: "ഭാരം",
    bho: "वजन",
    pa: "ਵਜ਼ਨ",
  },
  BMI: {
    en: "BMI",
    hi: "बीएमआई",
    bn: "বিএমআই",
    mr: "बीएमआय",
    gu: "બીએમઆઈ",
    ta: "பிஎம்ஐ",
    te: "బిఎంఐ",
    kn: "ಬಿಎಂಐ",
    ml: "ബി.എം.ഐ",
    bho: "बीएमआई",
    pa: "ਬੀਐਮਆਈ",
  },
};

function cssLength(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

function cssPageLength(value: string | null | undefined, fallback: string) {
  const normalized = cssLength(value, fallback).toLowerCase();
  return /^-?\d+(\.\d+)?(mm|cm|px|pt)$/.test(normalized) ? normalized : fallback;
}

function cssPageCalc(...parts: string[]) {
  const safeParts = parts.map((part) => cssPageLength(part, "0mm"));
  return `calc(${safeParts.join(" + ")})`;
}

function buildPrintSurfaceStyle(layout: EmrPrintablePrescription["layout_settings"]) {
  const fontSize = cssLength(layout.font_size, "14px");

  return {
    fontFamily: layout.font_family || undefined,
    fontSize,
    textTransform: "uppercase",
    "--emr-print-font-size": fontSize,
  } as CSSProperties;
}

function buildRepeatingPageMarginCss({
  top,
  right,
  bottom,
  left,
}: {
  top: string;
  right: string;
  bottom: string;
  left: string;
}) {
  return `
    @media print {
      @page {
        size: A4 portrait;
        margin: ${top} ${right} ${bottom} ${left};
      }

      .emr-a4-print-page {
        width: auto !important;
        margin: 0 !important;
      }

      .emr-print-content {
        padding: 0 !important;
      }
    }
  `;
}

function hasVisibleReservedSpace(value: string | null | undefined) {
  if (!value) return false;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function translateControlledValue(
  value: string | null | undefined,
  language: PrintLanguage,
  dictionary: Record<string, Partial<Record<Exclude<PrintLanguage, "en">, string>>>
) {
  const normalized = value?.trim();
  if (!normalized) return "-";
  if (language === "en") return normalized.toUpperCase();

  const translated = dictionary[normalized.toLowerCase()]?.[language];
  return translated ? translated.toUpperCase() : normalized.toUpperCase();
}

function formatDuration(
  input: {
    duration_text?: string | null;
    duration_value?: number | null;
    duration_unit?: string | null;
  },
  language: PrintLanguage
) {
  if (input.duration_text?.trim()) {
    const normalizedText = input.duration_text.trim();
    const parts = normalizedText.match(/^(\d+(?:\.\d+)?)\s+([a-zA-Z]+)$/);

    if (parts) {
      const [, value, unitLabel] = parts;
      const singularUnit = unitLabel.toLowerCase().replace(/s$/, "");

      if (language === "en") {
        return `${value} ${singularUnit}`.toUpperCase();
      }

      const translatedUnit = DURATION_UNIT_TRANSLATIONS[singularUnit]?.[language];
    return translatedUnit
        ? `${value} ${translatedUnit}`.toUpperCase()
        : normalizedText.toUpperCase();
    }

    return normalizedText.toUpperCase();
  }

  if (!input.duration_value || !input.duration_unit) {
    return "-";
  }

  const normalizedUnit = input.duration_unit.trim().toLowerCase();
  if (language === "en") {
    return `${input.duration_value} ${normalizedUnit}`.toUpperCase();
  }

  const translatedUnit = DURATION_UNIT_TRANSLATIONS[normalizedUnit]?.[language];
  return translatedUnit
    ? `${input.duration_value} ${translatedUnit}`.toUpperCase()
    : `${input.duration_value} ${normalizedUnit}`.toUpperCase();
}

function formatFollowUpSummary(
  summary: {
    date: string;
    slot_time: string;
    clinic_name: string | null;
  } | null | undefined
) {
  if (!summary?.date || !summary.slot_time) return "";

  const [hours, minutes] = summary.slot_time.split(":").map(Number);
  const slotDate = new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0));
  const formattedTime = slotDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).toUpperCase();

  return [
    formatDateDdMmYyyy(summary.date),
    formattedTime,
    summary.clinic_name?.trim() ? summary.clinic_name.trim().toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function calculatePrescriptionValidityTill(input: {
  baseDate: string | null | undefined;
  value: number | null | undefined;
  unit: "day" | "week" | "month" | "year" | null | undefined;
}) {
  if (!input.baseDate || !input.value || !input.unit) {
    return null;
  }

  const base = new Date(input.baseDate);
  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const next = new Date(base.getTime());
  if (input.unit === "day") {
    next.setUTCDate(next.getUTCDate() + input.value);
  } else if (input.unit === "week") {
    next.setUTCDate(next.getUTCDate() + input.value * 7);
  } else if (input.unit === "month") {
    next.setUTCMonth(next.getUTCMonth() + input.value);
  } else if (input.unit === "year") {
    next.setUTCFullYear(next.getUTCFullYear() + input.value);
  }

  return next;
}

function getDoseExplanation(
  dose: string | null | undefined,
  language: PrintLanguage
) {
  const normalized = formatDoseInput(dose);
  if (!normalized) return null;

  const labels = DOSE_SLOT_LABELS[language] ?? DOSE_SLOT_LABELS.en!;
  const compact = normalized.toLowerCase().replace(/\s+/g, "");

  if (compact === "1/2" || compact === "half") {
    return labels.halfDose.toUpperCase();
  }

  if (compact === "full") {
    return labels.fullDose.toUpperCase();
  }

  if (compact === "sos") {
    if (language === "en") return "SOS";
    return (DOSE_SPECIAL_TRANSLATIONS.sos[language] ?? "SOS").toUpperCase();
  }

  const fourPartMatch = normalized.match(
    /^\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*$/
  );

  if (fourPartMatch) {
    const [, morningValue, afternoonValue, eveningValue, nightValue] = fourPartMatch;
    const entries = [
      morningValue !== "0" ? `${labels.morning}: ${morningValue}` : null,
      afternoonValue !== "0" ? `${labels.afternoon}: ${afternoonValue}` : null,
      eveningValue !== "0" ? `${labels.evening}: ${eveningValue}` : null,
      nightValue !== "0" ? `${labels.night}: ${nightValue}` : null,
    ].filter(Boolean);

    return entries.length > 0 ? entries.join(", ").toUpperCase() : null;
  }

  const threePartMatch = normalized.match(
    /^\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*$/
  );
  if (!threePartMatch) return null;

  const [, morningValue, afternoonValue, nightValue] = threePartMatch;
  const entries = [
    morningValue !== "0" ? `${labels.morning}: ${morningValue}` : null,
    afternoonValue !== "0" ? `${labels.afternoon}: ${afternoonValue}` : null,
    nightValue !== "0" ? `${labels.night}: ${nightValue}` : null,
  ].filter(Boolean);

  return entries.length > 0 ? entries.join(", ").toUpperCase() : null;
}

function formatDoctorSpecificPrescriptionNumber(input: {
  prescription_no: string;
  doctor_id: number;
  doctor_sequence_no: number | null;
}) {
  if (
    typeof input.doctor_sequence_no === "number" &&
    Number.isFinite(input.doctor_sequence_no) &&
    input.doctor_sequence_no > 0
  ) {
    return `RX-${input.doctor_id}-${String(input.doctor_sequence_no).padStart(6, "0")}`;
  }

  return input.prescription_no;
}

export default function EmrPrintablePrescriptionView({
  printable,
  backHref,
}: {
  printable: EmrPrintablePrescription;
  backHref: string;
}) {
  const [language, setLanguage] = useState<PrintLanguage>("en");

  const layout = printable.layout_settings;
  const printVisibility = layout.print_visibility_json;
  const prescription = printable.prescription;
  const printPlacement = layout.page_margin_json;
  const pageTop = cssLength(printPlacement.top, "24px");
  const pageRight = cssLength(printPlacement.right, "24px");
  const pageBottom = cssLength(printPlacement.bottom, "24px");
  const pageLeft = cssLength(printPlacement.left, "24px");
  const offsetX = cssLength(printPlacement.offset_x, "0mm");
  const offsetY = cssLength(printPlacement.offset_y, "0mm");
  const headerSpace = cssLength(printPlacement.header_space, "0mm");
  const footerSpace = cssLength(printPlacement.footer_space, "0mm");
  const leftStripSpace = cssLength(printPlacement.left_strip_space, "0mm");
  const rightStripSpace = cssLength(printPlacement.right_strip_space, "0mm");
  const showHeaderImage =
    printPlacement.show_header_image !== false && Boolean(layout.header_image_url);
  const showFooterImage =
    printPlacement.show_footer_image !== false && Boolean(layout.footer_image_url);
  const showClinicLogo =
    printPlacement.show_clinic_logo !== false && Boolean(layout.clinic_logo_url);
  const showSignature =
    printPlacement.show_signature !== false && Boolean(layout.doctor_signature_url);
  const showPrescriptionValidity =
    printPlacement.show_prescription_validity === true &&
    Boolean(printPlacement.prescription_validity_value) &&
    Boolean(printPlacement.prescription_validity_unit);
  const showPrescriptionNumber = printPlacement.show_prescription_number === true;
  const hasHeaderReserve =
    hasVisibleReservedSpace(printPlacement.header_space) ||
    showHeaderImage ||
    showClinicLogo;
  const hasFooterReserve =
    hasVisibleReservedSpace(printPlacement.footer_space) ||
    showFooterImage ||
    showSignature;
  const repeatingPageMargins = buildRepeatingPageMarginCss({
    top: cssPageCalc(pageTop, headerSpace, offsetY),
    right: cssPageCalc(pageRight, rightStripSpace),
    bottom: cssPageCalc(pageBottom, footerSpace),
    left: cssPageCalc(pageLeft, leftStripSpace, offsetX),
  });

  const t = useMemo(() => UI_TRANSLATIONS[language], [language]);
  const prescriptionValidityTill = showPrescriptionValidity
    ? calculatePrescriptionValidityTill({
        baseDate: prescription.finalized_at ?? prescription.visit_date,
        value: printPlacement.prescription_validity_value ?? null,
        unit: printPlacement.prescription_validity_unit ?? null,
      })
    : null;
  const vitalsSummaryEntries = getVitalsSummaryEntries(prescription.vitals || null, language);
  const hasNextVisit = Boolean(
    prescription.follow_up_appointment || prescription.next_visit_date
  );
  const visiblePrintSectionOrder = layout.section_order_json.filter(
    (section) => printVisibility[section]
  );

  const renderPrintSection = (section: EmrLayoutSectionKey) => {
    switch (section) {
      case "vitals":
        return vitalsSummaryEntries.length > 0 ? (
          <section
            key={section}
            className="emr-print-section space-y-3 print:space-y-1"
          >
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.vitals)}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-0 py-0 text-sm text-gray-700 print:gap-x-3 print:gap-y-1">
              {vitalsSummaryEntries.map((entry) => (
                <span key={entry.key} className="whitespace-nowrap">
                  <span className="font-semibold uppercase text-gray-500">{entry.key}</span>{" "}
                  <span className="font-medium text-gray-900">{entry.value}</span>
                  {entry.unit ? (
                    <span className="ml-1 text-xs text-gray-500">{entry.unit}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </section>
        ) : null;
      case "complaints":
        return prescription.complaints.length > 0 ? (
          <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.complaints)}
            </h2>
            <p className="text-sm text-gray-700">{toUpperListDisplay(prescription.complaints)}</p>
          </section>
        ) : null;
      case "diagnosis":
        return prescription.diagnosis.length > 0 ? (
          <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.diagnosis)}
            </h2>
            <p className="text-sm text-gray-700">{toUpperListDisplay(prescription.diagnosis)}</p>
          </section>
        ) : null;
      case "medicines":
        return prescription.medicines.length > 0 ? (
            <section
              key={section}
            className="emr-print-section emr-print-medicines-section space-y-3 print:space-y-1"
          >
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.medicines)}
            </h2>
            <div className="emr-print-rx-grid overflow-hidden rounded-2xl border border-gray-200 bg-white print:overflow-visible print:rounded-none">
              <div
                className="emr-print-rx-grid-header grid border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"
                style={{ gridTemplateColumns: MEDICINE_PRINT_GRID_COLUMNS }}
              >
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.type)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.medicine)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.dose)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.when)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.frequency)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.duration)}</div>
                <div className="px-3 py-2 print:px-2 print:py-1.5">{toUpperText(t.notes)}</div>
              </div>
              <div className="divide-y divide-gray-100 bg-white">
                {prescription.medicines.map((medicine, index) => (
                  <div
                    key={`print-medicine-${index}`}
                    className="emr-print-rx-grid-row grid items-start text-sm text-gray-700"
                    style={{ gridTemplateColumns: MEDICINE_PRINT_GRID_COLUMNS }}
                  >
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      {toUpperDisplayValue(medicine.type, "-")}
                    </div>
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      <p className="font-semibold text-gray-900">
                        {medicine.medicine_name?.trim().toUpperCase() || "-"}
                      </p>
                      {medicine.salt_composition?.trim() ? (
                        <p className="mt-1 text-xs text-gray-500 print:mt-0">
                          {medicine.salt_composition.trim().toUpperCase()}
                        </p>
                      ) : null}
                    </div>
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      <p className="font-medium leading-snug text-gray-900">
                        {getDoseExplanation(medicine.dose, language) ||
                          toUpperDisplayValue(formatDoseInput(medicine.dose), "-")}
                      </p>
                    </div>
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      {translateControlledValue(
                        medicine.timing,
                        language,
                        CONTROLLED_TIMING_TRANSLATIONS
                      )}
                    </div>
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      {translateControlledValue(
                        medicine.frequency,
                        language,
                        CONTROLLED_FREQUENCY_TRANSLATIONS
                      )}
                    </div>
                    <div className="px-3 py-2 print:px-2 print:py-1">
                      {formatDuration(medicine, language)}
                    </div>
                    <div className="break-words px-3 py-2 print:px-2 print:py-1">
                      {toUpperDisplayValue(medicine.notes, "-")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null;
      case "advice":
        return prescription.advice.length > 0 ? (
          <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.advice)}
            </h2>
            <p className="text-sm text-gray-700">{toUpperListDisplay(prescription.advice)}</p>
          </section>
        ) : null;
      case "tests":
        return prescription.tests.length > 0 ? (
          <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.testsRequested)}
            </h2>
            <p className="text-sm text-gray-700">{toUpperListDisplay(prescription.tests)}</p>
          </section>
        ) : null;
      case "next_visit":
        return hasNextVisit ? (
          <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              {toUpperText(t.nextVisit)}
            </h2>
            <p className="text-sm text-gray-700">
              {prescription.follow_up_appointment
                ? toUpperText(formatFollowUpSummary(prescription.follow_up_appointment))
                : prescription.next_visit_date
                  ? toUpperText(formatDateDdMmYyyy(prescription.next_visit_date))
                  : ""}
            </p>
          </section>
        ) : null;
      default:
        if (CLINICAL_HISTORY_SECTIONS.includes(section as EmrClinicalHistorySection)) {
          const clinicalSection = section as EmrClinicalHistorySection;
          const details = getClinicalHistoryDetails(prescription, clinicalSection);
          if (details.length === 0) return null;

          return (
            <section key={section} className="emr-print-section space-y-2 print:space-y-0.5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                {toUpperText(getClinicalHistoryHeading(clinicalSection, language))}
              </h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {toUpperText(details.join(", "))}
              </p>
            </section>
          );
        }

        return null;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 print:max-w-none print:space-y-0 print:px-0 print:py-0">
      <style>{repeatingPageMargins}</style>
      <EmrPrintActions backHref={backHref}>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span>{toUpperText(t.printLanguage)}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as PrintLanguage)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </EmrPrintActions>

      <article
        className="emr-a4-print-page emr-print-surface rounded-3xl border border-gray-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none print:overflow-visible"
        style={buildPrintSurfaceStyle(layout)}
      >
        {hasHeaderReserve ? (
          <div
            className={`emr-print-header-strip border-b border-gray-200 bg-gray-50 ${
              showHeaderImage || showClinicLogo ? "" : "print:hidden"
            }`}
            style={{
              minHeight: headerSpace || layout.header_height || undefined,
              paddingTop: pageTop,
              paddingRight: `calc(${pageRight} + ${rightStripSpace})`,
              paddingLeft: `calc(${pageLeft} + ${leftStripSpace} + ${offsetX})`,
            }}
          >
            {showHeaderImage ? (
              <img
                src={layout.header_image_url!}
                alt="Prescription header"
                className="max-h-40 w-full object-cover"
              />
            ) : null}
            {showClinicLogo ? (
              <div className="px-0 py-4 print:py-2">
                <img
                  src={layout.clinic_logo_url!}
                  alt="Clinic logo"
                  className="h-14 w-auto object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className="emr-print-content space-y-6 print:space-y-2"
          style={{
            paddingTop: `calc(${pageTop} + ${offsetY})`,
            paddingRight: `calc(${pageRight} + ${rightStripSpace})`,
            paddingBottom: pageBottom,
            paddingLeft: `calc(${pageLeft} + ${leftStripSpace} + ${offsetX})`,
          }}
        >
          <header className="emr-print-section border-b border-gray-200 pb-4 print:pb-1.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-700 print:gap-x-3 print:gap-y-0.5">
              <p className="font-semibold text-gray-900">
                {formatPatientSummary(printable.patient)}
              </p>
              <p>
                {toUpperText(t.visitDate)}: {toUpperText(formatDateDdMmYyyy(prescription.visit_date))}
              </p>
              {showPrescriptionNumber ? (
                <p className="whitespace-nowrap font-medium text-gray-700">
                  {toUpperText(
                    `${PRESCRIPTION_NUMBER_LABEL_TRANSLATIONS[language]}: ${formatDoctorSpecificPrescriptionNumber(
                      prescription
                    )}`
                  )}
                </p>
              ) : null}
            </div>
          </header>

          {visiblePrintSectionOrder.map((section) => renderPrintSection(section))}

          {layout.custom_fields
            .filter((field) => field.show_in_print !== false)
            .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
            .map((field) => {
              const value = prescription.custom_fields?.find(
                (item) => item.field_key === field.field_key
              )?.field_value;
              const displayValue = formatCustomFieldPrintValue(field.field_type, value);
              if (!displayValue) return null;

              return (
                <section key={`print-custom-${field.field_key}`} className="emr-print-section space-y-2 print:space-y-0.5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
                    {toUpperText(field.field_label)}
                  </h2>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{displayValue}</p>
                </section>
              );
            })}

          {prescriptionValidityTill ? (
            <section className="emr-print-section border-t border-gray-200 pt-3 print:pt-1.5">
              <p className="text-[11px] text-gray-500">
                {toUpperText(
                  `${PRESCRIPTION_VALIDITY_NOTE_TRANSLATIONS[language]} ${formatDateDdMmYyyy(
                    prescriptionValidityTill.toISOString()
                  )}`
                )}
              </p>
            </section>
          ) : null}
        </div>

        {hasFooterReserve ? (
          <footer
            className={`emr-print-footer-strip border-t border-gray-200 bg-gray-50 ${
              showFooterImage || showSignature ? "" : "print:hidden"
            }`}
            style={{
              minHeight: footerSpace || layout.footer_height || undefined,
              paddingRight: `calc(${pageRight} + ${rightStripSpace})`,
              paddingBottom: pageBottom,
              paddingLeft: `calc(${pageLeft} + ${leftStripSpace} + ${offsetX})`,
            }}
          >
            {showSignature ? (
              <div className="px-0 py-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  {toUpperText(t.doctorSignature)}
                </p>
                <img
                  src={layout.doctor_signature_url!}
                  alt="Doctor signature"
                  className="h-16 w-auto object-contain"
                />
              </div>
            ) : null}
            {showFooterImage ? (
              <img
                src={layout.footer_image_url!}
                alt="Prescription footer"
                className="h-full max-h-32 w-full object-cover"
              />
            ) : null}
          </footer>
        ) : null}
      </article>
    </div>
  );
}
