// Master Application Bootstrap v2.0: Full Arsenal, Friends & Squad Invites, Room Codes & Dual-Transport (WS + Cloud P2P)
import {
  GAME_MODES,
  OPERATORS,
  OUTFITS,
  WEAPON_SUBCLASSES,
  WEAPONS,
  ATTACHMENTS,
  WEAPON_SKINS,
  getEffectiveWeaponStats
} from '/shared/constants.js';
import { MAP_LIST } from '/shared/maps.js';
import { NetworkClient } from './network.js';
import { LobbyShowcase } from './lobbyScene.js';
import { MatchHUD } from './hud.js';
import { FPSGameClient } from './gameClient.js';
import { soundEngine } from './audio.js';
import { TeamVoiceChat } from './voiceChat.js';

const state = {
  user: null,
  token: sessionStorage.getItem('bs_token') || localStorage.getItem('bs_token') || '',
  profileBackup: localStorage.getItem('bs_profile_backup') || '',
  activeTab: 'home',
  selectedQuickMode: 'tdm',
  selectedQuickMap: 'warehouse',
  selectedArmorySubclass: 'all',
  selectedArmoryWeapon: 'ak47',
  previewOperator: null,
  previewOutfit: null,
  previewWeaponSkins: {},
  previewWeaponAttachments: {},
  previewAttachmentSelection: null,
  currentRoom: null,
  roomsList: [],
  friendsList: [],
  incomingRequests: [],
  onlinePlayers: [],
  pendingInviteTarget: null,
  pendingUrlRoomCode: new URLSearchParams(window.location.search).get('room') || ''
};

const lobbyCanvas = document.getElementById('lobby-canvas');
const gameCanvas = document.getElementById('game-canvas');
const net = new NetworkClient();
const lobbyShowcase = new LobbyShowcase(lobbyCanvas);
const hud = new MatchHUD();
const fpsClient = new FPSGameClient(gameCanvas, net, hud);
const voice = new TeamVoiceChat(net);

let friendsPollTimer = null;
let lastShownInviteId = null;

function showToast(text) {
  const wrap = document.getElementById('toast-container');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Bespoke Tactical Vector Emblems (Zero Emojis — Unified AAA FPS Iconography)
const MODE_SVG = {
  tdm: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M10 12l28 24M38 12L10 36" opacity="0.35"/>
    <path d="M24 6l14 6v11c0 9-6 15-14 19-8-4-14-10-14-19V12l14-6z"/>
    <path d="M18 20l6-5 6 5M18 27l6-5 6 5"/>
  </svg>`,
  ffa: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
    <circle cx="24" cy="24" r="14"/>
    <circle cx="24" cy="24" r="5"/>
    <path d="M24 4v9M24 35v9M4 24h9M35 24h9"/>
    <path d="M11 11l4 4M37 11l-4 4M11 37l4-4M37 37l-4-4" opacity="0.45"/>
  </svg>`,
  bomb: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
    <rect x="8" y="13" width="32" height="24" rx="1"/>
    <rect x="13" y="18" width="14" height="8"/>
    <path d="M16 22h8M32 19h3M32 23h3M32 27h3M13 31h14"/>
    <path d="M17 13V9h14v4"/>
    <circle cx="35" cy="10" r="2.2" fill="currentColor" stroke="none"/>
  </svg>`,
  survival: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
    <path d="M8 22c0-9 7.2-15 16-15s16 6 16 15H8z"/>
    <path d="M14 22l10 16 10-16M24 7v31"/>
    <circle cx="24" cy="39" r="2.5" fill="currentColor" stroke="none"/>
    <path d="M6 42h36" opacity="0.4"/>
  </svg>`,
  ranked: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
    <polygon points="24,5 39,14 39,34 24,43 9,34 9,14"/>
    <polygon points="24,13 32,18 32,30 24,35 16,30 16,18" opacity="0.45"/>
    <path d="M18 26l6-7 6 7M20 31l4-4 4 4"/>
  </svg>`,
  practice: `<svg class="mode-emblem-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <circle cx="24" cy="24" r="15"/>
    <circle cx="24" cy="24" r="9"/>
    <circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none"/>
  </svg>`
};

const MAP_VISUAL_META = {
  warehouse: {
    sizeTag: 'CQC ARENA',
    accent: '#f97316',
    svg: `<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <rect x="8" y="8" width="104" height="48" opacity="0.35"/>
      <rect x="20" y="16" width="22" height="12" fill="currentColor" fill-opacity="0.16"/>
      <rect x="78" y="16" width="22" height="12" fill="currentColor" fill-opacity="0.16"/>
      <rect x="49" y="24" width="22" height="16" fill="currentColor" fill-opacity="0.24"/>
      <rect x="20" y="38" width="18" height="10" fill="currentColor" fill-opacity="0.16"/>
      <rect x="82" y="38" width="18" height="10" fill="currentColor" fill-opacity="0.16"/>
      <path d="M12 32h96" stroke-dasharray="3 3" opacity="0.45"/>
    </svg>`
  },
  military_base: {
    sizeTag: 'TACTICAL BASE',
    accent: '#eab308',
    svg: `<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <rect x="8" y="8" width="104" height="48" opacity="0.35"/>
      <polygon points="22,18 46,18 46,44 22,44" fill="currentColor" fill-opacity="0.18"/>
      <polygon points="74,18 98,18 98,44 74,44" fill="currentColor" fill-opacity="0.18"/>
      <circle cx="60" cy="32" r="9" fill="currentColor" fill-opacity="0.2"/>
      <path d="M46 32h5M69 32h5M60 12v11M60 41v11" opacity="0.6"/>
    </svg>`
  },
  urban_city: {
    sizeTag: 'URBAN C4',
    accent: '#00e5ff',
    svg: `<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <rect x="8" y="8" width="104" height="48" opacity="0.35"/>
      <rect x="16" y="14" width="24" height="18" fill="currentColor" fill-opacity="0.2"/>
      <rect x="48" y="12" width="24" height="14" fill="currentColor" fill-opacity="0.16"/>
      <rect x="80" y="14" width="24" height="20" fill="currentColor" fill-opacity="0.2"/>
      <rect x="18" y="38" width="28" height="12" fill="currentColor" fill-opacity="0.16"/>
      <rect x="54" y="34" width="18" height="16" fill="currentColor" fill-opacity="0.22"/>
      <rect x="80" y="40" width="22" height="10" fill="currentColor" fill-opacity="0.16"/>
    </svg>`
  },
  jungle: {
    sizeTag: 'JUNGLE OPS',
    accent: '#22c55e',
    svg: `<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M12 48 Q35 20 60 32 T108 16" stroke-width="2" opacity="0.65"/>
      <circle cx="30" cy="24" r="8" fill="currentColor" fill-opacity="0.16"/>
      <circle cx="60" cy="32" r="11" fill="currentColor" fill-opacity="0.22"/>
      <circle cx="90" cy="40" r="8" fill="currentColor" fill-opacity="0.16"/>
      <path d="M22 46l8-8 8 8M82 22l7-7 7 7" opacity="0.6"/>
    </svg>`
  },
  br_island: {
    sizeTag: '1.5KM • BR 50',
    accent: '#34d399',
    svg: `<svg viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M20 44 C14 26 30 12 58 12 C86 12 106 22 102 40 C98 54 70 54 48 52 C32 50 24 52 20 44 Z" fill="currentColor" fill-opacity="0.16"/>
      <path d="M28 34 Q58 26 94 36" stroke-dasharray="3 2" opacity="0.7"/>
      <circle cx="62" cy="30" r="14" stroke-dasharray="4 3" opacity="0.8"/>
      <circle cx="62" cy="30" r="3" fill="currentColor" stroke="none"/>
    </svg>`
  }
};

const ICON_USER_SVG = '<svg class="ui-ico xs" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_CLOSE_SVG = '<svg class="ui-ico xs" aria-hidden="true" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

async function apiCall(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (state.profileBackup) headers['x-profile-backup'] = state.profileBackup;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (data?.user?.profileBackup) {
    state.profileBackup = data.user.profileBackup;
    localStorage.setItem('bs_profile_backup', data.user.profileBackup);
  }
  return data;
}

// ============================================================================
// 1. INITIALIZATION & AUTHENTICATION
// ============================================================================
async function initApp() {
  populateStaticSelects();
  bindUIEvents();
  bindNetworkEvents();

  const authInput = document.getElementById('auth-username');
  const savedName = localStorage.getItem('bs_last_name');
  if (authInput) {
    authInput.value = savedName || `ChienBinh_${Math.floor(100 + Math.random() * 899)}`;
  }

  if (state.token) {
    try {
      const data = await apiCall('/api/profile');
      if (data.user) {
        onLoginSuccess(data.user);
        return;
      }
    } catch {}
    sessionStorage.removeItem('bs_token');
    localStorage.removeItem('bs_token');
    state.token = '';
  }

  document.getElementById('auth-overlay')?.classList.remove('hidden');
}

function onLoginSuccess(user) {
  state.user = user;
  state.token = user.token;
  if (user.profileBackup) {
    state.profileBackup = user.profileBackup;
    localStorage.setItem('bs_profile_backup', user.profileBackup);
  }
  sessionStorage.setItem('bs_token', user.token);
  localStorage.setItem('bs_token', user.token);
  localStorage.setItem('bs_last_name', user.username);

  document.getElementById('auth-overlay')?.classList.add('hidden');
  document.getElementById('lobby-shell')?.classList.remove('hidden');

  refreshProfileUI();
  renderQuickModes();
  renderOperatorsTab();
  renderArmoryTab();
  renderInGameBuyModal();
  sync3DShowcase();

  net.connect(user, apiCall);
  startFriendsPolling();
}

function refreshProfileUI() {
  const u = state.user;
  if (!u) return;
  const opNav = document.querySelector('.nav-btn[data-tab="operators"]');
  if (opNav) opNav.textContent = `NHÂN VẬT (${Object.keys(OPERATORS).length})`;
  document.getElementById('top-gp').textContent = u.gp.toLocaleString('vi-VN');
  document.getElementById('top-username').textContent = u.username;
  document.getElementById('top-rank-badge').textContent = u.rank?.icon || 'II';
  document.getElementById('top-rank-badge').style.borderColor = u.rank?.color || '#facc15';
  document.getElementById('top-rank-badge').style.color = u.rank?.color || '#facc15';
  document.getElementById('top-rank-text').textContent = `${u.rank?.name || 'Bạc Đoàn'} • ${u.rp} RP`;

  const fcEl = document.getElementById('my-friend-code');
  if (fcEl && u.friendCode) fcEl.textContent = u.friendCode;

  const op = OPERATORS[u.loadout.operator] || OPERATORS.vanguard;
  const out = OUTFITS[u.loadout.outfit] || OUTFITS.urban;
  const pri = WEAPONS[u.loadout.primary] || WEAPONS.ak47;
  const sec = WEAPONS[u.loadout.secondary] || WEAPONS.deagle;
  const mel = WEAPONS[u.loadout.melee || 'knife'] || WEAPONS.knife;
  const skin = WEAPON_SKINS[u.loadout.skins?.[pri.id]] || WEAPON_SKINS.default;

  const summaryEl = document.getElementById('home-loadout-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span>Quân nhân: <strong style="color:#38bdf8">${escapeHtml(op.name)}</strong> (${escapeHtml(out.name)})</span>
      <span>•</span>
      <span>Súng chính: <strong style="color:#f97316">${escapeHtml(pri.name)}</strong> [${escapeHtml(skin.name)}]</span>
      <span>•</span>
      <span>Phụ: <strong>${escapeHtml(sec.name)}</strong> &amp; <strong>${escapeHtml(mel.name)}</strong></span>
    `;
  }

  // Top-Left Operator Combat Dossier Card
  const dossierBody = document.getElementById('home-dossier-body');
  if (dossierBody) {
    const st = u.stats || {};
    const kd = (st.deaths || 0) > 0 ? ((st.kills || 0) / st.deaths).toFixed(2) : String(st.kills || 0);
    const winRate = (st.matches || 0) > 0 ? Math.round(((st.wins || 0) / st.matches) * 100) : 0;
    const hsRate = (st.kills || 0) > 0 ? Math.round(((st.headshots || 0) / st.kills) * 100) : 0;
    const rColor = u.rank?.color || '#f5c542';
    dossierBody.innerHTML = `
      <div class="dossier-head">
        <div class="dossier-rank-crest" style="border-color:${rColor};color:${rColor};">${escapeHtml(u.rank?.icon || 'II')}</div>
        <div style="min-width:0;flex:1;">
          <div class="dossier-callsign">${escapeHtml(u.username)}</div>
          <div class="dossier-rank-sub" style="color:${rColor};">${escapeHtml(u.rank?.name || 'Bạc Đoàn')} • ${u.rp || 1200} RP • Cấp ${u.level || 1}</div>
        </div>
      </div>
      <div class="dossier-kpis">
        <div class="dossier-kpi"><strong style="color:var(--cyan);">${kd}</strong><span>K/D Ratio</span></div>
        <div class="dossier-kpi"><strong style="color:var(--emerald);">${winRate}%</strong><span>Tỉ Lệ Thắng</span></div>
        <div class="dossier-kpi"><strong style="color:var(--gold);">${hsRate}%</strong><span>Headshot</span></div>
      </div>
    `;
  }

  // Top-Right Active Loadout & Weapon Quick-Inspect Card
  const arsenalBody = document.getElementById('home-arsenal-body');
  if (arsenalBody) {
    const eff = getEffectiveWeaponStats(pri.id, u.loadout.attachments?.[pri.id] || {}, op.id);
    const dmgPct = Math.min(100, Math.round(((eff.damage * (eff.pellets || 1)) / 120) * 100));
    const rpmPct = Math.min(100, Math.round((eff.rpm / 1000) * 100));
    const ctrlPct = Math.max(45, Math.min(98, Math.round(100 - eff.recoilPitch * 1650)));
    arsenalBody.innerHTML = `
      <div class="aq-primary-box">
        <div class="aq-kicker">
          <span>SÚNG CHÍNH ĐANG TRANG BỊ</span>
          <span style="color:${skin.rarityColor || '#38bdf8'};">${escapeHtml(skin.name)}</span>
        </div>
        <div class="aq-gun-name">${escapeHtml(pri.name)}</div>
        <div class="aq-bars">
          <div class="aq-bar-item">
            <span>DMG ${eff.damage * (eff.pellets || 1)}</span>
            <div class="aq-bar-track"><div class="aq-bar-fill" style="width:${dmgPct}%"></div></div>
          </div>
          <div class="aq-bar-item">
            <span>RPM ${eff.rpm}</span>
            <div class="aq-bar-track"><div class="aq-bar-fill" style="width:${rpmPct}%"></div></div>
          </div>
          <div class="aq-bar-item">
            <span>CTRL ${ctrlPct}%</span>
            <div class="aq-bar-track"><div class="aq-bar-fill" style="width:${ctrlPct}%"></div></div>
          </div>
        </div>
      </div>
      <div class="aq-sub-row">
        <div class="aq-sub-chip"><span>SÚNG PHỤ</span><strong>${escapeHtml(sec.name)}</strong></div>
        <div class="aq-sub-chip"><span>QUÂN NHÂN</span><strong>${escapeHtml(op.name)}</strong></div>
      </div>
    `;
  }
}

