import { api } from '../../lib/api';
export class VoiceCoach {
  private busy = false;
  private generation = 0;
  private audio?: HTMLAudioElement;
  private cache = new Map<string, Blob>();
  stop() {
    this.generation++;
    this.audio?.pause();
    this.audio = undefined;
    window.speechSynthesis?.cancel();
    this.busy = false;
  }
  async speak(text: string, authenticated: boolean) {
    if (this.busy) return;
    this.busy = true;
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
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.onpause = () => resolve();
          });
        } finally {
          URL.revokeObjectURL(url);
        }
        return;
      }
      throw new Error('Use browser voice');
    } catch {
      if (generation !== this.generation || !('speechSynthesis' in window)) return;
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
}
