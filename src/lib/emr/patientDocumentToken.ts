import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";
const EMR_PATIENT_DOCUMENT_TOKEN_TTL_SECONDS = 60 * 15;

type EmrPatientDocumentTokenPayload = {
  kind: "EMR_PATIENT_DOCUMENT";
  patientId: number;
  doctorId: number;
  prescriptionId: number;
};

export function signEmrPatientDocumentToken(input: {
  patientId: number;
  doctorId: number;
  prescriptionId: number;
}) {
  return jwt.sign(
    {
      kind: "EMR_PATIENT_DOCUMENT",
      patientId: input.patientId,
      doctorId: input.doctorId,
      prescriptionId: input.prescriptionId,
    } satisfies EmrPatientDocumentTokenPayload,
    JWT_SECRET,
    { expiresIn: EMR_PATIENT_DOCUMENT_TOKEN_TTL_SECONDS }
  );
}

export function verifyEmrPatientDocumentToken(
  token: string
): EmrPatientDocumentTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<EmrPatientDocumentTokenPayload>;
    if (
      payload.kind !== "EMR_PATIENT_DOCUMENT" ||
      !Number.isInteger(payload.patientId) ||
      !Number.isInteger(payload.doctorId) ||
      !Number.isInteger(payload.prescriptionId)
    ) {
      return null;
    }

    const patientId = Number(payload.patientId);
    const doctorId = Number(payload.doctorId);
    const prescriptionId = Number(payload.prescriptionId);

    return {
      kind: "EMR_PATIENT_DOCUMENT",
      patientId,
      doctorId,
      prescriptionId,
    };
  } catch {
    return null;
  }
}
