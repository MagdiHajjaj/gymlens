import type { ExerciseId } from '../types/workout';
export function ExerciseArt({ exercise, large = false }: { exercise: ExerciseId; large?: boolean }) {
  return (
    <svg
      className={`exercise-art ${large ? 'large-art' : ''}`}
      viewBox="0 0 280 180"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="146" cy="155" rx="89" ry="9" fill="currentColor" opacity=".07" />
      <circle cx="145" cy="88" r="66" stroke="currentColor" opacity=".12" />
      <circle cx="145" cy="88" r="48" stroke="currentColor" strokeDasharray="3 6" opacity=".15" />
      {exercise === 'squat' ? (
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M150 47L133 88L174 108L153 150M134 89L100 111L113 149" strokeWidth="15" />
          <path d="M146 53L116 74L83 69" strokeWidth="11" />
          <circle cx="158" cy="27" r="14" fill="currentColor" stroke="none" />
          <path d="M145 152h25m-66 0h24" strokeWidth="8" />
          <circle cx="134" cy="88" r="4" fill="#c6ee91" stroke="none" />
          <circle cx="175" cy="108" r="4" fill="#c6ee91" stroke="none" />
        </g>
      ) : exercise === 'curl' ? (
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="146" cy="28" r="14" fill="currentColor" stroke="none" />
          <path d="M146 52v48m0 0l-19 49m19-49l18 49" strokeWidth="16" />
          <path d="M135 58L119 88L104 59m51-2l17 29l15-26" strokeWidth="11" />
          <path d="M94 54l20 7m-18-13l-4 12m23-5l-4 12M176 61l21-8m-22 1l5 13m14-20l5 13" strokeWidth="6" />
        </g>
      ) : (
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="64" cy="79" r="13" fill="currentColor" stroke="none" />
          <path d="M87 87L147 102L213 140" strokeWidth="17" />
          <path d="M91 90l20 26l-31 30M100 94l-9 30l13 22" strokeWidth="11" />
          <path d="M71 150h25m108-6h20" strokeWidth="7" />
          <circle cx="145" cy="103" r="4" fill="#c6ee91" stroke="none" />
        </g>
      )}
      <path d="M37 52v-9h9m188 78v10h-10" stroke="currentColor" opacity=".35" strokeWidth="2" />
    </svg>
  );
}
