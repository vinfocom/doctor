"use client";

import Fuse from "fuse.js";
import type { EmrMasterItem } from "@/lib/emr/types";

export type VoiceSuggestionKind = "medicines" | "complaints" | "diagnosis" | "tests" | "advice";

type MasterListResponse = {
  items?: EmrMasterItem[];
};

type VoiceFuzzyCacheEntry = {
  itemsPromise: Promise<EmrMasterItem[]>;
  fusePromise: Promise<Fuse<EmrMasterItem>>;
};

const MAX_MASTER_ITEMS = 5000;
const MAX_FUZZY_CANDIDATES = 5;
const MAX_FINAL_SUGGESTIONS = 10;
const cache = new Map<VoiceSuggestionKind, VoiceFuzzyCacheEntry>();

function waitForUiFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

function dedupeSuggestions(items: EmrMasterItem[]) {
  const seen = new Set<string>();
  const deduped: EmrMasterItem[] = [];

  for (const item of items) {
    const key = item.id ? `id:${item.id}` : `name:${item.normalized_name || item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, MAX_FINAL_SUGGESTIONS);
}

async function fetchMasterList(kind: VoiceSuggestionKind) {
  const response = await fetch(`/api/emr/master/${kind}?limit=${MAX_MASTER_ITEMS}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load voice suggestions.");
  }

  const data = (await response.json()) as MasterListResponse;
  return data.items ?? [];
}

function createFuse(items: EmrMasterItem[]) {
  return new Fuse(items, {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "normalized_name", weight: 0.2 },
      { name: "salt_composition", weight: 0.1 },
    ],
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
    threshold: 0.42,
  });
}

function getCacheEntry(kind: VoiceSuggestionKind) {
  const existing = cache.get(kind);
  if (existing) return existing;

  const itemsPromise = fetchMasterList(kind);
  const fusePromise = itemsPromise.then(async (items) => {
    await waitForUiFrame();
    return createFuse(items);
  });

  const entry = { itemsPromise, fusePromise };
  cache.set(kind, entry);
  return entry;
}

async function fetchPrefixSuggestions(kind: VoiceSuggestionKind, query: string) {
  const response = await fetch(
    `/api/suggestions/${kind}?q=${encodeURIComponent(query)}&limit=${MAX_FINAL_SUGGESTIONS}`,
    { cache: "no-store" }
  );

  if (!response.ok) return [];
  const data = (await response.json()) as { suggestions?: EmrMasterItem[] };
  return data.suggestions ?? [];
}

export function invalidateVoiceFuzzyMasterCache(kind?: VoiceSuggestionKind) {
  if (kind) {
    cache.delete(kind);
    return;
  }
  cache.clear();
}

export async function getVoiceFuzzySuggestions(input: {
  kind: VoiceSuggestionKind;
  transcript: string;
}) {
  const transcript = input.transcript.trim();
  if (transcript.length < 2) return [];

  const { fusePromise } = getCacheEntry(input.kind);
  const fuse = await fusePromise;
  await waitForUiFrame();

  const candidates = fuse
    .search(transcript, { limit: MAX_FUZZY_CANDIDATES })
    .map((result) => result.item.name)
    .filter(Boolean);

  if (candidates.length === 0) return [];

  const suggestionGroups = await Promise.all(
    candidates.map((candidate) => fetchPrefixSuggestions(input.kind, candidate))
  );

  return dedupeSuggestions(suggestionGroups.flat());
}
