export const getPrescriptionErrorMessage = (
  error: unknown,
  fallbackMessage: string
) => {
  const candidate = error as {
    message?: string;
  };

  const rawMessage = String(candidate?.message || "").trim();
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("unauthorized")) {
    return "Your session has expired. Please sign in again and retry.";
  }

  if (normalized.includes("doctor context")) {
    return "This prescription can only be accessed inside the selected doctor context.";
  }

  if (normalized.includes("linked to this doctor") || normalized.includes("not linked")) {
    return "This patient is not linked to the selected doctor, so the prescription cannot be opened here.";
  }

  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Network error while loading or uploading prescriptions. Please retry.";
  }

  if (normalized.includes("invalid file type")) {
    return "Unsupported format. Please upload JPG, PNG, WEBP, HEIC, or HEIF images only.";
  }

  if (normalized.includes("file too large")) {
    return rawMessage || "Image is too large. Please choose a smaller image and retry.";
  }

  if (normalized.includes("compression")) {
    return "Image preparation failed before upload. Please pick the images again and retry.";
  }

  if (normalized.includes("at least one prescription image is required")) {
    return "Please select at least one prescription image.";
  }

  return rawMessage || fallbackMessage;
};
