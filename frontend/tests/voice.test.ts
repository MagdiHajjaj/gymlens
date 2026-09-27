import { afterEach, expect, it, vi } from 'vitest';
import { VoiceCoach } from '../src/features/coaching/VoiceCoach';
import { api, ApiError } from '../src/lib/api';
import {
  FeedbackEngine,
  predictNextRepCues,
  readyCue,
  repCompleteCue,
} from '../src/features/coaching/FeedbackEngine';
import { selectedExerciseWarmPhrases } from '../src/features/coaching/Phrasebook';
import type { ExerciseId, ExerciseResult } from '../src/types/workout';

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

it('never changes to browser speech after ElevenLabs has spoken in the workout', async () => {
  vi.spyOn(api, 'speech')
    .mockResolvedValueOnce(new Blob(['audio'], { type: 'audio/mpeg' }))
    .mockRejectedValueOnce(new Error('Unavailable'));
  const { speak } = stubBrowserSpeech();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:voice'),
    revokeObjectURL: vi.fn(),
  });
  class AudioStub {
    src = '';
    volume = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onpause: (() => void) | null = null;
    load() {}
    pause() {}
    play() {
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  }
  vi.stubGlobal('Audio', AudioStub);
  const status = vi.fn();
  const coach = new VoiceCoach(status);
  await coach.speak('One.', true);
  await coach.speak('Two.', true);
  expect(speak).not.toHaveBeenCalled();
  expect(status).toHaveBeenLastCalledWith('ElevenLabs temporarily unavailable · visual cues remain on');
});

it('a rejected phrase does not silence subsequent valid cloud cues or latch browser fallback', async () => {
  const speech = vi
    .spyOn(api, 'speech')
    .mockRejectedValueOnce(new ApiError('Unapproved phrase', 422))
    .mockResolvedValueOnce(new Blob(['audio'], { type: 'audio/mpeg' }))
    .mockRejectedValueOnce(new ApiError('Another unapproved phrase', 422))
    .mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  const { speak } = stubBrowserSpeech();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: vi.fn() });
  const play = vi.fn();
  vi.stubGlobal(
    'Audio',
    class {
      onended?: () => void;
      load() {}
      pause() {}
      play() {
        play();
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }
    },
  );
  const coach = new VoiceCoach();
  await coach.speak('Unapproved phrase', false);
  await coach.speak('1.', false);
  await coach.speak('Another unapproved phrase', false);
  await coach.speak('2.', false);
  expect(speech).toHaveBeenCalledTimes(4);
  expect(play).toHaveBeenCalledTimes(2);
  expect(speak).not.toHaveBeenCalled();
});

it('preserves the HTTP status of a rejected voice request', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: [{ msg: 'Choose an approved coaching phrase' }] }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  );
  await expect(api.speech('Unapproved phrase')).rejects.toMatchObject({ name: 'ApiError', status: 422 });
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

it('interrupts low-priority setup speech for an urgent rep cue', async () => {
  vi.spyOn(api, 'speech').mockRejectedValue(new Error('Unavailable'));
  const { speak, utterances } = stubBrowserSpeech();
  const coach = new VoiceCoach();
  const active = coach.speak('setup', false, { priority: 20 });
  const rep = coach.speak('rep', false, { priority: 85 });
  await vi.waitFor(() => expect(utterances).toHaveLength(1));
  expect(speak).toHaveBeenCalledTimes(1);
  expect(utterances[0].text).toBe('rep');

  utterances[0].onend?.({} as SpeechSynthesisEvent);
  await active;
  await rep;
});

