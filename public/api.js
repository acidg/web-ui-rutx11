// All network calls to the router REST API.

const TOKEN_KEY = 'rutx11_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function login(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.errors?.[0]?.error || 'Login failed');
  }
  localStorage.setItem(TOKEN_KEY, json.data.token);
}

// Dispatched when a 401/session-expired is detected so the app can re-prompt.
export const authExpired = new EventTarget();

export async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) { headers['Authorization'] = `Bearer ${token}`; }

  const res = await fetch(`/api${path}`, { ...opts, headers });
  const json = await res.json();

  if (!json.success) {
    if (json.errors?.[0]?.code === 120) {
      clearToken();
      authExpired.dispatchEvent(new Event('expired'));
      throw new Error('session-expired');
    }
    throw new Error(json.errors?.[0]?.error || `API error: ${path}`);
  }

  return json.data;
}

// ── Typed API calls ────────────────────────────────────────────────────────

export const fetchInterfacesStatus = () => apiFetch('/interfaces/status');
export const fetchInterfaceConfig  = (id) => apiFetch(`/interfaces/config/${id}`);
export const fetchWirelessConfig   = () => apiFetch('/wireless/interfaces/config');
export const fetchWirelessStatus   = () => apiFetch('/wireless/interfaces/status');
export const fetchModems           = () => apiFetch('/modems/status');

export async function scanWifi(radio = 'radio0') {
  return apiFetch('/wireless/actions/scan', {
    method: 'POST',
    body: JSON.stringify({ data: { device: radio } }),
  });
}

// Join a WiFi network — creates the STA and triggers connection.
// use_cache=true tells the API to use our recent scan results.
export async function joinWifi({ bssid, ssid, password, device }) {
  const data = { bssid, ssid, device };
  if (password) { data.password = password; }
  return apiFetch('/wireless/actions/join?use_cache=true', {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}

export async function reconnectWifi(staId) {
  return apiFetch('/wireless/actions/reconnect', {
    method: 'POST',
    body: JSON.stringify({ data: { sta_id: staId } }),
  });
}

export const deleteWifiSta = (id) =>
  apiFetch(`/wireless/interfaces/config/${id}`, { method: 'DELETE' });

// Update the metric of the wifi uplink interface, then reconnect so
// netifd re-installs the route with the new metric.
export async function setWifiMetric(ifaceId, staId, metric) {
  await apiFetch(`/interfaces/config/${ifaceId}`, {
    method: 'PUT',
    body: JSON.stringify({ data: { metric: String(metric) } }),
  });
  await reconnectWifi(String(staId));
}
