import {
  getToken, clearToken, login, authExpired,
  fetchInterfacesStatus, fetchWirelessConfig, fetchModems, fetchWirelessStatus,
  setWifiMetric, deleteWifiSta, apiFetch,
} from './api.js';
import { renderAddScreen } from './add.js';

// ── Constants ──────────────────────────────────────────────────────────────

const SCREENS = ['login', 'status', 'add'];
const REFRESH_MS = 5000;

// ── Routing ────────────────────────────────────────────────────────────────

let currentScreen = null;

function showScreen(name) {
  if (currentScreen === 'status') { stopRefresh(); }
  currentScreen = name;

  for (const id of SCREENS) {
    document.getElementById(`screen-${id}`).classList.toggle('hidden', id !== name);
  }

  if (name === 'status') { startRefresh(); }
  if (name === 'add')    { renderAddScreen(); }
}

function logout() {
  clearToken();
  showScreen('login');
}

// ── Login screen ───────────────────────────────────────────────────────────

function initLogin() {
  const form = document.getElementById('login-form');
  const btn = document.getElementById('btn-login');
  const msg = document.getElementById('login-message');

  authExpired.addEventListener('expired', () => {
    showScreen('login');
    showMsg(msg, 'Session expired — please sign in again.', 'info');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('input-password').value.trim();
    if (!pw) { return; }

    hideMsg(msg);
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      await login(pw);
      document.getElementById('input-password').value = '';
      showScreen('status');
    } catch (err) {
      showMsg(msg, err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}

// ── Status screen ──────────────────────────────────────────────────────────

let refreshTimer = null;
let refreshing = false;

function startRefresh() {
  renderStatus();
  stopRefresh();
  refreshTimer = setInterval(() => {
    const diagOpen = !document.getElementById('diagnostics-out')?.classList.contains('hidden');
    if (!document.hidden && !diagOpen) { renderStatus(); }
  }, REFRESH_MS);
}

function stopRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

async function renderStatus() {
  if (refreshing) { return; }
  refreshing = true;

  const content = document.getElementById('status-content');
  if (!content.firstChild) {
    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }

  try {
    const [ifaces, wirelessCfg, modems, wirelessStatus] = await Promise.all([
      fetchInterfacesStatus(),
      fetchWirelessConfig(),
      fetchModems(),
      fetchWirelessStatus(),
    ]);

    const wifiSta   = wirelessCfg.find(w => w.mode === 'sta');
    const wifiIface = wifiSta?.network ? ifaces.find(i => i.name === wifiSta.network) : null;

    content.innerHTML = buildStatusHtml(ifaces, wirelessCfg, modems, wifiIface, wirelessStatus);
    bindStatusEvents(wifiIface, wifiSta, ifaces);
  } catch (err) {
    if (err.message !== 'session-expired') {
      content.innerHTML = `<p class="message error">${err.message}</p>`;
    }
  } finally {
    refreshing = false;
  }
}

function activeUplink(ifaces) {
  const withDefault = ifaces.filter(i =>
    i.route?.some(r => r.target === '0.0.0.0' && r.mask === 0)
  );
  if (!withDefault.length) { return null; }
  return withDefault.reduce((a, b) => (Number(a.metric) < Number(b.metric) ? a : b));
}

function signalClass(rsrp) {
  if (rsrp >= -80) { return 'badge-green'; }
  if (rsrp >= -100) { return 'badge-orange'; }
  return 'badge-red';
}

function buildStatusHtml(ifaces, wirelessCfg, modems, wifiIface, wirelessStatus) {
  const uplink = activeUplink(ifaces);
  const stas = wirelessCfg.filter(w => w.mode === 'sta');
  const modem = Array.isArray(modems) ? modems[0] : modems;
  const preferWifi = wifiIface && Number(wifiIface.metric) === 0;

  const isWifiUplink = uplink && stas.some(s => s.network === uplink.name);
  const uplinkName = !uplink ? 'No uplink' : isWifiUplink ? 'WiFi' : 'Mobile';
  const uplinkIP = uplink?.ipaddrs?.[0]?.replace(/\/\d+$/, '') ?? '—';
  const activeSta = stas.find(s => s.network === uplink?.name);

  return `
    <div class="card">
      <div class="card-title">Active uplink</div>
      <div class="uplink-row">
        <div>
          <div class="card-value">${uplinkName}${activeSta ? ` · ${esc(activeSta.ssid)}` : ''}</div>
          <div class="text-muted text-sm">${uplinkIP}</div>
        </div>
        <span class="badge ${uplink ? (isWifiUplink ? 'badge-green' : 'badge-orange') : 'badge-red'}">
          ${uplink ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>

    <div class="card">
      <div class="card-row">
        <div>
          <div class="fw-600">Prefer WiFi</div>
          <div class="text-muted text-sm">${preferWifi ? 'WiFi routes traffic when available' : 'Mobile is primary, WiFi is failover'}</div>
        </div>
        <button class="toggle ${preferWifi ? 'on' : ''}" id="btn-toggle-wifi"
                ${!wifiIface ? 'disabled title="No WiFi uplink configured"' : ''}
                aria-pressed="${preferWifi}" aria-label="Prefer WiFi"></button>
      </div>
    </div>

    ${modem ? `
    <div class="card">
      <div class="card-title">Mobile signal</div>
      <div class="fw-600">${esc(modem.operator ?? '—')}</div>
      <div class="text-muted text-sm" style="margin-bottom:10px">${esc(modem.conntype ?? '—')} · ${esc(modem.band ?? '—')}</div>
      <div class="signal-grid">
        <div><div class="sig-label">RSSI</div><div class="sig-value">${modem.rssi ?? '—'}</div></div>
        <div><div class="sig-label">RSRP</div><div class="sig-value ${signalClass(modem.rsrp)}">${modem.rsrp ?? '—'}</div></div>
        <div><div class="sig-label">RSRQ</div><div class="sig-value">${modem.rsrq ?? '—'}</div></div>
        <div><div class="sig-label">SINR</div><div class="sig-value">${modem.sinr ?? '—'}</div></div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-title">Campsite WiFi</div>
      ${stas.length ? stas.map(sta => {
        const iface = ifaces.find(i => i.name === sta.network);
        const connected = iface?.is_up === true;
        const ws = wirelessStatus?.find(w => w.mode === 'sta' && w.id === sta.id);
        const quality = ws?.devices?.[0]?.quality ?? ws?.quality ?? 0;
        const subtext = connected && ws
          ? `${ws.band} · ${ws.signal} dBm · ${Math.round(ws.bitrate / 1e6)} Mbps`
          : Array.isArray(sta.device) ? sta.device.join(', ') : (sta.device ?? '');
        return `
        <div class="card-row">
          <div>
            <div class="fw-600">${esc(sta.ssid)}</div>
            <div class="text-muted text-sm">${subtext}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            ${connected && ws ? signalSvg(quality, 70) : ''}
            <button class="btn-danger btn-disconnect"
                    data-sta-id="${escAttr(sta.id)}"
                    data-network="${escAttr(sta.network ?? '')}"
                    style="min-height:36px;padding:0 12px;font-size:14px">
              Disconnect
            </button>
          </div>
        </div>
        `;
      }).join('') : `
      <div class="card-row">
        <span class="text-muted">No network saved</span>
        <button class="btn-primary" id="btn-scan-wifi"
                style="min-height:36px;padding:0 16px;font-size:14px">
          Scan
        </button>
      </div>
      `}
    </div>

    <button class="btn-secondary w-full" id="btn-diagnostics">Show diagnostics</button>
    <pre id="diagnostics-out" class="diag-out hidden"></pre>
  `;
}

function bindStatusEvents(wifiIface, wifiSta, ifaces) {
  document.getElementById('btn-toggle-wifi')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) { return; }
    btn.disabled = true;
    const preferWifi = btn.classList.contains('on');
    try {
      await setWifiMetric(wifiIface.id, wifiSta.id, preferWifi ? 10 : 0);
      await renderStatus();
    } catch (err) {
      if (err.message !== 'session-expired') { alert(err.message); }
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelectorAll('.btn-disconnect').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { staId, network } = btn.dataset;
      btn.disabled = true;
      btn.textContent = 'Disconnecting…';
      try {
        await deleteWifiSta(staId);
        const ifaceId = ifaces.find(i => i.name === network)?.id;
        if (ifaceId) {
          await apiFetch(`/interfaces/config/${ifaceId}`, { method: 'DELETE' }).catch(() => {});
        }
        await renderStatus();
      } catch (err) {
        if (err.message !== 'session-expired') {
          btn.disabled = false;
          btn.textContent = 'Disconnect';
          alert(err.message);
        }
      }
    });
  });

  document.getElementById('btn-scan-wifi')?.addEventListener('click', () => showScreen('add'));

  document.getElementById('btn-diagnostics')?.addEventListener('click', loadDiagnostics);
}

async function loadDiagnostics() {
  const btn = document.getElementById('btn-diagnostics');
  const pre = document.getElementById('diagnostics-out');
  if (!pre.classList.contains('hidden')) {
    pre.classList.add('hidden');
    btn.textContent = 'Show diagnostics';
    return;
  }

  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    const [ifaces, wireless] = await Promise.allSettled([
      fetchInterfacesStatus(),
      fetchWirelessConfig(),
    ]);

    let out = '=== Interfaces ===\n';
    out += ifaces.status === 'fulfilled'
      ? JSON.stringify(ifaces.value, null, 2)
      : `Error: ${ifaces.reason?.message}`;
    out += '\n\n=== Wireless ===\n';
    out += wireless.status === 'fulfilled'
      ? JSON.stringify(wireless.value, null, 2)
      : `Error: ${wireless.reason?.message}`;

    pre.textContent = out;
    pre.classList.remove('hidden');
    btn.textContent = 'Hide diagnostics';
  } catch (err) {
    pre.textContent = `Error: ${err.message}`;
    pre.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

// ── Back buttons ───────────────────────────────────────────────────────────

function initBackButtons() {
  document.getElementById('btn-back-add').addEventListener('click', () => showScreen('status'));
}

// ── Utilities ──────────────────────────────────────────────────────────────

function signalSvg(quality, qualityMax) {
  const pct = Math.round((quality / (qualityMax || 70)) * 100);
  const filled = pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
  const color = filled >= 3 ? '#30d158' : filled === 2 ? '#ff9f0a' : '#ff3b30';
  const bars = [{x:0,h:4},{x:7,h:7},{x:14,h:10},{x:21,h:13}];
  const rects = bars.map((b, i) =>
    `<rect x="${b.x}" y="${16-b.h}" width="4" height="${b.h}" rx="1" fill="${i < filled ? color : 'var(--border)'}" />`
  ).join('');
  return `<svg width="25" height="16" viewBox="0 0 25 16" aria-hidden="true">${rects}</svg>`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMsg(el) {
  el.className = 'message hidden';
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('app:navigate', (e) => showScreen(e.detail));

document.addEventListener('visibilitychange', () => {
  if (currentScreen !== 'status') { return; }
  if (document.hidden) { stopRefresh(); } else { startRefresh(); }
});

initLogin();
initBackButtons();
showScreen(getToken() ? 'status' : 'login');
