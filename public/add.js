// Add WiFi uplink screen — scan, pick, enter password, join.

import { scanWifi, joinWifi, fetchWirelessConfig, setInterfaceMetric } from './api.js';

export function renderAddScreen() {
  const content = document.getElementById('add-content');
  content.innerHTML = `
    <button class="btn-primary w-full" id="btn-scan" disabled>Scanning…</button>
    <div id="scan-results" class="mt-8"></div>
    <div id="add-form" class="hidden"></div>
    <p id="add-msg" class="message hidden mt-8"></p>
  `;
  content.onclick = handleClick;
  doScan();
}

// ── Event dispatch ─────────────────────────────────────────────────────────

function navigateTo(screen) {
  document.dispatchEvent(new CustomEvent('app:navigate', { detail: screen }));
}

async function handleClick(e) {
  const btn = e.target.closest('button');
  const row = e.target.closest('.ssid-row');
  if (!btn && !row) { return; }

  if (btn?.id === 'btn-scan')        { await doScan(); return; }
  if (btn?.id === 'btn-cancel')      { clearForm(); return; }
  if (btn?.id === 'btn-save')        { await doSave(); return; }
  if (btn?.id === 'btn-toggle-pass') { togglePassVisibility(btn); return; }
  if (row)                           { selectRow(row); }
}

// ── Scan ───────────────────────────────────────────────────────────────────

