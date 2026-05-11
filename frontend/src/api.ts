import { getItem } from "./storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

async function request(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (auth) {
    const token = await getItem("auth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }, false),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  me: () => request("/auth/me"),
  updatePushToken: (push_token: string) =>
    request("/auth/push-token", { method: "POST", body: JSON.stringify({ push_token }) }),

  getMyTodos: () => request("/todos"),
  getSharedTodos: () => request("/todos/shared"),
  createTodo: (payload: any) => request("/todos", { method: "POST", body: JSON.stringify(payload) }),
  deleteTodo: (id: string) => request(`/todos/${id}`, { method: "DELETE" }),
  toggleComplete: (id: string) => request(`/todos/${id}/complete`, { method: "PATCH" }),
  shareTodo: (id: string, user_code: string) =>
    request(`/todos/${id}/share`, { method: "POST", body: JSON.stringify({ user_code }) }),

  getNotifications: () => request("/notifications"),
  markAllRead: () => request("/notifications/mark-all-read", { method: "POST" }),
  unreadCount: () => request("/notifications/unread-count"),

  getBadges: () => request("/badges"),
  markSharedSeen: () => request("/badges/mark-shared-seen", { method: "POST" }),
};
