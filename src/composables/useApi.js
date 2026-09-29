// Thin API client for the email dashboard. Sends the admin token as a Bearer
// header and targets the /api/email endpoints (proxied in dev, same origin in prod).

const TOKEN_KEY = 'angel_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req(method, path, body) {
  const token = getToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/email${path}`, {
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

export const api = {
  // Templates
  listTemplates: () => req('GET', '/templates'),
  previewTemplate: (name, email) =>
    req('GET', `/templates/${encodeURIComponent(name)}/preview${email ? `?email=${encodeURIComponent(email)}` : ''}`),

  // Campaigns
  listCampaigns: () => req('GET', '/campaigns'),
  createCampaign: (payload) => req('POST', '/campaign', payload),
  campaignAction: (id, action) => req('POST', `/campaigns/${id}/${action}`),

  // Metrics
  summary: () => req('GET', '/metrics/summary'),
  metricsByCampaign: () => req('GET', '/metrics/campaigns'),
  recentEvents: (limit = 50) => req('GET', `/metrics/recent-events?limit=${limit}`),
  daily: (days = 30) => req('GET', `/metrics/daily?days=${days}`),
};

// Same client, targeting /api/monitor (lead & recovery monitoring).
async function monitorReq(method, path, body) {
  const token = getToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/monitor${path}`, {
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

export const monitorApi = {
  leads: (params = '') => monitorReq('GET', `/leads${params}`),
  recovery: (keys = 'F,G,C,D,E') => monitorReq('GET', `/recovery?keys=${encodeURIComponent(keys)}`),
  postbacks: (params = '') => monitorReq('GET', `/postbacks${params}`),
  funnelEvents: (params = '') => monitorReq('GET', `/funnel-events${params}`),
  triggerEvent: (payload) => monitorReq('POST', '/trigger-event', payload),
};

