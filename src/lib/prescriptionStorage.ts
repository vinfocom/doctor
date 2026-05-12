export const PRESCRIPTION_STORAGE_PREFIX = "prescriptions";

export const PRESCRIPTION_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const PRESCRIPTION_MAX_PAGE_COUNT = 5;
export const PRESCRIPTION_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

export const PRESCRIPTION_URL_STRATEGY = "store_public_url" as const;

export const PRESCRIPTION_COMPRESSION_STRATEGY = {
  mode: "moderate",
  applyOn: "client_before_upload",
  maxLongEdgePx: 2000,
  jpegQuality: 0.82,
  keepOriginalAspectRatio: true,
  avoidAggressiveCompression: true,
} as const;

export const PRESCRIPTION_PRODUCTION_REQUIREMENTS = {
  storageProvider: "cloudpe_s3_compatible",
  requiresStablePublicBaseUrl: true,
  requiresServerSideUpload: true,
  requiresPersistedStorageKey: true,
  requiresPersistedFileUrl: true,
} as const;

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const sanitizePathSegment = (value: string | number) =>
  String(value).replace(/[^a-zA-Z0-9_-]/g, "_");

export const getPrescriptionFileExtension = (mimeType: string) =>
  MIME_TYPE_TO_EXTENSION[mimeType] ?? "jpg";

export const buildPrescriptionPageObjectKey = ({
  doctorId,
  patientId,
  prescriptionId,
  pageNumber,
  mimeType,
}: {
  doctorId: number;
  patientId: number;
  prescriptionId: number;
  pageNumber: number;
  mimeType: string;
}) => {
  const ext = getPrescriptionFileExtension(mimeType);
  return [
    PRESCRIPTION_STORAGE_PREFIX,
    sanitizePathSegment(doctorId),
    sanitizePathSegment(patientId),
    sanitizePathSegment(prescriptionId),
    `page-${pageNumber}.${ext}`,
  ].join("/");
};

export const validatePrescriptionImageFile = ({
  mimeType,
  size,
}: {
  mimeType: string;
  size: number;
}) => {
  if (!PRESCRIPTION_ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false as const,
      error: "Invalid file type. Allowed: JPG, PNG, WEBP, HEIC, HEIF.",
    };
  }

  if (size > PRESCRIPTION_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false as const,
      error: `File too large. Max size is ${Math.floor(
        PRESCRIPTION_MAX_FILE_SIZE_BYTES / (1024 * 1024)
      )} MB per image.`,
    };
  }

  return { ok: true as const };
};

export const validatePrescriptionPageCount = (count: number) => {
  if (count < 1) {
    return { ok: false as const, error: "At least one prescription image is required." };
  }

  if (count > PRESCRIPTION_MAX_PAGE_COUNT) {
    return {
      ok: false as const,
      error: `Too many prescription pages. Max allowed is ${PRESCRIPTION_MAX_PAGE_COUNT}.`,
    };
  }

  return { ok: true as const };
};

export const getPrescriptionUploadProductionChecklist = () => [
  "CLOUDPE_ACCESS_KEY is configured",
  "CLOUDPE_SECRET_KEY is configured",
  "CLOUDPE_BUCKET_NAME is configured",
  "CLOUDPE_ENDPOINT is configured",
  "CLOUDPE_PUBLIC_BASE_URL is configured for stable production image URLs",
  "Prescription uploads go through the backend upload route, not direct client bucket access",
  "The database stores both storage_key and file_url for every uploaded page",
  "Uploaded prescription pages are fetched by patient_id + doctor_id permissions only",
] as const;
