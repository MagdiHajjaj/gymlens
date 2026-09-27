import { api } from '../../lib/api';

interface SpeakOptions {
  priority?: number;
}

interface SpeechRequest {
  id: number;
  text: string;
  priority: number;
  generation: number;
  resolve: () => void;
}

const CLOUD_LIMIT = 40;
const CLOUD_WINDOW_MS = 60_000;
const CLOUD_COOLDOWN_MS = 60_000;
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==';

export class VoiceCoach {
  constructor(private report: (status: string) => void = () => {}) {}
  private generation = 0;
  private nextId = 0;
  private active?: SpeechRequest;
  private pending?: SpeechRequest;
  private audio?: HTMLAudioElement;
  private unlockedAudio?: HTMLAudioElement;
  private audioContext?: AudioContext;
  private audioSource?: AudioBufferSourceNode;
  private cancelPlayback?: () => void;
  private cache = new Map<string, Blob>();
  private cloudInflight = new Map<string, Promise<Blob>>();
  private cloudCalls: number[] = [];
  private cloudCooldownUntil = 0;
  private voiceMode?: 'cloud' | 'browser';

  /** Resume Web Audio while a mobile tap still owns user activation. */
  unlock() {
    // A fresh user gesture should retry ElevenLabs after a session that had to
    // start on browser speech. Never leave the fallback latched indefinitely.
    if (this.voiceMode === 'browser') {
      this.voiceMode = undefined;
      this.cloudCooldownUntil = 0;
    }
    const AudioContextClass =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      if (!this.audioContext) this.audioContext = new AudioContextClass();
      void this.audioContext.resume().catch(() => {});
      return;
    }
    if (this.unlockedAudio || typeof Audio === 'undefined') return;
    const audio = new Audio(SILENT_WAV);
    audio.volume = 0;
    this.unlockedAudio = audio;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      })
      .catch(() => {
        if (this.unlockedAudio === audio) this.unlockedAudio = undefined;
      });
  }

  stop() {
    this.generation++;
    this.pending?.resolve();
    this.pending = undefined;
    this.cancelPlayback?.();
    this.cancelPlayback = undefined;
    try {
      this.audioSource?.stop();
    } catch {
      // A source that already ended cannot be stopped again.
    }
    this.audioSource = undefined;
    this.audio?.pause();
    this.audio = undefined;
    window.speechSynthesis?.cancel();
    this.active?.resolve();
    this.active = undefined;
  }

  speak(text: string, authenticated: boolean, options: SpeakOptions = {}) {
    void authenticated;
    const request: SpeechRequest = {
      id: ++this.nextId,
      text,
      priority: options.priority ?? 0,
      generation: this.generation,
      resolve: () => {},
    };
    const promise = new Promise<void>((resolve) => {
      request.resolve = resolve;
    });
    if (this.active && request.priority > this.active.priority) {
      this.pending?.resolve();
      this.pending = request;
      this.generation++;
      request.generation = this.generation;
      this.active = undefined;
      this.cancelPlayback?.();
      this.cancelPlayback = undefined;
      return promise;
    }
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

  /**
   * Warm the cloud cache for one phrase without speaking it. Best-effort and
   * silent: a cache hit, an in-flight request, a rate limit, or a network
   * failure all result in a no-op, and the later speak() falls back to its
   * normal fetch path. Used to speculatively pre-generate the next rep's cue
   * while the user is still moving, so playback starts instantly on completion.
   */
  prefetch(text: string, authenticated: boolean) {
    void authenticated;
    if (!text || this.cache.has(text) || this.cloudInflight.has(text)) return;
    void this.fetchCloud(text).catch(() => {});
  }

  async warmPhrases(phrases: string[], authenticated: boolean) {
    const limit = authenticated ? 4 : 2;
    const unique = [...new Set(phrases)].filter((phrase) => !this.cache.has(phrase)).slice(0, limit);
    const results = await Promise.all(
      unique.map(async (phrase) => {
        try {
          await this.fetchCloud(phrase);
          return true;
        } catch {
          return false;
        }
      }),
    );
    if (results.some((result) => !result)) {
      // Background warming is optional. A failed warm-up must not silence the
      // next live cue; the live request can retry or fall back to browser speech.
      this.cloudCooldownUntil = 0;
      return false;
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
    if (this.voiceMode === 'browser') {
      this.voiceMode = 'browser';
      await this.speakBrowser(request);
      return;
    }
    try {
      const blob = await this.fetchCloud(request.text);
      if (!this.isCurrent(request)) return;
      if (this.audioContext) {
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();
        const buffer = await this.audioContext.decodeAudioData(await blob.arrayBuffer());
        if (!this.isCurrent(request)) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        this.audioSource = source;
        this.voiceMode = 'cloud';
        this.report('Speaking · ElevenLabs');
        await new Promise<void>((resolve, reject) => {
          let finished = false;
          const finish = (error?: Error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            source.onended = null;
            this.cancelPlayback = undefined;
            if (this.audioSource === source) this.audioSource = undefined;
            if (error) reject(error);
            else resolve();
          };
          const timer = setTimeout(() => finish(new Error('Playback timed out')), 15000);
          this.cancelPlayback = () => {
            try {
              source.stop();
            } catch {
              // The source may have already ended.
            }
            finish();
          };
          source.onended = () => finish();
          source.start();
        });
        if (this.isCurrent(request)) this.report('Voice ready · ElevenLabs');
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const audio = this.unlockedAudio ?? new Audio();
        audio.src = url;
        audio.volume = 1;
        audio.load();
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
      // Once this workout has spoken with ElevenLabs, keep the voice consistent.
      // A transient provider/rate/network failure may skip a cue, but the next
      // cue retries after cooldown instead of suddenly becoming a system voice.
      if (this.voiceMode === 'cloud') {
        this.report('ElevenLabs temporarily unavailable · visual cues remain on');
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
