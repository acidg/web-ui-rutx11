// Manage saved WiFi uplinks — list, delete.

import {
  fetchWirelessConfig, fetchInterfacesStatus,
  deleteWifiSta, apiFetch,
} from './api.js';

export async function renderManageScreen() {
  const content = document.getElementById('manage-content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  content.onclick = null;

  try {
    const [wirelessCfg, ifaces] = await Promise.all([
      fetchWirelessConfig(),
      fetchInterfacesStatus(),
    ]);

    const stas = wirelessCfg.filter(w => w.mode === 'sta');

    content.innerHTML = stas.length
      ? buildListHtml(stas, ifaces)
      : '<p class="placeholder">No WiFi networks saved.<br>Use Add WiFi to connect to a network.</p>';

    content.onclick = (e) => handleClick(e, stas, ifaces);
  } catch (err) {
    content.innerHTML = `<p class="message error">${esc(err.message)}</p>`;
  }
}

// ── Build UI ───────────────────────────────────────────────────────────────

function buildListHtml(stas, ifaces) {
  const rows = stas.map(sta => {
    const iface = ifaces.find(i => i.name === sta.network);
    const connected = iface?.is_up === true;
    const band = radioToBand(sta.device);
    return `
      <div class="card-row" data-id="${escAttr(sta.id)}">
        <div>
          <div class="fw-600">${esc(sta.ssid)}</div>
          <div class="text-muted text-sm">${band} · ${enc(sta.encryption)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="badge ${connected ? 'badge-green' : 'badge-orange'}">
            ${connected ? 'Connected' : 'Saved'}
          </span>
          <button class="btn-danger btn-delete" data-id="${escAttr(sta.id)}"
                  style="min-height:36px;padding:0 12px;font-size:14px">
            Remove
          </button>
        </div>
      </div>`;
  }).join('');

  return `<div class="card">${rows}</div>`;
}

function radioToBand(device) {
  const dev = Array.isArray(device) ? device[0] : device;
  return dev === 'radio1' ? '5 GHz' : '2.4 GHz';
}

function enc(encryption) {
  return (!encryption || encryption === 'none') ? 'Open' : 'WPA2';
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function handleClick(e, stas, ifaces) {
  const btn = e.target.closest('.btn-delete');
  if (!btn) { return; }

  const id = btn.dataset.id;
  const sta = stas.find(s => s.id === id);
  btn.disabled = true;
  btn.textContent = 'Removing…';

  try {
    await deleteWifiSta(id);
    const ifaceId = ifaces.find(i => i.name === sta?.network)?.id;
    if (ifaceId) {
      await apiFetch(`/interfaces/config/${ifaceId}`, { method: 'DELETE' }).catch(() => {});
    }
    await renderManageScreen();
  } catch (err) {
    if (err.message !== 'session-expired') {
      btn.disabled = false;
      btn.textContent = 'Remove';
      alert(err.message);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
