import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { IdentityProvider } from './features/auth/AuthProvider';
import './styles/globals.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="page empty-state">
        <h1>Let’s reset your workspace.</h1>
        <p>The app encountered an unexpected problem. Saved sessions remain in your browser.</p>
        <button className="button button-primary" onClick={() => location.assign('/')}>
          Reload GymLens
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <IdentityProvider>
        <App />
      </IdentityProvider>
    </ErrorBoundary>
  </StrictMode>,
);
