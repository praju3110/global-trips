import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, setToken, clearToken, getToken } from "@/src/lib/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const data = await api<{ user: User }>("/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Web: detect session_id in URL on mount (Google redirect)
  const processWebSessionId = useCallback(async () => {
    if (Platform.OS !== "web") return false;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const match =
      hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
    if (match) {
      const sessionId = decodeURIComponent(match[1]);
      window.history.replaceState(null, "", window.location.pathname);
      await finishGoogle(sessionId);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    (async () => {
      const handled = await processWebSessionId();
      if (!handled) await loadSession();
      else setLoading(false);
    })();
  }, []);

  async function finishGoogle(sessionId: string) {
    const data = await api<{ token: string; user: User }>("/auth/google", "POST", {
      session_id: sessionId,
    });
    await setToken(data.token);
    setUser(data.user);
  }

  const login = async (email: string, password: string) => {
    const data = await api<{ token: string; user: User }>("/auth/login", "POST", {
      email,
      password,
    });
    await setToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await api<{ token: string; user: User }>("/auth/register", "POST", {
      email,
      password,
      name,
    });
    await setToken(data.token);
    setUser(data.user);
  };

  const loginGoogle = async () => {
    const authBase = "https://auth.emergentagent.com/";
    if (Platform.OS === "web") {
      const redirectUrl = window.location.origin + "/";
      window.location.href = `${authBase}?redirect=${encodeURIComponent(redirectUrl)}`;
      return;
    }
    const redirectUrl = Linking.createURL("auth");
    const authUrl = `${authBase}?redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const m =
        result.url.match(/session_id=([^&]+)/) ||
        result.url.match(/#session_id=([^&]+)/);
      if (m) {
        await finishGoogle(decodeURIComponent(m[1]));
      }
    }
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  const updateProfile = async (data: { name?: string; avatar?: string }) => {
    const res = await api<{ user: User }>("/auth/profile", "PUT", data);
    setUser(res.user);
  };

  const refreshUser = loadSession;

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginGoogle, logout, updateProfile, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
