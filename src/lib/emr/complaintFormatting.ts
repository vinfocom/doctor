import type { EmrComplaintPayload, EmrDurationUnit } from "@/lib/emr/types";

function formatDurationLabel(
  value: number | null | undefined,
  unit: EmrDurationUnit | null | undefined
) {
  if (!value || !unit || unit === "custom") return "";

  const labels: Record<Exclude<EmrDurationUnit, "custom">, [string, string]> = {
    day: ["Day", "Days"],
    week: ["Week", "Weeks"],
    month: ["Month", "Months"],
    year: ["Year", "Years"],
  };

  const [singular, plural] = labels[unit];
  return `${value} ${value === 1 ? singular : plural}`.toUpperCase();
}

export function formatComplaintDisplay(complaint: EmrComplaintPayload) {
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
    parts.push(`SINCE ${durationLabel}`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim().toUpperCase();
}

export function getPrintableComplaints(complaints: EmrComplaintPayload[]) {
  return complaints
    .map((complaint) => formatComplaintDisplay(complaint))
    .filter((value): value is string => Boolean(value));
}
