import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getPrintableComplaints } from "@/lib/emr/complaintFormatting";
import type {
  EmrClinicalHistorySection,
  EmrLayoutCustomField,
  EmrLayoutSectionKey,
  EmrPrintablePrescription,
} from "@/lib/emr/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN_X = 34;
const PAGE_MARGIN_TOP = 36;
const PAGE_MARGIN_BOTTOM = 34;
const LINE_HEIGHT = 15;
const SECTION_GAP = 10;
const BORDER_COLOR = rgb(0.88, 0.9, 0.93);
const SUBTLE_TEXT = rgb(0.4, 0.45, 0.52);
const TEXT_COLOR = rgb(0.12, 0.14, 0.18);
const HEADER_BG = rgb(0.97, 0.98, 0.99);
const TABLE_HEADER_BG = rgb(0.96, 0.97, 0.98);
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
const CLINICAL_HISTORY_LABELS: Record<EmrClinicalHistorySection, string> = {
  examination_findings: "EXAMINATION FINDINGS",
  investigation_findings: "INVESTIGATION FINDINGS",
  past_medical_history: "PAST MEDICAL HISTORY",
  family_history: "FAMILY HISTORY",
  surgical_history: "SURGICAL HISTORY",
  treatment_history: "TREATMENT HISTORY",
  allergies: "ALLERGIES",
  personal_social_history: "PERSONAL / SOCIAL HISTORY",
};

type FontSet = {
  regular: PDFFont;
  bold: PDFFont;
};

type PageState = {
  page: PDFPage;
  y: number;
};

type TableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center";
};

function toPdfSafeText(value: string | null | undefined) {
  const normalized = (value ?? "").normalize("NFKD").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ");
  return normalized.replace(/\s+/g, " ").trim();
}

function upper(value: string | null | undefined, fallback = "") {
  const normalized = toPdfSafeText(value);
  return normalized ? normalized.toUpperCase() : fallback;
}

function formatDateDdMmYyyy(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function formatTime12h(time: string | null | undefined) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0));
  return date
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    })
    .toUpperCase();
}

function formatPatientSummary(patient: EmrPrintablePrescription["patient"]) {
  const name = upper(patient.full_name, "PATIENT");
  const gender = patient.gender?.trim().toLowerCase();
  const genderShort =
    gender === "male"
      ? "M"
      : gender === "female"
        ? "F"
        : gender === "other"
          ? "O"
          : gender === "prefer not to say"
            ? "PNS"
            : null;

  const meta = [
    patient.age && patient.age > 0 ? `${patient.age}Y` : null,
    genderShort,
  ].filter(Boolean);

  return meta.length > 0 ? `${name} (${meta.join(", ")})` : name;
}

function parseCompactDoseTokens(value: string) {
  const compact = value.replace(/\s+/g, "").replace(/-/g, ".");
  if (!compact || /[^0-9/.]/.test(compact)) return null;

  if (compact.includes(".")) {
    const separated = compact.split(".").filter(Boolean);
    return separated.every((token) => /^\d+(?:\/\d+)?$/.test(token)) ? separated : null;
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
  return tokens ? tokens.join(" . ") : trimmed;
}

function getDoseExplanation(dose: string | null | undefined) {
  const normalized = formatDoseInput(dose);
  if (!normalized) return "";

  const compact = normalized.toLowerCase().replace(/\s+/g, "");
  if (compact === "1/2" || compact === "half") return "HALF DOSE";
  if (compact === "full") return "FULL DOSE";

  const fourPart = normalized.match(
    /^\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*$/
  );
  if (fourPart) {
    const [, morning, afternoon, evening, night] = fourPart;
    return [
      morning !== "0" ? `MORNING: ${morning}` : null,
      afternoon !== "0" ? `AFTERNOON: ${afternoon}` : null,
      evening !== "0" ? `EVENING: ${evening}` : null,
      night !== "0" ? `NIGHT: ${night}` : null,
    ]
      .filter(Boolean)
      .join(", ");
  }

  const threePart = normalized.match(
    /^\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*[.\-]\s*([0-9/]+)\s*$/
  );
  if (threePart) {
    const [, morning, afternoon, night] = threePart;
    return [
      morning !== "0" ? `MORNING: ${morning}` : null,
      afternoon !== "0" ? `AFTERNOON: ${afternoon}` : null,
      night !== "0" ? `NIGHT: ${night}` : null,
    ]
      .filter(Boolean)
      .join(", ");
  }

  return upper(normalized);
}

function translateTiming(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized === "before food") return "BEFORE FOOD";
  if (normalized === "after food") return "AFTER FOOD";
  if (normalized === "empty stomach") return "EMPTY STOMACH";
  if (normalized === "bed time") return "BED TIME";

  return upper(value);
}

