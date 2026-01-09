declare module 'expo-speech' {
  export interface SpeechOptions {
    language?: string;
    pitch?: number;
    rate?: number;
    onStart?: () => void;
    onStopped?: () => void;
    onDone?: () => void;
    onError?: (error: Error) => void;
    voice?: string;
    volume?: number;
  }

  export function speak(text: string, options?: SpeechOptions): void;
  export function stop(): void;
  export function getAvailableVoicesAsync(): Promise<SpeechVoice[]>;
  export function isSpeakingAsync(): Promise<boolean>;

  export interface SpeechVoice {
    identifier: string;
    language: string;
    name: string;
    quality?: string;
  }
}
