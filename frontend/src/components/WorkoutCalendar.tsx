import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Play, Plus, Trash2 } from 'lucide-react';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { usePlan } from '../features/workout/planStore';
import { timeLabel } from '../lib/sessionBuffer';
import type { WorkoutGroup } from '../lib/workoutGroups';
import { api, type ScheduledWorkout } from '../lib/api';
import type { ExerciseId } from '../types/workout';
import { dayKey, parseDayKey, workoutsByDay, canGoNextMonth, selectableWindow } from '../lib/calendarDays';
import { Button } from './ui/button';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface WorkoutCalendarProps {
  workouts: WorkoutGroup[];
  scheduled?: ScheduledWorkout[];
  /** Only signed-in users can schedule (it needs the backend). */
  canSchedule?: boolean;
  onScheduledChange?: () => void;
}

export function WorkoutCalendar({
  workouts,
  scheduled = [],
  canSchedule = false,
  onScheduledChange,
}: WorkoutCalendarProps) {
  const now = new Date();
  const todayKey = dayKey(now);
  const navigate = useNavigate();
  const byDay = useMemo(() => workoutsByDay(workouts), [workouts]);
  const scheduledByDay = useMemo(() => {
    const map = new Map<string, ScheduledWorkout[]>();
    scheduled.forEach((item) => {
      map.set(item.scheduled_date, [...(map.get(item.scheduled_date) ?? []), item]);
    });
    return map;
  }, [scheduled]);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const { minKey } = selectableWindow(now);
  // Default to the most recent training day within the selectable week so the
  // calendar opens on something meaningful.
  const [selected, setSelected] = useState<string | null>(() => {
    const recent = workouts.find(
      (w) => w.startedAt && dayKey(new Date(w.startedAt)) >= minKey,
    );
    return recent?.startedAt ? dayKey(new Date(recent.startedAt)) : todayKey;
  });

  // Schedule-form state, reset whenever the selected day changes.
  const [scheduling, setScheduling] = useState(false);
  const [schedName, setSchedName] = useState('');
  const [schedExercises, setSchedExercises] = useState<ExerciseId[]>([]);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedError, setSchedError] = useState('');
  useEffect(() => {
    setScheduling(false);
    setSchedName('');
    setSchedExercises([]);
    setSchedError('');
  }, [selected]);

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
  const canGoNext = canGoNextMonth(now, view);
  const shiftMonth = (dir: -1 | 1) =>
    setView((v) => {
      const d = new Date(v.y, v.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const selectedWorkouts = selected ? (byDay.get(selected) ?? []) : [];
  const selectedScheduled = selected ? (scheduledByDay.get(selected) ?? []) : [];
  const selectedDate = selected ? parseDayKey(selected) : null;
  const selectedDisabled = !selected || selected < minKey;

  const toggleSchedExercise = (id: ExerciseId) =>
    setSchedExercises((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );

  const saveScheduled = async () => {
    if (!selected || schedExercises.length === 0 || schedSaving) return;
    setSchedSaving(true);
    setSchedError('');
    try {
      await api.scheduled.create({
        scheduled_date: selected,
        name: schedName.trim() || undefined,
        exercises: schedExercises,
      });
      setScheduling(false);
      setSchedName('');
      setSchedExercises([]);
      onScheduledChange?.();
    } catch {
      setSchedError('Could not save that session. Try again.');
    } finally {
      setSchedSaving(false);
    }
  };

  const deleteScheduled = async (id: string) => {
    try {
      await api.scheduled.remove(id);
      onScheduledChange?.();
    } catch {
      setSchedError('Could not delete that session. Try again.');
    }
  };

  const startScheduled = (item: ScheduledWorkout) => {
    usePlan.getState().setPlan(item.exercises);
    if (item.name) usePlan.getState().setWorkoutName(item.name);
    navigate('/workout');
  };

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
          const schedCount = scheduledByDay.get(key)?.length ?? 0;
          const isToday = key === todayKey;
          const isSelected = selected === key;
          const isDisabled = key < minKey;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={`cal-day${count ? ' has-workout' : ''}${schedCount ? ' has-scheduled' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
              aria-pressed={isSelected}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              aria-label={`${monthLabel} ${day}${count ? `, ${count} workout${count === 1 ? '' : 's'}` : ', rest day'}${schedCount ? `, ${schedCount} scheduled` : ''}`}
              onClick={() => setSelected(key)}
            >
              {day}
              {count > 0 && <span className="cal-dot" aria-hidden="true" />}
              {schedCount > 0 && <span className="cal-sched" aria-hidden="true" />}
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
        {canSchedule && selectedScheduled.length > 0 && (
          <div className="sched-section">
            <p className="sched-heading">Scheduled</p>
            <ul className="sched-list">
              {selectedScheduled.map((item) => {
                const exerciseNames = item.exercises.map((id) => exercises[id].name).join(' · ');
                return (
                  <li key={item.id} className="sched-card">
                    <div className="sched-info">
                      <strong>{item.name || exerciseNames}</strong>
                      {item.name && <small>{exerciseNames}</small>}
                    </div>
                    <div className="sched-actions">
                      <button
                        type="button"
                        className="sched-start"
                        onClick={() => startScheduled(item)}
                      >
                        <Play size={14} fill="currentColor" /> Start
                      </button>
                      <button
                        type="button"
                        className="sched-delete"
                        aria-label={`Delete scheduled session ${item.name || exerciseNames}`}
                        onClick={() => deleteScheduled(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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
        {canSchedule && !selectedDisabled && !scheduling && (
          <button type="button" className="sched-add" onClick={() => setScheduling(true)}>
            <Plus size={14} /> Schedule a session
          </button>
        )}
        {canSchedule && !selectedDisabled && scheduling && (
          <form
            className="sched-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveScheduled();
            }}
          >
            <label className="sched-field">
              <span>Name (optional)</span>
              <input
                type="text"
                value={schedName}
                maxLength={80}
                placeholder="Leg day"
                onChange={(e) => setSchedName(e.target.value)}
              />
            </label>
            <div className="movement-chips" role="group" aria-label="Pick exercises">
              {(Object.keys(exercises) as ExerciseId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`movement-chip${schedExercises.includes(id) ? ' is-active' : ''}`}
                  aria-pressed={schedExercises.includes(id)}
                  onClick={() => toggleSchedExercise(id)}
                >
                  {exercises[id].name}
                </button>
              ))}
            </div>
            {schedError && (
              <p className="small-muted" role="alert">
                {schedError}
              </p>
            )}
            <div className="sched-form-actions">
              <Button type="submit" disabled={schedExercises.length === 0 || schedSaving}>
                {schedSaving ? 'Saving…' : 'Save session'}
              </Button>
              <button type="button" className="text-link" onClick={() => setScheduling(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