function sync3DShowcase() {
  if (!state.user) return;
  const lo = state.user.loadout;
  const viewOperator = (state.activeTab === 'operators' && state.previewOperator) ? state.previewOperator : lo.operator;
  const viewOutfit = (state.activeTab === 'operators' && state.previewOutfit) ? state.previewOutfit : lo.outfit;

  lobbyShowcase.updateOperator({
    operator: viewOperator,
    outfit: viewOutfit,
    primary: lo.primary,
    skinId: lo.skins?.[lo.primary] || 'default',
    attachments: lo.attachments?.[lo.primary] || {},
    username: state.user.username
  });

  const wId = state.selectedArmoryWeapon;
  const viewSkinId = state.previewWeaponSkins[wId] || lo.skins?.[wId] || 'default';
  const viewAttachments = {
    ...(lo.attachments?.[wId] || { optic: 'iron', muzzle: 'none', mag: 'standard' }),
    ...(state.previewWeaponAttachments[wId] || {})
  };
  lobbyShowcase.updateWeapon({
    weaponId: wId,
    skinId: viewSkinId,
    attachments: viewAttachments
  });
}

function populateStaticSelects() {
  const mapSelectIds = ['quick-map-select', 'cr-map', 'room-edit-map'];
  for (const id of mapSelectIds) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    sel.innerHTML = MAP_LIST.map((m) => `<option value="${m.id}">${m.name} — ${m.subtitle}</option>`).join('');
  }

  const modeSelectIds = ['cr-mode', 'room-edit-mode'];
  for (const id of modeSelectIds) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    sel.innerHTML = Object.values(GAME_MODES)
      .filter((m) => !m.isPractice)
      .map((m) => `<option value="${m.id}">${m.shortName} (${m.name})</option>`)
      .join('');
  }
}

// ============================================================================
// 2. TAB RENDERING: HOME, OPERATORS, ARMORY (12 WEAPONS), ROOMS, RANKED
// ============================================================================
function switchTab(tabId) {
  state.activeTab = tabId;
  soundEngine.playUiTone(680, 0.06);

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-view').forEach((sec) => {
    const isTarget = sec.id === `tab-${tabId}`;
    sec.classList.toggle('hidden', !isTarget);
    sec.classList.toggle('active', isTarget);
  });

  if (tabId === 'armory') {
    lobbyShowcase.setMode('weapon');
    renderArmoryTab();
  } else {
    if (tabId !== 'operators') {
      state.previewOperator = null;
      state.previewOutfit = null;
    }
    lobbyShowcase.setMode('operator');
  }
  sync3DShowcase();

  if (tabId === 'rooms') {
    net.send({ type: 'list_rooms' });
    updateRoomTabPanels();
  } else if (tabId === 'operators') {
    renderOperatorsTab();
  } else if (tabId === 'ranked') {
    loadRankedLeaderboard();
  }
}

function getModeSpecLine(m) {
  if (!m) return '';
  if (m.id === 'survival') return `${m.maxPlayers} Chiến binh • Nhảy dù C-130`;
  if (m.roundBased) return `${m.maxPlayers}P • Chạm ${m.scoreLimit} hiệp`;
  return `${m.maxPlayers}P • Mục tiêu ${m.scoreLimit} hạ gục`;
}

function renderActiveModeTrigger() {
  const mode = GAME_MODES[state.selectedQuickMode] || GAME_MODES.tdm;
  const mapObj = MAP_LIST.find((x) => x.id === state.selectedQuickMap) || MAP_LIST[0];
  const trigger = document.getElementById('btn-open-mode-modal');
  const emblemEl = document.getElementById('active-mode-emblem');
  const tagEl = document.getElementById('active-mode-tag');
  const nameEl = document.getElementById('active-mode-name');
  const subEl = document.getElementById('active-map-line');
  const summaryEl = document.getElementById('mode-modal-summary');

  if (trigger) trigger.style.setProperty('--mode-accent', mode.accent || '#ff4d1c');
  if (emblemEl) emblemEl.innerHTML = MODE_SVG[mode.icon] || MODE_SVG.tdm;
  if (tagEl) tagEl.textContent = mode.tag || mode.shortName;
  if (nameEl) nameEl.textContent = mode.name.toUpperCase();
  if (subEl) subEl.textContent = `${mapObj?.name || 'Nhà Kho'} • ${getModeSpecLine(mode)}`;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="mms-badge" style="border-color:${mode.accent || '#ff4d1c'};color:${mode.accent || '#ff4d1c'};">${mode.tag || mode.shortName}</span>
      <strong>${escapeHtml(mode.name)}</strong>
      <span class="muted">•</span>
      <span style="color:var(--cyan);font-weight:700;">${escapeHtml(mapObj?.name || 'Nhà Kho')}</span>
    `;
  }
}

function renderModeMapCards() {
  const container = document.getElementById('mode-map-cards');
  const hintEl = document.getElementById('mode-map-hint');
  if (!container) return;
  const isSurvival = state.selectedQuickMode === 'survival';
  if (hintEl) {
    hintEl.textContent = isSurvival
      ? 'Chế độ Sinh Tồn 50 Người triển khai trên bản đồ mở Đảo Sinh Tồn 1.5km'
      : 'Chọn bản đồ chiến thuật 3D (hoặc chọn Đảo Sinh Tồn để chuyển sang BR 50)';
  }

  container.innerHTML = MAP_LIST.map((m, idx) => {
    const meta = MAP_VISUAL_META[m.id] || MAP_VISUAL_META.warehouse;
    const selected = state.selectedQuickMap === m.id;
    const isBrMap = m.id === 'br_island';
    const dimMismatch = isSurvival && !isBrMap;
    return `
      <button type="button" class="map-tile ${selected ? 'selected' : ''} ${dimMismatch ? 'dimmed' : ''}" data-map="${m.id}" style="--map-accent:${meta.accent};--stagger:${idx};">
        <div class="map-tile-art">${meta.svg}</div>
        <div class="map-tile-info">
          <div class="map-tile-head">
            <span class="map-tile-size">${meta.sizeTag}</span>
            ${selected ? '<span class="tile-active-dot">ĐÃ CHỌN</span>' : ''}
          </div>
          <div class="map-tile-name">${escapeHtml(m.name)}</div>
          <div class="map-tile-sub">${escapeHtml(m.subtitle)}</div>
        </div>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.map-tile').forEach((card) => {
    card.addEventListener('click', () => {
      const mapId = card.dataset.map;
      state.selectedQuickMap = mapId;
      const mapSelect = document.getElementById('quick-map-select');
      if (mapSelect) mapSelect.value = mapId;
      if (mapId === 'br_island' && state.selectedQuickMode !== 'survival') {
        state.selectedQuickMode = 'survival';
      } else if (mapId !== 'br_island' && state.selectedQuickMode === 'survival') {
        state.selectedQuickMode = 'tdm';
      }
      soundEngine.playUiTone(820, 0.05);
      renderQuickModes();
    });
  });
}

function renderQuickModes() {
  const container = document.getElementById('quick-mode-list');
  if (container) {
    container.innerHTML = Object.values(GAME_MODES)
      .filter((m) => !m.isPractice)
      .map((m, idx) => {
        const selected = state.selectedQuickMode === m.id;
        return `
          <button type="button" class="mode-tile ${selected ? 'selected' : ''}" data-mode="${m.id}" style="--mode-accent:${m.accent || '#ff4d1c'};--stagger:${idx};">
            <div class="mode-tile-banner">
              <div class="mode-tile-top">
                <span class="mode-tile-tag">${escapeHtml(m.tag || m.shortName)}</span>
                ${selected ? '<span class="tile-active-stamp">ĐANG CHỌN</span>' : ''}
              </div>
              <div class="mode-tile-emblem">${MODE_SVG[m.icon] || MODE_SVG.tdm}</div>
            </div>
            <div class="mode-tile-body">
              <div class="mode-tile-title">${escapeHtml(m.name)}</div>
              <div class="mode-tile-short">${escapeHtml(m.shortName)}</div>
              <div class="mode-tile-desc">${escapeHtml(m.description)}</div>
              <div class="mode-tile-spec">${escapeHtml(getModeSpecLine(m))}</div>
            </div>
          </button>
        `;
      }).join('');

    container.querySelectorAll('.mode-tile').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedQuickMode = card.dataset.mode;
        const mapSelect = document.getElementById('quick-map-select');
        if (card.dataset.mode === 'survival') {
          state.selectedQuickMap = 'br_island';
          if (mapSelect) mapSelect.value = 'br_island';
        } else if (state.selectedQuickMap === 'br_island') {
          state.selectedQuickMap = 'warehouse';
          if (mapSelect) mapSelect.value = 'warehouse';
        }
        soundEngine.playUiTone(740, 0.05);
        renderQuickModes();
      });
    });
  }
  renderModeMapCards();
  renderActiveModeTrigger();
}

function openModeSelectorModal() {
  const modal = document.getElementById('mode-selector-modal');
  if (!modal) return;
  renderQuickModes();
  modal.classList.remove('hidden');
  soundEngine.playUiTone(760, 0.05);
}

function closeModeSelectorModal() {
  document.getElementById('mode-selector-modal')?.classList.add('hidden');
}

