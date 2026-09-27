import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { timeLabel } from '../lib/sessionBuffer';
import type { WorkoutGroup } from '../lib/workoutGroups';
import { dayKey, parseDayKey, workoutsByDay } from '../lib/calendarDays';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function WorkoutCalendar({ workouts }: { workouts: WorkoutGroup[] }) {
  const now = new Date();
  const todayKey = dayKey(now);
  const byDay = useMemo(() => workoutsByDay(workouts), [workouts]);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  // Default to the most recent training day so the calendar opens on something meaningful.
  const [selected, setSelected] = useState<string | null>(
    () => workouts[0]?.startedAt ? dayKey(new Date(workouts[0].startedAt)) : todayKey,
  );

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const canGoNext = view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m < now.getMonth());
  const shiftMonth = (dir: -1 | 1) =>
    setView((v) => {
      const d = new Date(v.y, v.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const selectedWorkouts = selected ? (byDay.get(selected) ?? []) : [];
  const selectedDate = selected ? parseDayKey(selected) : null;

  return (
    <div className="workout-calendar">
      <div className="calendar-header">
        <h3>{monthLabel}</h3>
        <div className="calendar-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={!canGoNext}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="calendar-grid" role="grid" aria-label="Workout calendar">
        {DOW.map((d) => (
          <span key={d} className="cal-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} aria-hidden="true" />;
          const key = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const count = byDay.get(key)?.length ?? 0;
          const isToday = key === todayKey;
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={`cal-day${count ? ' has-workout' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
              aria-pressed={isSelected}
              aria-label={`${monthLabel} ${day}${count ? `, ${count} workout${count === 1 ? '' : 's'}` : ', rest day'}`}
              onClick={() => setSelected(key)}
            >
              {day}
              {count > 0 && <span className="cal-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="calendar-detail" aria-live="polite">
        {selectedDate && (
          <p className="calendar-detail-date">
            {selectedDate.toLocaleDateString('en', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
        {selectedWorkouts.length > 0 ? (
          <ul className="calendar-workout-list">
            {selectedWorkouts.map((workout) => {
              const workoutName =
                workout.name || workout.sessions.map((s) => exercises[s.exercise].name).join(' · ');
              return (
                <li key={workout.id}>
                  <Link
                    to={
                      workout.sessions.length > 1
                        ? `/report/${workout.id}`
                        : `/session/${workout.sessions[0].id}`
                    }
                    className="calendar-workout-card"
                    aria-label={`View ${workoutName} report`}
                  >
                    <div>
                      <strong>{workoutName}</strong>
                      {workout.name && (
                        <small>
                          {workout.sessions.map((s) => exercises[s.exercise].name).join(' · ')}
                        </small>
                      )}
                    </div>
                    <div className="calendar-workout-meta">
                      <span>{workout.totalReps} reps</span>
                      <span>{workout.endedAt ? timeLabel(workout.durationSeconds) : 'Incomplete'}</span>
                    </div>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : workouts.length > 0 ? (
          <p className="small-muted">Rest day — nothing recorded.</p>
        ) : (
          <p className="small-muted">Finish a workout and it’ll land on your calendar.</p>
        )}
      </div>
    </div>
  );
}