function translateFrequency(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized === "daily") return "DAILY";
  if (normalized === "weekly") return "WEEKLY";
  if (normalized === "monthly") return "MONTHLY";
  if (normalized === "sos") return "SOS";

  return upper(value);
}

function formatDuration(input: {
  duration_text?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
}) {
  if (input.duration_text?.trim()) {
    return upper(input.duration_text);
  }

  if (!input.duration_value || !input.duration_unit) {
    return "";
  }

  return `${input.duration_value} ${upper(input.duration_unit)}`;
}

function getClinicalHistoryDetails(
  prescription: EmrPrintablePrescription["prescription"],
  section: EmrClinicalHistorySection
) {
  return (prescription.clinical_history ?? [])
    .filter((item) => item.section === section)
    .map((item) => upper(item.details))
    .filter(Boolean);
}

function getVitalsSummaryEntries(vitals: Record<string, string | null | undefined> | null | undefined) {
  if (!vitals) return [];

  return [
    { key: "PULSE", value: vitals.pulse?.trim(), unit: "bpm" },
    { key: "BP", value: vitals.bp?.trim(), unit: "mmHg" },
    { key: "SPO2", value: vitals.spo2?.trim(), unit: "%" },
    { key: "TEMP", value: vitals.temperature?.trim(), unit: "°F" },
    { key: "HEIGHT", value: vitals.height?.trim(), unit: "cm" },
    { key: "WEIGHT", value: vitals.weight?.trim(), unit: "kg" },
    { key: "BMI", value: vitals.bmi?.trim(), unit: "kg/m2" },
  ].filter((entry) => Boolean(entry.value));
}

function formatFollowUpSummary(
  summary: EmrPrintablePrescription["prescription"]["follow_up_appointment"]
) {
  if (!summary?.date || !summary.slot_time) return "";

  return [
    formatDateDdMmYyyy(summary.date),
    formatTime12h(summary.slot_time),
    upper(summary.clinic_name),
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

function formatCustomFieldPrintValue(
  fieldType: EmrLayoutCustomField["field_type"],
  value: string | null | undefined
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  if (fieldType === "date") {
    return upper(formatDateDdMmYyyy(normalized) || normalized);
  }

  if (fieldType === "checkbox") {
    return /^(true|1|yes|on)$/i.test(normalized) ? "YES" : "";
  }

  return upper(normalized);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const safe = toPdfSafeText(text);
  if (!safe) return [];

  const words = safe.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let chunk = "";
    for (const char of word) {
      const nextChunk = `${chunk}${char}`;
      if (font.widthOfTextAtSize(nextChunk, size) <= maxWidth) {
        chunk = nextChunk;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines;
}

function addPage(pdf: PDFDocument): PageState {
  return {
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - PAGE_MARGIN_TOP,
  };
}

function ensureRoom(pdf: PDFDocument, state: PageState, minHeight: number) {
  if (state.y - minHeight >= PAGE_MARGIN_BOTTOM) return state;
  return addPage(pdf);
}

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = TEXT_COLOR
) {
  page.drawText(text, { x, y, font, size, color });
}

function drawWrappedParagraph(
  pdf: PDFDocument,
  state: PageState,
  text: string,
  options: {
    x?: number;
    maxWidth: number;
    font: PDFFont;
    size: number;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
  }
) {
  const lines = wrapText(text, options.font, options.size, options.maxWidth);
  let next = state;

  for (const line of lines) {
    next = ensureRoom(pdf, next, options.lineHeight ?? LINE_HEIGHT);
    drawTextLine(
      next.page,
      line,
      options.x ?? PAGE_MARGIN_X,
      next.y,
      options.font,
      options.size,
      options.color ?? TEXT_COLOR
    );
    next = { ...next, y: next.y - (options.lineHeight ?? LINE_HEIGHT) };
  }

  return next;
}

function drawDivider(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y },
    thickness: 1,
    color: BORDER_COLOR,
  });
}

