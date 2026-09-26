import type { FormFault, RepEvent, WorkoutSession, WorkoutSetRange } from '../../types/workout';

const SET_FOCUS: Record<string, string> = {
  insufficient_depth: 'Sit a little deeper next set.',
  excessive_forward_lean: 'Keep your chest more upright next set.',
  upper_arm_movement: 'Keep your upper arm steady next set.',
  hip_alignment: 'Keep shoulders, hips, and ankles aligned.',
  limited_range: 'Use a fuller comfortable range next set.',
};

const SESSION_FOCUS: Record<string, string> = {
  insufficient_depth: 'Focus on comfortable depth next session.',
  excessive_forward_lean: 'Focus on an upright chest next session.',
  upper_arm_movement: 'Focus on a steady upper arm next session.',
  hip_alignment: 'Focus on shoulder, hip, and ankle alignment.',
  limited_range: 'Focus on a fuller comfortable range next session.',
};

const repLabel = (session: WorkoutSession, count: number) => {
  if (session.exercise === 'curl') return `${count} ${count === 1 ? 'arm rep' : 'arm reps'}`;
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
  const setCount = session.set_ranges?.length ?? (session.reps.length > 0 ? 1 : 0);
  return `Session complete. ${repLabel(session, session.reps.length)} across ${setCount} ${setCount === 1 ? 'set' : 'sets'}. ${techniqueText(session.reps, SESSION_FOCUS)}`;
};
