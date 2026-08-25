"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

const ACTIVE_VOICE_INPUT_EVENT = "hms-emr-active-voice-input";
const SILENCE_TIMEOUT_MS = 6500;

let activeVoiceInputId: string | null = null;

function appendSpeechValue(baseValue: string, spokenValue: string) {
  const normalizedSpeech = spokenValue.replace(/\s+/g, " ").trim();
  if (!normalizedSpeech) return baseValue;

  const normalizedBase = baseValue.replace(/\s+$/g, "");
  return normalizedBase ? `${normalizedBase} ${normalizedSpeech}` : normalizedSpeech;
}

function notifyActiveVoiceInput(id: string | null) {
  activeVoiceInputId = id;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_VOICE_INPUT_EVENT, { detail: id }));
}

type VoiceInputMicProps = {
  fieldId: string;
  value: string;
  onChange: (value: string) => void;
  onBeforeStart?: () => void;
  onVoiceComplete?: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function VoiceInputMic({
  fieldId,
  value,
  onChange,
  onBeforeStart,
  onVoiceComplete,
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
  const silenceTimerRef = useRef<number | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current === null) return;
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const stopListening = useCallback(
    () => {
      clearSilenceTimer();
      const completedTranscript = lastTranscriptRef.current.trim();
      void SpeechRecognition.stopListening();
      resetTranscript();
      lastTranscriptRef.current = "";
      setIsActive(false);
      if (activeVoiceInputId === fieldId) {
        notifyActiveVoiceInput(null);
      }
      if (completedTranscript) {
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
      const nextActiveId = (event as CustomEvent<string | null>).detail;
      if (nextActiveId !== fieldId && isActive) {
        clearSilenceTimer();
        resetTranscript();
        lastTranscriptRef.current = "";
        setIsActive(false);
      }
    };

    window.addEventListener(ACTIVE_VOICE_INPUT_EVENT, handleActiveChange);
    return () => window.removeEventListener(ACTIVE_VOICE_INPUT_EVENT, handleActiveChange);
  }, [clearSilenceTimer, fieldId, isActive, resetTranscript]);

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
    const spokenValue = transcript.trim();
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
  }, [isActive, resetTranscript, stopListening, value]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (activeVoiceInputId === fieldId) {
        void SpeechRecognition.stopListening();
        notifyActiveVoiceInput(null);
      }
    };
  }, [clearSilenceTimer, fieldId]);

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

  const toggleListening = async () => {
    if (disabled) return;
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
  };

  return (
    <span className="relative inline-flex shrink-0">
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
        title={isActive ? "Stop voice input" : "Start voice input"}
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
