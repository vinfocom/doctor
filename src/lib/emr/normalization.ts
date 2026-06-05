const SAFE_SPECIAL_CHARACTERS = /[\s\-_.(),/\\[\]{}]+/g;
const NON_ALPHANUMERIC = /[^a-z0-9]/g;

export function trimText(value: unknown) {
  return String(value ?? "").trim();
}

export function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeMasterName(value: unknown) {
  const trimmed = trimText(value).toLowerCase();
  if (!trimmed) return "";

  const spacingNormalized = trimmed.replace(
    /(\d+)\s*(mg|ml|gm|mcg|g|kg)\b/g,
    "$1$2"
  );

  const safeNormalized = spacingNormalized.replace(SAFE_SPECIAL_CHARACTERS, "");
  return safeNormalized.replace(NON_ALPHANUMERIC, "");
}

export function normalizeSuggestionQuery(value: unknown) {
  return normalizeMasterName(value).slice(0, 64);
}

export function normalizeDisplayName(value: unknown) {
  return collapseSpaces(trimText(value));
}

export function buildPrefixSearchPattern(value: unknown) {
  const normalized = normalizeDisplayName(value);
  return normalized ? `${normalized}%` : "";
}
