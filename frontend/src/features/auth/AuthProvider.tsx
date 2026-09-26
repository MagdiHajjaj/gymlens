import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { setTokenProvider } from '../../lib/api';
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
  logout: () => void;
}
const guest: Auth = {
  authenticated: false,
  loading: false,
  owner: 'guest',
  name: 'Local athlete',
  login: () => {},
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
  return (
    <Context.Provider
      value={{
        authenticated: isAuthenticated,
        loading: isLoading,
        owner: user?.sub || 'guest',
        name: user?.given_name || user?.name || 'Athlete',
        error: error?.message || loginError,
        login: () => {
          void loginWithRedirect().catch((e) => setLoginError(String(e)));
        },
        logout: () => {
          void logout({ logoutParams: { returnTo: window.location.origin } });
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
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
    >
      <Connected>{children}</Connected>
    </Auth0Provider>
  );
}
