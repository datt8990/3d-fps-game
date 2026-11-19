// High-Performance Tactical HUD v2.0: Zero-Reflow DOM Diffing, 5km Terrain Minimap/BigMap, Parachute Guide & PUBG Backpack
import {
  WEAPONS,
  BR_BACKPACKS,
  BR_VESTS,
  BR_HELMETS,
  BR_MEDS,
  BR_AMMO_TYPES,
  computeBackpackWeight
} from '/shared/constants.js';
import { renderTerrainRGBA } from '/shared/terrain.js';

export class MatchHUD {
  constructor() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.mmCtx = this.minimapCanvas?.getContext('2d');

    this.hpValEl = document.getElementById('hud-hp-val');
    this.hpBarEl = document.getElementById('hud-hp-bar');
    this.armorValEl = document.getElementById('hud-armor-val');
    this.armorBarEl = document.getElementById('hud-armor-bar');

    this.ammoMagEl = document.getElementById('hud-ammo-mag');
    this.ammoResEl = document.getElementById('hud-ammo-res');
    this.weaponNameEl = document.getElementById('hud-weapon-name');
    this.grenadeCountEl = document.getElementById('hud-grenade-count');
    this.reloadBarWrap = document.getElementById('hud-reload-wrap');
    this.reloadBarFill = document.getElementById('hud-reload-fill');

    this.slot1NameEl = document.getElementById('hud-slot1-name');
    this.slot2NameEl = document.getElementById('hud-slot2-name');
    this.slot3NameEl = document.getElementById('hud-slot3-name');
    this.slotBtns = [...document.querySelectorAll('.weapon-slots-row .hud-slot-btn')];

    this.alphaScoreEl = document.getElementById('hud-score-alpha');
    this.bravoScoreEl = document.getElementById('hud-score-bravo');
    this.alphaLabelEl = document.getElementById('hud-label-alpha');
    this.bravoLabelEl = document.getElementById('hud-label-bravo');
    this.timerEl = document.getElementById('hud-match-timer');
    this.modeSubEl = document.getElementById('hud-mode-sub');
    this.roomCodePillEl = document.getElementById('hud-room-code');

    this.bombBannerEl = document.getElementById('hud-bomb-banner');
    this.bombActionWrap = document.getElementById('hud-bomb-progress-wrap');
    this.bombActionLabel = document.getElementById('hud-bomb-progress-label');
    this.bombActionFill = document.getElementById('hud-bomb-progress-fill');
    this.interactHintEl = document.getElementById('hud-interact-hint');
    this.dropBannerEl = document.getElementById('hud-drop-banner');
    this.dropGuideEl = document.getElementById('hud-drop-guide');
    this.survivalGearEl = document.getElementById('hud-survival-gear');
    this.bigMapCanvas = document.getElementById('br-bigmap-canvas');
    this.bigMapCtx = this.bigMapCanvas?.getContext('2d');
    this._terrainCanvasCache = new Map();

    this.killFeedEl = document.getElementById('hud-killfeed');
    this.streakBannerEl = document.getElementById('hud-streak-banner');
    this.crosshairEl = document.getElementById('hud-crosshair');
    this.hitmarkerEl = document.getElementById('hud-hitmarker');
    this.hitDmgEl = document.getElementById('hud-hit-dmg');
    this.sniperOverlay = document.getElementById('sniper-scope-overlay');
    this.sniperZoomLabel = document.getElementById('sniper-zoom-label');
    this.acogOverlay = document.getElementById('acog-scope-overlay');
    this.acogZoomLabel = document.getElementById('acog-zoom-label');
    this.adsVignette = document.getElementById('ads-vignette-overlay');
    this.adsBadgeEl = document.getElementById('ads-mode-badge');
    this.damageVignette = document.getElementById('hud-damage-vignette');
    this.respawnOverlay = document.getElementById('hud-respawn-overlay');
    this.respawnTimerEl = document.getElementById('hud-respawn-sec');
    this.roundBannerEl = document.getElementById('hud-round-banner');
    this.fpsPingEl = document.getElementById('hud-fps-ping');
    this.scoreboardModal = document.getElementById('hud-scoreboard');
    this.scoreboardBody = document.getElementById('hud-scoreboard-body');
    this.radioMenuEl = document.getElementById('hud-radio-menu');

    this.hitmarkerTimeout = null;
    this.damageTimeout = null;
    this.streakTimeout = null;
    this.enemyRevealUntil = new Map();

