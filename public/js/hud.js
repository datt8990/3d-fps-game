// Upgraded Tactical HUD v2.0: Radar Minimap, Dynamic Crosshair, Kill Streaks, Grenades, Radio & Scoreboard
import { WEAPONS } from '/shared/constants.js';

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

    this.killFeedEl = document.getElementById('hud-killfeed');
    this.streakBannerEl = document.getElementById('hud-streak-banner');
    this.crosshairEl = document.getElementById('hud-crosshair');
    this.hitmarkerEl = document.getElementById('hud-hitmarker');
    this.hitDmgEl = document.getElementById('hud-hit-dmg');
    this.sniperOverlay = document.getElementById('sniper-scope-overlay');
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
    if (this.hpValEl) this.hpValEl.textContent = String(safeHp);
    if (this.armorValEl) this.armorValEl.textContent = String(safeArmor);
    if (this.hpBarEl) {
      const pct = Math.max(0, Math.min(100, (safeHp / (maxHp || 100)) * 100));
      this.hpBarEl.style.width = `${pct}%`;
      this.hpBarEl.classList.toggle('critical', safeHp <= 30);
    }
    if (this.armorBarEl) {
      const pct = Math.max(0, Math.min(100, (safeArmor / (maxArmor || 100)) * 100));
      this.armorBarEl.style.width = `${pct}%`;
    }
  }

  updateWeaponHUD(slot, weaponId, ammo, reserveAmmo, primaryId = 'ak47', secondaryId = 'deagle', meleeId = 'knife', grenades = 1) {
    const w = WEAPONS[weaponId] || WEAPONS.ak47;
    if (this.weaponNameEl) this.weaponNameEl.textContent = w.name;
    if (w.isMelee) {
      if (this.ammoMagEl) this.ammoMagEl.textContent = '∞';
      if (this.ammoResEl) this.ammoResEl.textContent = 'CẬN CHIẾN';
    } else {
      if (this.ammoMagEl) this.ammoMagEl.textContent = String(ammo);
      if (this.ammoResEl) this.ammoResEl.textContent = `/ ${reserveAmmo}`;
    }
    if (this.grenadeCountEl) {
      this.grenadeCountEl.textContent = String(grenades ?? 0);
    }

    const s1 = document.getElementById('hud-slot1-name');
    const s2 = document.getElementById('hud-slot2-name');
    const s3 = document.getElementById('hud-slot3-name');
    if (s1 && WEAPONS[primaryId]) s1.textContent = WEAPONS[primaryId].name;
    if (s2 && WEAPONS[secondaryId]) s2.textContent = WEAPONS[secondaryId].name;
    if (s3 && WEAPONS[meleeId]) s3.textContent = WEAPONS[meleeId].name;

    document.querySelectorAll('.weapon-slots-row .hud-slot-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.slot) === Number(slot));
    });
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
    if (this.timerEl) {
      this.timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (modeConfig?.teamBased) {
      if (this.alphaLabelEl) this.alphaLabelEl.textContent = 'ALPHA';
      if (this.bravoLabelEl) this.bravoLabelEl.textContent = 'BRAVO';
      if (this.alphaScoreEl) this.alphaScoreEl.textContent = String(alphaScore);
      if (this.bravoScoreEl) this.bravoScoreEl.textContent = String(bravoScore);
      if (this.modeSubEl) {
        this.modeSubEl.textContent = mode === 'bomb'
          ? `HIỆP ${roundNumber} • CHẠM ${modeConfig.scoreLimit}`
          : `${modeConfig.shortName.toUpperCase()} • MỤC TIÊU ${modeConfig.scoreLimit}`;
      }
    } else if (mode === 'survival') {
      if (this.alphaLabelEl) this.alphaLabelEl.textContent = 'HẠ GỤC';
      if (this.bravoLabelEl) this.bravoLabelEl.textContent = 'CÒN SỐNG';
      if (this.alphaScoreEl) this.alphaScoreEl.textContent = String(myKills || 0);
      if (this.bravoScoreEl) this.bravoScoreEl.textContent = String(aliveCount || 1);
      if (this.modeSubEl) this.modeSubEl.textContent = 'SINH TỒN • VÒNG BO ĐANG THU HẸP';
    } else {
      if (this.alphaLabelEl) this.alphaLabelEl.textContent = 'BẠN';
      if (this.bravoLabelEl) this.bravoLabelEl.textContent = 'MỤC TIÊU';
      if (this.alphaScoreEl) this.alphaScoreEl.textContent = String(myKills || 0);
      if (this.bravoScoreEl) this.bravoScoreEl.textContent = String(modeConfig?.scoreLimit || 20);
      if (this.modeSubEl) this.modeSubEl.textContent = mode === 'practice' ? 'TRƯỜNG BẮN THỬ SÚNG 3D' : 'SOLO DEATHMATCH';
    }
  }

  updateCrosshair(spreadPx = 8, isSniperScoped = false, isAds = false) {
    if (this.sniperOverlay) {
      this.sniperOverlay.classList.toggle('hidden', !isSniperScoped);
    }
    if (!this.crosshairEl) return;
    this.crosshairEl.classList.toggle('hidden', isSniperScoped);
    this.crosshairEl.classList.toggle('ads-tight', isAds && !isSniperScoped);
    const gap = Math.round(Math.max(4, Math.min(34, spreadPx)));
    this.crosshairEl.style.setProperty('--ch-gap', `${gap}px`);
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
    }, 260);
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
    }, 2400);
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
    }, 320);
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
    setTimeout(() => item.remove(), 5500);
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
        this.interactHintEl.textContent = hint;
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
    }, 3600);
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

  updateFpsAndPing(fps, pingMs) {
    if (this.fpsPingEl) {
      this.fpsPingEl.textContent = `FPS: ${fps}  |  PING: ${pingMs}ms`;
    }
  }

  drawMinimap(mapData, localPlayer, allPlayers, teamBased, bomb, storm) {
    if (!this.mmCtx || !mapData || !localPlayer) return;
    const ctx = this.mmCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 2.25;

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

    ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
    for (const b of mapData.blocks) {
      if (b.y > 4.0) continue;
      const rx = (b.x - b.w * 0.5 - localPlayer.x) * scale;
      const rz = (b.z - b.d * 0.5 - localPlayer.z) * scale;
      ctx.fillRect(rx, rz, b.w * scale, b.d * scale);
    }

    for (const site of mapData.bombSites || []) {
      const sx = (site.x - localPlayer.x) * scale;
      const sz = (site.z - localPlayer.z) * scale;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sz, site.radius * scale, 0, Math.PI * 2); ctx.stroke();

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
