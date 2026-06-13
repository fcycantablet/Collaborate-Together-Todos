import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform, InteractionManager } from "react-native";
import { api } from "./api";
import { getItem, setItem, removeItem } from "./storage";

export type User = {
  id: string;
  email: string;
  name: string;
  user_code: string;
  created_at: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithAuthResponse: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = await getItem("auth_token");
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      await removeItem("auth_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Register push token after auth.
  // Deferred (2.5s + after interactions) and timeout-guarded so the system
  // permission prompt never races the post-login navigation transition and
  // a hanging native call can never block anything (App Review freeze fix).
  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let cancelled = false;

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
      ]);

    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        if (cancelled) return;
        try {
          const Notifications = await import("expo-notifications");
          const { status: existing } = await withTimeout(Notifications.getPermissionsAsync(), 10000);
          let final = existing;
          if (existing !== "granted") {
            // User-driven system dialog — no timeout on purpose
            const { status } = await Notifications.requestPermissionsAsync();
            final = status;
          }
          if (cancelled || final !== "granted") return;
          const tokenRes = await withTimeout(Notifications.getExpoPushTokenAsync(), 15000).catch(() => null);
          const pushToken = tokenRes?.data;
          if (pushToken && !cancelled) {
            await api.updatePushToken(pushToken);
          }
        } catch (e) {
          console.log("Push token registration failed", e);
        }
      });
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setItem("auth_token", res.token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api.register(email, password, name);
    await setItem("auth_token", res.token);
    setUser(res.user);
  };

  const loginWithAuthResponse = async (token: string, u: User) => {
    await setItem("auth_token", token);
    setUser(u);
  };

  const logout = async () => {
    await removeItem("auth_token");
    setUser(null);
  };

  const refreshMe = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, loginWithAuthResponse, logout, refreshMe }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