    // State diff cache to prevent redundant 60Hz DOM reflows
    this._cache = {
      hp: -1,
      armor: -1,
      slot: -1,
      weaponId: '',
      ammo: -1,
      reserve: -1,
      grenades: -1,
      primaryId: '',
      secondaryId: '',
      meleeId: '',
      chGap: -1,
      chMode: '',
      zoomText: '',
      adsBadgeText: '',
      timerText: '',
      alphaScore: -1,
      bravoScore: -1,
      modeSub: ''
    };
    this._staticMapCache = new Map();
  }

  setRoomCode(code) {
    if (this.roomCodePillEl) {
      this.roomCodePillEl.textContent = code ? `MÃ PHÒNG: #${code}` : '';
    }
  }

  markEnemyFired(shooterId) {
    this.enemyRevealUntil.set(shooterId, performance.now() + 3200);
  }

  updateVitals(hp, maxHp, armor, maxArmor) {
    const safeHp = Math.max(0, Math.round(hp));
    const safeArmor = Math.max(0, Math.round(armor));

    if (safeHp !== this._cache.hp) {
      this._cache.hp = safeHp;
      if (this.hpValEl) this.hpValEl.textContent = String(safeHp);
      if (this.hpBarEl) {
        const pct = Math.max(0, Math.min(100, (safeHp / (maxHp || 100)) * 100));
        this.hpBarEl.style.width = `${pct}%`;
        this.hpBarEl.classList.toggle('critical', safeHp <= 30);
      }
    }

    if (safeArmor !== this._cache.armor) {
      this._cache.armor = safeArmor;
      if (this.armorValEl) this.armorValEl.textContent = String(safeArmor);
      if (this.armorBarEl) {
        const pct = Math.max(0, Math.min(100, (safeArmor / (maxArmor || 100)) * 100));
        this.armorBarEl.style.width = `${pct}%`;
      }
    }
  }

  updateWeaponHUD(slot, weaponId, ammo, reserveAmmo, primaryId = 'ak47', secondaryId = 'deagle', meleeId = 'knife', grenades = 1) {
    const w = WEAPONS[weaponId] || WEAPONS[meleeId] || WEAPONS.knife;
    if (weaponId !== this._cache.weaponId) {
      this._cache.weaponId = weaponId;
      if (this.weaponNameEl) this.weaponNameEl.textContent = w.name;
    }

    if (w.isMelee) {
      if (this._cache.ammo !== '∞') {
        this._cache.ammo = '∞';
        if (this.ammoMagEl) this.ammoMagEl.textContent = '∞';
        if (this.ammoResEl) this.ammoResEl.textContent = 'CẬN CHIẾN';
      }
    } else {
      if (ammo !== this._cache.ammo) {
        this._cache.ammo = ammo;
        if (this.ammoMagEl) this.ammoMagEl.textContent = String(ammo);
      }
      if (reserveAmmo !== this._cache.reserve) {
        this._cache.reserve = reserveAmmo;
        if (this.ammoResEl) this.ammoResEl.textContent = `/ ${reserveAmmo}`;
      }
    }

    if (grenades !== this._cache.grenades) {
      this._cache.grenades = grenades;
      if (this.grenadeCountEl) this.grenadeCountEl.textContent = String(grenades ?? 0);
    }

    const pKey = primaryId || '__EMPTY__';
    if (pKey !== this._cache.primaryId) {
      this._cache.primaryId = pKey;
      if (this.slot1NameEl) {
        this.slot1NameEl.textContent = primaryId && WEAPONS[primaryId] ? WEAPONS[primaryId].name : '--- (Trống)';
      }
      this.slotBtns.find((b) => Number(b.dataset.slot) === 1)?.classList.toggle('empty-slot', !primaryId);
    }
    const sKey = secondaryId || '__EMPTY__';
    if (sKey !== this._cache.secondaryId) {
      this._cache.secondaryId = sKey;
      if (this.slot2NameEl) {
        this.slot2NameEl.textContent = secondaryId && WEAPONS[secondaryId] ? WEAPONS[secondaryId].name : '--- (Trống)';
      }
      this.slotBtns.find((b) => Number(b.dataset.slot) === 2)?.classList.toggle('empty-slot', !secondaryId);
    }
    if (meleeId !== this._cache.meleeId) {
      this._cache.meleeId = meleeId;
      if (this.slot3NameEl && WEAPONS[meleeId]) this.slot3NameEl.textContent = WEAPONS[meleeId].name;
    }

    if (slot !== this._cache.slot) {
      this._cache.slot = slot;
      for (const btn of this.slotBtns) {
        btn.classList.toggle('active', Number(btn.dataset.slot) === Number(slot));
      }
    }
  }

  updateReloadProgress(ratio) {
    if (!this.reloadBarWrap || !this.reloadBarFill) return;
    if (ratio > 0 && ratio < 1) {
      this.reloadBarWrap.classList.remove('hidden');
      this.reloadBarFill.style.width = `${Math.round(ratio * 100)}%`;
    } else {
      this.reloadBarWrap.classList.add('hidden');
    }
  }

  updateTopScoreAndTimer({ mode, modeConfig, alphaScore, bravoScore, roundNumber, timeLeftSec, myKills, aliveCount }) {
    const mins = Math.floor(timeLeftSec / 60);
    const secs = timeLeftSec % 60;
    const tStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (tStr !== this._cache.timerText && this.timerEl) {
      this._cache.timerText = tStr;
      this.timerEl.textContent = tStr;
    }

    if (modeConfig?.teamBased) {
      if (this.alphaLabelEl && this.alphaLabelEl.textContent !== 'ALPHA') this.alphaLabelEl.textContent = 'ALPHA';
      if (this.bravoLabelEl && this.bravoLabelEl.textContent !== 'BRAVO') this.bravoLabelEl.textContent = 'BRAVO';
      if (alphaScore !== this._cache.alphaScore && this.alphaScoreEl) {
        this._cache.alphaScore = alphaScore;
        this.alphaScoreEl.textContent = String(alphaScore);
      }
      if (bravoScore !== this._cache.bravoScore && this.bravoScoreEl) {
        this._cache.bravoScore = bravoScore;
        this.bravoScoreEl.textContent = String(bravoScore);
      }
      const sub = mode === 'bomb'
        ? `HIỆP ${roundNumber} • CHẠM ${modeConfig.scoreLimit}`
        : `${modeConfig.shortName.toUpperCase()} • MỤC TIÊU ${modeConfig.scoreLimit}`;
      if (sub !== this._cache.modeSub && this.modeSubEl) {
        this._cache.modeSub = sub;
        this.modeSubEl.textContent = sub;
      }
    } else if (mode === 'survival') {
      if (this.alphaLabelEl && this.alphaLabelEl.textContent !== 'HẠ GỤC') this.alphaLabelEl.textContent = 'HẠ GỤC';
      if (this.bravoLabelEl && this.bravoLabelEl.textContent !== 'CÒN SỐNG') this.bravoLabelEl.textContent = 'CÒN SỐNG';
      if (this.alphaScoreEl) this.alphaScoreEl.textContent = String(myKills || 0);
      if (this.bravoScoreEl) this.bravoScoreEl.textContent = String(aliveCount || 1);
      if (this.modeSubEl && this.modeSubEl.textContent !== 'SINH TỒN • VÒNG BO ĐANG THU HẸP') {
        this.modeSubEl.textContent = 'SINH TỒN • VÒNG BO ĐANG THU HẸP';
      }
    } else {
      if (this.alphaLabelEl && this.alphaLabelEl.textContent !== 'BẠN') this.alphaLabelEl.textContent = 'BẠN';
      if (this.bravoLabelEl && this.bravoLabelEl.textContent !== 'MỤC TIÊU') this.bravoLabelEl.textContent = 'MỤC TIÊU';
      if (this.alphaScoreEl) this.alphaScoreEl.textContent = String(myKills || 0);
      if (this.bravoScoreEl) this.bravoScoreEl.textContent = String(modeConfig?.scoreLimit || 20);
      const sub = mode === 'practice' ? 'TRƯỜNG BẮN THỬ SÚNG 3D' : 'SOLO DEATHMATCH';
      if (this.modeSubEl && this.modeSubEl.textContent !== sub) this.modeSubEl.textContent = sub;
    }
  }

  updateCrosshair(spreadPx = 6, isSniperScoped = false, isAds = false, opticId = 'iron', adsBlend = 0, zoomFactor = 1.0) {
    let mode = 'hip';
    if (isSniperScoped) {
      mode = 'sniper';
    } else if (isAds && opticId === 'acog' && adsBlend > 0.55) {
      mode = 'acog';
    } else if (isAds && opticId === 'reddot' && adsBlend > 0.35) {
      mode = 'holo';
    } else if (isAds && adsBlend > 0.35) {
      mode = 'iron';
    }

    if (mode !== this._cache.chMode) {
      this._cache.chMode = mode;
      this.sniperOverlay?.classList.toggle('hidden', mode !== 'sniper');
      this.acogOverlay?.classList.toggle('hidden', mode !== 'acog');
      this.adsVignette?.classList.toggle('hidden', mode !== 'holo' && mode !== 'iron');
      this.adsBadgeEl?.classList.toggle('hidden', mode !== 'holo' && mode !== 'iron');
      if (this.crosshairEl) {
        this.crosshairEl.classList.toggle('hidden', mode === 'sniper' || mode === 'acog');
        this.crosshairEl.classList.toggle('ads-holo', mode === 'holo');
        this.crosshairEl.classList.toggle('ads-iron', mode === 'iron');
        this.crosshairEl.classList.toggle('ads-tight', mode === 'holo' || mode === 'iron');
      }
    }

    if (mode === 'sniper') {
      const zt = `${zoomFactor.toFixed(1)}×`;
      if (zt !== this._cache.zoomText && this.sniperZoomLabel) {
        this._cache.zoomText = zt;
        this.sniperZoomLabel.textContent = zt;
      }
      return;
    }

    if (mode === 'acog') {
      const zt = `ACOG ${zoomFactor.toFixed(1)}×`;
      if (zt !== this._cache.zoomText && this.acogZoomLabel) {
        this._cache.zoomText = zt;
        this.acogZoomLabel.textContent = zt;
      }
      return;
    }

    if (mode === 'holo' || mode === 'iron') {
      const label = mode === 'holo' ? `HOLO • ${zoomFactor.toFixed(1)}×` : `NGẮM CHUẨN • ${zoomFactor.toFixed(1)}×`;
      if (label !== this._cache.adsBadgeText && this.adsBadgeEl) {
        this._cache.adsBadgeText = label;
        this.adsBadgeEl.textContent = label;
      }
      return;
    }

    if (!this.crosshairEl) return;
    const gap = Math.round(Math.max(4, Math.min(26, spreadPx)));
    if (gap !== this._cache.chGap) {
      this._cache.chGap = gap;
      this.crosshairEl.style.setProperty('--ch-gap', `${gap}px`);
    }
  }

  showHitmarker(damage, hitZone, killed) {
    if (!this.hitmarkerEl) return;
    const isHead = hitZone === 'head';
    this.hitmarkerEl.classList.remove('hidden', 'headshot', 'kill');
    if (isHead) this.hitmarkerEl.classList.add('headshot');
    if (killed) this.hitmarkerEl.classList.add('kill');

    if (this.hitDmgEl) {
      this.hitDmgEl.textContent = hitZone === 'shield'
        ? 'KHIÊN BẢO VỆ'
        : (isHead ? `⌖ -${damage}` : `-${damage}`);
      this.hitDmgEl.classList.remove('hidden');
      this.hitDmgEl.classList.toggle('crit', isHead || killed);
    }

    clearTimeout(this.hitmarkerTimeout);
    this.hitmarkerTimeout = setTimeout(() => {
      this.hitmarkerEl.classList.add('hidden');
      this.hitDmgEl?.classList.add('hidden');
    }, 240);
  }

  showKillStreak(streak = 1, isHeadshot = false, isFirstBlood = false, victimName = '') {
    if (!this.streakBannerEl) return;
    let title = 'HẠ GỤC MỤC TIÊU';
    if (isFirstBlood) title = '⚡ CHIẾN CÔNG ĐẦU (FIRST BLOOD)';
    if (streak === 2) title = '🔥🔥 DOUBLE KILL!';
    else if (streak === 3) title = '🔥🔥🔥 TRIPLE KILL!';
    else if (streak === 4) title = '💀 QUADRA KILL!';
    else if (streak >= 5) title = '👑 HUYỀN THOẠI HỦY DIỆT (RAMPAGE)!';
    else if (isHeadshot && !isFirstBlood) title = '⌖ ONE-SHOT HEADSHOT!';

    this.streakBannerEl.innerHTML = `
      <div class="streak-main">${title}</div>
      <div class="streak-sub">Tiêu diệt ${this.escape(victimName)}</div>
    `;
    this.streakBannerEl.classList.remove('hidden');
    clearTimeout(this.streakTimeout);
    this.streakTimeout = setTimeout(() => {
      this.streakBannerEl.classList.add('hidden');
    }, 2300);
  }

  toggleRadioMenu(show) {
    this.radioMenuEl?.classList.toggle('hidden', !show);
  }

  flashDamageTaken(isStorm = false) {
    if (!this.damageVignette) return;
    this.damageVignette.classList.remove('hidden');
    this.damageVignette.classList.toggle('storm', Boolean(isStorm));
    clearTimeout(this.damageTimeout);
    this.damageTimeout = setTimeout(() => {
      this.damageVignette.classList.add('hidden');
    }, 300);
  }

  pushKillFeed({ killerName, killerTeam, victimName, victimTeam, weaponId, headshot }) {
    if (!this.killFeedEl) return;
    const item = document.createElement('div');
    item.className = 'killfeed-item';
    const wName = WEAPONS[weaponId]?.name || (weaponId === 'grenade' ? '💣 LỰU ĐẠN' : (weaponId === 'storm' ? '☣ BO ĐỘC' : '💣 C4'));
    const kClass = killerTeam === 'alpha' ? 'team-alpha-txt' : (killerTeam === 'bravo' ? 'team-bravo-txt' : '');
    const vClass = victimTeam === 'alpha' ? 'team-alpha-txt' : (victimTeam === 'bravo' ? 'team-bravo-txt' : '');
    const hsBadge = headshot ? '<span class="kf-hs">⌖ HS</span>' : '';

    item.innerHTML = `
      <span class="kf-name ${kClass}">${this.escape(killerName)}</span>
      <span class="kf-weapon">[${wName}] ${hsBadge}</span>
      <span class="kf-name ${vClass}">${this.escape(victimName)}</span>
    `;
    this.killFeedEl.prepend(item);
    while (this.killFeedEl.children.length > 6) {
      this.killFeedEl.lastElementChild.remove();
    }
    setTimeout(() => item.remove(), 5200);
  }

  updateBombHUD(bomb, localPlayer, mapData) {
    if (!bomb) {
      this.bombBannerEl?.classList.add('hidden');
      this.bombActionWrap?.classList.add('hidden');
      this.interactHintEl?.classList.add('hidden');
      return;
    }

    if (bomb.planted) {
      this.bombBannerEl?.classList.remove('hidden');
      if (this.bombBannerEl) {
        this.bombBannerEl.textContent = `⚠ BOM C4 ĐÃ ĐẶT TẠI KHU ${bomb.siteId} — PHÁT NỔ SAU ${bomb.bombLeftSec.toFixed(1)}s`;
      }
    } else {
      this.bombBannerEl?.classList.add('hidden');
    }

    if (bomb.plantProg > 0 && bomb.planterId === localPlayer?.id) {
      this.bombActionWrap?.classList.remove('hidden');
      if (this.bombActionLabel) this.bombActionLabel.textContent = 'ĐANG ĐẶT BOM C4...';
      if (this.bombActionFill) this.bombActionFill.style.width = `${Math.round(bomb.plantProg * 100)}%`;
    } else if (bomb.defuseProg > 0 && bomb.defuserId === localPlayer?.id) {
      this.bombActionWrap?.classList.remove('hidden');
      if (this.bombActionLabel) this.bombActionLabel.textContent = 'ĐANG GỠ BOM C4...';
      if (this.bombActionFill) this.bombActionFill.style.width = `${Math.round(bomb.defuseProg * 100)}%`;
    } else {
      this.bombActionWrap?.classList.add('hidden');
    }

    let hint = '';
    if (localPlayer && !localPlayer.dead) {
      if (!bomb.planted && localPlayer.hasBomb) {
        const inSite = (mapData?.bombSites || []).find(
          (s) => Math.hypot(localPlayer.x - s.x, localPlayer.z - s.z) <= s.radius
        );
        hint = inSite
          ? `Giữ phím [E] để ĐẶT BOM C4 tại Khu ${inSite.id}`
          : 'Bạn đang giữ BOM C4 — Tiến vào Khu A hoặc Khu B để đặt bom!';
      } else if (bomb.planted && localPlayer.team === 'alpha') {
        if (Math.hypot(localPlayer.x - bomb.x, localPlayer.z - bomb.z) <= 2.6) {
          hint = 'Giữ phím [E] để GỠ BOM C4 ngay!';
        }
      }
    }

    if (this.interactHintEl) {
      if (hint) {
        if (this.interactHintEl.textContent !== hint) this.interactHintEl.textContent = hint;
        this.interactHintEl.classList.remove('hidden');
      } else {
        this.interactHintEl.classList.add('hidden');
      }
    }
  }

  showRoundBanner(text, winnerTeam = '') {
    if (!this.roundBannerEl) return;
    this.roundBannerEl.textContent = text;
    this.roundBannerEl.className = `hud-round-banner ${winnerTeam}`;
    setTimeout(() => {
      this.roundBannerEl?.classList.add('hidden');
    }, 3500);
  }

  setRespawnState(dead, secondsLeft = 0) {
    if (!this.respawnOverlay) return;
    if (dead) {
      this.respawnOverlay.classList.remove('hidden');
      if (this.respawnTimerEl) {
        this.respawnTimerEl.textContent = secondsLeft > 0
          ? `Hồi sinh sau ${secondsLeft.toFixed(1)}s...`
          : 'Đang theo dõi đồng đội — Chờ hiệp tiếp theo';
      }
    } else {
      this.respawnOverlay.classList.add('hidden');
    }
  }

  updateFpsAndPing(fps, pingMs, fpsCap = 60) {
    if (this.fpsPingEl) {
      const capLabel = fpsCap > 0 ? fpsCap : '150+';
      this.fpsPingEl.textContent = `FPS: ${fps} (${capLabel})  |  PING: ${pingMs}ms`;
    }
  }

  updateDropBanner(info) {
    if (!this.dropBannerEl && !this.dropGuideEl) return;
    if (!info) {
      this.dropBannerEl?.classList.add('hidden');
      this.dropGuideEl?.classList.add('hidden');
      return;
    }

    this.dropBannerEl?.classList.remove('hidden');
    this.dropGuideEl?.classList.remove('hidden');
    const alt = Math.max(0, info.altitude || 0);
    const vy = Math.max(0, info.vy || 0);
    const altPct = Math.min(100, Math.round((alt / 260) * 100));

    if (this.dropBannerEl) {
      if (info.phase === 'plane') {
        this.dropBannerEl.textContent = `✈ MÁY BAY C-130 (${alt}m) — Nhấn [F] hoặc [SPACE] NHẢY DÙ • [M] Xem Bản Đồ 5km`;
      } else if (info.phase === 'skydive') {
        this.dropBannerEl.textContent = `🪂 RƠI TỰ DO (${alt}m • ${vy} m/s) — [SPACE] Mở Dù Sớm (Tự bung ở 55m)`;
      } else {
        this.dropBannerEl.textContent = `🪂 ĐANG LƯỢN DÙ (${alt}m • ${vy} m/s) — [W] Tới • [S] Hãm Rơi Chậm • [A/D] Lượn`;
      }
    }

    if (this.dropGuideEl) {
      const phaseBadge = info.phase === 'plane'
        ? 'TRÊN MÁY BAY C-130'
        : (info.phase === 'skydive' ? 'RƠI TỰ DO (SKYDIVING)' : 'ĐANG LƯỢN DÙ (CHẬM & ỔN ĐỊNH)');
      const hintRows = info.phase === 'plane'
        ? `
          <div><kbd>F</kbd> / <kbd>Space</kbd> Nhảy khỏi máy bay</div>
          <div><kbd>M</kbd> Mở bản đồ 5km chọn Nhà / Chòi / Cầu</div>
          <div><kbd>Chuột</kbd> Xoay quan sát địa hình</div>
        `
        : (info.phase === 'skydive'
          ? `
            <div><kbd>W</kbd> Bay tới xa • <kbd>A/D</kbd> Lệch hướng</div>
            <div><kbd>Nhìn xuống</kbd> Lao nhanh xuống mục tiêu</div>
            <div><kbd>Space</kbd> Bung dù sớm ngay bây giờ</div>
          `
          : `
            <div><kbd>W</kbd> Lướt nhanh về phía trước</div>
            <div><kbd>S</kbd> Hãm dù rơi cực chậm (~2.4 m/s)</div>
            <div><kbd>A/D</kbd> + <kbd>Chuột</kbd> Chỉnh điểm đáp nóc nhà / chòi</div>
          `);

      this.dropGuideEl.innerHTML = `
        <div class="dg-head">
          <span class="dg-phase">${phaseBadge}</span>
          <span class="dg-alt">${alt}m • ${vy} m/s</span>
        </div>
        <div class="dg-alt-bar">
          <div class="dg-alt-fill" style="width:${altPct}%"></div>
          <span class="dg-auto-mark" style="left:21%" title="Mốc tự bung dù 55m"></span>
        </div>
        <div class="dg-hints">${hintRows}</div>
      `;
    }
  }

  setAutoRunActive(active) {
    if (!this.autoRunBadgeEl) {
      this.autoRunBadgeEl = document.getElementById('autorun-badge');
    }
    if (this.autoRunBadgeEl) {
      this.autoRunBadgeEl.classList.toggle('hidden', !active);
    }
  }

  updateLootHint(crate, weaponsState) {
    if (!this.interactHintEl) return;
    if (!crate) {
      this.interactHintEl.classList.add('hidden');
      return;
    }
    let hint = '';
    if (crate.kind === 'deathbox') {
      const count = crate.items?.length || 0;
      hint = `⚰ HÒM XÁC ${crate.ownerName || ''} (${count} món) — Nhấn [E] hoặc [Tab] để nhặt toàn bộ đồ!`;
    } else if (crate.kind === 'weapon' && crate.weaponId) {
      const s1Empty = !weaponsState?.[1]?.id;
      const s2Empty = !weaponsState?.[2]?.id;
      const targetSlot = s1Empty ? 1 : (s2Empty ? 2 : (this._cache?.slot === 2 ? 2 : 1));
      const occupied = Boolean(weaponsState?.[targetSlot]?.id);
      const label = crate.label || WEAPONS[crate.weaponId]?.name || crate.weaponId;
      hint = occupied
        ? `Nhấn [E] ĐỔI súng [${targetSlot}] hoặc [Tab] Balo để lấy ${label}`
        : `Tiến sát để NHẶT ${label} vào [${targetSlot}] • [Tab] Mở Balo`;
    } else if (crate.label) {
      hint = `📦 ${crate.label} — Nhấn [E] nhặt hoặc [Tab] mở Balo`;
    }
    if (hint) {
      if (this.interactHintEl.textContent !== hint) this.interactHintEl.textContent = hint;
      this.interactHintEl.classList.remove('hidden');
    } else {
      this.interactHintEl.classList.add('hidden');
    }
  }

  updateSurvivalGear(local) {
    if (!this.survivalGearEl) return;
    if (!local || !local.gear || !local.backpack) {
      this.survivalGearEl.classList.add('hidden');
      return;
    }
    this.survivalGearEl.classList.remove('hidden');
    const g = local.gear;
    const meds = local.backpack.meds || {};
    const wt = Math.round(local.backpackWeight ?? computeBackpackWeight(local.backpack));
    const cap = local.backpack.capacity || 120;
    const quickBand = (meds.bandage || 0) + (meds.energy || 0);
    const quickFirstAid = (meds.firstaid || 0) + (meds.medkit || 0);

    this.survivalGearEl.innerHTML = `
      <span class="gear-pill ${g.helmetTier ? 't' + g.helmetTier : ''}">🪖 Mũ Lv.${g.helmetTier || 0}</span>
      <span class="gear-pill ${g.vestTier ? 't' + g.vestTier : ''}">🦺 Giáp Lv.${g.vestTier || 0}</span>
      <span class="gear-pill ${g.bagTier ? 't' + g.bagTier : ''}">🎒 Balo Lv.${g.bagTier || 0} (${wt}/${cap})</span>
      <span class="gear-pill med"><kbd>7</kbd> Băng ×${quickBand}</span>
      <span class="gear-pill med"><kbd>8</kbd> Y Tế ×${quickFirstAid}</span>
      <span class="gear-pill hint"><kbd>=</kbd> Auto Run • <kbd>Tab</kbd>/<kbd>I</kbd> Balo • <kbd>M</kbd> Bản Đồ</span>
    `;
  }

  renderBackpackModal({ nearbyCrates = [], local, onLootItem, onDropItem, onUseMed }) {
    const vicEl = document.getElementById('br-vicinity-list');
    const bagEl = document.getElementById('br-bag-list');
    const eqEl = document.getElementById('br-equip-list');
    const wtTxt = document.getElementById('br-bag-weight-text');
    const wtFill = document.getElementById('br-bag-weight-fill');
    if (!vicEl || !bagEl || !eqEl || !local) return;

    const bag = local.backpack || { tier: 0, capacity: 120, ammo: {}, meds: {}, frag_grenade: 0 };
    const gear = local.gear || { vestTier: 0, helmetTier: 0, helmetArmor: 0, bagTier: 0 };
    const wt = computeBackpackWeight(bag);
    const cap = bag.capacity || 120;
    if (wtTxt) wtTxt.textContent = `${wt.toFixed(0)} / ${cap} kg (${BR_BACKPACKS[bag.tier || 0]?.name || 'Balo'})`;
    if (wtFill) wtFill.style.width = `${Math.min(100, Math.round((wt / cap) * 100))}%`;

    // 1. Left Column: Vicinity & Death Boxes
    const vicCards = [];
    for (const c of nearbyCrates) {
      if (c.kind === 'deathbox') {
        vicCards.push(`<div class="inv-group-title">⚰ Hòm Xác: ${this.escape(c.ownerName || 'Kẻ Địch')} (${c.items?.length || 0})</div>`);
        for (const it of c.items || []) {
          vicCards.push(`
            <div class="inv-row">
              <span>${this.escape(it.label || it.weaponId || it.kind)}</span>
              <button class="inv-btn pick" data-loot="${c.id}" data-item="${it.itemId}">Nhặt</button>
            </div>
          `);
        }
      } else {
        vicCards.push(`
          <div class="inv-row">
            <span>📦 ${this.escape(c.label || c.weaponId || c.kind)}</span>
            <button class="inv-btn pick" data-loot="${c.id}" data-item="">Nhặt</button>
          </div>
        `);
      }
    }
    vicEl.innerHTML = vicCards.length ? vicCards.join('') : '<div class="inv-empty">Không có vật phẩm hoặc hòm xác nào quanh đây (bước lại gần để nhặt).</div>';

    // 2. Center Column: Backpack Contents (Meds, Ammo, Grenades)
    const bagCards = [];
    for (const [mId, qty] of Object.entries(bag.meds || {})) {
      if (qty <= 0) continue;
      const mCfg = BR_MEDS[mId];
      bagCards.push(`
        <div class="inv-row">
          <span>✚ ${this.escape(mCfg?.name || mId)} ×<strong>${qty}</strong></span>
          <div class="inv-acts">
            <button class="inv-btn use" data-use="${mId}">Dùng</button>
            <button class="inv-btn drop" data-drop="med" data-key="${mId}" data-qty="1">Vứt 1</button>
          </div>
        </div>
      `);
    }
    if ((bag.frag_grenade || 0) > 0) {
      bagCards.push(`
        <div class="inv-row">
          <span>💣 Lựu Đạn Nổ ×<strong>${bag.frag_grenade}</strong></span>
          <div class="inv-acts">
            <button class="inv-btn drop" data-drop="grenade" data-key="frag" data-qty="1">Vứt 1</button>
          </div>
        </div>
      `);
    }
    for (const [aType, qty] of Object.entries(bag.ammo || {})) {
      if (qty <= 0) continue;
      const aCfg = BR_AMMO_TYPES[aType];
      const step = aCfg?.dropStep || 30;
      bagCards.push(`
        <div class="inv-row">
          <span>🔸 ${this.escape(aCfg?.name || aType)} ×<strong>${qty}</strong></span>
          <div class="inv-acts">
            <button class="inv-btn drop" data-drop="ammo" data-key="${aType}" data-qty="${Math.min(qty, step)}">Vứt ${Math.min(qty, step)}</button>
            <button class="inv-btn drop" data-drop="ammo" data-key="${aType}" data-qty="${qty}">Hết</button>
          </div>
        </div>
      `);
    }
    bagEl.innerHTML = bagCards.length ? bagCards.join('') : '<div class="inv-empty">Balo trống rỗng. Hãy nhặt súng, đạn và hồi máu từ nhà dân hoặc hòm xác!</div>';

    // 3. Right Column: Equipped Gear & Firearms
    const eqCards = [];
    const s1 = local.weaponsState?.[1]?.id;
    const s2 = local.weaponsState?.[2]?.id;
    eqCards.push(`
      <div class="inv-row">
        <span><strong>[1] Súng Chính:</strong> ${s1 ? this.escape(WEAPONS[s1]?.name || s1) : '<em>Trống</em>'}</span>
        ${s1 ? `<button class="inv-btn drop" data-drop="weapon" data-key="1">Vứt Súng</button>` : ''}
      </div>
      <div class="inv-row">
        <span><strong>[2] Súng Phụ:</strong> ${s2 ? this.escape(WEAPONS[s2]?.name || s2) : '<em>Trống</em>'}</span>
        ${s2 ? `<button class="inv-btn drop" data-drop="weapon" data-key="2">Vứt Súng</button>` : ''}
      </div>
      <div class="inv-row">
        <span><strong>🪖 Mũ:</strong> ${gear.helmetTier ? `${BR_HELMETS[gear.helmetTier]?.name} (${gear.helmetArmor} AP)` : '<em>Chưa có</em>'}</span>
        ${gear.helmetTier ? `<button class="inv-btn drop" data-drop="helmet" data-key="helmet">Vứt</button>` : ''}
      </div>
      <div class="inv-row">
        <span><strong>🦺 Giáp:</strong> ${gear.vestTier ? `${BR_VESTS[gear.vestTier]?.name} (${Math.round(local.armor)} AP)` : '<em>Chưa có</em>'}</span>
        ${gear.vestTier ? `<button class="inv-btn drop" data-drop="vest" data-key="vest">Vứt</button>` : ''}
      </div>
      <div class="inv-row">
        <span><strong>🎒 Balo:</strong> ${BR_BACKPACKS[bag.tier || 0]?.name}</span>
      </div>
    `);
    eqEl.innerHTML = eqCards.join('');

    // Wire buttons directly
    vicEl.querySelectorAll('[data-loot]').forEach((btn) => {
      btn.addEventListener('click', () => onLootItem(btn.dataset.loot, btn.dataset.item || null));
    });
    bagEl.querySelectorAll('[data-use]').forEach((btn) => {
      btn.addEventListener('click', () => onUseMed(btn.dataset.use));
    });
    document.querySelectorAll('#br-backpack-modal [data-drop]').forEach((btn) => {
      btn.addEventListener('click', () => onDropItem(btn.dataset.drop, btn.dataset.key, Number(btn.dataset.qty || 1)));
    });
  }

  _getTerrainCanvas(mapData) {
    if (this._terrainCanvasCache.has(mapData.id)) {
      return this._terrainCanvasCache.get(mapData.id);
    }
    const size = 512;
    const rgba = renderTerrainRGBA(mapData.terrain, size);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    this._terrainCanvasCache.set(mapData.id, c);
    return c;
  }

  drawBigMap(mapData, localPlayer, storm, dropPlane = null, pingMarker = null) {
    if (!this.bigMapCtx || !mapData || !localPlayer) return;
    const ctx = this.bigMapCtx;
    const w = this.bigMapCanvas.width;
    const h = this.bigMapCanvas.height;
    const half = mapData.bounds?.halfW || 2500;
    const toPx = (wx, wz) => [((wx + half) / (half * 2)) * w, ((wz + half) / (half * 2)) * h];

    ctx.clearRect(0, 0, w, h);
    if (mapData.terrain) {
      ctx.drawImage(this._getTerrainCanvas(mapData), 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
    }

    // 1km Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let g = -2000; g <= 2000; g += 1000) {
      const [gx, gz] = toPx(g, g);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(w, gz); ctx.stroke();
    }

    // Named Towns, Compounds & Outposts
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    for (const np of mapData.namedPlaces || []) {
      const [px, pz] = toPx(np.x, np.z);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(px - 52, pz - 9, 104, 16);
      ctx.fillStyle = '#fef08a';
      ctx.fillText(np.name, px, pz + 3);
    }

    if (storm) {
      const [sx, sz] = toPx(storm.x, storm.z);
      const sr = (storm.r / (half * 2)) * w;
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx, sz, sr, 0, Math.PI * 2); ctx.stroke();
    }

    if (dropPlane?.active) {
      const [sx, sz] = toPx(dropPlane.startX, dropPlane.startZ);
      const [ex, ez] = toPx(dropPlane.endX, dropPlane.endZ);
      const [px, pz] = toPx(dropPlane.x, dropPlane.z);
      ctx.strokeStyle = '#f97316';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sz); ctx.lineTo(ex, ez); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.arc(px, pz, 6, 0, Math.PI * 2); ctx.fill();
    }

    if (pingMarker) {
      const [mx, mz] = toPx(pingMarker.x, pingMarker.z);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(mx, mz, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const [lx, lz] = toPx(localPlayer.x, localPlayer.z);
    ctx.save();
    ctx.translate(lx, lz);
    ctx.rotate(-localPlayer.yaw);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _getStaticMapCanvas(mapData, scale) {
    const cacheKey = `${mapData.id}_${scale.toFixed(2)}`;
    if (this._staticMapCache.has(cacheKey)) {
      return this._staticMapCache.get(cacheKey);
    }
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.translate(128, 128);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.44)';
    for (const b of mapData.blocks) {
      if (b.y > 4.0) continue;
      ctx.fillRect((b.x - b.w * 0.5) * scale, (b.z - b.d * 0.5) * scale, b.w * scale, b.d * scale);
    }
    for (const site of mapData.bombSites || []) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(site.x * scale, site.z * scale, site.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    this._staticMapCache.set(cacheKey, c);
    return c;
  }

  drawMinimap(mapData, localPlayer, allPlayers, teamBased, bomb, storm, dropPlane = null, pingMarker = null) {
    if (!this.mmCtx || !mapData || !localPlayer) return;
    const ctx = this.mmCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const halfSpan = Math.max(mapData.bounds?.halfW || 40, mapData.bounds?.halfD || 40);
    const scale = mapData.terrain ? (localPlayer.dropPhase === 'plane' ? 0.08 : 0.35) : (halfSpan > 55 ? 1.15 : 2.25);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 3, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(8, 13, 24, 0.88)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.stroke();

    ctx.translate(cx, cy);
    ctx.rotate(localPlayer.yaw);

    if (mapData.terrain) {
      const tCanvas = this._getTerrainCanvas(mapData);
      const drawW = halfSpan * 2 * scale;
      ctx.drawImage(tCanvas, (-halfSpan - localPlayer.x) * scale, (-halfSpan - localPlayer.z) * scale, drawW, drawW);
      for (const np of mapData.namedPlaces || []) {
        const nx = (np.x - localPlayer.x) * scale;
        const nz = (np.z - localPlayer.z) * scale;
        if (Math.hypot(nx, nz) > 92) continue;
        ctx.save();
        ctx.translate(nx, nz);
        ctx.rotate(-localPlayer.yaw);
        ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(np.name, 0, 0);
        ctx.restore();
      }
    } else {
      const staticCanvas = this._getStaticMapCanvas(mapData, scale);
      ctx.drawImage(staticCanvas, -128 - localPlayer.x * scale, -128 - localPlayer.z * scale);
    }

    if (pingMarker) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc((pingMarker.x - localPlayer.x) * scale, (pingMarker.z - localPlayer.z) * scale, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const site of mapData.bombSites || []) {
      const sx = (site.x - localPlayer.x) * scale;
      const sz = (site.z - localPlayer.z) * scale;
      ctx.save();
      ctx.translate(sx, sz);
      ctx.rotate(-localPlayer.yaw);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.id, 0, 0);
      ctx.restore();
    }

    if (storm) {
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((storm.x - localPlayer.x) * scale, (storm.z - localPlayer.z) * scale, storm.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (dropPlane?.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo((dropPlane.startX - localPlayer.x) * scale, (dropPlane.startZ - localPlayer.z) * scale);
      ctx.lineTo((dropPlane.endX - localPlayer.x) * scale, (dropPlane.endZ - localPlayer.z) * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc((dropPlane.x - localPlayer.x) * scale, (dropPlane.z - localPlayer.z) * scale, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (bomb && (bomb.planted || bomb.dropped)) {
      const bx = ((bomb.planted ? bomb.x : bomb.dropX) - localPlayer.x) * scale;
      const bz = ((bomb.planted ? bomb.z : bomb.dropZ) - localPlayer.z) * scale;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(bx, bz, 4.5, 0, Math.PI * 2); ctx.fill();
    }

    const now = performance.now();
    for (const p of allPlayers) {
      if (p.id === localPlayer.id || p.dead) continue;
      const isAlly = teamBased && p.team === localPlayer.team;
      const isRevealedEnemy = !isAlly && (
        (this.enemyRevealUntil.get(p.id) || 0) > now ||
        Math.hypot(p.x - localPlayer.x, p.z - localPlayer.z) < 22
      );
      if (!isAlly && !isRevealedEnemy) continue;

      ctx.fillStyle = isAlly ? '#38bdf8' : '#ef4444';
      ctx.beginPath();
      ctx.arc((p.x - localPlayer.x) * scale, (p.z - localPlayer.z) * scale, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 46, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2); ctx.stroke();
  }

  renderScoreboard(playersList = [], localId = '', teamBased = true) {
    if (!this.scoreboardBody) return;
    const sorted = [...playersList].sort((a, b) => (b.sc || 0) - (a.sc || 0) || (b.k || 0) - (a.k || 0));

    const makeRows = (arr) => arr.map((p) => {
      const isMe = p.id === localId ? 'me-row' : '';
      const tCls = p.team === 'alpha' ? 'team-alpha-txt' : (p.team === 'bravo' ? 'team-bravo-txt' : '');
      return `
        <tr class="${isMe}">
          <td class="${tCls}"><strong>${this.escape(p.name || p.id)}</strong></td>
          <td>${p.team === 'alpha' ? 'ALPHA' : (p.team === 'bravo' ? 'BRAVO' : 'SOLO')}</td>
          <td>${p.k || 0}</td>
          <td>${p.d || 0}</td>
          <td>${p.a || 0}</td>
          <td><strong>${p.sc || 0}</strong></td>
        </tr>
      `;
    }).join('');

    if (teamBased) {
      this.scoreboardBody.innerHTML = makeRows(sorted.filter((p) => p.team === 'alpha')) +
        makeRows(sorted.filter((p) => p.team === 'bravo'));
    } else {
      this.scoreboardBody.innerHTML = makeRows(sorted);
    }
  }

  toggleScoreboard(show) {
    this.scoreboardModal?.classList.toggle('hidden', !show);
  }

  escape(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
