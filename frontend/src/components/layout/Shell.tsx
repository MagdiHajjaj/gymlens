import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  History,
  ArrowUpRight,
  ShieldCheck,
  Settings2,
  X,
  LogOut,
  CircleHelp,
  UserRound,
} from 'lucide-react';
import { authConfigured, useIdentity } from '../../features/auth/AuthProvider';
import { Button } from '../ui/button';
import { api } from '../../lib/api';
export function Shell({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(false);
  const [tiger, setTiger] = useState<string>('Not checked');
  const identity = useIdentity();
  const location = useLocation();
  useEffect(() => {
    if (!settings || !identity.authenticated) {
      if (!identity.authenticated) setTiger('Sign in to check');
      return;
    }
    setTiger('Checking…');
    void api
      .tigerStatus()
      .then((status) =>
        setTiger(
          status.connected && status.timescale && status.continuous_aggregate
            ? 'Connected · time-series ready'
            : status.database === 'sqlite'
              ? 'Local SQLite'
              : 'PostgreSQL · migration needed',
        ),
      )
      .catch(() => setTiger('Connection check failed'));
  }, [settings, identity.authenticated]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <Dumbbell size={23} />
          </span>
          gym<span className="brand-light">lens</span>
          <span className="brand-dot">®</span>
        </Link>
        <div className="sidebar-section-label">YOUR TRAINING SPACE</div>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <LayoutDashboard size={19} />
            Overview
          </NavLink>
          <NavLink to="/workout">
            <Dumbbell size={19} />
            Workout
          </NavLink>
          <NavLink to="/history">
            <History size={19} />
            History
          </NavLink>
          {identity.authenticated && (
            <NavLink to="/profile">
              <UserRound size={19} />
              Profile
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">
              <ShieldCheck size={22} />
            </span>
            <h3>
              Your space.
              <br />
              Your pace.
            </h3>
            <p>Your camera stays private. Your progress stays yours.</p>
            <span className="privacy-label">
              <span /> VIDEO NEVER UPLOADED
            </span>
          </div>
          <button className="sidebar-utility" onClick={() => setSettings(true)}>
            <Settings2 size={18} /> Settings & connections
          </button>
          <div className="sidebar-profile">
            <div className="avatar">{identity.authenticated ? identity.name[0] : 'G'}</div>
            <Link to={identity.authenticated ? '/profile' : '/'} className="sidebar-profile-copy">
              <strong>{identity.name}</strong>
              <small>{identity.authenticated ? 'Connected account' : 'Guest workspace'}</small>
            </Link>
            {identity.authenticated && location.pathname !== '/workout' && (
              <button className="icon-button" aria-label="Sign out" onClick={identity.logout}>
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Your workspace <span>/</span>{' '}
            <strong>
              {location.pathname === '/'
                ? 'Overview'
                : location.pathname.startsWith('/session')
                  ? 'Session report'
                  : location.pathname === '/history'
                    ? 'Workout history'
                    : location.pathname === '/profile'
                      ? 'Athlete profile'
                    : 'Training studio'}
            </strong>
          </span>
          <div className="topbar-actions">
            <span className="mode-pill">
              <span />
              {identity.authenticated ? 'Connected' : 'Local mode'}
            </span>
            <button
              className="icon-button"
              aria-label="Help and connections"
              onClick={() => setSettings(true)}
            >
              <CircleHelp size={19} />
            </button>
            {!identity.authenticated && (
              <Button
                size="small"
                variant="secondary"
                onClick={authConfigured ? identity.login : () => setSettings(true)}
              >
                Sign in <ArrowUpRight size={14} />
              </Button>
            )}
            {authConfigured && !identity.authenticated && (
              <Button size="small" onClick={identity.signup}>
                Create account
              </Button>
            )}
            {identity.authenticated && location.pathname !== '/workout' && (
              <Button size="small" variant="secondary" onClick={identity.logout}>
                Sign out
              </Button>
            )}
          </div>
        </header>
        {identity.error && (
          <div className="notice error" role="alert">
            Sign-in issue: {identity.error}
          </div>
        )}
        <main key={identity.owner}>{children}</main>
        <footer className="footer">
          <span>Made for mindful movement.</span>
          <span>
            Gym Lens <span className="footer-dot">·</span> Move with intention
          </span>
        </footer>
      </div>
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSettings(false);
            }}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X />
            </button>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2 id="settings-title">Built around your privacy.</h2>
            <p>
              Camera analysis runs on your device. Only rep events and joint measurements are saved to your
              account.
            </p>
            <div className="connection-row">
              <span>Camera & pose tracking</span>
              <span className="tag green">On-device</span>
            </div>
            <div className="connection-row">
              <span>Workout history</span>
              <span className="tag">
                {identity.authenticated ? 'Account + local backup' : 'This browser'}
              </span>
            </div>
            <div className="connection-row">
              <span>Tiger Data</span>
              <span className="tag">{tiger}</span>
            </div>
            <div className="connection-row">
              <span>Voice coaching</span>
              <span className="tag">
                {identity.authenticated ? 'Cloud with browser fallback' : 'Browser voice'}
              </span>
            </div>
            <div className="connection-row">
              <span>Auth0 sign-in</span>
              <span className="tag">{authConfigured ? 'Available' : 'Not configured'}</span>
            </div>
            <p className="small-muted">
              {authConfigured
                ? 'Sign in to save sessions across devices and request AI insights.'
                : 'Local workouts and the demo are ready to use. Account sign-in and cloud features need the environment setup described in the README.'}
            </p>
            <Button
              onClick={authConfigured && !identity.authenticated ? identity.login : () => setSettings(false)}
            >
              {authConfigured && !identity.authenticated
                ? 'Sign in to your account'
                : 'Back to your workspace'}
              <ArrowUpRight size={16} />
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
