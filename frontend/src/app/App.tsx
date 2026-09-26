import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Shell } from '../components/layout/Shell';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
const WorkoutPage = lazy(() => import('../pages/WorkoutPage').then((m) => ({ default: m.WorkoutPage })));
const SessionPage = lazy(() => import('../pages/SessionPage').then((m) => ({ default: m.SessionPage })));
export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Suspense fallback={<div className="page loading-text">Preparing your workspace…</div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/session/:id" element={<SessionPage />} />
            <Route
              path="*"
              element={
                <div className="page empty-state">
                  <h1>This page is out of frame.</h1>
                  <Link to="/">Back to overview</Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </Shell>
    </BrowserRouter>
  );
}
