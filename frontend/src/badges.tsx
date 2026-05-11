import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { api } from "./api";
import { useAuth } from "./auth";

type Badges = {
  notifications_unread: number;
  shared_new: number;
  friend_requests_pending: number;
};

type BadgesCtx = {
  badges: Badges;
  refresh: () => Promise<void>;
  markSharedSeen: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
};

const Ctx = createContext<BadgesCtx | undefined>(undefined);

export function BadgesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [badges, setBadges] = useState<Badges>({ notifications_unread: 0, shared_new: 0, friend_requests_pending: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getBadges();
      setBadges({
        notifications_unread: data.notifications_unread || 0,
        shared_new: data.shared_new || 0,
        friend_requests_pending: data.friend_requests_pending || 0,
      });
    } catch {}
  }, [user]);

  const markSharedSeen = useCallback(async () => {
    try {
      await api.markSharedSeen();
      setBadges((b) => ({ ...b, shared_new: 0 }));
    } catch {}
  }, []);

  const markNotificationsRead = useCallback(async () => {
    try {
      await api.markAllRead();
      setBadges((b) => ({ ...b, notifications_unread: 0 }));
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) {
      setBadges({ notifications_unread: 0, shared_new: 0, friend_requests_pending: 0 });
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    refresh();
    intervalRef.current = setInterval(refresh, 15000);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") refresh();
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [user, refresh]);

  return (
    <Ctx.Provider value={{ badges, refresh, markSharedSeen, markNotificationsRead }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBadges() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBadges must be inside BadgesProvider");
  return ctx;
}
