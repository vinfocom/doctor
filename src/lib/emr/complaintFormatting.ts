import type {
  EmrComplaintPayload,
  EmrDurationUnit,
  EmrLayoutSettings,
} from "@/lib/emr/types";

export type PrintableComplaintEntry = {
  name: string;
  detailText: string;
  plainText: string;
};

export type ComplaintDisplayMode = EmrLayoutSettings["complaint_display_mode"];

function formatDurationLabel(
  value: number | null | undefined,
  unit: EmrDurationUnit | null | undefined,
  options?: {
    compactUnit?: boolean;
  }
) {
  if (!value || !unit || unit === "custom") return "";

  const labels: Record<Exclude<EmrDurationUnit, "custom">, [string, string]> = {
    day: ["Day", "Days"],
    week: ["Week", "Weeks"],
    month: ["Month", "Months"],
    year: ["Year", "Years"],
  };

  if (options?.compactUnit) {
    const shortLabels: Record<Exclude<EmrDurationUnit, "custom">, string> = {
      day: "D",
      week: "W",
      month: "M",
      year: "Y",
    };

    return `${value}${shortLabels[unit]}`;
  }

  const [singular, plural] = labels[unit];
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatPrintableComplaintEntry(
  complaint: EmrComplaintPayload,
  options?: {
    compactDuration?: boolean;
  }
): PrintableComplaintEntry | null {
  const name = complaint.name?.trim() ?? "";
  if (!name) return null;

  const severity = complaint.severity?.trim() ?? "";
  const frequency = complaint.frequency?.trim() ?? "";
  const durationLabel = formatDurationLabel(
    complaint.duration_value,
    complaint.duration_unit ?? null,
    {
      compactUnit: options?.compactDuration,
    }
  );

  let detailText = [severity, frequency].filter(Boolean).join(", ");
  if (durationLabel) {
    detailText = detailText ? `${detailText} since ${durationLabel}` : `since ${durationLabel}`;
  }

  const plainText = detailText ? `${name} - ${detailText}` : name;

  return {
    name,
    detailText,
    plainText: plainText.replace(/\s+/g, " ").trim(),
  };
}

export function formatComplaintDisplay(complaint: EmrComplaintPayload) {
  return formatPrintableComplaintEntry(complaint)?.plainText.toUpperCase() ?? "";
}

export function formatClassicComplaintDisplay(complaint: EmrComplaintPayload) {
  const name = complaint.name?.trim() ?? "";
  if (!name) return "";

  const parts = [
    complaint.severity?.trim() ?? "",
    name,
    complaint.frequency?.trim() ?? "",
  ].filter(Boolean);

  const durationLabel = formatDurationLabel(
    complaint.duration_value,
    complaint.duration_unit ?? null
  );

  if (durationLabel) {
    parts.push(`since ${durationLabel}`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim().toUpperCase();
}

export function getPrintableComplaintEntries(complaints: EmrComplaintPayload[]) {
  return complaints
    .map((complaint) =>
      formatPrintableComplaintEntry(complaint, { compactDuration: true })
    )
    .filter((value): value is PrintableComplaintEntry => Boolean(value));
}

export function getPrintableComplaints(
  complaints: EmrComplaintPayload[],
  mode: ComplaintDisplayMode = "paired_grid"
) {
  if (mode === "classic_inline") {
    return complaints
      .map((complaint) => formatClassicComplaintDisplay(complaint))
      .filter((value): value is string => Boolean(value));
  }

  return getPrintableComplaintEntries(complaints).map((complaint) =>
    complaint.plainText.toUpperCase()
  );
}
