import { createContext, useContext, useEffect, useState } from "react";
import { authApi, getStoredToken, setStoredToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on page refresh by verifying the stored JWT against /api/auth/me.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((profile) => setUser(profile))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await authApi.login({ email, password });
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function register(fullName, email, password) {
    const data = await authApi.register({
      full_name: fullName,
      email,
      password,
    });
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function socialLogin(provider, email, fullName = "") {
    const data = await authApi.socialLogin({
      provider,
      email,
      full_name: fullName,
    });
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setStoredToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, socialLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
