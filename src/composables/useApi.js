// API client for the admin panel. Sends the admin token (JWT or legacy
// ADMIN_TOKEN) as a Bearer header and targets the /api/* endpoints.
import { getToken } from './useAuth.js';

async function req(method, path, body, base = '') {
  const token = getToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.code = 401;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'request_failed');
    err.code = res.status;
    throw err;
  }
  return data;
}

// ---- Admin (JWT) endpoints: /api/admin/* ----
export const authApi = {
  login: (email, password) => req('POST', '/api/admin/login', { email, password }),
  profile: () => req('GET', '/api/admin/profile'),
  users: () => req('GET', '/api/admin/users'),
  createUser: (payload) => req('POST', '/api/admin/users', payload),
  updateUser: (id, payload) => req('PUT', `/api/admin/users/${id}`, payload),
  deleteUser: (id) => req('DELETE', `/api/admin/users/${id}`),
};

// Leads (contact_states) — /api/admin/leads
export const leadsApi = {
  list: (params = '') => req('GET', `/api/admin/leads${params}`),
  detail: (email) => req('GET', `/api/admin/leads/${encodeURIComponent(email)}`),
  diagnostics: () => req('GET', '/api/admin/diagnostics'),
};

// Transactions (Clientes) — /api/admin/transactions
export const transactionsApi = {
  list: (params = '') => req('GET', `/api/admin/transactions${params}`),
  stats: () => req('GET', '/api/admin/transactions/stats'),
};

// ---- Email campaigns / tracking: /api/email/* ----
const emailReq = (m, path, body) => req(m, path, body, '/api/email');

export const api = {
  listTemplates: () => emailReq('GET', '/templates'),
  previewTemplate: (name, email) =>
    emailReq('GET', `/templates/${encodeURIComponent(name)}/preview${email ? `?email=${encodeURIComponent(email)}` : ''}`),
  listCampaigns: () => emailReq('GET', '/campaigns'),
  createCampaign: (payload) => emailReq('POST', '/campaign', payload),
  campaignAction: (id, action) => emailReq('POST', `/campaigns/${id}/${action}`),
  summary: () => emailReq('GET', '/metrics/summary'),
  metricsByCampaign: () => emailReq('GET', '/metrics/campaigns'),
  recentEvents: (limit = 50) => emailReq('GET', `/metrics/recent-events?limit=${limit}`),
  daily: (days = 30) => emailReq('GET', `/metrics/daily?days=${days}`),
};

// ---- Lead & recovery monitoring: /api/monitor/* ----
const monitorReq = (m, path, body) => req(m, path, body, '/api/monitor');

export const monitorApi = {
  leads: (params = '') => monitorReq('GET', `/leads${params}`),
  recovery: (keys = 'F,G,C,D,E') => monitorReq('GET', `/recovery?keys=${encodeURIComponent(keys)}`),
  postbacks: (params = '') => monitorReq('GET', `/postbacks${params}`),
  funnelEvents: (params = '') => monitorReq('GET', `/funnel-events${params}`),
  triggerEvent: (payload) => monitorReq('POST', '/trigger-event', payload),
};