it('warms a bounded set of selected exercise phrases without audio', async () => {
  const speech = vi
    .spyOn(api, 'speech')
    .mockResolvedValueOnce(new Blob())
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(new Blob());
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  const phrases = selectedExerciseWarmPhrases('curl');
  expect(phrases.length).toBeGreaterThan(7);
  await expect(new VoiceCoach().warmPhrases(phrases, true)).resolves.toBe(false);
  expect(speech).toHaveBeenCalledTimes(4);
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

it('reuses warmed blobs and bounds each background warm-up', async () => {
  const speech = vi.spyOn(api, 'speech').mockResolvedValue(new Blob());
  const coach = new VoiceCoach();
  await expect(coach.warmPhrases(['1.', '2.'], true)).resolves.toBe(true);
  await expect(coach.warmPhrases(['1.', '2.'], true)).resolves.toBe(true);
  await expect(
    coach.warmPhrases(
      Array.from({ length: 11 }, (_, index) => `${index + 3}.`),
      true,
    ),
  ).resolves.toBe(true);
  expect(speech).toHaveBeenCalledTimes(6);
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
  ).toBe('Rep 6 complete.');
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

it('speaks a specific reason when a rep is not counted', () => {
  const engine = new FeedbackEngine();
  const result: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Rep not counted: press overhead until your arms are straight, then return to your shoulders.',
  };
  expect(engine.nextCue(result, 0, { exercise: 'press', totalReps: 0 })).toMatchObject({
    text: result.guidance,
    priority: 100,
  });
});

it('warms count and exercise-specific fault phrases for every exercise', () => {
  const phrases = selectedExerciseWarmPhrases('deadlift' as ExerciseId);
  expect(phrases).toContain('1.');
  expect(phrases).toContain('Keep your back flat — hinge at the hips, chest proud.');
  expect(phrases).toContain('Hinge deeper at the hips within your comfortable range.');
});

it('unlocks one reusable audio element from the mobile tap', async () => {
  const audio = {
    volume: 1,
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
  const audioConstructor = vi.fn();
  class FakeAudio {
    volume = audio.volume;
    currentTime = audio.currentTime;
    play = audio.play;
    pause = audio.pause;
    constructor() {
      audioConstructor();
    }
  }
  vi.stubGlobal('Audio', FakeAudio);
  const coach = new VoiceCoach();
  coach.unlock();
  coach.unlock();
  expect(audioConstructor).toHaveBeenCalledOnce();
  expect(audio.play).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(audio.pause).toHaveBeenCalledOnce();
});

it('announces every completed rep count', () => {
  const engine = new FeedbackEngine();
  const completed: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
  };
  expect(engine.next(completed, 0, { exercise: 'squat', totalReps: 6 })).toBe('Rep 6 complete.');
});

it('speaks measured movement guidance after a phase remains stable', () => {
  const engine = new FeedbackEngine();
  const moving: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'eccentric',
    repCompleted: false,
    jointAngles: { elbow_angle: 110 },
    faults: [],
    guidance: 'Curl toward your shoulders. Keep each elbow under its shoulder and your wrists straight.',
  };
  expect(engine.next(moving, 0, { exercise: 'curl', totalReps: 0 })).toBeNull();
  expect(engine.next(moving, 400, { exercise: 'curl', totalReps: 0 })).toBe(moving.guidance);
});

it('restarts spoken rep numbers at one for the next set', () => {
  const engine = new FeedbackEngine();
  const completed: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'ready',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: '',
  };
  expect(engine.next(completed, 0, { exercise: 'squat', totalReps: 9, setReps: 1 })).toBe('1.');
});

it('grounds the rep-completion cue in the rep’s measured angle', () => {
  const engine = new FeedbackEngine();
  const completed: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    repMetrics: { min_angle: 92, duration_ms: 2100 },
  };
  expect(engine.next(completed, 0, { exercise: 'squat', totalReps: 7 })).toBe(
    'Rep 7 complete. Bottom angle 92 degrees.',
  );
});

it('never invents an angle when the completed rep has no measurements', () => {
  const engine = new FeedbackEngine();
  const completed: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    repMetrics: { min_angle: NaN },
  };
  const cue = engine.next(completed, 0, { exercise: 'squat', totalReps: 7 });
  expect(cue).toBe('Rep 7 complete.');
  expect(cue).not.toContain('degrees');
});

it('repCompleteCue falls back to a plain callout without a rep number or metrics', () => {
  const result = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: '',
  } as ExerciseResult;
  expect(repCompleteCue(result, 0)).toBe('Rep complete.');
  expect(repCompleteCue(result, 4)).toBe('Rep 4 complete.');
});