function drawSectionHeading(
  pdf: PDFDocument,
  state: PageState,
  heading: string,
  fonts: FontSet
) {
  const next = ensureRoom(pdf, state, 18);
  drawTextLine(next.page, upper(heading), PAGE_MARGIN_X, next.y, fonts.bold, 10, rgb(0, 0, 0));
  return { ...next, y: next.y - 14 };
}

function drawSimpleSection(
  pdf: PDFDocument,
  state: PageState,
  heading: string,
  value: string,
  fonts: FontSet
) {
  if (!value.trim()) return state;

  let next = drawSectionHeading(pdf, state, heading, fonts);
  next = drawWrappedParagraph(pdf, next, upper(value), {
    x: PAGE_MARGIN_X,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN_X * 2,
    font: fonts.regular,
    size: 10,
    lineHeight: 14,
  });
  return { ...next, y: next.y - SECTION_GAP };
}

function drawListSection(
  pdf: PDFDocument,
  state: PageState,
  heading: string,
  values: string[],
  fonts: FontSet
) {
  const filtered = values.map((value) => upper(value)).filter(Boolean);
  if (filtered.length === 0) return state;
  return drawSimpleSection(pdf, state, heading, filtered.join(", "), fonts);
}

function drawHeaderBlock(
  pdf: PDFDocument,
  state: PageState,
  printable: EmrPrintablePrescription,
  fonts: FontSet
) {
  const next = ensureRoom(pdf, state, 82);
  const boxTop = next.y;
  const boxHeight = 66;
  next.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: boxTop - boxHeight,
    width: PAGE_WIDTH - PAGE_MARGIN_X * 2,
    height: boxHeight,
    color: HEADER_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  const doctorName = printable.doctor.doctor_name?.trim()
    ? `DR. ${upper(printable.doctor.doctor_name)}`
    : "DOCTOR";
  const qualification = [upper(printable.doctor.qualification), upper(printable.doctor.specialization)]
    .filter(Boolean)
    .join(" | ");
  const clinicLine = [
    upper(printable.clinic?.clinic_name),
    upper(printable.clinic?.phone),
    upper(printable.clinic?.location),
  ]
    .filter(Boolean)
    .join(" | ");

  drawTextLine(next.page, doctorName, PAGE_MARGIN_X + 12, boxTop - 18, fonts.bold, 13);
  if (qualification) {
    drawTextLine(next.page, qualification, PAGE_MARGIN_X + 12, boxTop - 34, fonts.regular, 9, SUBTLE_TEXT);
  }
  if (clinicLine) {
    const lines = wrapText(clinicLine, fonts.regular, 9, PAGE_WIDTH - PAGE_MARGIN_X * 2 - 24);
    let lineY = boxTop - 50;
    for (const line of lines.slice(0, 2)) {
      drawTextLine(next.page, line, PAGE_MARGIN_X + 12, lineY, fonts.regular, 9, SUBTLE_TEXT);
      lineY -= 12;
    }
  }

  return { ...next, y: boxTop - boxHeight - 10 };
}

