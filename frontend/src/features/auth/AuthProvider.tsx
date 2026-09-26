import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { setTokenProvider } from '../../lib/api';
import { safeReturnTo } from './redirect';
const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
export const authConfigured = Boolean(domain && clientId && audience);
interface Auth {
  authenticated: boolean;
  loading: boolean;
  owner: string;
  name: string;
  error?: string;
  login: () => void;
  signup: () => void;
  logout: () => void;
}
const guest: Auth = {
  authenticated: false,
  loading: false,
  owner: 'guest',
  name: 'Local athlete',
  login: () => {},
  signup: () => {},
  logout: () => {},
};
const Context = createContext<Auth>(guest);
export const useIdentity = () => useContext(Context);
function Connected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, error, loginWithRedirect, logout, getAccessTokenSilently } =
    useAuth0();
  const [loginError, setLoginError] = useState('');
  useLayoutEffect(() => {
    setTokenProvider(
      isAuthenticated
        ? async () => {
            const token = await getAccessTokenSilently();
            if (!token) throw new Error('Sign in again to reconnect your account.');
            return token;
          }
        : undefined,
    );
    return () => setTokenProvider();
  }, [isAuthenticated, getAccessTokenSilently]);
  function signIn(signup = false) {
    setLoginError('');
    void loginWithRedirect({
      appState: { returnTo: window.location.pathname + window.location.search + window.location.hash },
      authorizationParams: signup ? { screen_hint: 'signup' } : {},
    }).catch((e: unknown) => setLoginError(e instanceof Error ? e.message : 'Unable to sign in. Try again.'));
  }
  if (isLoading) {
    return (
      <div className="page loading-text" role="status">
        Connecting your account…
      </div>
    );
  }
  return (
    <Context.Provider
      value={{
        authenticated: isAuthenticated,
        loading: isLoading,
        owner: isAuthenticated ? user?.sub || 'guest' : 'guest',
        name: isAuthenticated ? user?.given_name || user?.name || 'Athlete' : 'Local athlete',
        error: error?.message || loginError,
        login: () => signIn(),
        signup: () => signIn(true),
        logout: () => {
          setLoginError('');
          void logout({ logoutParams: { returnTo: window.location.origin } }).catch(() =>
            setLoginError('Unable to sign out. Please try again.'),
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function IdentityProvider({ children }: { children: ReactNode }) {
  if (!authConfigured) return <Context.Provider value={guest}>{children}</Context.Provider>;
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience, scope: 'openid profile email' }}
      onRedirectCallback={(appState) => {
        window.history.replaceState({}, '', safeReturnTo(appState?.returnTo, window.location.origin));
      }}
    >
      <Connected>{children}</Connected>
    </Auth0Provider>
  );
}
