declare module "dictionary-en" {
  const dictionary: {
    aff: Uint8Array;
    dic: Uint8Array;
  };

  export default dictionary;
}

declare module "nspell" {
  type Dictionary = {
    aff: Uint8Array;
    dic: Uint8Array;
  };

  type SpellChecker = {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
  };

  export default function createSpellChecker(dictionary: Dictionary): SpellChecker;
}
