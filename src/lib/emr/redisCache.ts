import { executeRedisCommand, isRedisConfigured } from "@/lib/emr/redisConnection";

type CachedJsonValue = unknown;

const DEFAULT_TTL_SECONDS = 60 * 30;

function canUseRedis() {
  return isRedisConfigured();
}

export async function getCachedJson<T = CachedJsonValue>(key: string) {
  if (!canUseRedis()) return null;

  try {
    const payload = await executeRedisCommand<string | null>(["GET", key]);
    if (!payload) return null;
    return JSON.parse(payload) as T;
  } catch (error) {
    console.error("[emr-redis] GET failed:", error);
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: CachedJsonValue,
  ttlSeconds = DEFAULT_TTL_SECONDS
) {
  if (!canUseRedis()) return;

  try {
    await executeRedisCommand(["SETEX", key, String(ttlSeconds), JSON.stringify(value)]);
  } catch (error) {
    console.error("[emr-redis] SETEX failed:", error);
  }
}

export async function deleteCachedKey(key: string) {
  if (!canUseRedis()) return;

  try {
    await executeRedisCommand(["DEL", key]);
  } catch (error) {
    console.error("[emr-redis] DEL failed:", error);
  }
}

export async function invalidateCategoryCache(category: string) {
  if (!canUseRedis()) return;

  try {
    const keys = await executeRedisCommand<Array<string | null>>([
      "KEYS",
      `suggestion:${category}:*`,
    ]);

    for (const key of keys ?? []) {
      if (typeof key === "string" && key) {
        await deleteCachedKey(key);
      }
    }
  } catch (error) {
    console.error("[emr-redis] category invalidation failed:", error);
  }
}

export async function invalidateSuggestionPrefixes(
  category: string,
  rawName: string
) {
  const normalized = rawName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (!normalized) return;

  const prefixes = new Set<string>();
  for (let index = 2; index <= Math.min(normalized.length, 8); index += 1) {
    prefixes.add(normalized.slice(0, index));
  }

  if (prefixes.size === 0) {
    await invalidateCategoryCache(category);
    return;
  }

  await Promise.all(
    Array.from(prefixes).map((prefix) =>
      deleteCachedKey(`suggestion:${category}:${prefix}`)
    )
  );
}
