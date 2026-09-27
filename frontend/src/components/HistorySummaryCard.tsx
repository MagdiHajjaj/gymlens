import { useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { HistorySummary } from '../types/workout';
import { Button } from './ui/button';

export function HistorySummaryCard() {
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await api.historySummary());
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        setError('No training history yet — finish or import a workout first.');
      else if (e instanceof ApiError && e.status === 429)
        setError('Slow down — try again in a minute.');
      else setError(e instanceof Error ? e.message : 'Could not load the summary.');
    } finally {
      setLoading(false);
    }
  };

  if (!summary) {
    return (
      <div className="panel history-summary-cta">
        <div>
          <h2>How’s your training going?</h2>
          <p className="small-muted">
            Get an AI coaching summary of your recent history — consistency, trends, and what to
            focus on next.
          </p>
        </div>
        <Button onClick={load} disabled={loading}>
          <Sparkles size={16} /> {loading ? 'Reading your history…' : 'Summarize my training'}
        </Button>
        {error && (
          <p className="small-muted" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <article className="panel history-summary" aria-live="polite">
      <div className="history-summary-heading">
        <h2>
          <Sparkles size={16} aria-hidden /> Training summary
        </h2>
        <Button size="small" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <p>{summary.recap}</p>
      {summary.highlights.length > 0 && (
        <>
          <h3>Highlights</h3>
          <ul>
            {summary.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      {summary.trends.length > 0 && (
        <>
          <h3>Trends to watch</h3>
          <ul>
            {summary.trends.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <h3>Next focus</h3>
      <p>
        <strong>{summary.next_focus}</strong>
      </p>
      {error && (
        <p className="small-muted" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