it('announces readiness while waiting between reps', () => {
  const engine = new FeedbackEngine();
  const idle: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'ready',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
  };
  expect(engine.next(idle, 0, { exercise: 'squat', totalReps: 0 })).toBe('Ready.');
});

it('grounds the idle cue in the measured session total', () => {
  const engine = new FeedbackEngine();
  const idle: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'ready',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    completedReps: [],
  };
  // No rep completed in this frame — the idle cue must use the session total
  // from context, not this frame's (empty) rep count.
  expect(engine.next(idle, 0, { exercise: 'squat', totalReps: 2 })).toBe('Ready. 2 reps so far.');
});

it('alternates idle coaching between rep count and a pose reminder', () => {
  const engine = new FeedbackEngine();
  const idle: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'ready',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    completedReps: [],
  };
  const ctx = { exercise: 'squat', totalReps: 2 } as const;
  expect(engine.next(idle, 0, ctx)).toBe('Ready. 2 reps so far.');
  expect(engine.next(idle, 31_000, ctx)).toBe('Stand tall and brace your core for the next squat.');
  expect(engine.next(idle, 62_000, ctx)).toBe('Ready. 2 reps so far.');
});

it('resets the idle cue alternation', () => {
  const engine = new FeedbackEngine();
  const idle: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'ready',
    repCompleted: false,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    completedReps: [],
  };
  const ctx = { exercise: 'squat', totalReps: 2 } as const;
  expect(engine.next(idle, 0, ctx)).toBe('Ready. 2 reps so far.');
  expect(engine.next(idle, 31_000, ctx)).toBe('Stand tall and brace your core for the next squat.');
  engine.reset();
  expect(engine.next(idle, 62_000, ctx)).toBe('Ready. 2 reps so far.');
});

it('readyCue uses singular and plural rep counts', () => {
  expect(readyCue(0)).toBe('Ready.');
  expect(readyCue(1)).toBe('Ready. 1 rep so far.');
  expect(readyCue(7)).toBe('Ready. 7 reps so far.');
});

it('prefetches cloud audio into the cache without speaking', async () => {
  const speech = vi.spyOn(api, 'speech').mockResolvedValue(new Blob());
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  const coach = new VoiceCoach();
  coach.prefetch('Rep 7 complete.', true);
  coach.prefetch('Rep 7 complete.', true);
  await vi.waitFor(() => expect(speech).toHaveBeenCalledTimes(1));
  expect(speech).toHaveBeenCalledWith('Rep 7 complete.');
  expect(audio).not.toHaveBeenCalled();
});

it('prefetch failures are silent and never throw', async () => {
  vi.spyOn(api, 'speech').mockRejectedValue(new Error('Unavailable'));
  const coach = new VoiceCoach();
  expect(() => coach.prefetch('Rep 7 complete.', true)).not.toThrow();
  await Promise.resolve();
});

it('a later speak reuses prefetched audio instead of refetching', async () => {
  const speech = vi.spyOn(api, 'speech').mockResolvedValue(new Blob());
  vi.stubGlobal('window', { speechSynthesis: { cancel: vi.fn() } });
  const audio = vi.fn();
  vi.stubGlobal('Audio', audio);
  const coach = new VoiceCoach();
  coach.prefetch('Hello.', true);
  await vi.waitFor(() => expect(speech).toHaveBeenCalledTimes(1));
  const pending = coach.speak('Hello.', true);
  coach.stop();
  await pending;
  expect(speech).toHaveBeenCalledTimes(1);
});

it('predicts the next rep cue texts from the just-completed rep', () => {
  const completed: ExerciseResult = {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: '',
    repMetrics: { min_angle: 90, duration_ms: 2100 },
  };
  expect(predictNextRepCues(completed, { exercise: 'squat', nextSetReps: 5 })).toEqual([
    '5. Control the return.',
    'Rep 5 complete. Bottom angle 90 degrees.',
  ]);
  expect(predictNextRepCues(completed, { exercise: 'squat', nextSetReps: 7 })).toEqual([
    'Rep 7 complete. Bottom angle 90 degrees.',
  ]);
  const noMetrics: ExerciseResult = { ...completed, repMetrics: undefined };
  expect(predictNextRepCues(noMetrics, { exercise: 'squat', nextSetReps: 7 })).toEqual(['Rep 7 complete.']);
});

