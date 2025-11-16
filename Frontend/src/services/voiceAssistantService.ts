import * as Speech from 'expo-speech';
import type { SpeechOptions } from 'expo-speech';

export type VoiceAssistantCategory =
  | 'navigation'
  | 'status'
  | 'safety'
  | 'payment'
  | 'custom';

type QueueItem = {
  id: string;
  text: string;
  category: VoiceAssistantCategory;
  options?: SpeechOptions;
  force?: boolean;
};

const createUniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

class VoiceAssistantService {
  private enabled = true;
  private locale: string | null = null;
  private rate = 1;
  private pitch = 1;
  private queue: QueueItem[] = [];
  private isSpeaking = false;
  private currentItem: QueueItem | null = null;

  initialize(params?: { enabled?: boolean; locale?: string; rate?: number; pitch?: number }) {
    if (typeof params?.enabled === 'boolean') {
      this.enabled = params.enabled;
    }
    if (typeof params?.locale === 'string') {
      this.locale = params.locale;
    }
    if (typeof params?.rate === 'number' && Number.isFinite(params.rate)) {
      this.rate = params.rate;
    }
    if (typeof params?.pitch === 'number' && Number.isFinite(params.pitch)) {
      this.pitch = params.pitch;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  setLocale(locale: string | null) {
    this.locale = locale;
  }

  setRate(rate: number) {
    if (Number.isFinite(rate) && rate > 0) {
      this.rate = rate;
    }
  }

  setPitch(pitch: number) {
    if (Number.isFinite(pitch) && pitch > 0) {
      this.pitch = pitch;
    }
  }

  speak(text: string, category: VoiceAssistantCategory = 'custom', options?: SpeechOptions, force = false) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed || (!this.enabled && !force)) {
      return null;
    }

    const id = createUniqueId();
    const item: QueueItem = {
      id,
      text: trimmed,
      category,
      options,
      force,
    };

    this.queue.push(item);
    this.processQueue();
    return id;
  }

  stopById(id: string) {
    if (!id) return;
    if (this.currentItem?.id === id) {
      Speech.stop();
      this.currentItem = null;
      this.isSpeaking = false;
    }
    this.queue = this.queue.filter((item) => item.id !== id);
  }

  stopByCategory(category: VoiceAssistantCategory) {
    if (!category) return;
    if (this.currentItem?.category === category) {
      Speech.stop();
      this.currentItem = null;
      this.isSpeaking = false;
    }
    this.queue = this.queue.filter((item) => item.category !== category);
  }

  stopAll() {
    Speech.stop();
    this.queue = [];
    this.currentItem = null;
    this.isSpeaking = false;
  }

  private processQueue() {
    if (this.isSpeaking || (!this.enabled && !this.queue.some((item) => item.force))) {
      return;
    }

    const nextItem = this.queue.shift();
    if (!nextItem) {
      return;
    }

    if (!this.enabled && !nextItem.force) {
      return;
    }

    this.isSpeaking = true;
    this.currentItem = nextItem;

    const speechOptions: SpeechOptions = {
      language: nextItem.options?.language || this.locale || nextItem.options?.language,
      pitch: nextItem.options?.pitch ?? this.pitch,
      rate: nextItem.options?.rate ?? this.rate,
      onDone: () => this.handleSpeechEnd(nextItem.id),
      onStopped: () => this.handleSpeechEnd(nextItem.id),
      onError: () => this.handleSpeechEnd(nextItem.id),
      ...nextItem.options,
    };

    try {
      Speech.speak(nextItem.text, speechOptions);
    } catch (error) {
      console.error('❌ VoiceAssistantService error:', error);
      this.handleSpeechEnd(nextItem.id);
    }
  }

  private handleSpeechEnd(id: string) {
    if (this.currentItem?.id === id) {
      this.currentItem = null;
      this.isSpeaking = false;
    }
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 80);
    }
  }
}

const voiceAssistantService = new VoiceAssistantService();
export default voiceAssistantService;
