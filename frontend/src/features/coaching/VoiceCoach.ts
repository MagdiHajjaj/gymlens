import { api } from '../../lib/api';

const VOICE_CACHE = 'gymlens-voice-v1';
const CLOUD_BACKOFF_MS = 120_000;

// Keeps ElevenLabs audio in the browser's Cache Storage, so a page reload never pays for it again.
async function cachedSpeech(text: string): Promise<Blob> {
  const key = `/voice-cache/${encodeURIComponent(text)}`;
  const store = 'caches' in window ? await caches.open(VOICE_CACHE).catch(() => undefined) : undefined;
  const hit = await store?.match(key);
  if (hit) return hit.blob();
  const blob = await api.speech(text);
  void store?.put(key, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {});
  return blob;
}
export class VoiceCoach {
  constructor(private report: (status: string) => void = () => {}) {}
  private busy = false;
  private generation = 0;
  private audio?: HTMLAudioElement;
  private cancelPlayback?: () => void;
  private cache = new Map<string, Blob>();
  /** After ElevenLabs fails, use the browser voice until this time instead of retrying every cue. */
  private cloudPausedUntil = 0;
  stop() {
    this.generation++;
    this.cancelPlayback?.();
    this.cancelPlayback = undefined;
    this.audio?.pause();
    this.audio = undefined;
    window.speechSynthesis?.cancel();
    this.busy = false;
  }
  async speak(text: string, authenticated: boolean) {
    if (this.busy) return;
    this.busy = true;
    this.report('Preparing voice…');
    const generation = this.generation;
    try {
      if (authenticated && Date.now() >= this.cloudPausedUntil) {
        let blob = this.cache.get(text);
        if (!blob) {
          try {
            blob = await cachedSpeech(text);
          } catch (e) {
            this.cloudPausedUntil = Date.now() + CLOUD_BACKOFF_MS;
            throw e;
          }
          this.cache.set(text, blob);
        }
        if (generation !== this.generation) return;
        const url = URL.createObjectURL(blob);
        try {
          const audio = new Audio(url);
          this.audio = audio;
          await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
              clearTimeout(timer);
              audio.onended = audio.onerror = audio.onpause = null;
              this.cancelPlayback = undefined;
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
                if (generation === this.generation) this.report('Speaking · ElevenLabs');
              })
              .catch(() => finish(new Error('Playback blocked')));
          });
          if (generation === this.generation) this.report('Voice ready · ElevenLabs');
        } finally {
          URL.revokeObjectURL(url);
        }
        return;
      }
      throw new Error('Use browser voice');
    } catch {
      if (generation !== this.generation) return;
      if (!('speechSynthesis' in window)) {
        this.report('Audio unavailable in this browser. Visual cues remain on.');
        return;
      }
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        const finish = (status?: string) => {
          clearTimeout(timer);
          utterance.onstart = utterance.onend = utterance.onerror = null;
          this.cancelPlayback = undefined;
          if (status && generation === this.generation) this.report(status);
          resolve();
        };
        const timer = setTimeout(() => {
          finish('No audio response. Tap Test voice to retry.');
          window.speechSynthesis.cancel();
        }, 15000);
        this.cancelPlayback = () => finish();
        utterance.rate = 0.95;
        utterance.onstart = () => this.report('Speaking · browser voice');
        utterance.onend = () => {
          finish('Voice ready · browser');
        };
        utterance.onerror = () => {
          finish('Playback blocked. Tap Test voice to retry.');
        };
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      });
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
}
