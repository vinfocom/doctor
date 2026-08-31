"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Mic, Square } from "lucide-react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

const ACTIVE_VOICE_INPUT_EVENT = "hms-emr-active-voice-input";
const SILENCE_TIMEOUT_MS = 15000;

let activeVoiceInputId: string | null = null;

type ActiveVoiceInputEventDetail = {
  id: string | null;
  complete?: boolean;
};

function normalizeSpeechValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendSpeechValue(baseValue: string, spokenValue: string) {
  const normalizedSpeech = normalizeSpeechValue(spokenValue);
  if (!normalizedSpeech) return baseValue;

  const normalizedBase = baseValue.replace(/\s+$/g, "");
  return normalizedBase ? `${normalizedBase} ${normalizedSpeech}` : normalizedSpeech;
}

function notifyActiveVoiceInput(id: string | null, options: { complete?: boolean } = {}) {
  activeVoiceInputId = id;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ActiveVoiceInputEventDetail>(ACTIVE_VOICE_INPUT_EVENT, {
      detail: { id, complete: options.complete },
    })
  );
}

export function stopActiveVoiceInput(options: { complete?: boolean } = {}) {
  notifyActiveVoiceInput(null, options);
}

export function isVoiceInputActive(fieldId?: string) {
  if (!fieldId) return activeVoiceInputId !== null;
  return activeVoiceInputId === fieldId;
}

export function browserSupportsVoiceInput() {
  if (typeof window === "undefined") return false;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
}

type VoiceInputMicProps = {
  fieldId: string;
  value: string;
  onChange: (value: string) => void;
  shortcutTargetRef?: RefObject<HTMLElement | null>;
  isShortcutTarget?: () => boolean;
  onBeforeStart?: () => void;
  onVoiceComplete?: (transcript: string) => void;
  stopOnExternalValueChange?: boolean;
  stopOnOutsidePointerDown?: boolean;
  disabled?: boolean;
  className?: string;
};