function renderOperatorsTab() {
  if (!state.user) return;
  const u = state.user;
  const opList = document.getElementById('operators-list');
  const detailBox = document.getElementById('operator-detail-box');
  const outfitList = document.getElementById('outfits-list');

  const viewOpId = state.previewOperator || u.loadout.operator;
  const viewOutId = state.previewOutfit || u.loadout.outfit;
  const currentOp = OPERATORS[viewOpId] || OPERATORS.vanguard;
  const currentOut = OUTFITS[viewOutId] || OUTFITS.urban;

  const opTag = document.getElementById('operators-panel-tag');
  if (opTag) opTag.textContent = `${Object.keys(OPERATORS).length} QUÂN NHÂN ĐẶC NHIỆM (NAM & NỮ)`;
  if (opList) {
    opList.innerHTML = Object.values(OPERATORS).map((op) => {
      const unlocked = u.unlocked.operators.includes(op.id);
      const equipped = u.loadout.operator === op.id;
      const previewing = viewOpId === op.id;
      const badge = equipped
        ? '<span class="item-badge equipped">ĐANG DÙNG</span>'
        : (previewing
          ? '<span class="item-badge previewing">ĐANG XEM</span>'
          : (unlocked
            ? '<span class="item-badge owned">ĐÃ SỞ HỮU</span>'
            : `<span class="item-badge locked">◈ ${op.unlockCost} GP</span>`));

      return `
        <button class="item-card ${previewing ? 'active' : ''} ${previewing && !equipped ? 'previewing' : ''}" data-op="${op.id}">
          <div>
            <div style="font-weight:700;">${op.name}</div>
            <div class="muted">${op.role}</div>
            <div style="font-size:11px;color:#38bdf8;margin-top:2px;">PERK: ${op.perkLabel}</div>
          </div>
          ${badge}
        </button>
      `;
    }).join('');

    opList.querySelectorAll('.item-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.previewOperator = btn.dataset.op;
        soundEngine.playMetallicClick(920, 0.05, 0.2);
        sync3DShowcase();
        renderOperatorsTab();
      });
    });
  }

  const opUnlocked = u.unlocked.operators.includes(viewOpId);
  const opEquipped = u.loadout.operator === viewOpId;
  const outUnlocked = u.unlocked.outfits.includes(viewOutId);
  const outEquipped = u.loadout.outfit === viewOutId;

  if (detailBox) {
    const statusText = opEquipped
      ? '<span class="item-badge equipped">ĐANG DÙNG</span>'
      : (opUnlocked ? '<span class="item-badge previewing">ĐANG XEM • CHƯA CHỌN</span>' : `<span class="item-badge locked">XEM TRƯỚC • ${currentOp.unlockCost} GP</span>`);
    detailBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
        <div class="panel-tag" style="margin:0;">THÔNG SỐ: ${currentOp.name}</div>
        ${statusText}
      </div>
      <div style="font-size:12px;color:#facc15;font-weight:700;margin-bottom:4px;">Kỹ năng nội tại: ${currentOp.perkLabel}</div>
      <p class="muted" style="margin-bottom:10px;">${currentOp.desc}</p>
      <div class="stat-row">
        <div class="stat-label-line"><span>Giáp Chống Đạn Tối Đa</span><span>${currentOp.maxArmor} AP</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${(currentOp.maxArmor / 125) * 100}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Độ Cơ Động Di Chuyển</span><span>${Math.round(currentOp.speedMult * 100)}%</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${(currentOp.speedMult / 1.1) * 100}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Tốc Độ Thay Đạn</span><span>+${Math.round(currentOp.reloadBonus * 100)}%</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${50 + currentOp.reloadBonus * 450}%"></div></div>
      </div>
    `;
  }

  if (outfitList) {
    outfitList.innerHTML = Object.values(OUTFITS).map((o) => {
      const unlocked = u.unlocked.outfits.includes(o.id);
      const equipped = u.loadout.outfit === o.id;
      const previewing = viewOutId === o.id;
      const badge = equipped
        ? '<span class="item-badge equipped">ĐANG MẶC</span>'
        : (previewing
          ? '<span class="item-badge previewing">ĐANG XEM</span>'
          : (unlocked
            ? '<span class="item-badge owned">ĐÃ SỞ HỮU</span>'
            : `<span class="item-badge locked">◈ ${o.cost} GP</span>`));

      return `
        <button class="item-card ${previewing ? 'active' : ''} ${previewing && !equipped ? 'previewing' : ''}" data-outfit="${o.id}">
          <div style="display:flex;align-items:center;gap:9px;">
            <span style="width:16px;height:16px;border-radius:4px;background:${o.primary};border:2px solid ${o.accent};"></span>
            <strong>${o.name}</strong>
          </div>
          ${badge}
        </button>
      `;
    }).join('');

    outfitList.querySelectorAll('.item-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.previewOutfit = btn.dataset.outfit;
        soundEngine.playUiTone(820, 0.05);
        sync3DShowcase();
        renderOperatorsTab();
      });
    });
  }

  const btnActionOp = document.getElementById('btn-action-operator');
  if (btnActionOp) {
    if (!opUnlocked) {
      btnActionOp.textContent = `MUA & CHỌN ${currentOp.name} (${currentOp.unlockCost} GP)`;
    } else if (opEquipped) {
      btnActionOp.textContent = `ĐANG DÙNG ${currentOp.name}`;
    } else {
      btnActionOp.textContent = `CHỌN QUÂN NHÂN ${currentOp.name}`;
    }
  }

  const btnActionOut = document.getElementById('btn-action-outfit');
  if (btnActionOut) {
    if (!outUnlocked) {
      btnActionOut.textContent = `MUA & MẶC ${currentOut.name} (${currentOut.cost} GP)`;
    } else if (outEquipped) {
      btnActionOut.textContent = `ĐANG MẶC ${currentOut.name}`;
    } else {
      btnActionOut.textContent = `MẶC ${currentOut.name}`;
    }
  }
}

function renderArmoryTab() {
  if (!state.user) return;
  const u = state.user;
  const unlockedWeapons = u.unlocked.weapons || ['ak47', 'm4a1', 'awp', 'deagle', 'knife'];

  // 1. Subclass Filter Pills
  const pillsEl = document.getElementById('armory-subclass-tabs');
  if (pillsEl) {
    pillsEl.innerHTML = WEAPON_SUBCLASSES.map((sc) => `
      <button class="subclass-pill ${state.selectedArmorySubclass === sc.id ? 'active' : ''}" data-sc="${sc.id}">
        ${sc.label}
      </button>
    `).join('');

    pillsEl.querySelectorAll('.subclass-pill').forEach((b) => {
      b.addEventListener('click', () => {
        state.selectedArmorySubclass = b.dataset.sc;
        renderArmoryTab();
      });
    });
  }

  const wId = state.selectedArmoryWeapon;
  const gun = WEAPONS[wId] || WEAPONS.ak47;
  const curAtt = u.loadout.attachments?.[wId] || { optic: 'iron', muzzle: 'none', mag: 'standard' };
  const viewAtt = { ...curAtt, ...(state.previewWeaponAttachments[wId] || {}) };
  const eff = getEffectiveWeaponStats(wId, viewAtt, u.loadout.operator);

  // 2. Filtered Weapons List
  const gunListEl = document.getElementById('armory-weapons-list');
  if (gunListEl) {
    const guns = Object.values(WEAPONS).filter(
      (g) => state.selectedArmorySubclass === 'all' || g.subClass === state.selectedArmorySubclass
    );

    gunListEl.innerHTML = guns.map((g) => {
      const isUnlocked = unlockedWeapons.includes(g.id);
      const isEquipped = u.loadout.primary === g.id || u.loadout.secondary === g.id || (u.loadout.melee || 'knife') === g.id;
      const badge = isEquipped
        ? '<span class="item-badge equipped">TRONG BALO</span>'
        : (isUnlocked
          ? '<span class="item-badge owned">ĐÃ SỞ HỮU</span>'
          : `<span class="item-badge locked">◈ ${g.unlockCost} GP</span>`);

      return `
        <button class="item-card ${wId === g.id ? 'active' : ''}" data-gun="${g.id}">
          <div>
            <div style="font-weight:700;">${g.name}</div>
            <div class="muted">${g.typeLabel}</div>
          </div>
          ${badge}
        </button>
      `;
    }).join('');

    gunListEl.querySelectorAll('.item-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedArmoryWeapon = btn.dataset.gun;
        soundEngine.playMetallicClick(980, 0.05, 0.2);
        sync3DShowcase();
        renderArmoryTab();
      });
    });
  }

  // Equip / Unlock button state
  const equipBtn = document.getElementById('btn-equip-weapon');
  if (equipBtn) {
    const isUnlocked = unlockedWeapons.includes(wId);
    const alreadyEquipped = u.loadout.primary === wId || u.loadout.secondary === wId || (u.loadout.melee || 'knife') === wId;
    if (!isUnlocked) {
      equipBtn.textContent = `MỞ KHÓA & TRANG BỊ ${gun.name} (${gun.unlockCost} GP)`;
    } else if (alreadyEquipped) {
      equipBtn.textContent = `ĐANG TRANG BỊ ${gun.name} TRONG BALO`;
    } else {
      equipBtn.textContent = `TRANG BỊ ${gun.name} VÀO BALO`;
    }
  }

  // 3. Weapon Technical Stats
  const statsBox = document.getElementById('armory-stats-box');
  if (statsBox) {
    const totalDmg = eff.damage * (eff.pellets || 1);
    const headDmg = Math.round(eff.damage * eff.headMult);
    const ctrlPct = Math.max(45, Math.min(98, Math.round(100 - eff.recoilPitch * 1650)));

    statsBox.innerHTML = `
      <p class="muted" style="margin-bottom:8px;">${gun.desc}</p>
      <div class="stat-row">
        <div class="stat-label-line"><span>Sát Thương Cơ Bản / Headshot</span><span>${totalDmg} / ${headDmg}</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${Math.min(100, (totalDmg / 132) * 100)}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Tốc Độ Bắn</span><span>${eff.rpm} RPM</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${Math.min(100, (eff.rpm / 1060) * 100)}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Độ Ổn Định & Kiểm Soát Giật</span><span>${ctrlPct}%</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${ctrlPct}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Tầm Bắn Hiệu Quả</span><span>${Math.round(eff.range)}m</span></div>
        <div class="stat-track"><div class="stat-fill" style="width:${Math.min(100, (eff.range / 260) * 100)}%"></div></div>
      </div>
      <div class="stat-row">
        <div class="stat-label-line"><span>Băng Đạn & Nạp Đạn</span><span>${eff.isMelee ? 'Cận chiến vô hạn' : `${eff.magSize} viên • ${eff.reloadTimeSec.toFixed(1)}s`}</span></div>
      </div>
    `;
  }

  // 4. Attachments Selector (Preview before Buy / Install)
  const attBox = document.getElementById('armory-attachments-box');
  if (attBox) {
    if (gun.isMelee) {
      attBox.innerHTML = `<div class="muted">Vũ khí cận chiến không sử dụng ống ngắm / băng đạn. Bạn có thể chọn Skin bên dưới!</div>`;
    } else {
      const slots = gun.isSniper
        ? [{ key: 'mag', label: 'Băng Đạn' }]
        : [
            { key: 'optic', label: 'Ống Ngắm' },
            { key: 'muzzle', label: 'Đầu Nòng' },
            { key: 'mag', label: 'Băng Đạn' }
          ];

      const sel = (state.previewAttachmentSelection?.weaponId === wId && slots.some((s) => s.key === state.previewAttachmentSelection.slot))
        ? state.previewAttachmentSelection
        : { weaponId: wId, slot: slots[0].key, itemId: viewAtt[slots[0].key] || Object.keys(ATTACHMENTS[slots[0].key])[0] };

      const selAtt = ATTACHMENTS[sel.slot]?.[sel.itemId];
      const selUnlockKey = `${sel.slot}:${sel.itemId}`;
      const selUnlocked = u.unlocked.attachments.includes(selUnlockKey);
      const selEquipped = curAtt[sel.slot] === sel.itemId;
      const hasAttPreviewDiff = slots.some((s) => viewAtt[s.key] !== curAtt[s.key]);

      const actionLabel = !selUnlocked
        ? `MUA & LẮP ${selAtt.name} (${selAtt.cost} GP)`
        : (selEquipped ? `ĐANG LẮP ${selAtt.name}` : `LẮP ${selAtt.name}`);

      attBox.innerHTML = `
        <div class="preview-action-bar">
          <div class="preview-action-title">
            <span>Đang xem: <strong style="color:#38bdf8;">${selAtt?.name || ''}</strong></span>
            ${hasAttPreviewDiff ? '<button type="button" id="btn-reset-att-preview" class="voice-toggle-btn">↺ Hoàn tác xem</button>' : ''}
          </div>
          <button type="button" id="btn-confirm-attachment" class="${!selUnlocked || !selEquipped ? 'btn-primary' : 'btn-secondary'} btn-sm full-w">${actionLabel}</button>
        </div>
        ${slots.map((s) => {
          const items = Object.values(ATTACHMENTS[s.key]);
          return `
            <div style="margin-bottom:9px;">
              <div class="muted" style="margin-bottom:4px;font-weight:600;">${s.label}</div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">
                ${items.map((it) => {
                  const unlockKey = `${s.key}:${it.id}`;
                  const unlocked = u.unlocked.attachments.includes(unlockKey);
                  const active = curAtt[s.key] === it.id;
                  const previewing = viewAtt[s.key] === it.id;
                  const tagText = active
                    ? 'Đang lắp'
                    : (previewing ? 'Đang xem' : (unlocked ? 'Đã có' : `${it.cost} GP`));
                  return `
                    <button class="hud-slot-btn ${previewing ? 'active' : ''}" data-slot="${s.key}" data-item="${it.id}">
                      ${it.name}<br/>
                      <span style="font-size:10px;color:${active ? '#4ade80' : (previewing ? '#38bdf8' : '#facc15')};">${tagText}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      `;

      attBox.querySelectorAll('button[data-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const slot = btn.dataset.slot;
          const itemId = btn.dataset.item;
          if (!state.previewWeaponAttachments[wId]) state.previewWeaponAttachments[wId] = {};
          state.previewWeaponAttachments[wId][slot] = itemId;
          state.previewAttachmentSelection = { weaponId: wId, slot, itemId };
          soundEngine.playMetallicClick(1020, 0.05, 0.2);
          sync3DShowcase();
          renderArmoryTab();
        });
      });

      attBox.querySelector('#btn-reset-att-preview')?.addEventListener('click', () => {
        delete state.previewWeaponAttachments[wId];
        state.previewAttachmentSelection = null;
        sync3DShowcase();
        renderArmoryTab();
      });

      attBox.querySelector('#btn-confirm-attachment')?.addEventListener('click', async () => {
        if (!selAtt) return;
        if (curAtt[sel.slot] === sel.itemId) return showToast(`Đang lắp sẵn ${selAtt.name} trên ${gun.name}!`);
        if (!u.unlocked.attachments.includes(selUnlockKey)) {
          const un = await apiCall('/api/unlock', 'POST', { category: 'attachment', slot: sel.slot, itemId: sel.itemId });
          if (un.error) return showToast(un.error);
          state.user = un.user;
        }
        const eq = await apiCall('/api/loadout', 'POST', {
          weaponAttachment: { weaponId: wId, slot: sel.slot, itemId: sel.itemId }
        });
        if (eq.user) {
          if (state.previewWeaponAttachments[wId]) delete state.previewWeaponAttachments[wId][sel.slot];
          updateUserData(eq.user, `Đã lắp ${selAtt.name} cho ${gun.name}!`);
        }
      });
    }
  }

  // 5. Weapon Skins Selector (Preview before Buy / Apply)
  const skinList = document.getElementById('armory-skins-list');
  if (skinList) {
    const activeSkin = u.loadout.skins?.[wId] || 'default';
    const viewSkinId = state.previewWeaponSkins[wId] || activeSkin;
    const viewSk = WEAPON_SKINS[viewSkinId] || WEAPON_SKINS.default;
    const viewSkUnlocked = u.unlocked.skins.includes(viewSkinId);
    const viewSkEquipped = activeSkin === viewSkinId;

    const skinActionText = !viewSkUnlocked
      ? `MUA & ÁP DỤNG ${viewSk.name} (${viewSk.cost} GP)`
      : (viewSkEquipped ? `ĐANG DÙNG ${viewSk.name}` : `ÁP DỤNG SKIN ${viewSk.name}`);

    skinList.innerHTML = `
      <div class="preview-action-bar">
        <div class="preview-action-title">
          <span>Skin đang xem: <strong style="color:${viewSk.rarityColor || '#38bdf8'};">${viewSk.name}</strong></span>
          ${!viewSkEquipped ? '<button type="button" id="btn-reset-skin-preview" class="voice-toggle-btn">↺ Hoàn tác</button>' : ''}
        </div>
        <button type="button" id="btn-confirm-skin" class="${!viewSkUnlocked || !viewSkEquipped ? 'btn-primary' : 'btn-secondary'} btn-sm full-w">${skinActionText}</button>
      </div>
      ${Object.values(WEAPON_SKINS).map((sk) => {
        const unlocked = u.unlocked.skins.includes(sk.id);
        const equipped = activeSkin === sk.id;
        const previewing = viewSkinId === sk.id;
        const badge = equipped
          ? '<span class="item-badge equipped">ĐANG DÙNG</span>'
          : (previewing
            ? '<span class="item-badge previewing">ĐANG XEM</span>'
            : (unlocked ? '<span class="item-badge owned">ĐÃ SỞ HỮU</span>' : `<span class="item-badge locked">◈ ${sk.cost} GP</span>`));

        return `
          <button class="item-card ${previewing ? 'active' : ''} ${previewing && !equipped ? 'previewing' : ''}" data-skin="${sk.id}">
            <div style="display:flex;align-items:center;gap:9px;">
              <span style="width:16px;height:16px;border-radius:4px;background:${sk.bodyColor};border:2px solid ${sk.accentColor};"></span>
              <div>
                <div style="font-weight:700;">${sk.name}</div>
                <div class="muted" style="color:${sk.rarityColor || '#94a3b8'};">${sk.rarity}</div>
              </div>
            </div>
            ${badge}
          </button>
        `;
      }).join('')}
    `;

    skinList.querySelectorAll('.item-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.previewWeaponSkins[wId] = btn.dataset.skin;
        soundEngine.playUiTone(880, 0.05);
        sync3DShowcase();
        renderArmoryTab();
      });
    });

    skinList.querySelector('#btn-reset-skin-preview')?.addEventListener('click', () => {
      delete state.previewWeaponSkins[wId];
      sync3DShowcase();
      renderArmoryTab();
    });

    skinList.querySelector('#btn-confirm-skin')?.addEventListener('click', async () => {
      if (activeSkin === viewSkinId) return showToast(`Đang dùng sẵn skin ${viewSk.name}!`);
      if (!u.unlocked.skins.includes(viewSkinId)) {
        const un = await apiCall('/api/unlock', 'POST', { category: 'skin', itemId: viewSkinId });
        if (un.error) return showToast(un.error);
        state.user = un.user;
      }
      const eq = await apiCall('/api/loadout', 'POST', {
        weaponSkin: { weaponId: wId, skinId: viewSkinId }
      });
      if (eq.user) {
        delete state.previewWeaponSkins[wId];
        updateUserData(eq.user, `Đã trang bị skin ${viewSk.name}!`);
      }
    });
  }
}

function renderInGameBuyModal() {
  const grid = document.getElementById('ingame-buy-grid');
  if (!grid) return;
  const unlocked = state.user?.unlocked?.weapons || ['ak47', 'm4a1', 'awp', 'deagle', 'knife'];
  const selectable = Object.values(WEAPONS).filter(
    (w) => (w.category === 'primary' || w.category === 'secondary' || w.category === 'melee') && (unlocked.includes(w.id) || state.currentRoom?.mode === 'practice')
  );

  grid.innerHTML = selectable.map((w) => `
    <button class="buy-gun-card" data-gun="${w.id}">
      <strong>${w.name} <span style="color:#38bdf8;font-size:11px;">[${w.subClass.toUpperCase()}]</span></strong>
      <span>Sát thương: ${w.damage * (w.pellets || 1)} • ${w.rpm} RPM • Băng: ${w.magSize} viên</span>
    </button>
  `).join('');

  grid.querySelectorAll('.buy-gun-card').forEach((card) => {
    card.addEventListener('click', () => {
      net.send({ type: 'change_primary', primaryId: card.dataset.gun });
      fpsClient.toggleBuyWeaponModal(false);
    });
  });
}

function updateUserData(user, toastMsg = '') {
  state.user = user;
  net.updateUserContext(user);
  soundEngine.playUiTone(820, 0.08);
  refreshProfileUI();
  sync3DShowcase();
  renderOperatorsTab();
  renderArmoryTab();
  renderInGameBuyModal();
  if (toastMsg) showToast(toastMsg);
}

// ============================================================================
// 3. FRIENDS, REQUESTS, PLAYER PROFILES & SQUAD INVITE SYSTEM
// ============================================================================
function startFriendsPolling() {
  if (friendsPollTimer) clearInterval(friendsPollTimer);
  fetchFriendsStatus();
  friendsPollTimer = setInterval(fetchFriendsStatus, 3500);
}

function updateFriendsNotifBadge() {
  const badge = document.getElementById('friends-badge');
  if (!badge) return;
  const count = (state.incomingRequests?.length || 0);
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function fetchFriendsStatus() {
  if (!state.token || fpsClient.active) return;
  try {
    const res = await apiCall('/api/friends');
    if (res.friends) state.friendsList = res.friends;
    if (res.incomingRequests) state.incomingRequests = res.incomingRequests;
    const searchVal = document.getElementById('add-friend-input')?.value?.trim() || '';
    if (!searchVal && res.onlinePlayers) state.onlinePlayers = res.onlinePlayers;
    updateFriendsNotifBadge();
    renderFriendsDrawerContent();
    if (res.pendingInvite && res.pendingInvite.id !== lastShownInviteId) {
      lastShownInviteId = res.pendingInvite.id;
      showSquadInvitePopup(res.pendingInvite);
    }
  } catch {}
}

async function sendSquadInviteSmart(targetUsername) {
  if (!targetUsername) return;
  // If already in a room, invite straight away; if in lobby, auto-create a room and invite immediately!
  if (!state.currentRoom?.code) {
    state.pendingInviteTarget = targetUsername;
    soundEngine.ensureContext();
    const mode = state.selectedQuickMode === 'practice' ? 'tdm' : (state.selectedQuickMode || 'tdm');
    const mapId = state.selectedQuickMap || 'warehouse';
    net.send({
      type: 'create_room',
      name: `Tổ Đội của ${state.user?.username || 'Chiến Binh'}`,
      mode,
      mapId,
      maxPlayers: mode === 'survival' ? 50 : 10,
      fillBots: true,
      botDifficulty: 'normal'
    });
    showToast(`Đang mở phòng tổ đội và gửi lời mời tới ${targetUsername}...`);
    return;
  }

  const res = await apiCall('/api/friends/invite', 'POST', {
    targetUsername,
    roomCode: state.currentRoom.code,
    modeName: state.currentRoom.modeConfig?.shortName || 'Đấu Đội',
    mapName: state.currentRoom.mapName || 'Nhà Kho'
  });
  if (res?.error) return showToast(res.error);
  if (res?.ok) showToast(`Đã gửi lời mời vào phòng #${state.currentRoom.code} tới ${targetUsername}!`);
}

async function openPlayerProfile(identifier) {
  if (!identifier) return;
  const modal = document.getElementById('player-profile-modal');
  const body = document.getElementById('player-profile-body');
  if (!modal || !body) return;
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="muted" style="padding:24px;text-align:center;">Đang tải hồ sơ chiến binh...</div>';

  try {
    const res = await apiCall(`/api/players/profile/${encodeURIComponent(identifier)}`);
    if (res?.error || !res?.profile) {
      body.innerHTML = `<div class="muted" style="padding:20px;text-align:center;">${escapeHtml(res?.error || 'Không tìm thấy hồ sơ.')}</div>`;
      return;
    }
    const p = res.profile;
    const st = p.stats || {};
    const kd = (st.deaths || 0) > 0 ? ((st.kills || 0) / st.deaths).toFixed(2) : String(st.kills || 0);
    const winRate = (st.matches || 0) > 0 ? Math.round(((st.wins || 0) / st.matches) * 100) : 0;
    const hsRate = (st.kills || 0) > 0 ? Math.round(((st.headshots || 0) / st.kills) * 100) : 0;
    const opName = OPERATORS[p.loadout?.operator]?.name || 'VANGUARD';
    const priName = WEAPONS[p.loadout?.primary]?.name || 'AK-47';
    const secName = WEAPONS[p.loadout?.secondary]?.name || 'Desert Eagle';
    const statusText = p.isRivalBot
      ? '<span class="muted">BOT • Chiến Binh AI Huyền Thoại</span>'
      : (p.online
        ? `<span style="color:#4ade80;font-weight:700;">● Đang Online ${p.roomCode ? `• Phòng #${escapeHtml(p.roomCode)}` : '• Sảnh Chính'}</span>`
        : '<span class="muted">○ Ngoại tuyến</span>');

    const actionHtml = [];
    if (p.relationship === 'self') {
      actionHtml.push(`<button class="btn-secondary btn-sm" id="prof-copy-code" data-code="${escapeHtml(p.friendCode)}">Copy Mã Kết Bạn (${escapeHtml(p.friendCode)})</button>`);
    } else if (!p.isRivalBot) {
      if (p.relationship === 'none') {
        actionHtml.push(`<button class="btn-primary btn-sm" id="prof-add-friend" data-user="${escapeHtml(p.username)}">+ Gửi Lời Mời Kết Bạn</button>`);
      } else if (p.relationship === 'outgoing_request') {
        actionHtml.push(`<button class="btn-secondary btn-sm" disabled>Đã Gửi Lời Mời Kết Bạn</button>`);
      } else if (p.relationship === 'incoming_request') {
        actionHtml.push(`<button class="btn-primary btn-sm" id="prof-accept-req" data-user="${escapeHtml(p.username)}">Chấp Nhận Kết Bạn</button>`);
        actionHtml.push(`<button class="btn-secondary btn-sm" id="prof-decline-req" data-user="${escapeHtml(p.username)}">Từ Chối</button>`);
      } else if (p.relationship === 'friend') {
        actionHtml.push(`<button class="btn-secondary btn-sm" id="prof-remove-friend" data-user="${escapeHtml(p.username)}" style="color:#fca5a5;">Xóa Bạn</button>`);
      }

      if (p.online) {
        actionHtml.push(`<button class="btn-primary btn-sm" id="prof-invite-squad" data-user="${escapeHtml(p.username)}">Mời Đấu Chung</button>`);
      }
      if (p.roomCode && p.roomCode !== state.currentRoom?.code) {
        actionHtml.push(`<button class="btn-secondary btn-sm" id="prof-join-room" data-room="${escapeHtml(p.roomCode)}">Vào Phòng #${escapeHtml(p.roomCode)}</button>`);
      }
    }

    const histHtml = (p.history || []).length
      ? p.history.slice(0, 6).map((h) => `
          <div class="history-row ${h.won ? 'win' : 'loss'}">
            <div>
              <strong>${h.won ? 'THẮNG' : 'BẠI'}</strong> • ${escapeHtml(h.mapName || 'Đấu Trường')}
              <div class="muted">K/D: ${h.kills || 0}/${h.deaths || 0} • HS: ${h.headshots || 0}</div>
            </div>
            <div style="text-align:right;font-size:12px;">
              <div style="color:${(h.rpDelta || 0) >= 0 ? '#4ade80' : '#f87171'};font-weight:700;">${(h.rpDelta || 0) >= 0 ? '+' : ''}${h.rpDelta || 0} RP</div>
            </div>
          </div>
        `).join('')
      : '<div class="muted" style="font-size:12px;padding:6px 0;">Chưa có lịch sử trận đấu gần đây.</div>';

    body.innerHTML = `
      <div class="profile-hero">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="profile-avatar-badge" style="border-color:${p.rank?.color || '#38bdf8'};">
            ${escapeHtml(p.rank?.icon || 'II')}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:20px;color:#fff;">${escapeHtml(p.username)}</strong>
              <span class="mode-pill" style="color:${p.rank?.color || '#38bdf8'};">${escapeHtml(p.rank?.name || 'Bạc')} • ${p.rp || 1200} RP</span>
            </div>
            <div class="muted" style="font-size:12px;margin-top:3px;">Cấp ${p.level || 1} • Mã: <strong style="color:#facc15;">${escapeHtml(p.friendCode || '---')}</strong></div>
            <div style="font-size:12px;margin-top:3px;">${statusText}</div>
          </div>
        </div>
      </div>

      <div class="profile-kpi-grid">
        <div class="profile-kpi">
          <div class="profile-kpi-val" style="color:#38bdf8;">${kd}</div>
          <div class="profile-kpi-lbl">Tỉ Lệ K/D</div>
        </div>
        <div class="profile-kpi">
          <div class="profile-kpi-val" style="color:#4ade80;">${winRate}%</div>
          <div class="profile-kpi-lbl">Tỉ Lệ Thắng (${st.wins || 0}/${st.matches || 0})</div>
        </div>
        <div class="profile-kpi">
          <div class="profile-kpi-val" style="color:#f59e0b;">${hsRate}%</div>
          <div class="profile-kpi-lbl">Headshot (${st.headshots || 0})</div>
        </div>
        <div class="profile-kpi">
          <div class="profile-kpi-val">${st.kills || 0}</div>
          <div class="profile-kpi-lbl">Tổng Hạ Gục</div>
        </div>
      </div>

      <div class="panel-tag">TRANG BỊ HIỆN TẠI</div>
      <div class="profile-loadout-row">
        <div class="profile-loadout-chip"><span class="muted">Nhân vật:</span><br><strong>${escapeHtml(opName)}</strong></div>
        <div class="profile-loadout-chip"><span class="muted">Súng chính:</span><br><strong>${escapeHtml(priName)}</strong></div>
        <div class="profile-loadout-chip"><span class="muted">Súng phụ:</span><br><strong>${escapeHtml(secName)}</strong></div>
      </div>

      <div class="panel-tag">LỊCH SỬ TRẬN GẦN ĐÂY</div>
      <div class="history-list" style="max-height:175px;overflow-y:auto;">${histHtml}</div>

      <div class="profile-actions-bar">${actionHtml.join('')}</div>
    `;

    body.querySelector('#prof-copy-code')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText(e.currentTarget.dataset.code || '');
      showToast(`Đã copy mã kết bạn: ${e.currentTarget.dataset.code}`);
    });
    body.querySelector('#prof-add-friend')?.addEventListener('click', async (e) => {
      const uname = e.currentTarget.dataset.user;
      const r = await apiCall('/api/friends/add', 'POST', { query: uname });
      if (r?.error) return showToast(r.error);
      showToast(r.acceptedImmediately ? `Đã trở thành bạn bè với ${uname}!` : `Đã gửi lời mời kết bạn tới ${uname}!`);
      fetchFriendsStatus();
      openPlayerProfile(uname);
    });
    body.querySelector('#prof-accept-req')?.addEventListener('click', async (e) => {
      const uname = e.currentTarget.dataset.user;
      const r = await apiCall('/api/friends/respond', 'POST', { username: uname, accept: true });
      if (r?.ok) {
        showToast(`Đã chấp nhận kết bạn với ${uname}!`);
        fetchFriendsStatus();
        openPlayerProfile(uname);
      }
    });
    body.querySelector('#prof-decline-req')?.addEventListener('click', async (e) => {
      const uname = e.currentTarget.dataset.user;
      const r = await apiCall('/api/friends/respond', 'POST', { username: uname, accept: false });
      if (r?.ok) {
        showToast(`Đã từ chối lời mời của ${uname}.`);
        fetchFriendsStatus();
        openPlayerProfile(uname);
      }
    });
    body.querySelector('#prof-remove-friend')?.addEventListener('click', async (e) => {
      const uname = e.currentTarget.dataset.user;
      const r = await apiCall('/api/friends/remove', 'POST', { username: uname });
      if (r?.ok) {
        showToast(`Đã xóa ${uname} khỏi danh sách bạn bè.`);
        fetchFriendsStatus();
        openPlayerProfile(uname);
      }
    });
    body.querySelector('#prof-invite-squad')?.addEventListener('click', async (e) => {
      const uname = e.currentTarget.dataset.user;
      modal.classList.add('hidden');
      await sendSquadInviteSmart(uname);
    });
    body.querySelector('#prof-join-room')?.addEventListener('click', (e) => {
      const code = e.currentTarget.dataset.room;
      modal.classList.add('hidden');
      document.getElementById('friends-drawer')?.classList.add('hidden');
      joinRoomByCode(code);
    });
  } catch {
    body.innerHTML = '<div class="muted" style="padding:20px;text-align:center;">Lỗi tải hồ sơ chiến binh.</div>';
  }
}

function renderFriendsDrawerContent() {
  renderIncomingRequests();
  renderFriendsList();
  renderOnlinePlayersList();
}

function renderIncomingRequests() {
  const sec = document.getElementById('friend-requests-section');
  const box = document.getElementById('friend-requests-box');
  if (!sec || !box) return;
  const reqs = state.incomingRequests || [];
  if (!reqs.length) {
    sec.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  sec.classList.remove('hidden');
  box.innerHTML = reqs.map((r) => `
    <div class="roster-slot">
      <div>
        <strong class="profile-name-link" data-open-profile="${escapeHtml(r.from)}">${escapeHtml(r.from)}</strong>
        <div class="muted" style="font-size:11px;">${escapeHtml(r.rank?.name || 'Bạc')} • Cấp ${r.level || 1}</div>
      </div>
      <div class="row-gap">
        <button class="btn-primary btn-xs" data-accept-req="${escapeHtml(r.from)}">Đồng Ý</button>
        <button class="btn-secondary btn-xs" data-decline-req="${escapeHtml(r.from)}" aria-label="Từ chối">${ICON_CLOSE_SVG}</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-open-profile]').forEach((el) => {
    el.addEventListener('click', () => openPlayerProfile(el.dataset.openProfile));
  });
  box.querySelectorAll('button[data-accept-req]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await apiCall('/api/friends/respond', 'POST', { username: b.dataset.acceptReq, accept: true });
      if (r?.ok) {
        showToast(`Đã kết bạn với ${b.dataset.acceptReq}!`);
        fetchFriendsStatus();
      }
    });
  });
  box.querySelectorAll('button[data-decline-req]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await apiCall('/api/friends/respond', 'POST', { username: b.dataset.declineReq, accept: false });
      if (r?.ok) fetchFriendsStatus();
    });
  });
}

function renderFriendsList() {
  const box = document.getElementById('friends-list-box');
  const countLbl = document.getElementById('friends-count-lbl');
  if (countLbl) countLbl.textContent = String(state.friendsList.length || 0);
  if (!box) return;
  if (!state.friendsList.length) {
    box.innerHTML = `<div class="muted" style="padding:8px 0;font-size:12px;">Chưa có bạn bè. Bấm vào chiến binh Online bên dưới hoặc nhập tên/mã VN-xxxx để kết bạn!</div>`;
    return;
  }

  box.innerHTML = state.friendsList.map((f) => {
    const statusHtml = f.online
      ? `<span style="color:#4ade80;font-size:11px;">● Online ${f.roomCode ? `(Phòng #${escapeHtml(f.roomCode)})` : ''}</span>`
      : `<span class="muted" style="font-size:11px;">○ Ngoại tuyến</span>`;

    const actionBtns = [`<button class="btn-secondary btn-xs" data-open-profile="${escapeHtml(f.username)}" title="Xem Hồ Sơ">${ICON_USER_SVG}</button>`];
    if (f.roomCode && f.roomCode !== state.currentRoom?.code) {
      actionBtns.push(`<button class="btn-primary btn-xs" data-join-friend="${escapeHtml(f.roomCode)}">Vào Chung</button>`);
    }
    if (f.online) {
      actionBtns.push(`<button class="btn-secondary btn-xs" data-invite-friend="${escapeHtml(f.username)}">Mời Đấu</button>`);
    }

    return `
      <div class="roster-slot">
        <div>
          <strong class="profile-name-link" data-open-profile="${escapeHtml(f.username)}">${escapeHtml(f.username)}</strong>
          <span style="color:${f.rank?.color || '#94a3b8'};font-size:10.5px;margin-left:4px;">${escapeHtml(f.rank?.icon || '')}</span>
          <div>${statusHtml}</div>
        </div>
        <div class="row-gap">${actionBtns.join('')}</div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-open-profile]').forEach((el) => {
    el.addEventListener('click', () => openPlayerProfile(el.dataset.openProfile));
  });
  box.querySelectorAll('button[data-join-friend]').forEach((b) => {
    b.addEventListener('click', () => {
      joinRoomByCode(b.dataset.joinFriend);
      document.getElementById('friends-drawer')?.classList.add('hidden');
    });
  });
  box.querySelectorAll('button[data-invite-friend]').forEach((b) => {
    b.addEventListener('click', () => sendSquadInviteSmart(b.dataset.inviteFriend));
  });
}

