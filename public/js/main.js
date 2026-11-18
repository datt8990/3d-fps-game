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
      <span>Quân nhân: <strong style="color:#38bdf8">${op.name}</strong> (${out.name})</span>
      <span>•</span>
      <span>Súng chính: <strong style="color:#f97316">${pri.name}</strong> [${skin.name}]</span>
      <span>•</span>
      <span>Phụ: <strong>${sec.name}</strong> & <strong>${mel.name}</strong></span>
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
      .map((m) => `<option value="${m.id}">${m.icon || ''} ${m.shortName} (${m.name})</option>`)
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
    sec.classList.toggle('hidden', sec.id !== `tab-${tabId}`);
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

function renderQuickModes() {
  const container = document.getElementById('quick-mode-list');
  if (!container) return;
  container.innerHTML = Object.values(GAME_MODES)
    .filter((m) => !m.isPractice)
    .map((m) => `
      <div class="mode-card ${state.selectedQuickMode === m.id ? 'selected' : ''}" data-mode="${m.id}">
        <div class="mode-card-title">
          <span>${m.icon || '⚡'} ${m.name}</span>
          <span style="color:#38bdf8;font-size:11.5px;">${m.shortName}</span>
        </div>
        <div class="mode-card-desc">${m.description}</div>
      </div>
    `).join('');

  container.querySelectorAll('.mode-card').forEach((card) => {
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
            <div style="font-size:11px;color:#38bdf8;margin-top:2px;">★ ${op.perkLabel}</div>
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
      btnActionOp.textContent = `🔓 MUA & CHỌN ${currentOp.name} (${currentOp.unlockCost} GP)`;
    } else if (opEquipped) {
      btnActionOp.textContent = `✓ ĐANG DÙNG ${currentOp.name}`;
    } else {
      btnActionOp.textContent = `✓ CHỌN QUÂN NHÂN ${currentOp.name}`;
    }
  }

  const btnActionOut = document.getElementById('btn-action-outfit');
  if (btnActionOut) {
    if (!outUnlocked) {
      btnActionOut.textContent = `🔓 MUA & MẶC ${currentOut.name} (${currentOut.cost} GP)`;
    } else if (outEquipped) {
      btnActionOut.textContent = `✓ ĐANG MẶC ${currentOut.name}`;
    } else {
      btnActionOut.textContent = `👕 MẶC ${currentOut.name}`;
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
      equipBtn.textContent = `🔓 MỞ KHÓA & TRANG BỊ ${gun.name} (${gun.unlockCost} GP)`;
    } else if (alreadyEquipped) {
      equipBtn.textContent = `✓ ĐANG TRANG BỊ ${gun.name} TRONG BALO`;
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
        ? `🔓 MUA & LẮP ${selAtt.name} (${selAtt.cost} GP)`
        : (selEquipped ? `✓ ĐANG LẮP ${selAtt.name}` : `🔧 LẮP ${selAtt.name}`);

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
      ? `🔓 MUA & ÁP DỤNG ${viewSk.name} (${viewSk.cost} GP)`
      : (viewSkEquipped ? `✓ ĐANG DÙNG ${viewSk.name}` : `🎨 ÁP DỤNG SKIN ${viewSk.name}`);

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
    (w) => (w.category === 'primary' || w.category === 'secondary') && (unlocked.includes(w.id) || state.currentRoom?.mode === 'practice')
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
// 3. FRIENDS & SQUAD INVITE SYSTEM
// ============================================================================
function startFriendsPolling() {
  if (friendsPollTimer) clearInterval(friendsPollTimer);
  fetchFriendsStatus();
  friendsPollTimer = setInterval(fetchFriendsStatus, 6000);
}

async function fetchFriendsStatus() {
  if (!state.token || fpsClient.active) return;
  try {
    const res = await apiCall('/api/friends');
    if (res.friends) {
      state.friendsList = res.friends;
      renderFriendsList();
    }
    if (res.pendingInvite && res.pendingInvite.id !== lastShownInviteId) {
      lastShownInviteId = res.pendingInvite.id;
      showSquadInvitePopup(res.pendingInvite);
    }
  } catch {}
}

function renderFriendsList() {
  const box = document.getElementById('friends-list-box');
  if (!box) return;
  if (!state.friendsList.length) {
    box.innerHTML = `<div class="muted" style="padding:12px 0;">Chưa có bạn bè. Nhập Tên hoặc Mã VN-xxxx của bạn bè ở ô trên để kết bạn!</div>`;
    return;
  }

  box.innerHTML = state.friendsList.map((f) => {
    const statusHtml = f.online
      ? `<span style="color:#4ade80;font-size:11px;">● Online ${f.roomCode ? `(Phòng #${f.roomCode})` : ''}</span>`
      : `<span class="muted" style="font-size:11px;">○ Ngoại tuyến</span>`;

    const actionBtns = [];
    if (f.roomCode) {
      actionBtns.push(`<button class="btn-primary btn-sm" data-join-friend="${f.roomCode}">Vào Chung</button>`);
    }
    if (state.currentRoom?.code && f.online) {
      actionBtns.push(`<button class="btn-secondary btn-sm" data-invite-friend="${escapeHtml(f.username)}">Mời</button>`);
    }

    return `
      <div class="roster-slot">
        <div>
          <strong>${escapeHtml(f.username)}</strong>
          <div>${statusHtml}</div>
        </div>
        <div class="row-gap">${actionBtns.join('')}</div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('button[data-join-friend]').forEach((b) => {
    b.addEventListener('click', () => {
      joinRoomByCode(b.dataset.joinFriend);
      document.getElementById('friends-drawer')?.classList.add('hidden');
    });
  });

  box.querySelectorAll('button[data-invite-friend]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!state.currentRoom?.code) return showToast('Hãy tạo hoặc vào một phòng đấu trước khi mời!');
      const targetUsername = b.dataset.inviteFriend;
      const res = await apiCall('/api/friends/invite', 'POST', {
        targetUsername,
        roomCode: state.currentRoom.code,
        modeName: state.currentRoom.modeConfig?.shortName,
        mapName: state.currentRoom.mapName
      });
      if (res.ok) showToast(`Đã gửi lời mời tổ đội tới ${targetUsername}!`);
    });
  });
}

function showSquadInvitePopup(invite) {
  const popup = document.getElementById('invite-popup');
  const desc = document.getElementById('invite-desc');
  if (!popup || !desc) return;
  soundEngine.playUiTone(920, 0.14);
  desc.innerHTML = `<strong>${escapeHtml(invite.fromName)}</strong> mời bạn vào phòng <strong>#${escapeHtml(invite.roomCode)}</strong> (${escapeHtml(invite.modeName)} - ${escapeHtml(invite.mapName)})`;
  popup.classList.remove('hidden');

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
    startBtn.textContent = isHost ? '⚡ BẮT ĐẦU TRẬN ĐẤU' : 'Đang chờ Chủ phòng bắt đầu...';
  }

  const alphaContainer = document.getElementById('room-team-alpha');
  const bravoContainer = document.getElementById('room-team-bravo');
  const players = room.players || [];

  const renderSlot = (p) => `
    <div class="roster-slot">
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        ${p.id === room.hostId ? '<span style="color:#facc15;font-size:11px;"> ★ Chủ phòng</span>' : ''}
        <div class="muted">${OPERATORS[p.operator]?.name || 'VANGUARD'} • ${WEAPONS[p.primary]?.name || 'AK-47'}</div>
      </div>
      <span class="mode-pill">${p.rank?.name || 'Bạc'}</span>
    </div>
  `;

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
          <td><strong>${escapeHtml(row.username)}</strong> ${row.isHuman ? '<span style="color:#38bdf8;font-size:11px;">[Người chơi]</span>' : ''}</td>
          <td style="color:${row.rank.color};font-weight:700;">${row.rank.icon} ${row.rank.name}</td>
          <td><strong>${row.rp} RP</strong></td>
          <td>${kd}</td>
          <td>${row.stats.wins} / ${row.stats.matches}</td>
        </tr>
      `;
    }).join('');
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
    switchTab('rooms');
    updateRoomTabPanels();
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
    if (msg.rooms) state.roomsList = msg.rooms;
    voice.stop();
    if (fpsClient.active) exitMatchToLobbyUI();
    updateRoomTabPanels();
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

  net.on('world_state', (msg) => fpsClient.onWorldState(msg));
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
    hud.showRoundBanner(`⚠ ${msg.planterName} ĐÃ ĐẶT BOM C4 TẠI KHU ${msg.siteId}!`, 'bravo');
  });
  net.on('bomb_defused', (msg) => {
    soundEngine.playFanfare(true);
    hud.showRoundBanner(`🛡 ${msg.defuserName} ĐÃ GỠ BOM C4 THÀNH CÔNG!`, 'alpha');
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
  badge.textContent = msg.winnerTeam === 'draw' ? 'HÒA TRẬN' : (won ? 'CHIẾN THẮNG VINH QUANG' : 'KẾT THÚC TRẬN ĐẤU');
  badge.className = `pm-badge ${won ? 'win' : 'loss'}`;

  document.getElementById('pm-subtitle').textContent = msg.winnerTeam
    ? `ALPHA ${msg.alphaScore}  —  ${msg.bravoScore} BRAVO (${msg.mapName})`
    : `Bản đồ: ${msg.mapName}`;

  const myReward = msg.rewardsByPlayer?.[net.clientId];
  const rewardEl = document.getElementById('pm-rewards-row');
  if (rewardEl) {
    rewardEl.innerHTML = myReward
      ? `<span>+${myReward.gpEarned} GP</span> • <span>+${myReward.xpEarned} XP</span> • <span>${myReward.rpDelta >= 0 ? '+' : ''}${myReward.rpDelta} RP (${myReward.rank?.name || ''})</span>`
      : '';
  }

  const mvpEl = document.getElementById('pm-mvp-box');
  if (mvpEl && msg.mvp) {
    mvpEl.innerHTML = `★ MVP TRẬN ĐẤU: <strong>${escapeHtml(msg.mvp.name)}</strong> (${msg.mvp.kills} Hạ gục • ${msg.mvp.score} Điểm)`;
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
    if (res.friends) {
      state.friendsList = res.friends;
      renderFriendsList();
    }
    showToast(`Đã kết bạn với ${res.friendAdded}!`);
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

  // Quick Play, Practice Range & Go Rooms
  document.getElementById('quick-map-select')?.addEventListener('change', (e) => {
    state.selectedQuickMap = e.target.value;
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
  document.getElementById('set-quality')?.addEventListener('change', (e) => {
    fpsClient.applySettings({ quality: e.target.value });
  });

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
