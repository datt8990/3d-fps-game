// Realistic Ballistic Web Audio Engine: Convolver Arena Reverb, Hard-Clipped Shockwave Crack & 30 Weapon Profiles
const GUN_PROFILES = {
  // Assault Rifles (Sharp supersonic crack + punchy mid-low bark + echoing tail)
  ak47:      { crackF: 3400, blastS: 6800, blastE: 520, blastD: 0.17, subG: 0.72, subD: 0.09, rev: 0.58, mechF: 2300, punch: 0.85 },
  m4a1:      { crackF: 2100, blastS: 2800, blastE: 380, blastD: 0.11, subG: 0.42, subD: 0.06, rev: 0.22, mechF: 2900, punch: 0.52, nativeSuppressed: true },
  scarh:     { crackF: 2950, blastS: 6200, blastE: 420, blastD: 0.21, subG: 0.88, subD: 0.12, rev: 0.66, mechF: 1950, punch: 0.96 },
  aug:       { crackF: 4100, blastS: 7400, blastE: 640, blastD: 0.14, subG: 0.58, subD: 0.07, rev: 0.48, mechF: 3100, punch: 0.72 },
  m16a4:     { crackF: 4400, blastS: 7800, blastE: 620, blastD: 0.15, subG: 0.62, subD: 0.08, rev: 0.54, mechF: 3250, punch: 0.78 },
  famas:     { crackF: 4300, blastS: 7600, blastE: 680, blastD: 0.13, subG: 0.54, subD: 0.07, rev: 0.46, mechF: 3400, punch: 0.70 },
  galil:     { crackF: 3650, blastS: 7000, blastE: 540, blastD: 0.16, subG: 0.70, subD: 0.09, rev: 0.55, mechF: 2450, punch: 0.82 },
  hk416:     { crackF: 4000, blastS: 7300, blastE: 580, blastD: 0.14, subG: 0.60, subD: 0.08, rev: 0.50, mechF: 3000, punch: 0.76 },

  // SMGs (Fast snappy CQB cracks)
  mp5:       { crackF: 1750, blastS: 2300, blastE: 340, blastD: 0.08, subG: 0.34, subD: 0.05, rev: 0.16, mechF: 3500, punch: 0.42, nativeSuppressed: true },
  p90:       { crackF: 4600, blastS: 8000, blastE: 780, blastD: 0.10, subG: 0.44, subD: 0.05, rev: 0.38, mechF: 3600, punch: 0.60 },
  vector:    { crackF: 3900, blastS: 6800, blastE: 690, blastD: 0.08, subG: 0.38, subD: 0.045, rev: 0.32, mechF: 4100, punch: 0.54 },
  ump45:     { crackF: 2800, blastS: 5400, blastE: 460, blastD: 0.13, subG: 0.58, subD: 0.07, rev: 0.42, mechF: 2400, punch: 0.70 },
  mp7:       { crackF: 4700, blastS: 8200, blastE: 820, blastD: 0.09, subG: 0.40, subD: 0.045, rev: 0.36, mechF: 3850, punch: 0.58 },

  // LMGs (Thunderous sustained heavy fire)
  m249:      { crackF: 3750, blastS: 7200, blastE: 500, blastD: 0.18, subG: 0.78, subD: 0.10, rev: 0.62, mechF: 2600, punch: 0.88, post: 'belt' },
  rpk:       { crackF: 3300, blastS: 6600, blastE: 460, blastD: 0.19, subG: 0.82, subD: 0.11, rev: 0.64, mechF: 2200, punch: 0.90 },

  // Shotguns (Huge concussive blast + echoing boom)
  spas12:    { crackF: 2500, blastS: 5800, blastE: 260, blastD: 0.27, subG: 1.05, subD: 0.16, rev: 0.78, mechF: 1650, punch: 1.05, post: 'pump' },
  aa12:      { crackF: 2300, blastS: 5200, blastE: 280, blastD: 0.22, subG: 0.94, subD: 0.13, rev: 0.66, mechF: 1750, punch: 0.96 },
  m870:      { crackF: 2650, blastS: 6000, blastE: 250, blastD: 0.29, subG: 1.10, subD: 0.17, rev: 0.82, mechF: 1550, punch: 1.10, post: 'pump' },

  // Snipers (Massive supersonic CRACK-BOOM! + long outdoor tail)
  awp:       { crackF: 3900, blastS: 8800, blastE: 240, blastD: 0.38, subG: 1.15, subD: 0.22, rev: 0.95, mechF: 2200, punch: 1.15, post: 'bolt' },
  svd:       { crackF: 3700, blastS: 7800, blastE: 340, blastD: 0.28, subG: 0.92, subD: 0.15, rev: 0.76, mechF: 2550, punch: 0.98 },
  barrett:   { crackF: 3200, blastS: 9200, blastE: 170, blastD: 0.48, subG: 1.28, subD: 0.28, rev: 1.05, mechF: 1700, punch: 1.25 },
  kar98k:    { crackF: 4100, blastS: 8400, blastE: 290, blastD: 0.34, subG: 1.04, subD: 0.18, rev: 0.88, mechF: 2400, punch: 1.08, post: 'bolt' },
  m200:      { crackF: 4200, blastS: 9000, blastE: 210, blastD: 0.42, subG: 1.20, subD: 0.24, rev: 0.98, mechF: 2100, punch: 1.20, post: 'bolt' },

  // Pistols (Crisp high-velocity pops & heavy magnum cracks)
  deagle:    { crackF: 3500, blastS: 7600, blastE: 420, blastD: 0.21, subG: 0.85, subD: 0.11, rev: 0.72, mechF: 2900, punch: 0.94, brass: true },
  usps:      { crackF: 1950, blastS: 2500, blastE: 380, blastD: 0.075, subG: 0.30, subD: 0.045, rev: 0.14, mechF: 3800, punch: 0.38, nativeSuppressed: true },
  glock18:   { crackF: 4200, blastS: 7000, blastE: 640, blastD: 0.10, subG: 0.46, subD: 0.055, rev: 0.38, mechF: 3500, punch: 0.62 },
  magnum:    { crackF: 3600, blastS: 8000, blastE: 360, blastD: 0.25, subG: 0.96, subD: 0.13, rev: 0.80, mechF: 2500, punch: 1.02, post: 'hammer', brass: false },
  fiveseven: { crackF: 4500, blastS: 7600, blastE: 700, blastD: 0.11, subG: 0.48, subD: 0.06, rev: 0.42, mechF: 3600, punch: 0.66, brass: true }
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.shaper = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.volume = 0.75;
    this.whiteBuffer = null;
    this.brownBuffer = null;
    this._reloadTimers = [];
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.001;
      this.compressor.release.value = 0.12;

      this.shaper = this.ctx.createWaveShaper();
      this.shaper.curve = this._makeBallisticClipCurve(6.5);
      this.shaper.oversample = '2x';

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.shaper.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Tactical outdoor/arena impulse reverb for crisp echoing "ĐOÀNG" gunfire tails!
      if (typeof this.ctx.createConvolver === 'function') {
        this.reverbNode = this.ctx.createConvolver();
        this.reverbNode.buffer = this._createArenaImpulse(0.82);
        const revFilter = this.ctx.createBiquadFilter();
        revFilter.type = 'lowpass';
        revFilter.frequency.value = 2800;
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.55;
        this.reverbGain.connect(this.reverbNode);
        this.reverbNode.connect(revFilter);
        revFilter.connect(this.compressor);
      }

      this.whiteBuffer = this._createNoiseBuffer(1.5, false);
      this.brownBuffer = this._createNoiseBuffer(1.5, true);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _makeBallisticClipCurve(drive = 6.5) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Asymmetric saturation adds realistic even+odd harmonics to gunpowder crack
      const biased = x >= 0 ? x * drive : x * (drive * 0.82);
      curve[i] = Math.tanh(biased);
    }
    return curve;
  }

  _createArenaImpulse(durationSec = 0.82) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.pow(1 - i / len, 2.8);
        d[i] = (Math.random() * 2 - 1) * env * 0.35;
      }
      // Early discrete concrete/container slapback echoes (15ms, 34ms, 62ms, 105ms)
      for (const [ms, amp] of [[15, 0.72], [34, 0.52], [62, 0.34], [105, 0.20]]) {
        const idx = Math.min(len - 1, Math.floor((ms / 1000) * sr) + ch * 11);
        d[idx] += (Math.random() > 0.5 ? 1 : -1) * amp;
      }
    }
    return buf;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  _createNoiseBuffer(durationSec = 1.4, brown = false) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        lastOut = (lastOut + 0.045 * w) / 1.045;
        data[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
      } else {
        data[i] = w;
      }
    }
    return buf;
  }

  playGunshot(weaponId = 'ak47', suppressed = false, distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const atten = distance <= 1 ? 1.0 : Math.max(0.04, 1 / (1 + distance * 0.048));
    if (atten <= 0.045) return;

    if (weaponId === 'knife' || weaponId === 'karambit') {
      this.playKnifeSlash(atten, weaponId === 'karambit');
      return;
    }

    const base = GUN_PROFILES[weaponId] || GUN_PROFILES.ak47;
    const isSilenced = suppressed || Boolean(base.nativeSuppressed);
    const now = ctx.currentTime;

    if (isSilenced) {
      // Crisp tactical suppressed pneumatic SNAP ("Phụt-Tách") - never a muffled "tụt"
      const puff = ctx.createBufferSource();
      puff.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(base.crackF * 0.85, now);
      bp.frequency.exponentialRampToValueAtTime(380, now + 0.075);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.68 * atten, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      puff.connect(bp);
      bp.connect(pg);
      pg.connect(this.shaper);
      if (this.reverbGain) {
        const rs = ctx.createGain();
        rs.gain.value = 0.14;
        pg.connect(rs);
        rs.connect(this.reverbGain);
      }
      puff.start(now);
      puff.stop(now + 0.095);

      this._playMechTick(base.mechF, 0.018, 0.24 * atten, now + 0.008);
      return;
    }

    // Layer 1: Instantaneous Supersonic Shockwave Crack ("ĐOÀNG" attack!)
    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 820;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = base.crackF;
    peak.Q.value = 1.3;
    peak.gain.value = 8.5;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(1.15 * base.punch * atten, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);

    crack.connect(hp);
    hp.connect(peak);
    peak.connect(crackGain);
    crackGain.connect(this.shaper);
    crack.start(now);
    crack.stop(now + 0.05);

    // Layer 2: Wide-Spectrum Gunpowder Blast & Acoustic Tail
    const blast = ctx.createBufferSource();
    blast.buffer = this.whiteBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(base.blastS, now);
    lp.frequency.exponentialRampToValueAtTime(base.blastE, now + base.blastD);

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.95 * base.punch * atten, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + base.blastD);

    blast.connect(lp);
    lp.connect(blastGain);
    blastGain.connect(this.shaper);
    if (this.reverbGain) {
      const send = ctx.createGain();
      send.gain.value = base.rev;
      blastGain.connect(send);
      send.connect(this.reverbGain);
    }
    blast.start(now);
    blast.stop(now + base.blastD + 0.03);

    // Layer 3: Concussive Sub-Bass Noise Blast (Deep chest boom, NOT a slow laser pitch-sweep!)
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownBuffer;
    const rFilter = ctx.createBiquadFilter();
    rFilter.type = 'lowpass';
    rFilter.frequency.setValueAtTime(260, now);
    rFilter.frequency.exponentialRampToValueAtTime(70, now + base.subD);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(base.subG * atten, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + base.subD);
    rumble.connect(rFilter);
    rFilter.connect(rGain);
    rGain.connect(this.shaper);
    rumble.start(now);
    rumble.stop(now + base.subD + 0.02);

    // Layer 4: Ultra-short 22ms physical kick transient (zero "tụt" tail!)
    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(115, now);
    kick.frequency.exponentialRampToValueAtTime(42, now + 0.024);
    const kGain = ctx.createGain();
    kGain.gain.setValueAtTime(0.55 * base.punch * atten, now);
    kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
    kick.connect(kGain);
    kGain.connect(this.shaper);
    kick.start(now);
    kick.stop(now + 0.03);

    // Layer 5: Metallic Bolt Action & Post-Shot Details
    if (distance <= 3) {
      this._playMechTick(base.mechF, 0.016, 0.18 * atten, now + 0.012);
    }
    if (distance <= 2) {
      if (base.brass) {
        setTimeout(() => this._playMechTick(5400, 0.012, 0.08 * atten), 220 + Math.random() * 90);
      }
      if (base.post === 'bolt') {
        setTimeout(() => this.playBoltCycle(), 380);
      } else if (base.post === 'pump') {
        setTimeout(() => this.playPumpCycle(), 260);
      } else if (base.post === 'belt') {
        this._playMechTick(4200, 0.014, 0.10 * atten, now + 0.032);
      } else if (base.post === 'hammer') {
        this._playMechTick(3300, 0.016, 0.14 * atten, now + 0.075);
      }
    }
  }

  _playMechTick(freq = 2200, dur = 0.022, gainVal = 0.2, startAt = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = startAt ?? ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.8;
    bp.frequency.setValueAtTime(freq, t);
    bp.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }

  _playFoleySlide(freqStart, freqEnd, dur = 0.11, gainVal = 0.24, q = 2.2) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(freqStart, now);
    bp.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), now + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gainVal, now + dur * 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + dur + 0.01);
  }

  _playThump(freqStart = 180, freqEnd = 55, dur = 0.06, gainVal = 0.34) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playKnifeSlash(atten = 1, isKarambit = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.6;
    filter.frequency.setValueAtTime(isKarambit ? 1350 : 920, now);
    filter.frequency.exponentialRampToValueAtTime(isKarambit ? 4100 : 3200, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(580, now + 0.15);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.48 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.17);
  }

  playWeaponDraw(weaponId = 'ak47') {
    if (weaponId === 'knife' || weaponId === 'karambit') {
      this._playFoleySlide(1600, 4400, 0.14, 0.28, 4.5);
      this._playMechTick(3600, 0.03, 0.18);
      return;
    }
    if (['awp', 'barrett', 'svd', 'kar98k', 'm200', 'm249', 'rpk'].includes(weaponId)) {
      this._playFoleySlide(520, 1400, 0.14, 0.24, 1.8);
      setTimeout(() => this._playMechTick(1750, 0.032, 0.22), 70);
      return;
    }
    if (['deagle', 'usps', 'glock18', 'magnum', 'fiveseven'].includes(weaponId)) {
      this._playFoleySlide(900, 2600, 0.09, 0.20, 2.5);
      setTimeout(() => this._playMechTick(2800, 0.022, 0.18), 55);
      return;
    }
    this._playFoleySlide(680, 1850, 0.11, 0.22, 2.0);
    setTimeout(() => this._playMechTick(2200, 0.025, 0.20), 65);
  }

  playGrenadeThrow() {
    this._playMechTick(3100, 0.035, 0.26);
    setTimeout(() => this.playKnifeSlash(0.55, false), 65);
  }

  playBoltCycle() {
    this._playMechTick(1900, 0.028, 0.24);
    this._playFoleySlide(1200, 2200, 0.08, 0.20, 3.0);
    setTimeout(() => {
      this._playFoleySlide(2200, 1100, 0.08, 0.20, 3.0);
      this._playMechTick(1450, 0.032, 0.26);
    }, 175);
  }

  playPumpCycle() {
    this._playFoleySlide(850, 1950, 0.075, 0.28, 2.4);
    setTimeout(() => this._playFoleySlide(1950, 780, 0.075, 0.30, 2.4), 105);
  }

  cancelReloadSequence() {
    for (const tid of this._reloadTimers) clearTimeout(tid);
    this._reloadTimers = [];
  }

  _scheduleReload(delayMs, fn) {
    const tid = setTimeout(() => fn(), Math.max(0, Math.round(delayMs)));
    this._reloadTimers.push(tid);
  }

  playReloadSequence(durationMs = 2200, weaponId = 'ak47') {
    this.cancelReloadSequence();
    const d = Math.max(800, Number(durationMs) || 2200);

    if (weaponId === 'spas12' || weaponId === 'm870') {
      for (let i = 0; i < 4; i++) {
        this._scheduleReload(d * (0.14 + i * 0.16), () => {
          this._playThump(240, 85, 0.055, 0.25);
          this._playMechTick(2350, 0.022, 0.24);
        });
      }
      this._scheduleReload(d * 0.80, () => this.playPumpCycle());
      return;
    }

    if (weaponId === 'magnum') {
      this._scheduleReload(d * 0.08, () => {
        this._playMechTick(2800, 0.025, 0.24);
        this._playFoleySlide(1800, 950, 0.09, 0.22, 3.5);
      });
      this._scheduleReload(d * 0.30, () => {
        this._playMechTick(4200, 0.02, 0.18);
        setTimeout(() => this._playMechTick(3800, 0.02, 0.16), 55);
      });
      this._scheduleReload(d * 0.56, () => {
        this._playThump(220, 75, 0.08, 0.32);
        this._playMechTick(2100, 0.025, 0.22);
      });
      this._scheduleReload(d * 0.82, () => {
        this._playMechTick(2600, 0.032, 0.30);
        this._playThump(160, 60, 0.06, 0.26);
      });
      return;
    }

    if (weaponId === 'm249') {
      this._scheduleReload(d * 0.08, () => {
        this._playMechTick(1500, 0.04, 0.28);
        this._playFoleySlide(700, 1400, 0.15, 0.26, 2.2);
      });
      this._scheduleReload(d * 0.26, () => this._playFoleySlide(1100, 520, 0.16, 0.26, 1.8));
      this._scheduleReload(d * 0.48, () => {
        this._playThump(145, 44, 0.11, 0.42);
        this._playMechTick(1950, 0.03, 0.25);
      });
      this._scheduleReload(d * 0.64, () => {
        this._playMechTick(3400, 0.024, 0.22);
        setTimeout(() => this._playMechTick(3700, 0.024, 0.20), 80);
      });
      this._scheduleReload(d * 0.78, () => {
        this._playThump(165, 48, 0.09, 0.40);
        this._playMechTick(1400, 0.045, 0.32);
      });
      this._scheduleReload(d * 0.90, () => {
        this._playFoleySlide(950, 2100, 0.12, 0.32, 2.5);
        setTimeout(() => this._playMechTick(1650, 0.035, 0.28), 90);
      });
      return;
    }

    if (weaponId === 'aa12') {
      this._scheduleReload(d * 0.12, () => {
        this._playMechTick(1400, 0.03, 0.24);
        this._playFoleySlide(1200, 500, 0.14, 0.26, 1.9);
      });
      this._scheduleReload(d * 0.52, () => {
        this._playThump(135, 42, 0.11, 0.42);
        this._playMechTick(1750, 0.035, 0.28);
      });
      this._scheduleReload(d * 0.80, () => {
        this._playFoleySlide(900, 1950, 0.10, 0.28, 2.6);
        setTimeout(() => this._playMechTick(1650, 0.03, 0.26), 80);
      });
      return;
    }

    if (['awp', 'barrett', 'svd', 'kar98k', 'm200'].includes(weaponId)) {
      const isHeavy = weaponId === 'barrett' || weaponId === 'm200';
      this._scheduleReload(d * 0.12, () => {
        this._playMechTick(isHeavy ? 1200 : 1650, 0.035, 0.26);
        this._playFoleySlide(1500, 620, 0.13, 0.26, 2.1);
      });
      this._scheduleReload(d * 0.48, () => {
        this._playThump(isHeavy ? 125 : 155, 42, 0.10, 0.40);
        this._playMechTick(isHeavy ? 1450 : 1900, 0.032, 0.30);
      });
      this._scheduleReload(d * 0.78, () => this.playBoltCycle());
      return;
    }

    if (weaponId === 'mp5') {
      this._scheduleReload(d * 0.14, () => {
        this._playMechTick(2200, 0.025, 0.22);
        this._playFoleySlide(1900, 820, 0.10, 0.22, 2.4);
      });
      this._scheduleReload(d * 0.50, () => {
        this._playThump(195, 58, 0.08, 0.34);
        this._playMechTick(2400, 0.028, 0.26);
      });
      this._scheduleReload(d * 0.80, () => {
        this._playThump(260, 90, 0.05, 0.36);
        this._playMechTick(2700, 0.032, 0.30);
      });
      return;
    }

    if (['deagle', 'usps', 'glock18', 'fiveseven'].includes(weaponId)) {
      const heavySlide = weaponId === 'deagle';
      this._scheduleReload(d * 0.12, () => {
        this._playMechTick(2900, 0.02, 0.22);
        this._playFoleySlide(2600, 1100, 0.09, 0.22, 2.8);
      });
      this._scheduleReload(d * 0.48, () => {
        this._playThump(heavySlide ? 185 : 230, 60, 0.075, 0.36);
        this._playMechTick(heavySlide ? 2200 : 2850, 0.025, 0.26);
      });
      this._scheduleReload(d * 0.79, () => {
        this._playFoleySlide(1400, 3100, 0.07, 0.24, 3.0);
        setTimeout(() => this._playMechTick(heavySlide ? 2350 : 3200, 0.028, 0.28), 65);
      });
      return;
    }

    const isSteelAk = weaponId === 'ak47' || weaponId === 'rpk' || weaponId === 'galil';
    this._scheduleReload(d * 0.12, () => {
      this._playMechTick(isSteelAk ? 1750 : 2400, 0.028, 0.24);
      this._playFoleySlide(isSteelAk ? 1600 : 2200, 720, 0.11, 0.24, 2.2);
    });
    this._scheduleReload(d * 0.48, () => {
      this._playThump(isSteelAk ? 155 : 195, 52, 0.09, 0.38);
      this._playMechTick(isSteelAk ? 1850 : 2500, 0.03, 0.28);
    });
    this._scheduleReload(d * 0.79, () => {
      this._playFoleySlide(isSteelAk ? 1150 : 1500, isSteelAk ? 2500 : 3100, 0.085, 0.26, 2.8);
      setTimeout(() => this._playMechTick(isSteelAk ? 1950 : 2750, 0.032, 0.28), 75);
    });
  }

  playEmptyClick() {
    this._playMechTick(2800, 0.024, 0.26);
  }

  playMetallicClick(freq = 1000, dur = 0.05, gainVal = 0.25) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playHitmarker(isHeadshot = false, isKill = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (isHeadshot) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1680, now);
      osc.frequency.setValueAtTime(2280, now + 0.035);
      g.gain.setValueAtTime(0.46, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isKill ? 1150 : 880, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.065);
      g.gain.setValueAtTime(0.34, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    }
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playStreakChord(streak = 2) {
    const base = streak >= 4 ? [587, 740, 880, 1174] : [523, 659, 784];
    base.forEach((f, idx) => {
      setTimeout(() => this.playUiTone(f, 0.18), idx * 75);
    });
  }

  playDamageTaken() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playFootstep(sprint = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.brownBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprint ? 440 : 310;
    const g = ctx.createGain();
    g.gain.setValueAtTime(sprint ? 0.17 : 0.095, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.07);
  }

  playBombBeep(urgent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = urgent ? 2350 : 1850;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.10);
  }

  playExplosion(distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const atten = distance <= 2 ? 1.0 : Math.max(0.12, 1 / (1 + distance * 0.04));
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.brownBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1250, now);
    filter.frequency.exponentialRampToValueAtTime(48, now + 0.95);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.15 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.98);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.shaper);
    if (this.reverbGain) {
      const send = ctx.createGain();
      send.gain.value = 0.85 * atten;
      g.connect(send);
      send.connect(this.reverbGain);
    }
    noise.start(now);
    noise.stop(now + 1.0);
  }

  playUiTone(freq = 640, dur = 0.07) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playFanfare(win = true) {
    const notes = win ? [523, 659, 784, 1046] : [440, 392, 349, 293];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playUiTone(n, 0.22), idx * 130);
    });
  }
}

export const soundEngine = new SoundEngine();