function renderOnlinePlayersList() {
  const box = document.getElementById('online-players-box');
  if (!box) return;
  const list = state.onlinePlayers || [];
  if (!list.length) {
    box.innerHTML = '<div class="muted" style="padding:6px 0;font-size:12px;">Không có người chơi nào khác đang trực tuyến.</div>';
    return;
  }
  box.innerHTML = list.map((p) => {
    let relBtn = `<button class="btn-primary btn-xs" data-quick-add="${escapeHtml(p.username)}">+ Kết Bạn</button>`;
    if (p.relationship === 'friend') relBtn = '<span class="muted" style="font-size:11px;">Bạn bè</span>';
    else if (p.relationship === 'outgoing_request') relBtn = '<span class="muted" style="font-size:11px;">Đã gửi</span>';
    else if (p.relationship === 'incoming_request') relBtn = `<button class="btn-primary btn-xs" data-accept-req="${escapeHtml(p.username)}">Đồng Ý</button>`;
    return `
      <div class="roster-slot">
        <div>
          <strong class="profile-name-link" data-open-profile="${escapeHtml(p.username)}">${escapeHtml(p.username)}</strong>
          <div class="muted" style="font-size:11px;">
            <span style="color:${p.online ? '#4ade80' : '#94a3b8'};">${p.online ? '● Online' : '○ Offline'}</span> • ${escapeHtml(p.rank?.name || 'Bạc')}
          </div>
        </div>
        <div class="row-gap">
          <button class="btn-secondary btn-xs" data-open-profile="${escapeHtml(p.username)}" title="Xem Hồ Sơ">${ICON_USER_SVG}</button>
          ${relBtn}
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-open-profile]').forEach((el) => {
    el.addEventListener('click', () => openPlayerProfile(el.dataset.openProfile));
  });
  box.querySelectorAll('button[data-quick-add]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await apiCall('/api/friends/add', 'POST', { query: b.dataset.quickAdd });
      if (r?.error) return showToast(r.error);
      showToast(r.acceptedImmediately ? `Đã kết bạn với ${b.dataset.quickAdd}!` : `Đã gửi lời mời kết bạn tới ${b.dataset.quickAdd}!`);
      fetchFriendsStatus();
    });
  });
  box.querySelectorAll('button[data-accept-req]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await apiCall('/api/friends/respond', 'POST', { username: b.dataset.acceptReq, accept: true });
      if (r?.ok) {
        showToast(`Đã kết bạn với ${b.dataset.acceptReq}!`);
        fetchFriendsStatus();
      }
    });
  });
}

function showSquadInvitePopup(invite) {
  const popup = document.getElementById('invite-popup');
  const desc = document.getElementById('invite-desc');
  if (!popup || !desc) return;
  soundEngine.playUiTone(920, 0.14);
  desc.innerHTML = `<strong class="profile-name-link" id="invite-sender-link">${escapeHtml(invite.fromName)}</strong> mời bạn vào phòng <strong>#${escapeHtml(invite.roomCode)}</strong> (${escapeHtml(invite.modeName)} - ${escapeHtml(invite.mapName)})`;
  popup.classList.remove('hidden');

  document.getElementById('invite-sender-link')?.addEventListener('click', () => openPlayerProfile(invite.fromName));
  document.getElementById('btn-accept-invite').onclick = () => {
    popup.classList.add('hidden');
    apiCall('/api/friends/dismiss-invite', 'POST');
    joinRoomByCode(invite.roomCode);
  };
  document.getElementById('btn-decline-invite').onclick = () => {
    popup.classList.add('hidden');
    apiCall('/api/friends/dismiss-invite', 'POST');
  };
}

function joinRoomByCode(rawCode) {
  const code = String(rawCode || '').replace(/[^A-Za-z0-9_]/g, '').trim().toUpperCase();
  if (!code) return showToast('Vui lòng nhập Mã Phòng hợp lệ (VD: BS1001).');
  soundEngine.ensureContext();
  net.send({ type: 'join_room', roomCode: code, roomId: code });
}

// ============================================================================
// 4. ROOM BROWSER & WAITING ROOM LOBBY
// ============================================================================
function renderRoomsTable() {
  const tbody = document.getElementById('rooms-table-body');
  if (!tbody) return;

  if (!state.roomsList.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">Chưa có phòng đang mở. Hãy bấm "+ Tạo Phòng Cùng Bạn Bè" để nhận Mã Phòng ngay!</td></tr>`;
    return;
  }

  tbody.innerHTML = state.roomsList.map((r) => {
    const code = r.code || r.id;
    const statusBadge = r.status === 'playing'
      ? '<span style="color:#f97316;font-weight:700;">● Đang Chiến Đấu</span>'
      : '<span style="color:#4ade80;font-weight:700;">● Đang Chờ</span>';
    return `
      <tr>
        <td><strong style="color:#facc15;font-family:var(--font-display);">#${escapeHtml(code)}</strong></td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td><span class="mode-pill">${escapeHtml(r.modeName)}</span></td>
        <td>${escapeHtml(r.mapName)}</td>
        <td>${r.humans} Người ${r.fillBots ? '+ AI Bot' : ''} / ${r.maxPlayers}</td>
        <td>${statusBadge}</td>
        <td><button class="btn-primary btn-sm" data-join="${escapeHtml(code)}">VÀO PHÒNG</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('button[data-join]').forEach((btn) => {
    btn.addEventListener('click', () => joinRoomByCode(btn.dataset.join));
  });
}

function updateRoomTabPanels() {
  const browser = document.getElementById('room-browser-panel');
  const waiting = document.getElementById('room-waiting-panel');
  if (!browser || !waiting) return;

  if (state.currentRoom) {
    browser.classList.add('hidden');
    waiting.classList.remove('hidden');
    renderWaitingRoom(state.currentRoom);
  } else {
    browser.classList.remove('hidden');
    waiting.classList.add('hidden');
    renderRoomsTable();
  }
}

function renderWaitingRoom(room) {
  const isSolo = !room.modeConfig?.teamBased || room.maxPlayers === 2;
  document.getElementById('room-lobby-badge').textContent = room.maxPlayers === 2
    ? 'SOLO 1v1'
    : (room.modeConfig?.shortName || room.mode);
  document.getElementById('room-lobby-title').textContent = `${room.name} — ${room.mapName}`;
  document.getElementById('room-lobby-code').textContent = `#${room.code || room.id}`;

  const isHost = room.hostId === net.clientId;
  const modeSel = document.getElementById('room-edit-mode');
  const mapSel = document.getElementById('room-edit-map');
  const maxSel = document.getElementById('room-edit-max');
  const diffSel = document.getElementById('room-edit-botdiff');
  const fillChk = document.getElementById('room-edit-fillbots');
  const startBtn = document.getElementById('btn-start-match');
  const switchTeamBtn = document.getElementById('btn-switch-team');

  if (modeSel) { modeSel.value = room.mode; modeSel.disabled = !isHost; }
  if (mapSel) { mapSel.value = room.mapId; mapSel.disabled = !isHost; }
  if (maxSel) { maxSel.value = String(room.maxPlayers || 10); maxSel.disabled = !isHost; }
  if (diffSel) { diffSel.value = room.botDifficulty; diffSel.disabled = !isHost; }
  if (fillChk) { fillChk.checked = room.fillBots; fillChk.disabled = !isHost; }
  if (switchTeamBtn) {
    switchTeamBtn.style.display = room.modeConfig?.teamBased ? 'inline-block' : 'none';
  }
  if (startBtn) {
    startBtn.disabled = !isHost;
    startBtn.textContent = isHost ? 'BẮT ĐẦU TRẬN ĐẤU' : 'Đang chờ Chủ phòng bắt đầu...';
  }

  const alphaContainer = document.getElementById('room-team-alpha');
  const bravoContainer = document.getElementById('room-team-bravo');
  const players = (room.players || []).filter((p) => !p.isBot && !String(p.id || '').startsWith('bot_'));

  const renderSlot = (p) => {
    const canKick = isHost && p.id !== room.hostId && p.id !== net.clientId;
    return `
      <div class="roster-slot">
        <div>
          <strong class="profile-name-link" data-open-profile="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong>
          ${p.id === room.hostId ? '<span class="host-tag">HOST</span>' : ''}
          <div class="muted">${OPERATORS[p.operator]?.name || 'VANGUARD'} • ${WEAPONS[p.primary]?.name || 'AK-47'}</div>
        </div>
        <div class="row-gap">
          <span class="mode-pill">${p.rank?.name || 'Bạc'}</span>
          ${canKick ? `<button class="btn-secondary btn-xs" data-kick-id="${escapeHtml(p.id)}" title="Mời khỏi phòng" style="color:#fca5a5;">${ICON_CLOSE_SVG}</button>` : ''}
        </div>
      </div>
    `;
  };

  if (room.modeConfig?.teamBased) {
    const perTeam = Math.max(1, Math.floor((room.maxPlayers || 10) / 2));
    const alphas = players.filter((p) => p.team === 'alpha');
    const bravos = players.filter((p) => p.team === 'bravo');
    alphaContainer.innerHTML = alphas.map(renderSlot).join('') +
      (room.fillBots && alphas.length < perTeam ? `<div class="roster-slot empty">+ ${perTeam - alphas.length} vị trí sẽ được AI Bot hỗ trợ</div>` : '');
    bravoContainer.innerHTML = bravos.map(renderSlot).join('') +
      (room.fillBots && bravos.length < perTeam ? `<div class="roster-slot empty">+ ${perTeam - bravos.length} vị trí sẽ được AI Bot hỗ trợ</div>` : '');
  } else {
    const half = Math.ceil(players.length / 2);
    const botSlots = Math.max(0, (room.maxPlayers || 8) - players.length);
    alphaContainer.innerHTML = players.slice(0, half).map(renderSlot).join('');
    bravoContainer.innerHTML = players.slice(half).map(renderSlot).join('') +
      (room.fillBots && botSlots > 0 ? `<div class="roster-slot empty">Chế độ Solo (${room.maxPlayers} người) — +${botSlots} AI Bot khi bắt đầu</div>` : '');
  }

  [alphaContainer, bravoContainer].forEach((container) => {
    container?.querySelectorAll('[data-open-profile]').forEach((el) => {
      el.addEventListener('click', () => openPlayerProfile(el.dataset.openProfile));
    });
    container?.querySelectorAll('button[data-kick-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        net.send({ type: 'kick_player', targetId: btn.dataset.kickId });
      });
    });
  });

  const chatEl = document.getElementById('room-chat-log');
  if (chatEl && room.chat) {
    chatEl.innerHTML = room.chat.map((m) => `
      <div class="chat-line ${m.team === 'system' ? 'sys' : ''}">
        <span class="sender">[${escapeHtml(m.senderName)}]:</span> ${escapeHtml(m.text)}
      </div>
    `).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

// ============================================================================
// 5. RANKED LEADERBOARD & CAREER PROFILE
// ============================================================================
async function loadRankedLeaderboard() {
  const profileRes = await apiCall('/api/profile');
  if (profileRes.user) {
    state.user = profileRes.user;
    refreshProfileUI();
  }

  const u = state.user;
  const summaryBox = document.getElementById('career-rank-summary');
  if (summaryBox && u) {
    const kd = u.stats.deaths > 0 ? (u.stats.kills / u.stats.deaths).toFixed(2) : u.stats.kills.toFixed(2);
    const winRate = u.stats.matches > 0 ? Math.round((u.stats.wins / u.stats.matches) * 100) : 0;
    const hsRate = u.stats.kills > 0 ? Math.round((u.stats.headshots / u.stats.kills) * 100) : 0;

    summaryBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin:10px 0 14px;">
        <div style="width:58px;height:58px;border-radius:12px;border:2px solid ${u.rank.color};display:grid;place-items:center;font-size:26px;font-weight:800;color:${u.rank.color};">
          ${u.rank.icon}
        </div>
        <div>
          <div style="font-size:19px;font-weight:800;color:${u.rank.color};">${u.rank.name}</div>
          <div class="muted">Điểm xếp hạng: <strong>${u.rp} RP</strong> • Cấp độ ${u.level}</div>
        </div>
      </div>
      <div class="two-col" style="gap:8px;">
        <div class="roster-slot"><span>Tỷ lệ K/D</span><strong>${kd}</strong></div>
        <div class="roster-slot"><span>Tỷ lệ Thắng</span><strong>${winRate}%</strong></div>
        <div class="roster-slot"><span>Tổng Hạ Gục</span><strong>${u.stats.kills}</strong></div>
        <div class="roster-slot"><span>Tỷ lệ Headshot</span><strong>${hsRate}%</strong></div>
      </div>
    `;

    const histEl = document.getElementById('career-history-list');
    if (histEl) {
      histEl.innerHTML = (u.history || []).length
        ? u.history.map((h) => `
          <div class="history-item ${h.won ? 'win' : 'loss'}">
            <div>
              <strong>${h.won ? 'THẮNG' : 'BẠI'}</strong> • ${escapeHtml(h.mapName)}
              <div class="muted">K/D: ${h.kills}/${h.deaths} • HS: ${h.headshots}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:#facc15;font-weight:700;">+${h.gpEarned} GP</div>
              <div style="color:${h.rpDelta >= 0 ? '#4ade80' : '#f87171'};">${h.rpDelta >= 0 ? '+' : ''}${h.rpDelta} RP</div>
            </div>
          </div>
        `).join('')
        : '<div class="muted">Chưa có trận đấu nào. Hãy tham chiến để ghi danh!</div>';
    }
  }

  const lbRes = await apiCall('/api/leaderboard');
  const tbody = document.getElementById('leaderboard-body');
  if (tbody && lbRes.leaderboard) {
    tbody.innerHTML = lbRes.leaderboard.map((row) => {
      const kd = row.stats.deaths > 0 ? (row.stats.kills / row.stats.deaths).toFixed(2) : row.stats.kills;
      const isMe = row.id === state.user?.id ? 'me-row' : '';
      return `
        <tr class="${isMe}">
          <td><strong>#${row.position}</strong></td>
          <td><button class="profile-name-link" data-profile="${escapeHtml(row.username)}" title="Xem hồ sơ">${escapeHtml(row.username)}</button> ${row.isHuman ? '<span style="color:#38bdf8;font-size:11px;">[Người chơi]</span>' : ''}</td>
          <td style="color:${row.rank.color};font-weight:700;">${row.rank.icon} ${row.rank.name}</td>
          <td><strong>${row.rp} RP</strong></td>
          <td>${kd}</td>
          <td>${row.stats.wins} / ${row.stats.matches}</td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('.profile-name-link').forEach((btn) => {
      btn.addEventListener('click', () => openPlayerProfile(btn.dataset.profile));
    });
  }
}

// ============================================================================
// 6. NETWORK EVENT HANDLERS
// ============================================================================
function bindNetworkEvents() {
  net.on('transport_mode', ({ label }) => {
    const el = document.getElementById('top-transport-mode');
    if (el) el.textContent = `ONLINE • ${label}`;
  });

  net.on('welcome', (msg) => {
    state.roomsList = msg.rooms || [];
    document.getElementById('top-online-count').textContent = `${msg.onlineCount || 1} Online`;
    renderRoomsTable();

    const gLog = document.getElementById('global-chat-log');
    if (gLog && msg.globalChat) {
      gLog.innerHTML = msg.globalChat.map((m) => `
        <div class="chat-line ${m.isSystem ? 'sys' : ''}">
          <span class="sender">[${escapeHtml(m.senderName)}]:</span> ${escapeHtml(m.text)}
        </div>
      `).join('');
    }

    // Auto-join room if user opened a shared ?room=CODE invite URL!
    if (state.pendingUrlRoomCode) {
      const codeToJoin = state.pendingUrlRoomCode;
      state.pendingUrlRoomCode = '';
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => joinRoomByCode(codeToJoin), 250);
    }
  });

  net.on('ping_updated', ({ pingMs, onlineCount }) => {
    document.getElementById('top-ping').textContent = `${pingMs}ms`;
    document.getElementById('top-online-count').textContent = `${onlineCount} Online`;
  });

  net.on('rooms_list', (msg) => {
    state.roomsList = msg.rooms || [];
    if (msg.onlineCount) {
      document.getElementById('top-online-count').textContent = `${msg.onlineCount} Online`;
    }
    if (!state.currentRoom) renderRoomsTable();
  });

  net.on('global_chat_msg', ({ msg }) => {
    const gLog = document.getElementById('global-chat-log');
    if (!gLog) return;
    const div = document.createElement('div');
    div.className = 'chat-line';
    div.innerHTML = `<span class="sender">[${escapeHtml(msg.senderName)}]:</span> ${escapeHtml(msg.text)}`;
    gLog.appendChild(div);
    gLog.scrollTop = gLog.scrollHeight;
  });

  const hideQueueModal = () => {
    document.getElementById('matchmaking-queue-overlay')?.classList.add('hidden');
  };

  net.on('queue_status', (msg) => {
    const overlay = document.getElementById('matchmaking-queue-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const badgeEl = document.getElementById('queue-mode-badge');
    const countEl = document.getElementById('queue-humans-count');
    const waitEl = document.getElementById('queue-wait-sec');
    if (badgeEl) badgeEl.textContent = `TÌM TRẬN: ${String(msg.modeName || msg.mode || '').toUpperCase()}`;
    if (countEl) countEl.textContent = String(msg.searchingHumans || 1);
    if (waitEl) waitEl.textContent = `${Math.max(0, msg.waitLeftSec ?? 0)}s`;
  });

  net.on('queue_cancelled', () => {
    hideQueueModal();
    showToast('Đã hủy tìm trận.');
  });

  net.on('joined_room', ({ room }) => {
    hideQueueModal();
    state.currentRoom = room;
    if (state.token && room?.code) {
      apiCall(`/api/profile?roomCode=${encodeURIComponent(room.code)}`).catch(() => {});
    }
    switchTab('rooms');
    updateRoomTabPanels();
    if (state.pendingInviteTarget && room?.code) {
      const target = state.pendingInviteTarget;
      state.pendingInviteTarget = null;
      sendSquadInviteSmart(target);
    }
  });

  net.on('room_lobby', ({ room }) => {
    state.currentRoom = room;
    fpsClient.syncRosterFromLobby(room);
    if (fpsClient.active && room?.players) {
      voice.updateRoster(room.players);
    }
    if (!fpsClient.active && state.activeTab === 'rooms') {
      updateRoomTabPanels();
    }
  });

  net.on('left_room', (msg) => {
    hideQueueModal();
    state.currentRoom = null;
    state.pendingInviteTarget = null;
    if (state.token) {
      apiCall('/api/profile?roomCode=').catch(() => {});
    }
    if (msg.rooms) state.roomsList = msg.rooms;
    voice.stop();
    if (fpsClient.active) exitMatchToLobbyUI();
    updateRoomTabPanels();
  });

  net.on('squad_invite', ({ invite }) => {
    if (invite && invite.id !== lastShownInviteId && !fpsClient.active) {
      lastShownInviteId = invite.id;
      showSquadInvitePopup(invite);
    }
  });

  net.on('chat_msg', ({ msg }) => {
    const roomChat = document.getElementById('room-chat-log');
    if (roomChat) {
      const div = document.createElement('div');
      div.className = `chat-line ${msg.team === 'system' ? 'sys' : ''}`;
      div.innerHTML = `<span class="sender">[${escapeHtml(msg.senderName)}]:</span> ${escapeHtml(msg.text)}`;
      roomChat.appendChild(div);
      roomChat.scrollTop = roomChat.scrollHeight;
    }

    const igChat = document.getElementById('ingame-chat-messages');
    if (igChat) {
      const line = document.createElement('div');
      const color = msg.isRadio ? '#facc15' : '#38bdf8';
      line.innerHTML = `<strong style="color:${color}">[${escapeHtml(msg.senderName)}]:</strong> ${escapeHtml(msg.text)}`;
      igChat.appendChild(line);
      while (igChat.children.length > 6) igChat.firstElementChild.remove();
    }
  });

  net.on('error_msg', (msg) => showToast(msg.text));
  net.on('system_toast', (msg) => showToast(msg.text));

  net.on('match_started', (msg) => {
    hideQueueModal();
    state.currentRoom = msg.room;
    renderInGameBuyModal();
    document.getElementById('postmatch-modal')?.classList.add('hidden');
    document.getElementById('friends-drawer')?.classList.add('hidden');
    document.getElementById('lobby-shell')?.classList.add('hidden');
    document.getElementById('match-hud')?.classList.remove('hidden');
    lobbyShowcase.setPaused(true);
    fpsClient.startMatchSession(msg, net.clientId);
    const myTeam = fpsClient.localMeta?.team || msg.room?.players?.find((p) => p.id === net.clientId)?.team;
    voice.start({
      roomCode: msg.room?.code,
      clientId: net.clientId,
      players: msg.room?.players || [],
      myTeam,
      teamBased: Boolean(msg.modeConfig?.teamBased)
    });
  });

  net.on('voice_signal', (msg) => voice.onSignal(msg));
  net.on('voice_audio', (msg) => voice.onRelayAudio(msg));

  let lastWsResyncAt = 0;
  net.on('world_state', (msg) => {
    if (!fpsClient.active && state.currentRoom) {
      const now = Date.now();
      if (now - lastWsResyncAt > 1500) {
        lastWsResyncAt = now;
        net.send({ type: 'resync_match' });
      }
      return;
    }
    fpsClient.onWorldState(msg);
  });
  net.on('player_spawned', (msg) => fpsClient.onPlayerSpawned(msg));
  net.on('weapon_switched', (msg) => {
    fpsClient.onWeaponSwitched(msg);
    if (msg.notice) showToast(msg.notice);
  });
  net.on('player_reload', (msg) => fpsClient.onPlayerReload(msg));
  net.on('ammo_sync', (msg) => fpsClient.onAmmoSync(msg));
  net.on('shot_fired', (msg) => fpsClient.onShotFired(msg));
  net.on('grenade_thrown', (msg) => fpsClient.onGrenadeThrown(msg));
  net.on('grenade_exploded', (msg) => fpsClient.onGrenadeExploded(msg));
  net.on('hit_confirm', (msg) => fpsClient.onHitConfirm(msg));
  net.on('damage_taken', (msg) => fpsClient.onDamageTaken(msg));
  net.on('kill_event', (msg) => fpsClient.onKillEvent(msg));
  net.on('weapons_sync', (msg) => fpsClient.onWeaponsSync(msg));
  net.on('inventory_sync', (msg) => fpsClient.onInventorySync(msg));
  net.on('loot_spawned', (msg) => fpsClient.onLootSpawned(msg));
  net.on('loot_updated', (msg) => fpsClient.onLootUpdated(msg));
  net.on('loot_picked', (msg) => fpsClient.onLootPicked(msg));
  net.on('drop_plane_ended', () => {
    if (fpsClient.dropPlaneData) fpsClient.dropPlaneData.active = false;
    if (fpsClient.dropPlaneMesh) fpsClient.dropPlaneMesh.visible = false;
  });

  net.on('bomb_planted', (msg) => {
    soundEngine.playBombBeep(true);
    hud.showRoundBanner(`${msg.planterName} ĐÃ ĐẶT BOM C4 TẠI KHU ${msg.siteId}!`, 'bravo');
  });
  net.on('bomb_defused', (msg) => {
    soundEngine.playFanfare(true);
    hud.showRoundBanner(`${msg.defuserName} ĐÃ GỠ BOM C4 THÀNH CÔNG!`, 'alpha');
  });
  net.on('bomb_exploded', () => soundEngine.playExplosion(0));
  net.on('round_ended', (msg) => hud.showRoundBanner(msg.reasonText, msg.winnerTeam));
  net.on('round_started', (msg) => hud.showRoundBanner(`HIỆP ĐẤU THỨ ${msg.roundNumber} BẮT ĐẦU!`, ''));

  net.on('match_ended', async (msg) => {
    state.currentRoom = msg.room;
    voice.stop();
    fpsClient.stopMatchSession();
    document.getElementById('match-hud')?.classList.add('hidden');
    lobbyShowcase.setPaused(false);
    document.getElementById('lobby-shell')?.classList.remove('hidden');

    const prof = await apiCall('/api/profile');
    if (prof.user) {
      state.user = prof.user;
      refreshProfileUI();
    }
    showPostMatchModal(msg);
  });
}

function exitMatchToLobbyUI() {
  voice.stop();
  fpsClient.stopMatchSession();
  document.getElementById('match-hud')?.classList.add('hidden');
  document.getElementById('lobby-shell')?.classList.remove('hidden');
  lobbyShowcase.setPaused(false);
}

function showPostMatchModal(msg) {
  const modal = document.getElementById('postmatch-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const myRow = (msg.scoreboard || []).find((p) => p.id === net.clientId);
  const won = msg.winnerTeam ? myRow?.team === msg.winnerTeam : msg.winnerPlayerId === net.clientId;
  soundEngine.playFanfare(won);

  const badge = document.getElementById('pm-outcome-badge');
  badge.textContent = msg.winnerTeam === 'draw'
    ? 'HÒA TRẬN'
    : (won
      ? (msg.mode === 'survival' ? 'TOP 1 — CHIẾN THẮNG SINH TỒN' : 'CHIẾN THẮNG VINH QUANG')
      : 'KẾT THÚC TRẬN ĐẤU');
  badge.className = `pm-badge ${won ? 'win' : 'loss'}`;

  document.getElementById('pm-subtitle').textContent = msg.winnerTeam
    ? `ALPHA ${msg.alphaScore}  —  ${msg.bravoScore} BRAVO (${msg.mapName})`
    : (msg.mode === 'survival' && won ? `Người sống sót cuối cùng • ${msg.mapName}` : `Bản đồ: ${msg.mapName}`);

  const myReward = msg.rewardsByPlayer?.[net.clientId];
  const rewardEl = document.getElementById('pm-rewards-row');
  if (rewardEl) {
    rewardEl.innerHTML = myReward
      ? `<span>+${myReward.gpEarned} GP</span> • <span>+${myReward.xpEarned} XP</span> • <span>${myReward.rpDelta >= 0 ? '+' : ''}${myReward.rpDelta} RP (${myReward.rank?.name || ''})</span>`
      : '';
  }

  const mvpEl = document.getElementById('pm-mvp-box');
  if (mvpEl && msg.mvp) {
    mvpEl.innerHTML = `MVP TRẬN ĐẤU: <strong>${escapeHtml(msg.mvp.name)}</strong> (${msg.mvp.kills} Hạ gục • ${msg.mvp.score} Điểm)`;
  }

  const tbody = document.getElementById('pm-scoreboard-body');
  if (tbody) {
    tbody.innerHTML = (msg.scoreboard || []).map((p) => `
      <tr class="${p.id === net.clientId ? 'me-row' : ''}">
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${p.team === 'alpha' ? 'ALPHA' : (p.team === 'bravo' ? 'BRAVO' : 'SOLO')}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${p.assists}</td>
        <td>${p.headshots}</td>
        <td><strong>${p.score}</strong></td>
      </tr>
    `).join('');
  }
}

// ============================================================================
// 7. DOM EVENT LISTENERS
// ============================================================================
function bindUIEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    soundEngine.ensureContext();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errBox = document.getElementById('auth-error');
    errBox?.classList.add('hidden');

    const res = await apiCall('/api/auth', 'POST', { username, password });
    if (res.error) {
      if (errBox) {
        errBox.textContent = res.error;
        errBox.classList.remove('hidden');
      }
      return;
    }
    onLoginSuccess(res.user);
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (state.currentRoom) net.send({ type: 'leave_room' });
    sessionStorage.removeItem('bs_token');
    localStorage.removeItem('bs_token');
    state.token = '';
    state.user = null;
    document.getElementById('lobby-shell')?.classList.add('hidden');
    document.getElementById('auth-overlay')?.classList.remove('hidden');
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // My Profile Modal & Close Controls
  document.getElementById('btn-open-my-profile')?.addEventListener('click', () => {
    if (state.user?.username) openPlayerProfile(state.user.username);
  });
  document.getElementById('btn-close-profile-modal')?.addEventListener('click', () => {
    document.getElementById('player-profile-modal')?.classList.add('hidden');
  });
  document.getElementById('player-profile-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('player-profile-modal')?.classList.add('hidden');
    }
  });
  document.getElementById('btn-copy-friend-code')?.addEventListener('click', () => {
    const code = state.user?.friendCode;
    if (!code) return;
    navigator.clipboard?.writeText(code);
    showToast(`Đã sao chép Mã Kết Bạn: ${code}`);
  });

  // Friends Drawer
  document.getElementById('btn-toggle-friends')?.addEventListener('click', () => {
    const dr = document.getElementById('friends-drawer');
    if (!dr) return;
    dr.classList.toggle('hidden');
    if (!dr.classList.contains('hidden')) fetchFriendsStatus();
  });
  document.getElementById('btn-close-friends')?.addEventListener('click', () => {
    document.getElementById('friends-drawer')?.classList.add('hidden');
  });
  document.getElementById('add-friend-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('add-friend-input');
    if (!inp || !inp.value.trim()) return;
    const res = await apiCall('/api/friends/add', 'POST', { query: inp.value.trim() });
    if (res.error) return showToast(res.error);
    inp.value = '';
    const tag = document.getElementById('online-players-tag');
    if (tag) tag.textContent = 'Đang Online';
    if (res.friends) state.friendsList = res.friends;
    if (res.incomingRequests) state.incomingRequests = res.incomingRequests;
    if (res.requestSentTo) {
      showToast(`Đã gửi lời mời kết bạn tới ${res.requestSentTo}!`);
    } else if (res.friendAdded) {
      showToast(`Đã trở thành bạn bè với ${res.friendAdded}!`);
    }
    fetchFriendsStatus();
  });

  let playerSearchTimer = null;
  document.getElementById('add-friend-input')?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (playerSearchTimer) clearTimeout(playerSearchTimer);
    const tag = document.getElementById('online-players-tag');
    if (!q) {
      if (tag) tag.textContent = 'Đang Online';
      fetchFriendsStatus();
      return;
    }
    playerSearchTimer = setTimeout(async () => {
      const res = await apiCall(`/api/players/search?q=${encodeURIComponent(q)}`);
      if (res?.players) {
        state.onlinePlayers = res.players;
        if (tag) tag.textContent = `Kết quả (${res.players.length})`;
        renderOnlinePlayersList();
      }
    }, 220);
  });

  // Room Code Join Inputs (Home, Browser, Friend Drawer)
  document.getElementById('btn-home-join-code')?.addEventListener('click', () => {
    joinRoomByCode(document.getElementById('home-room-code-input')?.value);
  });
  document.getElementById('btn-browser-join-code')?.addEventListener('click', () => {
    joinRoomByCode(document.getElementById('browser-code-input')?.value);
  });
  document.getElementById('drawer-join-code-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    joinRoomByCode(document.getElementById('drawer-room-code-input')?.value);
    document.getElementById('friends-drawer')?.classList.add('hidden');
  });

  // Copy Room Code & Invite Link
  document.getElementById('btn-copy-room-code')?.addEventListener('click', () => {
    const code = state.currentRoom?.code || state.currentRoom?.id;
    if (!code) return;
    navigator.clipboard?.writeText(code);
    showToast(`Đã sao chép Mã Phòng: ${code}`);
  });
  document.getElementById('btn-copy-invite-link')?.addEventListener('click', () => {
    const code = state.currentRoom?.code || state.currentRoom?.id;
    if (!code) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
    navigator.clipboard?.writeText(url);
    showToast('Đã copy Link mời bạn bè! Hãy gửi qua Zalo / Discord / Messenger.');
  });

  // Home Quick-Navigation Buttons (Dossier & Armed Loadout Cards)
  document.getElementById('btn-home-open-profile')?.addEventListener('click', () => {
    if (state.user?.username) openPlayerProfile(state.user.username);
  });
  document.getElementById('btn-home-go-ranked')?.addEventListener('click', () => switchTab('ranked'));
  document.getElementById('btn-home-go-armory')?.addEventListener('click', () => switchTab('armory'));
  document.getElementById('btn-home-go-operators')?.addEventListener('click', () => switchTab('operators'));

  // Mode & Map Selector Popup Modal + Controls Popup Modal
  document.getElementById('btn-open-mode-modal')?.addEventListener('click', openModeSelectorModal);
  document.getElementById('btn-close-mode-modal')?.addEventListener('click', closeModeSelectorModal);
  document.getElementById('btn-confirm-mode-modal')?.addEventListener('click', () => {
    soundEngine.playUiTone(880, 0.05);
    closeModeSelectorModal();
  });
  document.getElementById('btn-mode-modal-play')?.addEventListener('click', () => {
    closeModeSelectorModal();
    soundEngine.ensureContext();
    net.send({
      type: 'queue_join',
      mode: state.selectedQuickMode,
      mapId: state.selectedQuickMap
    });
  });
  document.getElementById('mode-selector-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModeSelectorModal();
  });

  document.getElementById('btn-open-controls-modal')?.addEventListener('click', () => {
    soundEngine.playUiTone(720, 0.05);
    document.getElementById('controls-modal')?.classList.remove('hidden');
  });
  document.getElementById('btn-close-controls-modal')?.addEventListener('click', () => {
    document.getElementById('controls-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-ok-controls-modal')?.addEventListener('click', () => {
    document.getElementById('controls-modal')?.classList.add('hidden');
  });
  document.getElementById('controls-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('controls-modal')?.classList.add('hidden');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.getElementById('mode-selector-modal')?.classList.add('hidden');
    document.getElementById('controls-modal')?.classList.add('hidden');
  });

  // Quick Play, Practice Range & Go Rooms
  document.getElementById('quick-map-select')?.addEventListener('change', (e) => {
    state.selectedQuickMap = e.target.value;
    renderActiveModeTrigger();
  });
  document.getElementById('btn-quick-play')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({
      type: 'queue_join',
      mode: state.selectedQuickMode,
      mapId: state.selectedQuickMap
    });
  });
  document.getElementById('btn-queue-force-start')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({ type: 'queue_force_start' });
  });
  document.getElementById('btn-queue-cancel')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({ type: 'queue_cancel' });
    document.getElementById('matchmaking-queue-overlay')?.classList.add('hidden');
  });
  document.getElementById('btn-practice-range')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({ type: 'quick_match', mode: 'practice', mapId: 'warehouse' });
  });
  document.getElementById('btn-preview-fire')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    lobbyShowcase.triggerWeaponPreviewFire();
  });
  document.getElementById('btn-preview-reload')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    lobbyShowcase.triggerWeaponPreviewReload();
  });
  document.getElementById('btn-test-weapon-range')?.addEventListener('click', async () => {
    soundEngine.ensureContext();
    const wId = state.selectedArmoryWeapon;
    const gun = WEAPONS[wId];
    if (gun && (state.user?.unlocked?.weapons || []).includes(wId)) {
      const payload = gun.category === 'primary' ? { primary: wId } : (gun.category === 'secondary' ? { secondary: wId } : { melee: wId });
      const res = await apiCall('/api/loadout', 'POST', payload);
      if (res.user) updateUserData(res.user);
    }
    net.send({ type: 'quick_match', mode: 'practice', mapId: 'warehouse' });
  });
  document.getElementById('btn-go-rooms')?.addEventListener('click', () => switchTab('rooms'));
  document.getElementById('btn-queue-ranked')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({ type: 'queue_join', mode: 'ranked', mapId: 'urban_city' });
  });

  const quickCreatePresetRoom = (presetType) => {
    soundEngine.ensureContext();
    const hostName = state.user?.username || 'Chiến Binh';
    const mapId = state.selectedQuickMap || 'warehouse';
    if (presetType === 'solo') {
      net.send({
        type: 'create_room',
        name: `[SOLO] Phòng Đấu Đơn - ${hostName}`,
        mode: 'ffa',
        mapId,
        maxPlayers: 8,
        botDifficulty: 'normal',
        fillBots: true
      });
    } else {
      net.send({
        type: 'create_room',
        name: `[5v5] Phòng Đấu Đội - ${hostName}`,
        mode: 'tdm',
        mapId,
        maxPlayers: 10,
        botDifficulty: 'normal',
        fillBots: true
      });
    }
  };

  document.getElementById('btn-home-create-5v5')?.addEventListener('click', () => quickCreatePresetRoom('5v5'));
  document.getElementById('btn-home-create-solo')?.addEventListener('click', () => quickCreatePresetRoom('solo'));
  document.getElementById('btn-quick-create-5v5')?.addEventListener('click', () => quickCreatePresetRoom('5v5'));
  document.getElementById('btn-quick-create-solo')?.addEventListener('click', () => quickCreatePresetRoom('solo'));

  // Global Chat
  document.getElementById('global-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('global-chat-input');
    if (!input || !input.value.trim()) return;
    net.send({ type: 'global_chat', text: input.value.trim() });
    input.value = '';
  });

  // Room Browser & Create Room
  document.getElementById('btn-refresh-rooms')?.addEventListener('click', () => {
    net.send({ type: 'list_rooms' });
  });
  document.getElementById('btn-open-create-room')?.addEventListener('click', () => {
    const nameInput = document.getElementById('cr-name');
    if (nameInput && !nameInput.value) {
      nameInput.value = `Phòng của ${state.user?.username || 'Chiến Binh'}`;
    }
    document.getElementById('create-room-modal')?.classList.remove('hidden');
  });
  document.querySelectorAll('.cr-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modeEl = document.getElementById('cr-mode');
      const maxEl = document.getElementById('cr-max');
      const nameEl = document.getElementById('cr-name');
      const hostName = state.user?.username || 'Chiến Binh';
      if (modeEl && btn.dataset.presetMode) modeEl.value = btn.dataset.presetMode;
      if (maxEl && btn.dataset.presetMax) maxEl.value = btn.dataset.presetMax;
      if (nameEl && btn.dataset.presetLabel) {
        nameEl.value = `[${btn.dataset.presetLabel}] Phòng của ${hostName}`;
      }
    });
  });
  document.getElementById('btn-cancel-create-room')?.addEventListener('click', () => {
    document.getElementById('create-room-modal')?.classList.add('hidden');
  });
  document.getElementById('create-room-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('create-room-modal')?.classList.add('hidden');
    net.send({
      type: 'create_room',
      name: document.getElementById('cr-name').value.trim(),
      mode: document.getElementById('cr-mode').value,
      mapId: document.getElementById('cr-map').value,
      maxPlayers: Number(document.getElementById('cr-max').value),
      botDifficulty: document.getElementById('cr-botdiff').value,
      fillBots: document.getElementById('cr-fillbots').checked
    });
  });

  // Waiting Room Controls
  document.getElementById('btn-switch-team')?.addEventListener('click', () => net.send({ type: 'switch_team' }));
  document.getElementById('btn-leave-room')?.addEventListener('click', () => net.send({ type: 'leave_room' }));
  document.getElementById('btn-start-match')?.addEventListener('click', () => {
    soundEngine.ensureContext();
    net.send({ type: 'start_match' });
  });
  document.getElementById('cr-mode')?.addEventListener('change', (e) => {
    if (e.target.value === 'survival') {
      const mEl = document.getElementById('cr-map');
      const maxEl = document.getElementById('cr-max');
      if (mEl) mEl.value = 'br_island';
      if (maxEl) maxEl.value = '50';
    }
  });

  ['room-edit-mode', 'room-edit-map', 'room-edit-max', 'room-edit-botdiff', 'room-edit-fillbots'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (id === 'room-edit-mode' && document.getElementById('room-edit-mode').value === 'survival') {
        const mEl = document.getElementById('room-edit-map');
        const maxEl = document.getElementById('room-edit-max');
        if (mEl) mEl.value = 'br_island';
        if (maxEl) maxEl.value = '50';
      }
      net.send({
        type: 'update_room',
        mode: document.getElementById('room-edit-mode').value,
        mapId: document.getElementById('room-edit-map').value,
        maxPlayers: Number(document.getElementById('room-edit-max')?.value || 10),
        botDifficulty: document.getElementById('room-edit-botdiff').value,
        fillBots: document.getElementById('room-edit-fillbots').checked
      });
    });
  });
  document.getElementById('room-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('room-chat-input');
    if (!input || !input.value.trim()) return;
    net.send({ type: 'room_chat', text: input.value.trim(), scope: 'all' });
    input.value = '';
  });

  // Operator & Outfit Confirm Buy/Equip Buttons (Preview-Before-Buy)
  document.getElementById('btn-action-operator')?.addEventListener('click', async () => {
    if (!state.user) return;
    const opId = state.previewOperator || state.user.loadout.operator;
    const op = OPERATORS[opId];
    if (!op) return;
    if (state.user.loadout.operator === opId && state.user.unlocked.operators.includes(opId)) {
      return showToast(`Bạn đang sử dụng quân nhân ${op.name}.`);
    }
    if (!state.user.unlocked.operators.includes(opId)) {
      const res = await apiCall('/api/unlock', 'POST', { category: 'operator', itemId: opId });
      if (res.error) return showToast(res.error);
      if (res.user) {
        state.previewOperator = null;
        updateUserData(res.user, `Đã mở khóa & chọn quân nhân ${op.name}!`);
      }
      return;
    }
    const res = await apiCall('/api/loadout', 'POST', { operator: opId });
    if (res.user) {
      state.previewOperator = null;
      updateUserData(res.user, `Đã chọn quân nhân ${op.name}`);
    }
  });

  document.getElementById('btn-action-outfit')?.addEventListener('click', async () => {
    if (!state.user) return;
    const outId = state.previewOutfit || state.user.loadout.outfit;
    const out = OUTFITS[outId];
    if (!out) return;
    if (state.user.loadout.outfit === outId && state.user.unlocked.outfits.includes(outId)) {
      return showToast(`Bạn đang mặc trang phục ${out.name}.`);
    }
    if (!state.user.unlocked.outfits.includes(outId)) {
      const res = await apiCall('/api/unlock', 'POST', { category: 'outfit', itemId: outId });
      if (res.error) return showToast(res.error);
      if (res.user) {
        state.previewOutfit = null;
        updateUserData(res.user, `Đã mở khóa & mặc ${out.name}!`);
      }
      return;
    }
    const res = await apiCall('/api/loadout', 'POST', { outfit: outId });
    if (res.user) {
      state.previewOutfit = null;
      updateUserData(res.user, `Đã mặc trang phục ${out.name}`);
    }
  });

  // Armory Unlock / Equip Button
  document.getElementById('btn-equip-weapon')?.addEventListener('click', async () => {
    const wId = state.selectedArmoryWeapon;
    const gun = WEAPONS[wId];
    if (!gun || !state.user) return;
    const unlocked = state.user.unlocked.weapons || [];
    if (!unlocked.includes(wId)) {
      const un = await apiCall('/api/unlock', 'POST', { category: 'weapon', itemId: wId });
      if (un.error) return showToast(un.error);
      if (un.user) return updateUserData(un.user, `Đã mở khóa & trang bị ${gun.name}!`);
    }
    const payload = gun.category === 'primary' ? { primary: wId } : (gun.category === 'secondary' ? { secondary: wId } : { melee: wId });
    const res = await apiCall('/api/loadout', 'POST', payload);
    if (res.user) updateUserData(res.user, `Đã trang bị ${gun.name} vào Balo chiến đấu!`);
  });

  // Settings Modal
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.classList.remove('hidden');
  });
  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.classList.add('hidden');
  });
  document.getElementById('set-sens')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    document.getElementById('lbl-sens').textContent = `${Math.round(v * 100)}%`;
    fpsClient.applySettings({ sensitivity: v });
  });
  document.getElementById('set-vol')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    document.getElementById('lbl-vol').textContent = `${Math.round(v * 100)}%`;
    fpsClient.applySettings({ volume: v });
  });
  const qualitySel = document.getElementById('set-quality');
  if (qualitySel) {
    qualitySel.value = fpsClient.quality;
    qualitySel.addEventListener('change', (e) => {
      fpsClient.applySettings({ quality: e.target.value });
    });
  }

  // FPS Cap Selector
  const fpsBtns = document.querySelectorAll('#set-fps-group .fps-cap-btn');
  const syncFpsBtns = (val) => {
    fpsBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.fps) === Number(val)));
  };
  syncFpsBtns(fpsClient.fpsCap);
  fpsBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cap = Number(btn.dataset.fps);
      fpsClient.applySettings({ fpsCap: cap });
      syncFpsBtns(cap);
    });
  });

  // Voice Chat Settings & HUD Toggle
  const voiceModeEl = document.getElementById('set-voice-mode');
  const voiceVolEl = document.getElementById('set-voice-vol');
  const voiceVolLbl = document.getElementById('lbl-voice-vol');
  if (voiceModeEl) {
    voiceModeEl.value = voice.mode;
    voiceModeEl.addEventListener('change', (e) => voice.setMode(e.target.value));
  }
  if (voiceVolEl) {
    voiceVolEl.value = String(voice.volume);
    if (voiceVolLbl) voiceVolLbl.textContent = `${Math.round(voice.volume * 100)}%`;
    voiceVolEl.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (voiceVolLbl) voiceVolLbl.textContent = `${Math.round(v * 100)}%`;
      voice.setVolume(v);
    });
  }
  document.getElementById('hud-voice-toggle')?.addEventListener('click', () => {
    voice.toggleOpenMic();
    if (voiceModeEl) voiceModeEl.value = voice.mode;
  });

  // Voice Hotkeys (V: Push-to-Talk, N: Toggle Open Mic)
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !fpsClient.active) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'KeyV') {
      voice.setPushToTalk(true);
    } else if (e.code === 'KeyN') {
      voice.toggleOpenMic();
      if (voiceModeEl) voiceModeEl.value = voice.mode;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV') {
      voice.setPushToTalk(false);
    }
  });

  // In-Match HUD Buttons
  document.getElementById('btn-leave-match')?.addEventListener('click', () => net.send({ type: 'leave_room' }));
  document.getElementById('hud-btn-reload')?.addEventListener('click', () => fpsClient.requestReload());
  document.getElementById('hud-btn-grenade')?.addEventListener('click', () => fpsClient.requestThrowGrenade());
  document.getElementById('hud-btn-swap-primary')?.addEventListener('click', () => {
    if (fpsClient.mode === 'survival') fpsClient.toggleBackpackModal();
    else fpsClient.toggleBuyWeaponModal();
  });
  document.querySelectorAll('.weapon-slots-row .hud-slot-btn').forEach((btn) => {
    btn.addEventListener('click', () => fpsClient.requestWeaponSwitch(Number(btn.dataset.slot)));
  });
  document.getElementById('btn-close-buy-modal')?.addEventListener('click', () => fpsClient.toggleBuyWeaponModal(false));
  document.getElementById('btn-close-backpack')?.addEventListener('click', () => fpsClient.toggleBackpackModal(false));
  document.getElementById('btn-close-bigmap')?.addEventListener('click', () => fpsClient.toggleBigMapModal(false));
  document.getElementById('br-bigmap-canvas')?.addEventListener('click', (e) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const half = fpsClient.mapData?.bounds?.halfW || 2500;
    fpsClient.mapPingMarker = { x: (u * 2 - 1) * half, z: (v * 2 - 1) * half };
    soundEngine.playUiTone(920, 0.06);
  });

  // In-Game Chat
  document.getElementById('ingame-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('ingame-chat-input');
    if (input && input.value.trim()) {
      net.send({ type: 'room_chat', text: input.value.trim(), scope: 'all' });
      input.value = '';
    }
    fpsClient.closeInGameChat();
  });
  document.getElementById('ingame-chat-input')?.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      fpsClient.closeInGameChat();
    }
  });

  // Post-Match Actions
  document.getElementById('btn-pm-rematch')?.addEventListener('click', () => {
    document.getElementById('postmatch-modal')?.classList.add('hidden');
    switchTab('rooms');
    updateRoomTabPanels();
  });
  document.getElementById('btn-pm-lobby')?.addEventListener('click', () => {
    document.getElementById('postmatch-modal')?.classList.add('hidden');
    net.send({ type: 'leave_room' });
    switchTab('home');
  });
}

initApp();
