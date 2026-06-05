export function logEmrOperationalError(scope: string, error: unknown, detail?: unknown) {
  console.error(`[${scope}]`, {
    error: error instanceof Error ? error.message : String(error),
    detail: detail ?? null,
  });
}

export function getDoctorSafeErrorMessage(
  error: unknown,
  fallback: string
) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
