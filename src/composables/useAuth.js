// Auth composable — manages the JWT login flow and stores the token in
// localStorage. Falls back to the legacy ADMIN_TOKEN for backward compat.
import { ref } from 'vue';

const TOKEN_KEY = 'angel_admin_token';
const USER_KEY = 'angel_admin_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setSession(token, user) {
  if (token) { localStorage.setItem(TOKEN_KEY, token); if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
}
export function isAuthed() {
  return !!getToken();
}

const authed = ref(isAuthed());
const user = ref(getUser());

async function login(email, password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'login_failed');
  }
  setSession(data.token, data.user);
  authed.value = true;
  user.value = data.user;
  return data;
}

function logout() {
  setSession('', null);
  authed.value = false;
  user.value = null;
}

async function profile() {
  if (!authed.value) return null;
  try {
    const res = await fetch('/api/admin/profile', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (data.ok) { user.value = data.user; return data.user; }
  } catch { /* ignore */ }
  return user.value;
}

export function useAuth() {
  return { authed, user, login, logout, profile, getToken, isAuthed };
}