function measuredRep(minAngle: number, durationMs: number): ExerciseResult {
  return {
    trackingValid: true,
    calibrated: true,
    phase: 'concentric',
    repCompleted: true,
    jointAngles: {},
    faults: [],
    guidance: 'Keep your movement steady and controlled.',
    repMetrics: { min_angle: minAngle, duration_ms: durationMs },
  };
}

it('praises a new best range on a clean rep instead of parroting the angle', () => {
  const engine = new FeedbackEngine();
  for (let rep = 1; rep <= 5; rep += 1) {
    engine.next(measuredRep(95, 2100), rep * 3000, { exercise: 'squat', totalReps: rep });
  }
  expect(engine.next(measuredRep(80, 2100), 18000, { exercise: 'squat', totalReps: 6 })).toBe(
    'Rep 6 — best range yet. Hold that standard.',
  );
});

it('calls out a rep that falls short of the user’s usual range', () => {
  const engine = new FeedbackEngine();
  for (let rep = 1; rep <= 5; rep += 1) {
    engine.next(measuredRep(95, 2100), rep * 3000, { exercise: 'squat', totalReps: rep });
  }
  expect(engine.next(measuredRep(112, 2100), 18000, { exercise: 'squat', totalReps: 6 })).toBe(
    'Rep 6 — short of your usual range. Reach a little further.',
  );
});

it('calls out a rushed rep compared to the user’s own pace', () => {
  const engine = new FeedbackEngine();
  for (let rep = 1; rep <= 5; rep += 1) {
    engine.next(measuredRep(95, 2100), rep * 3000, { exercise: 'squat', totalReps: rep });
  }
  expect(engine.next(measuredRep(95, 1000), 18000, { exercise: 'squat', totalReps: 6 })).toBe(
    'Rep 6 — slow it down. Control the movement.',
  );
});

it('needs three baseline reps before offering comparative insights', () => {
  const engine = new FeedbackEngine();
  engine.next(measuredRep(95, 2100), 0, { exercise: 'squat', totalReps: 6 });
  engine.next(measuredRep(95, 2100), 3000, { exercise: 'squat', totalReps: 7 });
  // Only two baselines recorded: the standout rep gets the plain grounded cue.
  expect(engine.next(measuredRep(80, 2100), 6000, { exercise: 'squat', totalReps: 8 })).toBe(
    'Rep 8 complete. Bottom angle 80 degrees.',
  );
});

it('does not repeat the same insight inside its cooldown', () => {
  const engine = new FeedbackEngine();
  for (let rep = 1; rep <= 5; rep += 1) {
    engine.next(measuredRep(95, 2100), rep * 3000, { exercise: 'squat', totalReps: rep });
  }
  expect(engine.next(measuredRep(80, 2100), 18000, { exercise: 'squat', totalReps: 6 })).toBe(
    'Rep 6 — best range yet. Hold that standard.',
  );
  expect(engine.next(measuredRep(79, 2100), 24000, { exercise: 'squat', totalReps: 7 })).toBe(
    'Rep 7 complete. Bottom angle 79 degrees.',
  );
  expect(engine.next(measuredRep(70, 2100), 18000 + 121_000, { exercise: 'squat', totalReps: 8 })).toBe(
    'Rep 8 — best range yet. Hold that standard.',
  );
});

it('reset clears the comparative baseline', () => {
  const engine = new FeedbackEngine();
  for (let rep = 1; rep <= 5; rep += 1) {
    engine.next(measuredRep(95, 2100), rep * 3000, { exercise: 'squat', totalReps: rep });
  }
  engine.reset();
  engine.next(measuredRep(95, 2100), 18000, { exercise: 'squat', totalReps: 1 });
  expect(engine.next(measuredRep(80, 2100), 21000, { exercise: 'squat', totalReps: 2 })).toBe(
    '2. Settle into your pace.',
  );
});
