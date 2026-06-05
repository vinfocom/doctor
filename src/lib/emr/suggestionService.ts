import { normalizeSuggestionQuery } from "@/lib/emr/normalization";
import { listMasterItemsByPrefix } from "@/lib/emr/masterService";
import {
  getCachedJson,
  invalidateCategoryCache,
  invalidateSuggestionPrefixes,
  setCachedJson,
} from "@/lib/emr/redisCache";
import type { EmrMasterItem, EmrMasterType } from "@/lib/emr/types";

const SUGGESTION_CATEGORY_MAP: Record<EmrMasterType, string> = {
  medicine: "medicine",
  complaint: "complaint",
  diagnosis: "diagnosis",
  test: "test",
  advice: "advice",
};

export function getSuggestionCacheKey(type: EmrMasterType, query: string) {
  const normalizedQuery = normalizeSuggestionQuery(query);
  return `suggestion:${SUGGESTION_CATEGORY_MAP[type]}:${normalizedQuery}`;
}

export async function getMasterSuggestions(input: {
  type: EmrMasterType;
  doctorId: number;
  query: string;
  limit?: number;
}) {
  const normalizedQuery = normalizeSuggestionQuery(input.query);
  if (normalizedQuery.length < 1) {
    return [];
  }

  const cacheKey = getSuggestionCacheKey(input.type, input.query);
  const cached = await getCachedJson<EmrMasterItem[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const results = await listMasterItemsByPrefix({
    type: input.type,
    doctorId: input.doctorId,
    query: input.query,
    limit: input.limit,
  });

  await setCachedJson(cacheKey, results, 60 * 30);
  return results;
}

export async function invalidateMasterSuggestionCache(
  type: EmrMasterType,
  rawName: string
) {
  const category = SUGGESTION_CATEGORY_MAP[type];
  try {
    await invalidateSuggestionPrefixes(category, rawName);
  } catch {
    await invalidateCategoryCache(category);
  }
}
