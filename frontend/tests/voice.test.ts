import { afterEach, expect, it, vi } from 'vitest';
import { VoiceCoach } from '../src/features/coaching/VoiceCoach';
import { api } from '../src/lib/api';
import { FeedbackEngine } from '../src/features/coaching/FeedbackEngine';
import type { ExerciseResult } from '../src/types/workout';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('falls back to browser speech when cloud voice fails', async () => {
  vi.spyOn(api, 'speech').mockRejectedValue(new Error('Unavailable'));
  const speak = vi.fn((utterance) => {
    utterance.onstart();
    utterance.onend();
  });
  vi.stubGlobal('window', { speechSynthesis: { speak, resume: vi.fn(), cancel: vi.fn() } });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  const status = vi.fn();
  await new VoiceCoach(status).speak('Test', true);
  expect(speak).toHaveBeenCalledOnce();
  expect(status).toHaveBeenLastCalledWith('Voice ready · browser');
});

it('stopping prevents a delayed cloud response from playing', async () => {
  let complete!: (blob: Blob) => void;
  vi.spyOn(api, 'speech').mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  vi.stubGlobal('window', { speechSynthesis: { cancel: vi.fn() } });
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  const coach = new VoiceCoach();
  const pending = coach.speak('Test', true);
  coach.stop();
  complete(new Blob());
  await pending;
  expect(audio).not.toHaveBeenCalled();
});

it('speaks setup guidance and clean rep feedback with cooldowns', () => {
  const engine = new FeedbackEngine();
  const result: ExerciseResult = {
    trackingValid: false,
    calibrated: false,
    phase: 'ready',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your wrist visible.',
  };
  expect(engine.next(result, 0)).toBe(result.guidance);
  expect(engine.next(result, 1000)).toBeNull();
  expect(engine.next({ ...result, trackingValid: true, calibrated: true, repCompleted: true }, 6000)).toBe(
    'Rep complete. Keep your movement controlled.',
  );
});