async function doScan() {
  const btn = document.getElementById('btn-scan');
  const resultsDiv = document.getElementById('scan-results');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  clearForm();

  try {
    const [r0, r1] = await Promise.allSettled([
      scanWifi('radio0'),
      scanWifi('radio1'),
    ]);
    const all = [
      ...(r0.status === 'fulfilled' ? r0.value : []),
      ...(r1.status === 'fulfilled' ? r1.value : []),
    ];
    const aps = deduplicate(all);
    resultsDiv.innerHTML = aps.length
      ? buildScanHtml(aps)
      : '<p class="placeholder">No networks found. Try scanning again.</p>';
  } catch (err) {
    resultsDiv.innerHTML = `<p class="message error">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rescan';
  }
}

function deduplicate(aps) {
  const map = new Map();
  for (const ap of aps) {
    if (!ap.ssid) { continue; }
    const prev = map.get(ap.ssid);
    if (!prev || ap.quality > prev.quality) { map.set(ap.ssid, ap); }
  }
  return [...map.values()].sort((a, b) => b.quality - a.quality);
}

function buildScanHtml(aps) {
  const rows = aps.map(ap => {
    const enc = encType(ap.encryption);
    const band = ap.mhz >= 5000 ? '5 GHz' : '2.4 GHz';
    const security = enc === 'none' ? 'Open' : 'WPA2';
    return `
      <div class="card-row ssid-row"
           data-ssid="${escAttr(ap.ssid)}"
           data-bssid="${escAttr(ap.bssid ?? '')}"
           data-enc="${escAttr(enc)}"
           data-radio="${ap.mhz >= 5000 ? 'radio1' : 'radio0'}">
        <div>
          <div class="fw-600">${esc(ap.ssid)}</div>
          <div class="text-muted text-sm">${band} · ${security} · ${ap.signal ?? '?'} dBm</div>
        </div>
        ${signalSvg(ap.quality, ap.quality_max)}
      </div>`;
  }).join('');
  return `<div class="card">${rows}</div>`;
}

function signalSvg(quality, qualityMax) {
  const pct = Math.round((quality / (qualityMax || 70)) * 100);
  const filled = pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
  const color = filled >= 3 ? '#30d158' : filled === 2 ? '#ff9f0a' : '#ff3b30';
  const bars = [
    { x: 0, h: 4  },
    { x: 7, h: 7  },
    { x: 14, h: 10 },
    { x: 21, h: 13 },
  ];
  const rects = bars.map((b, i) =>
    `<rect x="${b.x}" y="${16 - b.h}" width="4" height="${b.h}" rx="1"
           fill="${i < filled ? color : 'var(--border)'}" />`
  ).join('');
  return `<svg width="25" height="16" viewBox="0 0 25 16" aria-hidden="true">${rects}</svg>`;
}

function encType(enc) {
  if (!enc?.enabled) { return 'none'; }
  const wpa = enc.wpa ?? [];
  if (wpa.includes(2)) { return 'psk2'; }
  if (wpa.includes(1)) { return 'psk'; }
  return 'psk2';
}

// ── Selection + form ───────────────────────────────────────────────────────

function selectRow(row) {
  document.querySelectorAll('.ssid-row').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  showForm(row.dataset.ssid, row.dataset.bssid, row.dataset.enc, row.dataset.radio);
}

function showForm(ssid, bssid, enc, radio) {
  const open = enc === 'none';
  const form = document.getElementById('add-form');
  form.innerHTML = `
    <div class="card mt-8">
      <div class="card-title">Connect to</div>
      <div class="fw-600" style="margin-bottom:12px">${esc(ssid)}</div>
      ${open ? '<p class="text-muted text-sm">Open network — no password required.</p>' : `
        <label for="input-wifi-pass">Password</label>
        <div class="pass-wrap">
          <input id="input-wifi-pass" type="password" autocomplete="new-password"
                 placeholder="Network password">
          <button class="btn-pass-toggle" id="btn-toggle-pass" type="button"
                  aria-label="Show password">Show</button>
        </div>`}
      <input type="hidden" id="add-ssid"  value="${escAttr(ssid)}">
      <input type="hidden" id="add-bssid" value="${escAttr(bssid)}">
      <input type="hidden" id="add-enc"   value="${escAttr(enc)}">
      <input type="hidden" id="add-radio" value="${escAttr(radio)}">
      <div class="btn-row" style="margin-top:14px">
        <button class="btn-secondary" id="btn-cancel">Cancel</button>
        <button class="btn-primary"   id="btn-save">Add network</button>
      </div>
    </div>
  `;
  form.classList.remove('hidden');
  if (!open) { document.getElementById('input-wifi-pass').focus(); }
}

function togglePassVisibility(btn) {
  const input = document.getElementById('input-wifi-pass');
  if (!input) { return; }
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
}

function clearForm() {
  document.querySelectorAll('.ssid-row').forEach(r => r.classList.remove('selected'));
  const form = document.getElementById('add-form');
  form.innerHTML = '';
  form.classList.add('hidden');
  hideMsg();
}

// ── Save ───────────────────────────────────────────────────────────────────

async function doSave() {
  const ssid  = document.getElementById('add-ssid')?.value;
  const bssid = document.getElementById('add-bssid')?.value;
  const enc   = document.getElementById('add-enc')?.value;
  const radio = document.getElementById('add-radio')?.value;
  const key   = document.getElementById('input-wifi-pass')?.value?.trim() ?? '';
  const btn   = document.getElementById('btn-save');

  if (!ssid) { return; }
  if (enc !== 'none' && !key) { showMsg('Password is required.', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Adding…';
  hideMsg();

  try {
    await joinWifi({ bssid, ssid, password: key || undefined, device: radio });
    await preferNewWifi({ ssid, bssid, device: radio });
    showMsg(`"${esc(ssid)}" added — connecting…`, 'info');
    setTimeout(() => navigateTo('status'), 1800);
  } catch (err) {
    if (err.message === 'session-expired') { return; }
    showMsg(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Add network';
  }
}

// Set metric=0 on the freshly-joined STA's network so WiFi wins the default
// route by default. Best-effort: a failure here doesn't undo the join.
async function preferNewWifi({ ssid, bssid, device }) {
  try {
    const cfg = await fetchWirelessConfig();
    const sta = findNewSta(cfg, { ssid, bssid, device });
    if (!sta?.network) { return; }
    await setInterfaceMetric(sta.network, 0);
  } catch (err) {
    console.warn('Could not set default metric on new WiFi:', err);
  }
}

function findNewSta(cfg, { ssid, bssid, device }) {
  const candidates = cfg.filter(w => w.mode === 'sta' && w.ssid === ssid);
  const bssidLc = bssid?.toLowerCase();
  const exact = candidates.find(s => {
    const dev = Array.isArray(s.device) ? s.device[0] : s.device;
    if (dev !== device) { return false; }
    if (!bssidLc) { return true; }
    return (s.bssid ?? '').toLowerCase() === bssidLc;
  });
  return exact ?? candidates[candidates.length - 1];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function showMsg(text, type) {
  const el = document.getElementById('add-msg');
  if (!el) { return; }
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMsg() {
  const el = document.getElementById('add-msg');
  if (!el) { return; }
  el.className = 'message hidden';
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
