declare module "react-speech-recognition" {
  type StartListeningOptions = {
    continuous?: boolean;
    interimResults?: boolean;
    language?: string;
  };

  type SpeechRecognitionController = {
    startListening: (options?: StartListeningOptions) => Promise<void>;
    stopListening: () => Promise<void>;
    abortListening: () => Promise<void>;
    browserSupportsSpeechRecognition: () => boolean;
  };

  type SpeechRecognitionState = {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable: boolean;
  };

  const SpeechRecognition: SpeechRecognitionController;
  export function useSpeechRecognition(): SpeechRecognitionState;
  export default SpeechRecognition;
}
