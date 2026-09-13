import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { setAccessToken } from '../api/client.js';
import * as authApi from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const adopt = useCallback((session) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  // On load, try the refresh cookie — a page reload keeps you signed in.
  useEffect(() => {
    authApi
      .refreshSession()
      .then(adopt)
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, [adopt]);

  const value = useMemo(
    () => ({
      user,
      booting,
      login: (body) => authApi.loginUser(body).then(adopt),
      register: (body) => authApi.registerUser(body).then(adopt),
      googleLogin: (idToken) => authApi.loginWithGoogle(idToken).then(adopt),
      // Profile edits replace the cached user so the nav avatar updates at once.
      updateProfile: async (body) => {
        const { user: updated } = await authApi.updateProfile(body);
        setUser(updated);
        return updated;
      },
      changePassword: (body) => authApi.changePassword(body).then(adopt),
      logout: async () => {
        await authApi.logoutUser().catch(() => {});
        setAccessToken(null);
        setUser(null);
      },
    }),
    [user, booting, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
