import { getItem } from "./storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://collaborate-together-api.onrender.com";
export const API_BASE = `${BACKEND_URL}/api`;

const REQUEST_TIMEOUT_MS = 30000;

// Fire-and-forget warm-up ping. Wakes a sleeping server (Render free tier)
// as early as possible so login/register never hang on a cold start.
export function pingServer(): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  fetch(`${API_BASE}/`, { signal: controller.signal })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}

async function request(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (auth) {
    const token = await getItem("auth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("The server is taking too long to respond. Please try again in a moment.");
    }
    throw new Error("Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
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
  forgotPassword: (email: string) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }, false),
  resetPassword: (email: string, code: string, new_password: string) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, new_password }),
    }, false),
  me: () => request("/auth/me"),
  updatePushToken: (push_token: string) =>
    request("/auth/push-token", { method: "POST", body: JSON.stringify({ push_token }) }),
  deleteAccount: (password: string) =>
    request("/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }),

  getMyTodos: () => request("/todos"),
  getSharedTodos: () => request("/todos/shared"),
  getTodo: (id: string) => request(`/todos/${id}`),
  createTodo: (payload: any) => request("/todos", { method: "POST", body: JSON.stringify(payload) }),
  updateTodo: (id: string, payload: any) => request(`/todos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTodo: (id: string) => request(`/todos/${id}`, { method: "DELETE" }),
  toggleComplete: (id: string) => request(`/todos/${id}/complete`, { method: "PATCH" }),
  shareTodo: (id: string, user_code: string) =>
    request(`/todos/${id}/share`, { method: "POST", body: JSON.stringify({ user_code }) }),
  setReminder: (id: string, minutes: number) =>
    request(`/todos/${id}/remind`, { method: "POST", body: JSON.stringify({ minutes }) }),
  clearReminder: (id: string) => request(`/todos/${id}/remind`, { method: "DELETE" }),
  setProof: (id: string, images: string[]) =>
    request(`/todos/${id}/proof`, { method: "POST", body: JSON.stringify({ images }) }),

  getComments: (id: string) => request(`/todos/${id}/comments`),
  addComment: (id: string, text: string) =>
    request(`/todos/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) }),

  getNotifications: () => request("/notifications"),
  markAllRead: () => request("/notifications/mark-all-read", { method: "POST" }),
  unreadCount: () => request("/notifications/unread-count"),

  getBadges: () => request("/badges"),
  markSharedSeen: () => request("/badges/mark-shared-seen", { method: "POST" }),

  listFriends: () => request("/friends"),
  addFriend: (user_code: string, nickname: string) =>
    request("/friends", { method: "POST", body: JSON.stringify({ user_code, nickname }) }),
  updateFriend: (id: string, nickname: string) =>
    request(`/friends/${id}`, { method: "PUT", body: JSON.stringify({ nickname }) }),
  removeFriend: (id: string) => request(`/friends/${id}`, { method: "DELETE" }),

  listFriendRequests: () => request("/friend-requests"),
  acceptFriendRequest: (id: string, nickname?: string) =>
    request(`/friend-requests/${id}/accept`, { method: "POST", body: JSON.stringify({ nickname }) }),
  declineFriendRequest: (id: string) =>
    request(`/friend-requests/${id}/decline`, { method: "POST" }),
  cancelFriendRequest: (id: string) =>
    request(`/friend-requests/${id}`, { method: "DELETE" }),
};
