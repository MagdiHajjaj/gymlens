/**
 * Compress a rep-number list into readable ranges: [1,2,3,5,7,8] -> "1–3, 5, 7–8".
 * Used everywhere rep numbers are shown so full sessions don't print "1, 2, 3, …".
 */
export function formatRepList(repNumbers: number[]): string {
  const reps = [...repNumbers].sort((a, b) => a - b);
  if (!reps.length) return '';
  const parts: string[] = [];
  let start = reps[0];
  let prev = reps[0];
  for (const rep of reps.slice(1)) {
    if (rep === prev + 1) {
      prev = rep;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = rep;
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return parts.join(', ');
}