function drawPatientMeta(
  pdf: PDFDocument,
  state: PageState,
  printable: EmrPrintablePrescription,
  fonts: FontSet
) {
  let next = ensureRoom(pdf, state, 34);
  const parts = [
    formatPatientSummary(printable.patient),
    printable.patient.phone?.trim() ? `PHONE: ${upper(printable.patient.phone)}` : "",
    `VISIT DATE: ${formatDateDdMmYyyy(printable.prescription.visit_date)}`,
    printable.prescription.prescription_no?.trim()
      ? `PRESCRIPTION NO.: ${upper(printable.prescription.prescription_no)}`
      : "",
  ].filter(Boolean);

  next = drawWrappedParagraph(pdf, next, parts.join("   |   "), {
    maxWidth: PAGE_WIDTH - PAGE_MARGIN_X * 2,
    font: fonts.bold,
    size: 10,
    lineHeight: 14,
  });

  drawDivider(next.page, next.y - 2);
  return { ...next, y: next.y - 12 };
}

function drawVitalsSection(
  pdf: PDFDocument,
  state: PageState,
  printable: EmrPrintablePrescription,
  fonts: FontSet
) {
  const entries = getVitalsSummaryEntries(printable.prescription.vitals || null);
  if (entries.length === 0) return state;

  let next = drawSectionHeading(pdf, state, "VITALS", fonts);
  const vitalsText = entries
    .map((entry) => `${entry.key} ${upper(entry.value)}${entry.unit ? ` ${entry.unit}` : ""}`)
    .join("   ");

  next = drawWrappedParagraph(pdf, next, vitalsText, {
    maxWidth: PAGE_WIDTH - PAGE_MARGIN_X * 2,
    font: fonts.regular,
    size: 10,
    lineHeight: 14,
  });

  return { ...next, y: next.y - SECTION_GAP };
}

function buildMedicineRows(printable: EmrPrintablePrescription) {
  return printable.prescription.medicines.map((medicine) => ({
    type: upper(medicine.type, "-"),
    medicine: upper(medicine.medicine_name, "-"),
    subtext: upper(medicine.salt_composition),
    dose: getDoseExplanation(medicine.dose) || upper(formatDoseInput(medicine.dose), "-"),
    when: translateTiming(medicine.timing) || "-",
    frequency: translateFrequency(medicine.frequency) || "-",
    duration: formatDuration(medicine) || "-",
    notes: upper(medicine.notes, "-"),
  }));
}

function drawMedicineTableHeader(page: PDFPage, y: number, columns: TableColumn[], fonts: FontSet) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 18,
    width: tableWidth,
    height: 18,
    color: TABLE_HEADER_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  let cursorX = PAGE_MARGIN_X;
  for (const column of columns) {
    drawTextLine(page, upper(column.label), cursorX + 4, y - 12, fonts.bold, 8, SUBTLE_TEXT);
    cursorX += column.width;
    if (cursorX < PAGE_MARGIN_X + tableWidth) {
      page.drawLine({
        start: { x: cursorX, y: y - 18 },
        end: { x: cursorX, y },
        thickness: 1,
        color: BORDER_COLOR,
      });
    }
  }
}

