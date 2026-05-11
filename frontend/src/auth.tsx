import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
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

  // Register push token after auth
  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const { status: existing } = await Notifications.getPermissionsAsync();
        let final = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          final = status;
        }
        if (final !== "granted") return;
        const tokenRes = await Notifications.getExpoPushTokenAsync().catch(() => null);
        const pushToken = tokenRes?.data;
        if (pushToken) {
          await api.updatePushToken(pushToken);
        }
      } catch (e) {
        console.log("Push token registration failed", e);
      }
    })();
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
    <Ctx.Provider value={{ user, loading, login, register, logout, refreshMe }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
