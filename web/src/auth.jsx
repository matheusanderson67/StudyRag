import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('studyrag:logout', logout);
    return () => window.removeEventListener('studyrag:logout', logout);
  }, [logout]);

  const authenticate = async (mode, form) => {
    const data = await api(`/auth/${mode}`, { method: 'POST', body: form });
    setToken(data.token);
    setUser(data.user);
  };

  return <AuthContext.Provider value={{ user, loading, login: (f) => authenticate('login', f), register: (f) => authenticate('register', f), logout }}>{children}</AuthContext.Provider>;
}
