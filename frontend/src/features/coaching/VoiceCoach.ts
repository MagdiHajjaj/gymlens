import { api } from '../../lib/api';

interface SpeakOptions {
  priority?: number;
}

interface SpeechRequest {
  id: number;
  text: string;
  authenticated: boolean;
  priority: number;
  generation: number;
  resolve: () => void;
}

const CLOUD_LIMIT = 12;
const CLOUD_WINDOW_MS = 60_000;
const CLOUD_COOLDOWN_MS = 60_000;

export class VoiceCoach {
  constructor(private report: (status: string) => void = () => {}) {}
  private generation = 0;
  private nextId = 0;
  private active?: SpeechRequest;
  private pending?: SpeechRequest;
  private audio?: HTMLAudioElement;
  private cancelPlayback?: () => void;
  private cache = new Map<string, Blob>();
  private cloudInflight = new Map<string, Promise<Blob>>();
  private cloudCalls: number[] = [];
  private cloudCooldownUntil = 0;
  private voiceMode?: 'cloud' | 'browser';

  stop() {
    this.generation++;
    this.pending?.resolve();
    this.pending = undefined;
    this.cancelPlayback?.();
    this.cancelPlayback = undefined;
    this.audio?.pause();
    this.audio = undefined;
    window.speechSynthesis?.cancel();
    this.active?.resolve();
    this.active = undefined;
  }

  speak(text: string, authenticated: boolean, options: SpeakOptions = {}) {
    const request: SpeechRequest = {
      id: ++this.nextId,
      text,
      authenticated,
      priority: options.priority ?? 0,
      generation: this.generation,
      resolve: () => {},
    };
    const promise = new Promise<void>((resolve) => {
      request.resolve = resolve;
    });
    if (!this.active) {
      this.active = request;
      void this.runActive(request);
      return promise;
    }
    if (!this.pending || request.priority >= this.pending.priority) {
      this.pending?.resolve();
      this.pending = request;
    } else request.resolve();
    return promise;
  }

  async warmPhrases(phrases: string[], authenticated: boolean) {
    if (!authenticated) return false;
    for (const phrase of phrases) {
      if (this.cache.has(phrase)) continue;
      try {
        await this.fetchCloud(phrase);
      } catch {
        this.cloudCooldownUntil = Date.now() + CLOUD_COOLDOWN_MS;
        return false;
      }
    }
    return true;
  }

  private async runActive(request: SpeechRequest) {
    try {
      await this.perform(request);
    } finally {
      if (this.active?.id === request.id) this.active = undefined;
      request.resolve();
      const next = this.pending;
      this.pending = undefined;
      if (next && next.generation === this.generation) {
        this.active = next;
        void this.runActive(next);
      } else next?.resolve();
    }
  }

  private async perform(request: SpeechRequest) {
    this.report('Preparing voice…');
    if (!request.authenticated || this.voiceMode === 'browser') {
      this.voiceMode = 'browser';
      await this.speakBrowser(request);
      return;
    }
    try {
      const blob = await this.fetchCloud(request.text);
      if (!this.isCurrent(request)) return;
      const url = URL.createObjectURL(blob);
      try {
        const audio = new Audio(url);
        this.audio = audio;
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timer);
            audio.onended = audio.onerror = audio.onpause = null;
            this.cancelPlayback = undefined;
            if (this.audio === audio) this.audio = undefined;
            audio.pause();
            if (error) reject(error);
            else resolve();
          };
          const timer = setTimeout(() => finish(new Error('Playback timed out')), 15000);
          this.cancelPlayback = () => finish();
          audio.onended = () => finish();
          audio.onerror = () => finish(new Error('Audio playback failed'));
          audio.onpause = () => finish();
          void audio
            .play()
            .then(() => {
              this.voiceMode = 'cloud';
              if (this.isCurrent(request)) this.report('Speaking · ElevenLabs');
            })
            .catch(() => finish(new Error('Playback blocked')));
        });
        if (this.isCurrent(request)) this.report('Voice ready · ElevenLabs');
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      if (!this.isCurrent(request)) return;
      if (this.voiceMode === 'cloud') {
        this.report('ElevenLabs voice unavailable. Visual cues remain on.');
        return;
      }
      this.voiceMode = 'browser';
      await this.speakBrowser(request);
    }
  }

  private async speakBrowser(request: SpeechRequest) {
    if (!('speechSynthesis' in window)) {
      this.report('Audio unavailable in this browser. Visual cues remain on.');
      return;
    }
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      const finish = (status?: string) => {
        clearTimeout(timer);
        utterance.onstart = utterance.onend = utterance.onerror = null;
        this.cancelPlayback = undefined;
        if (status && this.isCurrent(request)) this.report(status);
        resolve();
      };
      const timer = setTimeout(() => {
        finish('No audio response. Tap Test voice to retry.');
        window.speechSynthesis.cancel();
      }, 15000);
      this.cancelPlayback = () => finish();
      utterance.rate = 0.95;
      utterance.onstart = () => {
        if (this.isCurrent(request)) this.report('Speaking · browser voice');
      };
      utterance.onend = () => {
        finish('Voice ready · browser');
      };
      utterance.onerror = () => {
        finish('Playback blocked. Tap Test voice to retry.');
      };
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    });
  }

  private fetchCloud(text: string): Promise<Blob> {
    const cached = this.cache.get(text);
    if (cached) return Promise.resolve(cached);
    const current = this.cloudInflight.get(text);
    if (current) return current;
    const request = this.requestCloud(text)
      .then((blob) => {
        this.cache.set(text, blob);
        return blob;
      })
      .finally(() => {
        if (this.cloudInflight.get(text) === request) this.cloudInflight.delete(text);
      });
    this.cloudInflight.set(text, request);
    return request;
  }

  private async requestCloud(text: string) {
    const now = Date.now();
    if (now < this.cloudCooldownUntil) throw new Error('Cloud voice is cooling down');
    this.cloudCalls = this.cloudCalls.filter((time) => now - time < CLOUD_WINDOW_MS);
    if (this.cloudCalls.length >= CLOUD_LIMIT) throw new Error('Cloud voice rate limit reached');
    this.cloudCalls.push(now);
    try {
      const blob = await api.speech(text);
      return blob;
    } catch (error) {
      this.cloudCooldownUntil = Date.now() + CLOUD_COOLDOWN_MS;
      throw error;
    }
  }

  private isCurrent(request: SpeechRequest) {
    return this.active?.id === request.id && request.generation === this.generation;
  }
}
