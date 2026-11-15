import { createContext, useContext, useEffect, useState } from "react";
import { authApi, getStoredToken, setStoredToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on page refresh by verifying stored JWT or HttpOnly cookie against /api/auth/me.
  useEffect(() => {
    // Check if redirected from OAuth callback with ?auth_token=
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("auth_token");
    if (urlToken) {
      setStoredToken(urlToken);
      // Clean query parameter from URL without page reload
      window.history.replaceState({}, document.title, window.location.pathname);
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

  async function register(fullName, email, password, confirmPassword = "") {
    const data = await authApi.register({
      full_name: fullName,
      email,
      password,
      confirm_password: confirmPassword || password,
    });
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function googleLogin(idToken) {
    const data = await authApi.googleLogin(idToken);
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch (_) {
      // Safe fallback
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, googleLogin, logout }}
    >
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
