import { ProfilePage } from '../pages/ProfilePage';
import { lazyRoute } from './lazyRoute';
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Outlet,
  Route,
  Link,
} from 'react-router-dom';
import { Suspense } from 'react';
import { Shell } from '../components/layout/Shell';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
const WorkoutPage = lazyRoute(() => import('../pages/WorkoutPage').then((m) => ({ default: m.WorkoutPage })));
const SessionPage = lazyRoute(() => import('../pages/SessionPage').then((m) => ({ default: m.SessionPage })));
const WorkoutReportPage = lazyRoute(() =>
  import('../pages/WorkoutReportPage').then((m) => ({ default: m.WorkoutReportPage })),
);
function Layout() {
  return (
    <Shell>
      <Suspense fallback={<div className="page loading-text">Preparing your workspace…</div>}>
        <Outlet />
      </Suspense>
    </Shell>
  );
}
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/workout" element={<WorkoutPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/session/:id" element={<SessionPage />} />
      <Route path="/report/:workoutId" element={<WorkoutReportPage />} />
      <Route
        path="*"
        element={
          <div className="page empty-state">
            <h1>This page is out of frame.</h1>
            <Link to="/">Back to overview</Link>
          </div>
        }
      />
    </Route>,
  ),
);
export function App() {
  return <RouterProvider router={router} />;
}
