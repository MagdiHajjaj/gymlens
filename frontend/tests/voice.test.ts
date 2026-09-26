import { afterEach, expect, it, vi } from 'vitest';
import { VoiceCoach } from '../src/features/coaching/VoiceCoach';
import { api } from '../src/lib/api';
import { FeedbackEngine } from '../src/features/coaching/FeedbackEngine';
import { selectedExerciseWarmPhrases } from '../src/features/coaching/Phrasebook';
import type { ExerciseResult } from '../src/types/workout';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubBrowserSpeech() {
  const utterances: SpeechSynthesisUtterance[] = [];
  const speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    utterances.push(utterance);
    utterance.onstart?.({} as SpeechSynthesisEvent);
  });
  vi.stubGlobal('window', { speechSynthesis: { speak, resume: vi.fn(), cancel: vi.fn() } });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      rate = 1;
      constructor(public text: string) {}
    },
  );
  return { speak, utterances };
}

it('falls back to browser speech when cloud voice fails', async () => {
  vi.spyOn(api, 'speech').mockRejectedValue(new Error('Unavailable'));
  const { speak, utterances } = stubBrowserSpeech();
  const status = vi.fn();
  const pending = new VoiceCoach(status).speak('Test', true);
  await vi.waitFor(() => expect(utterances).toHaveLength(1));
  utterances[0].onend?.({} as SpeechSynthesisEvent);
  await pending;
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
  coach.stop();
  complete(new Blob());
  await pending;
  expect(audio).not.toHaveBeenCalled();
});

it('keeps one active and one prioritized pending cue with newest winning equal priority', async () => {
  const { speak, utterances } = stubBrowserSpeech();
  const coach = new VoiceCoach();
  const active = coach.speak('setup', false, { priority: 20 });
  const dropped = coach.speak('rep', false, { priority: 50 });
  const replaced = coach.speak('fault-old', false, { priority: 100 });
  const pending = coach.speak('fault-new', false, { priority: 100 });

  await dropped;
  await replaced;
  expect(speak).toHaveBeenCalledTimes(1);
  expect(utterances[0].text).toBe('setup');

  utterances[0].onend?.({} as SpeechSynthesisEvent);
  await active;
  await Promise.resolve();
  expect(speak).toHaveBeenCalledTimes(2);
  expect(utterances[1].text).toBe('fault-new');

  utterances[1].onend?.({} as SpeechSynthesisEvent);
  await pending;
});

it('warms selected exercise phrases through cloud without audio and aborts after first failure', async () => {
  const speech = vi
    .spyOn(api, 'speech')
    .mockResolvedValueOnce(new Blob())
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(new Blob());
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  const phrases = selectedExerciseWarmPhrases('curl');
  expect(phrases).toHaveLength(7);
  await expect(new VoiceCoach().warmPhrases(phrases, true)).resolves.toBe(false);
  expect(speech).toHaveBeenCalledTimes(2);
  expect(audio).not.toHaveBeenCalled();
});

it('coalesces overlapping warm requests for the same phrase', async () => {
  let complete!: (blob: Blob) => void;
  const speech = vi.spyOn(api, 'speech').mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const coach = new VoiceCoach();
  const first = coach.warmPhrases(['1.'], true);
  const second = coach.warmPhrases(['1.'], true);
  expect(speech).toHaveBeenCalledOnce();
  complete(new Blob());
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
});

it('reuses warmed blobs and stops before a thirteenth cloud request', async () => {
  const speech = vi.spyOn(api, 'speech').mockResolvedValue(new Blob());
  const coach = new VoiceCoach();
  await expect(coach.warmPhrases(['1.', '2.'], true)).resolves.toBe(true);
  await expect(coach.warmPhrases(['1.', '2.'], true)).resolves.toBe(true);
  await expect(
    coach.warmPhrases(
      Array.from({ length: 11 }, (_, index) => `${index + 3}.`),
      true,
    ),
  ).resolves.toBe(false);
  expect(speech).toHaveBeenCalledTimes(12);
});

it('speaks setup guidance and rep counts independent of feedback cooldowns', () => {
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
  expect(engine.next(result, 0, { exercise: 'curl', totalReps: 0 })).toBe(result.guidance);
  expect(engine.next(result, 1000, { exercise: 'curl', totalReps: 0 })).toBeNull();
  expect(
    engine.next({ ...result, trackingValid: true, calibrated: true, repCompleted: true }, 1000, {
      exercise: 'squat',
      totalReps: 1,
    }),
  ).toBe('1.');
  expect(
    engine.next({ ...result, trackingValid: true, calibrated: true, repCompleted: true }, 2000, {
      exercise: 'squat',
      totalReps: 6,
    }),
  ).toBeNull();
});

it('prioritizes active faults over simultaneous rep totals', () => {
  const engine = new FeedbackEngine();
  const cue = engine.nextCue(
    {
      trackingValid: true,
      calibrated: true,
      phase: 'concentric',
      repCompleted: true,
      jointAngles: {},
      faults: [
        {
          code: 'upper_arm_movement',
          message: 'Keep your upper arm close to your side.',
          severity: 'warning',
        },
      ],
      guidance: 'Keep your movement steady and controlled.',
    },
    1000,
    { exercise: 'curl', totalReps: 2 },
  );
  expect(cue).toMatchObject({ text: 'Keep your upper arm close to your side.', priority: 100 });
});