function drawMedicineTable(
  pdf: PDFDocument,
  state: PageState,
  printable: EmrPrintablePrescription,
  fonts: FontSet
) {
  const rows = buildMedicineRows(printable);
  if (rows.length === 0) return state;

  let next = drawSectionHeading(pdf, state, "RX", fonts);
  const tableX = PAGE_MARGIN_X;
  const tableWidth = PAGE_WIDTH - PAGE_MARGIN_X * 2;
  const columns: TableColumn[] = [
    { key: "type", label: "TYPE", width: 42 },
    { key: "medicine", label: "MEDICINE", width: 158 },
    { key: "dose", label: "DOSE", width: 78 },
    { key: "when", label: "WHEN", width: 72 },
    { key: "frequency", label: "FREQUENCY", width: 60 },
    { key: "duration", label: "DURATION", width: 54 },
    { key: "notes", label: "NOTES", width: 63 },
  ];

  next = ensureRoom(pdf, next, 26);
  drawMedicineTableHeader(next.page, next.y, columns, fonts);
  next = { ...next, y: next.y - 18 };
  let currentTableTop = next.y + 18;

  for (const row of rows) {
    const medicineLines = [
      ...wrapText(row.medicine, fonts.bold, 9.5, columns[1]!.width - 8),
      ...(row.subtext ? wrapText(row.subtext, fonts.regular, 7.5, columns[1]!.width - 8) : []),
    ];

    const doseLines = wrapText(row.dose, fonts.regular, 8.5, columns[2]!.width - 8);
    const whenLines = wrapText(row.when, fonts.regular, 8.5, columns[3]!.width - 8);
    const frequencyLines = wrapText(row.frequency, fonts.regular, 8.5, columns[4]!.width - 8);
    const durationLines = wrapText(row.duration, fonts.regular, 8.5, columns[5]!.width - 8);
    const noteLines = wrapText(row.notes, fonts.regular, 8.5, columns[6]!.width - 8);
    const typeLines = wrapText(row.type, fonts.regular, 8.5, columns[0]!.width - 8);

    const lineCount = Math.max(
      typeLines.length || 1,
      medicineLines.length || 1,
      doseLines.length || 1,
      whenLines.length || 1,
      frequencyLines.length || 1,
      durationLines.length || 1,
      noteLines.length || 1
    );
    const rowHeight = Math.max(22, lineCount * 11 + 8);

    const previousPage = next.page;
    next = ensureRoom(pdf, next, rowHeight + 1);
    if (next.y === PAGE_HEIGHT - PAGE_MARGIN_TOP) {
      drawMedicineTableHeader(next.page, next.y, columns, fonts);
      next = { ...next, y: next.y - 18 };
      currentTableTop = next.y + 18;
    } else if (next.page !== previousPage) {
      currentTableTop = next.y + 18;
    }

    const rowTop = next.y;
    const rowBottom = rowTop - rowHeight;

    next.page.drawLine({
      start: { x: tableX, y: rowBottom },
      end: { x: tableX, y: currentTableTop },
      thickness: 1,
      color: BORDER_COLOR,
    });
    next.page.drawLine({
      start: { x: tableX + tableWidth, y: rowBottom },
      end: { x: tableX + tableWidth, y: currentTableTop },
      thickness: 1,
      color: BORDER_COLOR,
    });
    next.page.drawLine({
      start: { x: tableX, y: rowBottom },
      end: { x: tableX + tableWidth, y: rowBottom },
      thickness: 1,
      color: BORDER_COLOR,
    });

    let cursorX = tableX;
    const cellLinesMap: Record<string, string[]> = {
      type: typeLines.length > 0 ? typeLines : ["-"],
      medicine: medicineLines.length > 0 ? medicineLines : ["-"],
      dose: doseLines.length > 0 ? doseLines : ["-"],
      when: whenLines.length > 0 ? whenLines : ["-"],
      frequency: frequencyLines.length > 0 ? frequencyLines : ["-"],
      duration: durationLines.length > 0 ? durationLines : ["-"],
      notes: noteLines.length > 0 ? noteLines : ["-"],
    };

    columns.forEach((column, index) => {
      if (index > 0) {
        next.page.drawLine({
          start: { x: cursorX, y: rowBottom },
          end: { x: cursorX, y: rowTop },
          thickness: 1,
          color: BORDER_COLOR,
        });
      }

      const lines = cellLinesMap[column.key] ?? ["-"];
      let lineY = rowTop - 11;
      lines.forEach((line, lineIndex) => {
        const isMedicineTitle = column.key === "medicine" && lineIndex === 0;
        drawTextLine(
          next.page,
          line,
          cursorX + 4,
          lineY,
          isMedicineTitle ? fonts.bold : fonts.regular,
          isMedicineTitle ? 9.5 : 8,
          isMedicineTitle ? TEXT_COLOR : column.key === "medicine" && lineIndex > 0 ? SUBTLE_TEXT : TEXT_COLOR
        );
        lineY -= 10;
      });

      cursorX += column.width;
    });

    next = { ...next, y: rowBottom };
  }

  return { ...next, y: next.y - SECTION_GAP };
}

