import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, Check, CloudUpload, Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ExerciseReport } from '../components/ExerciseReport';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { usePlan } from '../features/workout/planStore';
import { api } from '../lib/api';
import { exportSession, localSessions, saveLocal } from '../lib/sessionBuffer';
import type { Insight, WorkoutSession } from '../types/workout';

export function SessionPage() {
  const { id } = useParams();
  const { authenticated, owner } = useIdentity();
  const hasPlan = usePlan((state) => state.plan.length > 0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [backupWarning, setBackupWarning] = useState('');
  const [version, setVersion] = useState(0);
  const currentRequest = useRef('');

  useEffect(() => {
    let cancelled = false;
    currentRequest.current = `${owner}:${id}`;
    const local = localSessions(owner).find((s) => s.id === id);
    setSession(local || null);
    setError('');
    setSaveError('');
    setBackupWarning('');
    setBusy(null);
    if (!authenticated || local?.local) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api
      .detail(id!)
      .then((remote) => {
        if (!cancelled)
          setSession({ ...remote, set_ranges: local?.set_ranges ?? remote.set_ranges, local: false });
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not load the account report. Any available browser copy is shown below.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      currentRequest.current = '';
    };
  }, [id, owner, authenticated, version]);

  async function sync() {
    if (!session || busy) return;
    const requestKey = currentRequest.current;
    setBusy('save');
    setSaveError('');
    setBackupWarning('');
    try {
      const saved = { ...(await api.save(session)), set_ranges: session.set_ranges, local: false };
      if (currentRequest.current !== requestKey) return;
      setSession(saved);
      try {
        saveLocal(saved, owner);
      } catch {
        setBackupWarning('Saved to your account, but the browser backup could not be updated.');
      }
    } catch {
      if (currentRequest.current === requestKey)
        setSaveError(
          'Account save failed. Your browser copy is still available. Retry or download a backup.',
        );
    } finally {
      if (currentRequest.current === requestKey) setBusy(null);
    }
  }

  function handleInsight(sessionId: string, insight: Insight) {
    setSession((prev) => {
      if (!prev || prev.id !== sessionId) return prev;
      const updated = { ...prev, insight };
      try {
        saveLocal(updated, owner);
      } catch {
        setBackupWarning(
          'The account report is available, but this browser could not store the updated copy.',
        );
      }
      return updated;
    });
  }

  if (loading && !session)
    return (
      <div className="page">
        <p role="status">Loading your session…</p>
      </div>
    );
  if (!session)
    return (
      <div className="page empty-state">
        <h1>Session not found.</h1>
        <p>{error || 'This report may belong to another browser or account.'}</p>
        {error && <Button onClick={() => setVersion((v) => v + 1)}>Retry report</Button>}
        <Button asChild variant="secondary">
          <Link to="/history">Back to history</Link>
        </Button>
      </div>
    );

  const isDemo = session.source === 'demo';
  const local = session.local !== false;
  const sourceLabel = isDemo
    ? 'Demo · sample movement'
    : session.source === 'upload'
      ? 'Video analysis'
      : 'Camera workout';

  return (
    <div className="page session-report-page">
      <Link className="back-link" to="/history">
        <ArrowLeft size={16} /> All sessions
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{sourceLabel}</span>
          <h1>{exercises[session.exercise].name} session report</h1>
          <p>{new Date(session.started_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</p>
        </div>
        <Button variant="secondary" onClick={() => exportSession(session)}>
          <Download size={16} /> Download session data
        </Button>
      </div>
      {isDemo && (
        <div className="notice">
          <Info size={18} />
          <span>
            This report was made from sample footage to demonstrate the app. It is not your workout and
            is excluded from training totals.
          </span>
        </div>
      )}
      {session.status !== 'completed' && (
        <div className="notice">This session was not completed. These are the details saved so far.</div>
      )}
      <div className={`report-save-state ${saveError ? 'has-error' : ''}`} role="status">
        <Check size={18} />
        <div>
          <strong>
            {busy === 'save'
              ? 'Saving to your account…'
              : local
                ? 'Saved in this browser'
                : 'Saved to your account'}
          </strong>
          <p>
            {local
              ? authenticated
                ? 'An account copy is not confirmed yet. Keep this browser copy until saving succeeds.'
                : 'Available in this browser. Download the session data to keep a separate copy.'
              : 'Available when you sign in to this account.'}
          </p>
        </div>
        {local && authenticated && session.status === 'completed' && (
          <Button size="small" variant="secondary" disabled={Boolean(busy)} onClick={() => void sync()}>
            <CloudUpload size={16} />
            {saveError ? 'Retry account save' : 'Save to account'}
          </Button>
        )}
      </div>
      {saveError && (
        <p className="notice error" role="alert">
          {saveError}
        </p>
      )}
      {backupWarning && (
        <p className="notice" role="status">
          {backupWarning}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <Button size="small" variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            Retry report
          </Button>
        </div>
      )}

      <ExerciseReport session={session} autoFetchInsight onInsight={handleInsight} />

      <div className="report-next-actions">
        {hasPlan && (
          <Button asChild variant="secondary">
            <Link to="/workout?plan=review">
              Back to plan <ArrowRight size={17} />
            </Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link to="/history">
            View history <ArrowRight size={17} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
