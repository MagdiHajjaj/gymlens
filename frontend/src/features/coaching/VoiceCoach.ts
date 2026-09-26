import { api } from '../../lib/api';
export class VoiceCoach {
  constructor(private report: (status: string) => void = () => {}) {}
  private busy = false;
  private generation = 0;
  private audio?: HTMLAudioElement;
  private cancelPlayback?: () => void;
  private cache = new Map<string, Blob>();
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
      if (authenticated) {
        let blob = this.cache.get(text);
        if (!blob) {
          blob = await api.speech(text);
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