export default function VoiceInputMic({
  fieldId,
  value,
  onChange,
  shortcutTargetRef,
  isShortcutTarget,
  onBeforeStart,
  onVoiceComplete,
  stopOnExternalValueChange = true,
  stopOnOutsidePointerDown = false,
  disabled = false,
  className = "",
}: VoiceInputMicProps) {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const baseValueRef = useRef("");
  const lastAppliedValueRef = useRef("");
  const lastTranscriptRef = useRef("");
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const silenceTimerRef = useRef<number | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current === null) return;
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const stopListening = useCallback(
    (options: { complete?: boolean } = {}) => {
      const shouldComplete = options.complete ?? true;
      clearSilenceTimer();
      const completedTranscript = lastTranscriptRef.current.trim();
      void SpeechRecognition.stopListening();
      resetTranscript();
      lastTranscriptRef.current = "";
      setIsActive(false);
      if (activeVoiceInputId === fieldId) {
        notifyActiveVoiceInput(null);
      }
      if (shouldComplete && completedTranscript) {
        onVoiceComplete?.(completedTranscript);
      }
    },
    [clearSilenceTimer, fieldId, onVoiceComplete, resetTranscript]
  );

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      stopListening();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, stopListening]);

  useEffect(() => {
    const handleActiveChange = (event: Event) => {
      const detail = (event as CustomEvent<ActiveVoiceInputEventDetail | string | null>).detail;
      const nextActiveId =
        typeof detail === "object" && detail !== null ? detail.id : detail;
      const shouldComplete =
        typeof detail === "object" && detail !== null ? detail.complete : false;
      if (nextActiveId !== fieldId && isActive) {
        stopListening({ complete: shouldComplete });
      }
    };

    window.addEventListener(ACTIVE_VOICE_INPUT_EVENT, handleActiveChange);
    return () => window.removeEventListener(ACTIVE_VOICE_INPUT_EVENT, handleActiveChange);
  }, [fieldId, isActive, stopListening]);

  useEffect(() => {
    if (!isActive) return;
    if (isMicrophoneAvailable === false) {
      window.setTimeout(() => {
        setError("Microphone access is blocked. Allow microphone permission and try again.");
        stopListening();
      }, 0);
    }
  }, [isActive, isMicrophoneAvailable, stopListening]);

  useEffect(() => {
    if (!isActive) return;
    const spokenValue = normalizeSpeechValue(transcript);
    if (spokenValue) {
      lastTranscriptRef.current = spokenValue;
      const nextValue = appendSpeechValue(baseValueRef.current, spokenValue);
      lastAppliedValueRef.current = nextValue;
      onChange(nextValue);
    }
    startSilenceTimer();
  }, [isActive, onChange, startSilenceTimer, transcript]);

  useEffect(() => {
    if (!isActive) return;
    if (!stopOnExternalValueChange) return;
    const manualValueChanged =
      value !== baseValueRef.current && value !== lastAppliedValueRef.current;

    if (manualValueChanged) {
      baseValueRef.current = value;
      lastAppliedValueRef.current = value;
      lastTranscriptRef.current = "";
      resetTranscript();
      window.setTimeout(() => {
        stopListening();
      }, 0);
    }
  }, [isActive, resetTranscript, stopListening, stopOnExternalValueChange, value]);

  useEffect(() => {
    if (!isActive || !stopOnOutsidePointerDown) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }

      stopListening({ complete: false });
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isActive, stopListening, stopOnOutsidePointerDown]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (activeVoiceInputId === fieldId) {
        void SpeechRecognition.stopListening();
        notifyActiveVoiceInput(null);
      }
    };
  }, [clearSilenceTimer, fieldId]);

  const toggleListening = useCallback(async () => {
    if (disabled) return;
    if (!browserSupportsSpeechRecognition) return;
    setError("");

    if (isActive || (listening && activeVoiceInputId === fieldId)) {
      stopListening();
      return;
    }

    if (activeVoiceInputId && activeVoiceInputId !== fieldId) {
      await SpeechRecognition.stopListening();
    }

    try {
      onBeforeStart?.();
      baseValueRef.current = value;
      lastAppliedValueRef.current = "";
      lastTranscriptRef.current = "";
      resetTranscript();
      notifyActiveVoiceInput(fieldId);
      setIsActive(true);
      // Chrome's Web Speech Recognition may send audio to Google servers; replace with a local engine before any on-prem deployment.
      await SpeechRecognition.startListening({
        continuous: true,
        interimResults: true,
        language: "en-IN",
      });
      startSilenceTimer();
    } catch {
      setError("Voice input could not start. Check microphone permission and try again.");
      stopListening();
    }
  }, [
    browserSupportsSpeechRecognition,
    disabled,
    fieldId,
    isActive,
    listening,
    onBeforeStart,
    resetTranscript,
    startSilenceTimer,
    stopListening,
    value,
  ]);

  useEffect(() => {
    if (disabled || !browserSupportsSpeechRecognition) return;

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "m") return;

      const shortcutTargetIsFocused =
        Boolean(shortcutTargetRef?.current && document.activeElement === shortcutTargetRef.current) ||
        Boolean(isShortcutTarget?.());

      if (!isActive && !shortcutTargetIsFocused) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleListening();
    };

    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, [
    browserSupportsSpeechRecognition,
    disabled,
    isActive,
    isShortcutTarget,
    shortcutTargetRef,
    toggleListening,
  ]);

  if (!browserSupportsSpeechRecognition) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black bg-white text-black opacity-40 ${className}`}
        title="Voice input is not supported in this browser."
        aria-label="Voice input is not supported in this browser"
      >
        <Mic size={15} />
      </button>
    );
  }

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleListening}
        disabled={disabled}
        style={{
          backgroundColor: isActive ? "#000000" : "#ffffff",
          borderColor: "#000000",
          color: isActive ? "#ffffff" : "#000000",
        }}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40 ${
          isActive ? "ring-2 ring-black ring-offset-2" : ""
        } ${className}`}
        title={isActive ? "Stop voice input (Alt+M)" : "Start voice input (Alt+M)"}
        aria-label={isActive ? "Stop voice input" : "Start voice input"}
      >
        {isActive ? (
          <Square
            size={13}
            color="#ffffff"
            fill="#ffffff"
            strokeWidth={2.5}
            style={{ color: "#ffffff", stroke: "#ffffff", fill: "#ffffff" }}
          />
        ) : (
          <Mic
            size={15}
            color="#000000"
            strokeWidth={2}
            style={{ color: "#000000", stroke: "#000000" }}
          />
        )}
      </button>
      {error ? (
        <span className="absolute right-0 top-9 z-30 w-56 rounded-lg border border-red-700 bg-white p-2 text-xs font-medium text-red-700 shadow-lg">
          {error}
        </span>
      ) : null}
    </span>
  );
}
