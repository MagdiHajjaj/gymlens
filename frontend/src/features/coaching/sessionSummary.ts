import type { FormFault, RepEvent, WorkoutSession, WorkoutSetRange } from '../../types/workout';
import { exercises } from '../exercises/ExerciseRegistry';

const SET_FOCUS: Record<string, string> = {
  insufficient_depth: 'Sit a little deeper next set.',
  excessive_forward_lean: 'Keep your chest more upright next set.',
  upper_arm_movement: 'Keep your upper arm steady next set.',
  hip_alignment: 'Keep shoulders, hips, and ankles aligned.',
  limited_range: 'Use a fuller comfortable range next set.',
  excessive_back_rounding: 'Keep your back flat next set.',
  insufficient_hinge: 'Hinge deeper at the hips next set.',
  knee_over_toes: 'Keep your front knee behind your toes next set.',
  excessive_back_arch: 'Keep your ribs down next set.',
  incomplete_extension: 'Drive up to a full bridge next set.',
  incomplete_pull: 'Pull all the way up next set.',
  torso_rising: 'Keep your torso still next set.',
  excessive_swing: 'Keep your body still next set.',
};

const SESSION_FOCUS: Record<string, string> = {
  insufficient_depth: 'Focus on comfortable depth next session.',
  excessive_forward_lean: 'Focus on an upright chest next session.',
  upper_arm_movement: 'Focus on a steady upper arm next session.',
  hip_alignment: 'Focus on shoulder, hip, and ankle alignment.',
  limited_range: 'Focus on a fuller comfortable range next session.',
  excessive_back_rounding: 'Focus on a flat back next session.',
  insufficient_hinge: 'Focus on a deeper hip hinge next session.',
  knee_over_toes: 'Focus on knee position next session.',
  excessive_back_arch: 'Focus on keeping your ribs down next session.',
  incomplete_extension: 'Focus on full hip extension next session.',
  incomplete_pull: 'Focus on a complete pull next session.',
  torso_rising: 'Focus on a steady torso next session.',
  excessive_swing: 'Focus on a still body next session.',
};

const repLabel = (session: WorkoutSession, count: number) => {
  return `${count} ${count === 1 ? 'rep' : 'reps'}`;
};

const topFault = (reps: RepEvent[]): FormFault | null => {
  const counts = new Map<string, { fault: FormFault; count: number; first: number }>();
  reps.forEach((rep, repIndex) => {
    rep.faults_json.forEach((fault) => {
      const current = counts.get(fault.code);
      if (current) {
        current.count += 1;
        return;
      }
      counts.set(fault.code, { fault, count: 1, first: repIndex });
    });
  });
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  return ranked[0]?.fault ?? null;
};

const techniqueText = (reps: RepEvent[], focusByCode: Record<string, string>) => {
  const faultCount = reps.reduce((total, rep) => total + rep.faults_json.length, 0);
  if (faultCount === 0) return 'No technique cues detected.';
  const focus = focusByCode[topFault(reps)?.code ?? ''];
  return `${faultCount} technique ${faultCount === 1 ? 'cue' : 'cues'}.${focus ? ` ${focus}` : ''}`;
};

const repsForRange = (session: WorkoutSession, range: WorkoutSetRange) =>
  session.reps.filter((rep) => rep.rep_number >= range.start_rep && rep.rep_number <= range.end_rep);

export const summarizeSet = (session: WorkoutSession, range: WorkoutSetRange): string => {
  const reps = repsForRange(session, range);
  return `Set ${range.set_number} complete. ${repLabel(session, reps.length)}. ${techniqueText(reps, SET_FOCUS)}`;
};

export const summarizeSession = (session: WorkoutSession): string => {
  if (session.reps.length === 0)
    return `Session complete. No ${exercises[session.exercise].name.toLowerCase()} reps were recorded.`;
  const setCount = session.set_ranges?.length ?? (session.reps.length > 0 ? 1 : 0);
  return `Session complete. ${repLabel(session, session.reps.length)} across ${setCount} ${setCount === 1 ? 'set' : 'sets'}. ${techniqueText(session.reps, SESSION_FOCUS)}`;
};
