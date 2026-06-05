import Fuse from "fuse.js";
import {
  normalizeDisplayName,
  normalizeMasterName,
} from "@/lib/emr/normalization";
import { listVisibleMasterItemsForDoctor } from "@/lib/emr/masterService";
import type { EmrMasterItem, EmrMasterType } from "@/lib/emr/types";

type SupportedCorrectionType = Extract<
  EmrMasterType,
  "complaint" | "diagnosis" | "advice"
>;

type SpellChecker = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
};

let spellCheckerPromise: Promise<SpellChecker> | null = null;

function getSpellChecker() {
  if (!spellCheckerPromise) {
    spellCheckerPromise = Promise.all([
      import("nspell"),
      import("dictionary-en"),
    ]).then(([nspellModule, dictionaryModule]) => {
      const createSpellChecker = nspellModule.default;
      return createSpellChecker(dictionaryModule.default);
    });
  }

  return spellCheckerPromise;
}

function computeLevenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex];
    }
  }

  return previous[right.length];
}

function matchWordCasing(source: string, suggestion: string) {
  if (source.toUpperCase() === source) {
    return suggestion.toUpperCase();
  }

  if (source[0] && source[0] === source[0].toUpperCase()) {
    return `${suggestion.charAt(0).toUpperCase()}${suggestion.slice(1).toLowerCase()}`;
  }

  return suggestion.toLowerCase();
}

function buildDictionarySuggestion(
  value: string,
  spellChecker: SpellChecker
) {
  const tokens = value.match(/[A-Za-z]+|[^A-Za-z]+/g) ?? [value];
  let changed = false;

  const corrected = tokens.map((token) => {
    if (!/^[A-Za-z]{3,}$/.test(token)) {
      return token;
    }

    const lowerToken = token.toLowerCase();
    if (spellChecker.correct(lowerToken)) {
      return token;
    }

    const suggestion = spellChecker.suggest(lowerToken)[0];
    if (!suggestion) {
      return token;
    }

    changed = true;
    return matchWordCasing(token, suggestion);
  });

  if (!changed) {
    return null;
  }

  const normalizedSuggestion = normalizeDisplayName(corrected.join(""));
  if (!normalizedSuggestion || normalizedSuggestion === normalizeDisplayName(value)) {
    return null;
  }

  return normalizedSuggestion;
}

function findStrongMasterMatch(
  items: EmrMasterItem[],
  rawName: string
) {
  const normalizedInput = normalizeMasterName(rawName);
  if (!normalizedInput) return null;

  const exactMatch = items.find(
    (item) => normalizeMasterName(item.name) === normalizedInput
  );
  if (exactMatch) {
    return exactMatch;
  }

  const fuse = new Fuse(items, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    keys: [
      { name: "name", weight: 0.75 },
      { name: "normalized_name", weight: 0.25 },
    ],
  });

  const result = fuse.search(rawName, { limit: 5 })[0];
  if (!result?.item) {
    return null;
  }

  const candidate = result.item;
  const candidateNormalized = normalizeMasterName(candidate.name);
  const distance = computeLevenshteinDistance(normalizedInput, candidateNormalized);
  const maxAllowedDistance =
    normalizedInput.length <= 5 ? 1 : normalizedInput.length <= 10 ? 2 : 3;
  const similarity =
    1 - distance / Math.max(normalizedInput.length, candidateNormalized.length, 1);

  if (distance <= maxAllowedDistance || similarity >= 0.74) {
    return candidate;
  }

  return null;
}

export async function getMasterCorrectionSuggestion(input: {
  type: SupportedCorrectionType;
  doctorId: number;
  name: string;
}) {
  const rawName = normalizeDisplayName(input.name);
  const normalizedInput = normalizeMasterName(rawName);

  if (!rawName || normalizedInput.length < 3) {
    return {
      masterSuggestion: null,
      spellSuggestion: null,
    };
  }

  const visibleItems = await listVisibleMasterItemsForDoctor({
    type: input.type,
    doctorId: input.doctorId,
    limit: 1000,
  });

  const masterSuggestion = findStrongMasterMatch(visibleItems, rawName);
  if (masterSuggestion) {
    return {
      masterSuggestion,
      spellSuggestion: null,
    };
  }

  const spellChecker = await getSpellChecker();
  const spellSuggestion = buildDictionarySuggestion(rawName, spellChecker);
  if (!spellSuggestion) {
    return {
      masterSuggestion: null,
      spellSuggestion: null,
    };
  }

  const correctedMasterMatch = visibleItems.find(
    (item) => normalizeMasterName(item.name) === normalizeMasterName(spellSuggestion)
  );

  return {
    masterSuggestion: correctedMasterMatch ?? null,
    spellSuggestion: correctedMasterMatch ? null : spellSuggestion,
  };
}
