// Procedural Web Audio API Sound Synthesizer for 12 Weapons, Grenades, Kill Streaks & C4
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.75;
    this.noiseBuffer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(1.4);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  createNoiseBuffer(durationSec = 1.0) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  playGunshot(weaponId = 'ak47', suppressed = false, distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const atten = distance <= 1 ? 1.0 : Math.max(0.04, 1 / (1 + distance * 0.055));
    if (atten <= 0.045) return;

    if (weaponId === 'knife' || weaponId === 'karambit') {
      this.playKnifeSlash(atten, weaponId === 'karambit');
      return;
    }

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    const nGain = ctx.createGain();

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();

    let duration = 0.22;

    if (suppressed || weaponId === 'mp5' || weaponId === 'usps') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(weaponId === 'usps' ? 920 : 760, now);
      filter.frequency.exponentialRampToValueAtTime(240, now + 0.10);
      duration = 0.11;
      nGain.gain.setValueAtTime(0.38 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(185, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.075);
      oGain.gain.setValueAtTime(0.32 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else if (weaponId === 'awp' || weaponId === 'barrett') {
      const isBarrett = weaponId === 'barrett';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isBarrett ? 3800 : 3400, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + (isBarrett ? 0.68 : 0.58));
      duration = isBarrett ? 0.72 : 0.62;
      nGain.gain.setValueAtTime(1.0 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isBarrett ? 120 : 145, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.38);
      oGain.gain.setValueAtTime(0.92 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

      if (!isBarrett && distance <= 2) {
        setTimeout(() => this.playBoltCycle(), 380);
      }
    } else if (weaponId === 'spas12') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(190, now + 0.34);
      duration = 0.36;
      nGain.gain.setValueAtTime(0.95 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
      oGain.gain.setValueAtTime(0.82 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      if (distance <= 2) {
        setTimeout(() => this.playMetallicClick(680, 0.06, 0.24), 280);
      }
    } else if (weaponId === 'ak47' || weaponId === 'scarh') {
      const isScar = weaponId === 'scarh';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isScar ? 2400 : 2600, now);
      filter.frequency.exponentialRampToValueAtTime(290, now + 0.25);
      duration = 0.26;
      nGain.gain.setValueAtTime(0.75 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isScar ? 142 : 160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      oGain.gain.setValueAtTime(0.66 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    } else if (weaponId === 'deagle') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2900, now);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.28);
      duration = 0.30;
      nGain.gain.setValueAtTime(0.80 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.17);
      oGain.gain.setValueAtTime(0.70 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      // M4A1 / P90 crisp high-velocity
      filter.type = 'bandpass';
      filter.Q.value = 0.9;
      filter.frequency.setValueAtTime(weaponId === 'p90' ? 2550 : 2200, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.16);
      duration = 0.17;
      nGain.gain.setValueAtTime(0.60 * atten, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(205, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
      oGain.gain.setValueAtTime(0.48 * atten, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    }

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    osc.connect(oGain);
    oGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration + 0.02);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playKnifeSlash(atten = 1, isKarambit = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.6;
    filter.frequency.setValueAtTime(isKarambit ? 1200 : 900, now);
    filter.frequency.exponentialRampToValueAtTime(isKarambit ? 3800 : 3200, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.15);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.46 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.17);
  }

  playGrenadeThrow() {
    this.playMetallicClick(1600, 0.045, 0.25);
    setTimeout(() => this.playKnifeSlash(0.55, false), 65);
  }

  playBoltCycle() {
    this.playMetallicClick(920, 0.055, 0.24);
    setTimeout(() => this.playMetallicClick(1250, 0.06, 0.26), 170);
  }

  playReloadSequence(durationMs = 2200) {
    this.playMetallicClick(620, 0.06, 0.25);
    setTimeout(() => this.playMetallicClick(780, 0.07, 0.30), Math.round(durationMs * 0.48));
    setTimeout(() => this.playMetallicClick(1180, 0.065, 0.28), Math.round(durationMs * 0.82));
  }

  playEmptyClick() {
    this.playMetallicClick(1400, 0.035, 0.22);
  }

  playMetallicClick(freq = 1000, dur = 0.05, gainVal = 0.25) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + dur);
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
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprint ? 420 : 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(sprint ? 0.15 : 0.085, now);
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
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(980, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 0.95);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.98);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
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
