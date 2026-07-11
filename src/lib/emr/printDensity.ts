import type { EmrPrintablePrescription } from "@/lib/emr/types";

export type EmrPrintDensityMode = "normal" | "compact";

function sumTextLength(values: Array<string | null | undefined>) {
  return values.reduce((total, value) => total + (value?.trim().length ?? 0), 0);
}

export function getEmrPrintDensityMode(
  printable: Pick<EmrPrintablePrescription, "prescription">
): EmrPrintDensityMode {
  const prescription = printable.prescription;

  const complaintCount = prescription.complaints.length;
  const complaintTextLength = sumTextLength(
    prescription.complaints.flatMap((complaint) => [
      complaint.name,
      complaint.severity,
      complaint.frequency,
      complaint.notes,
    ])
  );

  const medicineCount = prescription.medicines.length;
  const medicineTextLength = sumTextLength(
    prescription.medicines.flatMap((medicine) => [
      medicine.medicine_name,
      medicine.salt_composition,
      medicine.dose,
      medicine.notes,
      medicine.duration_text,
    ])
  );

  const diagnosisCount = prescription.diagnosis.length;
  const adviceCount = prescription.advice.length;
  const testsCount = prescription.tests.length;
  const clinicalHistoryLength = sumTextLength(
    (prescription.clinical_history ?? []).map((item) => item.details)
  );
  const customFieldLength = sumTextLength(
    (prescription.custom_fields ?? []).map((item) => item.field_value)
  );

  const densityScore =
    complaintCount * 2.5 +
    complaintTextLength / 90 +
    medicineCount * 4 +
    medicineTextLength / 150 +
    diagnosisCount * 1.25 +
    adviceCount +
    testsCount +
    clinicalHistoryLength / 180 +
    customFieldLength / 200;

  if (
    medicineCount >= 6 ||
    complaintCount >= 7 ||
    clinicalHistoryLength >= 420 ||
    densityScore >= 20
  ) {
    return "compact";
  }

  return "normal";
}