function drawOrderedBodySections(
  pdf: PDFDocument,
  state: PageState,
  printable: EmrPrintablePrescription,
  fonts: FontSet
) {
  let next = state;
  const layout = printable.layout_settings;
  const visibleSections = layout.section_order_json.filter(
    (section) => layout.print_visibility_json[section]
  );

  for (const section of visibleSections) {
    switch (section) {
      case "vitals":
        next = drawVitalsSection(pdf, next, printable, fonts);
        break;
      case "complaints":
        next = drawListSection(
          pdf,
          next,
          "COMPLAINTS",
          getPrintableComplaints(printable.prescription.complaints).map((item) =>
            item.toUpperCase()
          ),
          fonts
        );
        break;
      case "diagnosis":
        next = drawListSection(
          pdf,
          next,
          "DIAGNOSIS",
          printable.prescription.diagnosis.map((item) => item.name),
          fonts
        );
        break;
      case "medicines":
        next = drawMedicineTable(pdf, next, printable, fonts);
        break;
      case "advice":
        next = drawListSection(
          pdf,
          next,
          "ADVICE",
          printable.prescription.advice.map((item) => item.name),
          fonts
        );
        break;
      case "tests":
        next = drawListSection(
          pdf,
          next,
          "TESTS REQUESTED",
          printable.prescription.tests.map((item) => item.name),
          fonts
        );
        break;
      case "next_visit": {
        const value = printable.prescription.follow_up_appointment
          ? formatFollowUpSummary(printable.prescription.follow_up_appointment)
          : formatDateDdMmYyyy(printable.prescription.next_visit_date);
        next = drawSimpleSection(pdf, next, "NEXT VISIT", value, fonts);
        break;
      }
      default:
        if (CLINICAL_HISTORY_SECTIONS.includes(section as EmrClinicalHistorySection)) {
          const clinicalSection = section as EmrClinicalHistorySection;
          next = drawListSection(
            pdf,
            next,
            CLINICAL_HISTORY_LABELS[clinicalSection],
            getClinicalHistoryDetails(printable.prescription, clinicalSection),
            fonts
          );
        }
        break;
    }
  }

  const customFields = layout.custom_fields
    .filter((field) => field.show_in_print !== false)
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));

  for (const field of customFields) {
    const value = printable.prescription.custom_fields?.find(
      (item) => item.field_key === field.field_key
    )?.field_value;
    const displayValue = formatCustomFieldPrintValue(field.field_type, value);
    if (!displayValue) continue;

    next = drawSimpleSection(pdf, next, upper(field.field_label), displayValue, fonts);
  }

  return next;
}

export async function generatePatientEmrPrescriptionPdf(
  printable: EmrPrintablePrescription
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: FontSet = { regular, bold };

  let state = addPage(pdf);
  state = drawHeaderBlock(pdf, state, printable, fonts);
  state = drawPatientMeta(pdf, state, printable, fonts);
  state = drawOrderedBodySections(pdf, state, printable, fonts);

  const printPlacement = printable.layout_settings.page_margin_json;
  const showPrescriptionValidity =
    printPlacement.show_prescription_validity === true &&
    Boolean(printPlacement.prescription_validity_value) &&
    Boolean(printPlacement.prescription_validity_unit);
  const prescriptionValidityTill = showPrescriptionValidity
    ? calculatePrescriptionValidityTill({
        baseDate: printable.prescription.finalized_at ?? printable.prescription.visit_date,
        value: printPlacement.prescription_validity_value ?? null,
        unit: printPlacement.prescription_validity_unit ?? null,
      })
    : null;

  if (prescriptionValidityTill) {
    state = ensureRoom(pdf, state, 20);
    drawDivider(state.page, state.y - 2);
    state = { ...state, y: state.y - 12 };
    state = drawWrappedParagraph(
      pdf,
      state,
      `THIS PRESCRIPTION IS VALID FOR ONE MORE VISIT TILL ${formatDateDdMmYyyy(
        prescriptionValidityTill.toISOString()
      )}`,
      {
        maxWidth: PAGE_WIDTH - PAGE_MARGIN_X * 2,
        font: fonts.regular,
        size: 9,
        color: SUBTLE_TEXT,
        lineHeight: 12,
      }
    );
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
