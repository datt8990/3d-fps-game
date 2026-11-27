// Realistic Ballistic Web Audio Engine: Convolver Arena Reverb, Hard-Clipped Shockwave Crack, WAV Pack Loader & 50 Weapon Profiles
import { WEAPONS } from '/shared/constants.js';
import { getConfiguredSoundUrl, getAudioSampleBuffer } from './weaponAssetLoader.js';

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
  ak12:      { crackF: 3850, blastS: 7200, blastE: 560, blastD: 0.15, subG: 0.66, subD: 0.085, rev: 0.52, mechF: 2650, punch: 0.80 },
  g36c:      { crackF: 4150, blastS: 7500, blastE: 630, blastD: 0.135, subG: 0.56, subD: 0.07, rev: 0.48, mechF: 3150, punch: 0.72 },
  groza:     { crackF: 3200, blastS: 6500, blastE: 460, blastD: 0.18, subG: 0.80, subD: 0.10, rev: 0.60, mechF: 2250, punch: 0.90 },
  asval:     { crackF: 1850, blastS: 2400, blastE: 350, blastD: 0.09, subG: 0.36, subD: 0.05, rev: 0.18, mechF: 3200, punch: 0.44, nativeSuppressed: true },
  fal:       { crackF: 2850, blastS: 6000, blastE: 390, blastD: 0.23, subG: 0.94, subD: 0.13, rev: 0.70, mechF: 1850, punch: 1.00 },
  mcx:       { crackF: 3900, blastS: 7600, blastE: 540, blastD: 0.16, subG: 0.74, subD: 0.095, rev: 0.58, mechF: 2900, punch: 0.86 },

  // SMGs (Fast snappy CQB cracks)
  mp5:       { crackF: 1750, blastS: 2300, blastE: 340, blastD: 0.08, subG: 0.34, subD: 0.05, rev: 0.16, mechF: 3500, punch: 0.42, nativeSuppressed: true },
  p90:       { crackF: 4600, blastS: 8000, blastE: 780, blastD: 0.10, subG: 0.44, subD: 0.05, rev: 0.38, mechF: 3600, punch: 0.60 },
  vector:    { crackF: 3900, blastS: 6800, blastE: 690, blastD: 0.08, subG: 0.38, subD: 0.045, rev: 0.32, mechF: 4100, punch: 0.54 },
  ump45:     { crackF: 2800, blastS: 5400, blastE: 460, blastD: 0.13, subG: 0.58, subD: 0.07, rev: 0.42, mechF: 2400, punch: 0.70 },
  mp7:       { crackF: 4700, blastS: 8200, blastE: 820, blastD: 0.09, subG: 0.40, subD: 0.045, rev: 0.36, mechF: 3850, punch: 0.58 },
  uzi:       { crackF: 4300, blastS: 7200, blastE: 720, blastD: 0.08, subG: 0.38, subD: 0.045, rev: 0.32, mechF: 3900, punch: 0.52 },
  mac10:     { crackF: 4050, blastS: 6900, blastE: 700, blastD: 0.075, subG: 0.36, subD: 0.042, rev: 0.30, mechF: 4200, punch: 0.50 },
  bizon:     { crackF: 3750, blastS: 6500, blastE: 620, blastD: 0.10, subG: 0.46, subD: 0.055, rev: 0.36, mechF: 3300, punch: 0.60 },
  thompson:  { crackF: 2950, blastS: 5700, blastE: 480, blastD: 0.135, subG: 0.62, subD: 0.075, rev: 0.45, mechF: 2550, punch: 0.72 },

  // LMGs (Thunderous sustained heavy fire)
  m249:      { crackF: 3750, blastS: 7200, blastE: 500, blastD: 0.18, subG: 0.78, subD: 0.10, rev: 0.62, mechF: 2600, punch: 0.88, post: 'belt' },
  rpk:       { crackF: 3300, blastS: 6600, blastE: 460, blastD: 0.19, subG: 0.82, subD: 0.11, rev: 0.64, mechF: 2200, punch: 0.90 },
  pkm:       { crackF: 3050, blastS: 6400, blastE: 410, blastD: 0.21, subG: 0.92, subD: 0.12, rev: 0.68, mechF: 2000, punch: 0.96, post: 'belt' },
  mg3:       { crackF: 3600, blastS: 7000, blastE: 490, blastD: 0.15, subG: 0.76, subD: 0.09, rev: 0.58, mechF: 3100, punch: 0.88, post: 'belt' },
  negev:     { crackF: 3850, blastS: 7300, blastE: 520, blastD: 0.16, subG: 0.74, subD: 0.09, rev: 0.58, mechF: 2750, punch: 0.84, post: 'belt' },

  // Shotguns (Huge concussive blast + echoing boom)
  spas12:    { crackF: 2500, blastS: 5800, blastE: 260, blastD: 0.27, subG: 1.05, subD: 0.16, rev: 0.78, mechF: 1650, punch: 1.05, post: 'pump' },
  aa12:      { crackF: 2300, blastS: 5200, blastE: 280, blastD: 0.22, subG: 0.94, subD: 0.13, rev: 0.66, mechF: 1750, punch: 0.96 },
  m870:      { crackF: 2650, blastS: 6000, blastE: 250, blastD: 0.29, subG: 1.10, subD: 0.17, rev: 0.82, mechF: 1550, punch: 1.10, post: 'pump' },
  benellim4: { crackF: 2550, blastS: 5900, blastE: 270, blastD: 0.25, subG: 1.02, subD: 0.15, rev: 0.74, mechF: 1850, punch: 1.02 },
  db_shotgun:{ crackF: 2400, blastS: 6200, blastE: 220, blastD: 0.32, subG: 1.18, subD: 0.19, rev: 0.86, mechF: 1500, punch: 1.16 },

  // Snipers (Massive supersonic CRACK-BOOM! + long outdoor tail)
  awp:       { crackF: 3900, blastS: 8800, blastE: 240, blastD: 0.38, subG: 1.15, subD: 0.22, rev: 0.95, mechF: 2200, punch: 1.15, post: 'bolt' },
  svd:       { crackF: 3700, blastS: 7800, blastE: 340, blastD: 0.28, subG: 0.92, subD: 0.15, rev: 0.76, mechF: 2550, punch: 0.98 },
  barrett:   { crackF: 3200, blastS: 9200, blastE: 170, blastD: 0.48, subG: 1.28, subD: 0.28, rev: 1.05, mechF: 1700, punch: 1.25 },
  kar98k:    { crackF: 4100, blastS: 8400, blastE: 290, blastD: 0.34, subG: 1.04, subD: 0.18, rev: 0.88, mechF: 2400, punch: 1.08, post: 'bolt' },
  m200:      { crackF: 4200, blastS: 9000, blastE: 210, blastD: 0.42, subG: 1.20, subD: 0.24, rev: 0.98, mechF: 2100, punch: 1.20, post: 'bolt' },
  m24:       { crackF: 4000, blastS: 8600, blastE: 260, blastD: 0.36, subG: 1.10, subD: 0.20, rev: 0.90, mechF: 2300, punch: 1.12, post: 'bolt' },
  mk14:      { crackF: 3450, blastS: 7400, blastE: 370, blastD: 0.24, subG: 0.88, subD: 0.13, rev: 0.70, mechF: 2450, punch: 0.94 },

  // Pistols (Crisp high-velocity pops & heavy magnum cracks)
  deagle:    { crackF: 3500, blastS: 7600, blastE: 420, blastD: 0.21, subG: 0.85, subD: 0.11, rev: 0.72, mechF: 2900, punch: 0.94, brass: true },
  usps:      { crackF: 1950, blastS: 2500, blastE: 380, blastD: 0.075, subG: 0.30, subD: 0.045, rev: 0.14, mechF: 3800, punch: 0.38, nativeSuppressed: true },
  glock18:   { crackF: 4200, blastS: 7000, blastE: 640, blastD: 0.10, subG: 0.46, subD: 0.055, rev: 0.38, mechF: 3500, punch: 0.62 },
  magnum:    { crackF: 3600, blastS: 8000, blastE: 360, blastD: 0.25, subG: 0.96, subD: 0.13, rev: 0.80, mechF: 2500, punch: 1.02, post: 'hammer', brass: false },
  fiveseven: { crackF: 4500, blastS: 7600, blastE: 700, blastD: 0.11, subG: 0.48, subD: 0.06, rev: 0.42, mechF: 3600, punch: 0.66, brass: true },
  m1911:     { crackF: 3150, blastS: 6800, blastE: 470, blastD: 0.16, subG: 0.72, subD: 0.09, rev: 0.56, mechF: 2700, punch: 0.82, brass: true },
  beretta92: { crackF: 4100, blastS: 7100, blastE: 620, blastD: 0.11, subG: 0.48, subD: 0.06, rev: 0.40, mechF: 3450, punch: 0.64, brass: true },

  // === 50 NEW REAL-WORLD WEAPON ACOUSTIC PROFILES ===
  ak74m:      { crackF: 3750, blastS: 7100, blastE: 540, blastD: 0.155, subG: 0.68, subD: 0.085, rev: 0.54, mechF: 2550, punch: 0.82 },
  an94:       { crackF: 4250, blastS: 7600, blastE: 600, blastD: 0.14,  subG: 0.62, subD: 0.075, rev: 0.50, mechF: 3200, punch: 0.78 },
  qbz95:      { crackF: 4050, blastS: 7300, blastE: 610, blastD: 0.14,  subG: 0.60, subD: 0.075, rev: 0.48, mechF: 3050, punch: 0.74 },
  bren2:      { crackF: 4100, blastS: 7500, blastE: 590, blastD: 0.145, subG: 0.62, subD: 0.08,  rev: 0.51, mechF: 2950, punch: 0.77 },
  f2000:      { crackF: 4450, blastS: 7800, blastE: 680, blastD: 0.125, subG: 0.52, subD: 0.065, rev: 0.45, mechF: 3450, punch: 0.70 },
  sg553:      { crackF: 3900, blastS: 7300, blastE: 550, blastD: 0.155, subG: 0.66, subD: 0.085, rev: 0.53, mechF: 2850, punch: 0.80 },
  tar21:      { crackF: 4200, blastS: 7500, blastE: 640, blastD: 0.135, subG: 0.56, subD: 0.07,  rev: 0.47, mechF: 3250, punch: 0.73 },
  type89:     { crackF: 4050, blastS: 7400, blastE: 600, blastD: 0.145, subG: 0.60, subD: 0.075, rev: 0.49, mechF: 3000, punch: 0.75 },
  acr:        { crackF: 3800, blastS: 7400, blastE: 530, blastD: 0.16,  subG: 0.72, subD: 0.09,  rev: 0.56, mechF: 2800, punch: 0.84 },
  l85a2:      { crackF: 4150, blastS: 7500, blastE: 590, blastD: 0.15,  subG: 0.62, subD: 0.08,  rev: 0.52, mechF: 2900, punch: 0.76 },
  hk417:      { crackF: 2900, blastS: 6200, blastE: 400, blastD: 0.22,  subG: 0.92, subD: 0.125, rev: 0.68, mechF: 1900, punch: 0.98 },
  m416_cqb:   { crackF: 4300, blastS: 7700, blastE: 640, blastD: 0.13,  subG: 0.58, subD: 0.07,  rev: 0.48, mechF: 3200, punch: 0.75 },

  vityaz:     { crackF: 3600, blastS: 6400, blastE: 580, blastD: 0.11,  subG: 0.48, subD: 0.06,  rev: 0.38, mechF: 3100, punch: 0.62 },
  mpx:        { crackF: 4150, blastS: 7100, blastE: 660, blastD: 0.095, subG: 0.42, subD: 0.05,  rev: 0.36, mechF: 3550, punch: 0.58 },
  scorpion:   { crackF: 4350, blastS: 7300, blastE: 710, blastD: 0.08,  subG: 0.38, subD: 0.045, rev: 0.33, mechF: 4000, punch: 0.54 },
  mp9:        { crackF: 4500, blastS: 7600, blastE: 750, blastD: 0.085, subG: 0.38, subD: 0.045, rev: 0.34, mechF: 3900, punch: 0.55 },
  ppsh41:     { crackF: 3950, blastS: 6800, blastE: 630, blastD: 0.09,  subG: 0.44, subD: 0.052, rev: 0.37, mechF: 3700, punch: 0.59 },
  mp40:       { crackF: 3100, blastS: 5800, blastE: 500, blastD: 0.125, subG: 0.56, subD: 0.07,  rev: 0.42, mechF: 2500, punch: 0.68 },
  sten:       { crackF: 1800, blastS: 2350, blastE: 350, blastD: 0.085, subG: 0.35, subD: 0.05,  rev: 0.16, mechF: 3400, punch: 0.42, nativeSuppressed: true },
  k1a:        { crackF: 4250, blastS: 7400, blastE: 650, blastD: 0.12,  subG: 0.52, subD: 0.065, rev: 0.44, mechF: 3350, punch: 0.68 },
  mx4:        { crackF: 4100, blastS: 6900, blastE: 670, blastD: 0.09,  subG: 0.42, subD: 0.05,  rev: 0.35, mechF: 3650, punch: 0.57 },
  qcw05:      { crackF: 1700, blastS: 2250, blastE: 330, blastD: 0.08,  subG: 0.33, subD: 0.048, rev: 0.15, mechF: 3550, punch: 0.40, nativeSuppressed: true },

  m60e4:      { crackF: 2950, blastS: 6300, blastE: 390, blastD: 0.22,  subG: 0.94, subD: 0.125, rev: 0.70, mechF: 1950, punch: 0.98, post: 'belt' },
  rpd:        { crackF: 3250, blastS: 6600, blastE: 450, blastD: 0.19,  subG: 0.84, subD: 0.11,  rev: 0.64, mechF: 2250, punch: 0.90, post: 'belt' },
  mg42:       { crackF: 3700, blastS: 7200, blastE: 480, blastD: 0.145, subG: 0.78, subD: 0.09,  rev: 0.58, mechF: 3300, punch: 0.90, post: 'belt' },
  stoner63:   { crackF: 3850, blastS: 7300, blastE: 520, blastD: 0.165, subG: 0.74, subD: 0.095, rev: 0.58, mechF: 2700, punch: 0.85, post: 'belt' },
  l86:        { crackF: 4050, blastS: 7400, blastE: 560, blastD: 0.16,  subG: 0.68, subD: 0.085, rev: 0.54, mechF: 2800, punch: 0.82 },
  dp28:       { crackF: 2900, blastS: 6200, blastE: 400, blastD: 0.22,  subG: 0.92, subD: 0.12,  rev: 0.68, mechF: 2050, punch: 0.95 },

  ksg12:      { crackF: 2550, blastS: 5900, blastE: 260, blastD: 0.28,  subG: 1.08, subD: 0.165, rev: 0.80, mechF: 1650, punch: 1.08, post: 'pump' },
  saiga12:    { crackF: 2450, blastS: 5600, blastE: 275, blastD: 0.24,  subG: 0.98, subD: 0.14,  rev: 0.70, mechF: 1850, punch: 1.00 },
  striker12:  { crackF: 2400, blastS: 5400, blastE: 280, blastD: 0.23,  subG: 0.96, subD: 0.135, rev: 0.68, mechF: 1800, punch: 0.98 },
  m1887:      { crackF: 2500, blastS: 6100, blastE: 235, blastD: 0.31,  subG: 1.15, subD: 0.18,  rev: 0.85, mechF: 1600, punch: 1.14, post: 'pump' },
  mossberg590:{ crackF: 2600, blastS: 6000, blastE: 255, blastD: 0.285, subG: 1.08, subD: 0.165, rev: 0.80, mechF: 1600, punch: 1.08, post: 'pump' },
  origin12:   { crackF: 2350, blastS: 5300, blastE: 280, blastD: 0.215, subG: 0.94, subD: 0.13,  rev: 0.65, mechF: 1900, punch: 0.96 },

  vss:        { crackF: 1750, blastS: 2300, blastE: 330, blastD: 0.09,  subG: 0.38, subD: 0.055, rev: 0.18, mechF: 3150, punch: 0.46, nativeSuppressed: true },
  mosin:      { crackF: 4050, blastS: 8500, blastE: 280, blastD: 0.35,  subG: 1.06, subD: 0.19,  rev: 0.89, mechF: 2350, punch: 1.10, post: 'bolt' },
  psg1:       { crackF: 3650, blastS: 7900, blastE: 330, blastD: 0.29,  subG: 0.95, subD: 0.155, rev: 0.78, mechF: 2500, punch: 1.00 },
  msr:        { crackF: 4100, blastS: 8900, blastE: 225, blastD: 0.40,  subG: 1.18, subD: 0.23,  rev: 0.96, mechF: 2200, punch: 1.18, post: 'bolt' },
  dsr1:       { crackF: 4000, blastS: 8800, blastE: 220, blastD: 0.41,  subG: 1.18, subD: 0.23,  rev: 0.96, mechF: 2150, punch: 1.18, post: 'bolt' },
  m110:       { crackF: 1950, blastS: 2700, blastE: 360, blastD: 0.11,  subG: 0.46, subD: 0.065, rev: 0.22, mechF: 2850, punch: 0.54, nativeSuppressed: true },
  sks:        { crackF: 3500, blastS: 7200, blastE: 410, blastD: 0.21,  subG: 0.82, subD: 0.115, rev: 0.65, mechF: 2450, punch: 0.90 },
  ntw20:      { crackF: 2800, blastS: 9600, blastE: 140, blastD: 0.56,  subG: 1.38, subD: 0.32,  rev: 1.12, mechF: 1500, punch: 1.35, post: 'bolt' },

  p226:       { crackF: 4050, blastS: 7000, blastE: 600, blastD: 0.115, subG: 0.50, subD: 0.062, rev: 0.42, mechF: 3400, punch: 0.66, brass: true },
  makarov:    { crackF: 4300, blastS: 6900, blastE: 650, blastD: 0.10,  subG: 0.46, subD: 0.055, rev: 0.38, mechF: 3650, punch: 0.62, brass: true },
  cz75:       { crackF: 4150, blastS: 7100, blastE: 630, blastD: 0.095, subG: 0.45, subD: 0.055, rev: 0.37, mechF: 3600, punch: 0.61 },
  luger:      { crackF: 3950, blastS: 7200, blastE: 560, blastD: 0.125, subG: 0.56, subD: 0.07,  rev: 0.45, mechF: 3250, punch: 0.72, brass: true },
  ragingbull: { crackF: 3450, blastS: 8400, blastE: 310, blastD: 0.29,  subG: 1.06, subD: 0.15,  rev: 0.86, mechF: 2300, punch: 1.10, post: 'hammer', brass: false }
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
    this._gunBufferCache = new Map();
    this._reloadTimers = [];
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 5.5;
      this.compressor.attack.value = 0.0008;
      this.compressor.release.value = 0.09;

      this.shaper = this.ctx.createWaveShaper();
      this.shaper.curve = this._makeBallisticClipCurve(4.2);
      this.shaper.oversample = 'none';

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.shaper.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.whiteBuffer = this._createNoiseBuffer(1.2, false);
      this.brownBuffer = this._createNoiseBuffer(1.2, true);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Synthesizes a physically-modeled, stereo, real-life recorded-style firearm PCM AudioBuffer ONCE per weapon:
  // Combines N-Wave muzzle shockwave, supersonic propellant crack, barrel-throat formant bark,
  // mechanical steel bolt slam, 6 stereo concrete/outdoor slapback reflections & rolling acoustic tail!
  _getOrBuildGunSample(weaponId, isSilenced) {
    const key = `${weaponId}_${isSilenced ? 'sup' : 'loud'}`;
    const cached = this._gunBufferCache.get(key);
    if (cached) return cached;

    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const base = GUN_PROFILES[weaponId] || GUN_PROFILES.ak47;
    const wCfg = WEAPONS[weaponId] || {};
    const sub = wCfg.subClass || 'ar';

    // Deterministic seeded PRNG per weapon so each gun has a consistent authentic timbre
    let seed = 0x9e3779b9;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };

    const durSec = isSilenced
      ? 0.24
      : (sub === 'sniper' ? 0.88 : (sub === 'shotgun' ? 0.68 : (sub === 'lmg' ? 0.60 : (sub === 'ar' ? 0.56 : 0.42))));
    const len = Math.floor(sr * durSec);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    // Dry mono core generation (0..durSec) before stereo outdoor reflection matrix
    const dry = new Float32Array(len);
    const punch = base.punch || 0.85;
    const crackHz = base.crackF || 3500;
    const mechHz = base.mechF || 2600;
    const subWeight = base.subG || 0.70;

    // 1-pole LP & 2-pole SVF states for zero-allocation sample-level physical filtering
    let lpBody = 0, lpSub = 0, lpTail = 0;
    let bp1 = 0, lp1 = 0; // Barrel-throat resonant formant filter
    let bpM = 0, lpM = 0; // Steel bolt mechanical resonator

    const barrelFreq = sub === 'sniper' ? 310 : (sub === 'shotgun' ? 240 : (sub === 'pistol' ? 680 : (sub === 'smg' ? 580 : 410)));
    const fBarrel = Math.min(0.45, (2 * Math.PI * barrelFreq) / sr);
    const fMech = Math.min(0.75, (2 * Math.PI * mechHz) / sr);
    const blastDecay = isSilenced ? 0.022 : Math.max(0.032, (base.blastD || 0.16) * 0.44);
    const tailDecay = isSilenced ? 0.045 : Math.max(0.085, (base.blastD || 0.16) * 1.15);

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const n = rand();
      const n2 = rand();

      if (isSilenced) {
        // Real Suppressed Firearm: Loud metallic bolt carrier cycle + baffled high-pressure pneumatic spit + supersonic whip
        const spitEnv = Math.exp(-t / 0.016);
        const baffleEnv = Math.exp(-t / 0.042);
        const bolt1 = Math.exp(-Math.pow((t - 0.007) / 0.0045, 2));
        const bolt2 = Math.exp(-Math.pow((t - 0.034) / 0.006, 2));

        // Pneumatic baffle burst (mid-high bandpass)
        const fSpit = Math.min(0.6, (2 * Math.PI * (1900 - t * 6000)) / sr);
        lp1 += Math.max(0.05, fSpit) * (n - lp1);
        const hpSpit = n - lp1;

        // Mechanical steel action clack (very audible on real suppressed rifles!)
        bpM += fMech * (n2 - lpM - 0.18 * bpM);
        lpM += fMech * bpM;
        const mechSig = bpM * (bolt1 * 0.85 + bolt2 * 0.55);

        // Soft baffled sub thump
        lpSub += 0.045 * (n - lpSub);
        const subSig = lpSub * Math.exp(-t / 0.028) * 1.35 * subWeight;

        const raw = (hpSpit * spitEnv * 0.95 + lp1 * baffleEnv * 0.45 + mechSig * 0.92 + subSig);
        dry[i] = Math.tanh(raw * 2.2) * 0.82;
      } else {
        // 1. N-Wave Muzzle Shockwave (0..3.5ms): Asymmetric pressure impulse
        let shock = 0;
        if (t < 0.0038) {
          const u = t / 0.0038;
          // Sharp positive pressure wall -> negative rarefaction trough
          shock = (u < 0.25 ? (u / 0.25) : (1 - (u - 0.25) * 2.4)) * (1.25 + n * 0.55) * punch;
        }

        // 2. Supersonic Ballistic Crack (0..22ms): Fierce high-frequency air rip
        const crackEnv = Math.exp(-t / 0.011);
        const crackAlpha = Math.min(0.85, (2 * Math.PI * Math.max(900, crackHz * Math.exp(-t * 28))) / sr);
        lpBody += crackAlpha * (n - lpBody);
        const crackSig = (n - lpBody * 0.55) * crackEnv * 1.65 * punch;

        // 3. Gunpowder Combustion Bark & Barrel Formant Resonance (Chest punch without sine-wave tone!)
        const barkEnv = Math.exp(-t / blastDecay);
        const fDyn = Math.max(0.015, fBarrel * (1.6 - Math.min(1.1, t * 9)));
        bp1 += fDyn * (n - lp1 - 0.52 * bp1);
        lp1 += fDyn * bp1;
        const barkSig = (bp1 * 1.15 + lp1 * 1.35) * barkEnv * 1.55 * punch;

        // 4. Deep Sub-Bass Air Displacement Rumble (felt in the chest on Snipers, Shotguns, 7.62mm!)
        const subAlpha = Math.min(0.12, (2 * Math.PI * (155 * Math.exp(-t * 8) + 45)) / sr);
        lpSub += subAlpha * (n2 - lpSub);
        const subSig = lpSub * Math.exp(-t / (base.subD || 0.10)) * 3.8 * subWeight;

        // 5. Metallic Bolt Carrier Slam + Receiver Ring (+11ms & +36ms)
        const boltEnv = Math.exp(-Math.pow((t - 0.011) / 0.0055, 2)) + 0.55 * Math.exp(-Math.pow((t - 0.036) / 0.007, 2));
        bpM += fMech * (n2 - lpM - 0.22 * bpM);
        lpM += fMech * bpM;
        const mechSig = bpM * boltEnv * 0.42;

        // 6. Outdoor Air Crackle & Propellant Tail (warm rolling lowpass noise)
        const tailAlpha = Math.min(0.28, (2 * Math.PI * (1800 * Math.exp(-t * 5.2) + 220)) / sr);
        lpTail += tailAlpha * (n - lpTail);
        const tailEnv = Math.exp(-t / tailDecay) * (1 - Math.exp(-t / 0.006));
        const tailSig = lpTail * tailEnv * (0.72 * (base.rev || 0.55));

        // Asymmetric microphone saturation (captures authentic real-life camera/mic gunfire snap!)
        const summed = shock + crackSig + barkSig + subSig + mechSig + tailSig;
        const satDrive = sub === 'sniper' || sub === 'shotgun' ? 2.6 : 2.15;
        dry[i] = Math.tanh(summed >= 0 ? summed * satDrive : summed * (satDrive * 0.86));
      }
    }

    // Apply Stereo Early Reflections (Concrete/Wall Slapback Echoes -> authentic outdoor/indoor realism!)
    const reflections = isSilenced
      ? [[0.016, 0.16, 0.10], [0.038, 0.08, 0.14]]
      : [
          [0.018, 0.34, 0.18],
          [0.036, 0.16, 0.30],
          [0.059, 0.24, 0.14],
          [0.092, 0.12, 0.22],
          [0.138, 0.15, 0.10],
          [0.195, 0.08, 0.12]
        ];
    const revScale = isSilenced ? 0.5 : (base.rev || 0.55);

    let refLpL = 0, refLpR = 0;
    for (let i = 0; i < len; i++) {
      let sL = dry[i];
      let sR = dry[i];
      for (let r = 0; r < reflections.length; r++) {
        const dIdx = i - Math.floor(reflections[r][0] * sr);
        if (dIdx >= 0) {
          const src = dry[dIdx];
          sL += src * reflections[r][1] * revScale;
          sR += src * reflections[r][2] * revScale;
        }
      }
      // Subtle stereo air-absorption smoothing on late reflections
      refLpL += 0.32 * (sL - refLpL);
      refLpR += 0.32 * (sR - refLpR);
      const earlyMix = i < sr * 0.025 ? 0.92 : 0.62;
      L[i] = Math.max(-1, Math.min(1, sL * earlyMix + refLpL * (1 - earlyMix)));
      R[i] = Math.max(-1, Math.min(1, sR * earlyMix + refLpR * (1 - earlyMix)));
    }

    this._gunBufferCache.set(key, buf);
    return buf;
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

  _tryPlayExternalSample(soundKey, weaponId = null, gainVal = 0.85, pitchJitter = 0.04) {
    const url = getConfiguredSoundUrl(soundKey, weaponId);
    if (!url || !this.ctx) return false;
    getAudioSampleBuffer(this.ctx, url).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 2 * pitchJitter;
      const g = this.ctx.createGain();
      g.gain.value = gainVal;
      src.connect(g);
      g.connect(this.compressor || this.masterGain);
      src.start();
    });
    return true;
  }

  playGunshot(weaponId = 'ak47', suppressed = false, distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const atten = distance <= 1 ? 1.0 : Math.max(0.04, 1 / (1 + distance * 0.048));
    if (atten <= 0.045) return;

    if (WEAPONS[weaponId]?.isMelee) {
      const heavyBlade = ['katana', 'kukri', 'tomahawk', 'karambit'].includes(weaponId);
      this.playKnifeSlash(atten, heavyBlade);
      return;
    }

    const sampleKey = suppressed ? 'fire_suppressed' : 'fire';
    if (this._tryPlayExternalSample(sampleKey, weaponId, 0.92 * atten, 0.035)) {
      return;
    }

    const base = GUN_PROFILES[weaponId] || GUN_PROFILES.ak47;
    const isSilenced = suppressed || Boolean(base.nativeSuppressed);
    const now = ctx.currentTime;

    // Play pre-synthesized physical ballistic PCM sample (10x more realistic + 10x less CPU during heavy firefights!)
    const gunBuf = this._getOrBuildGunSample(weaponId, isSilenced);
    const src = ctx.createBufferSource();
    src.buffer = gunBuf;
    // Subtle natural shot-to-shot micro-variation (±3% pitch) so rapid fire sounds organic & lifelike
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((isSilenced ? 0.82 : 1.05) * atten, now);

    if (distance > 12) {
      // Realistic outdoor air absorption: distant shots lose sharp highs and sound like deep rolling cracks
      const distLp = ctx.createBiquadFilter();
      distLp.type = 'lowpass';
      distLp.frequency.value = Math.max(750, 7200 / (1 + distance * 0.075));
      src.connect(distLp);
      distLp.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(this.compressor || this.masterGain);
    src.start(now);

    // Post-Shot Realism: Brass casing multi-bounce tinkle on concrete + Bolt/Pump/Belt mechanical action
    if (distance <= 2) {
      if (!isSilenced && base.brass !== false && WEAPONS[weaponId]?.subClass !== 'shotgun') {
        const t1 = 210 + Math.random() * 90;
        setTimeout(() => this._playBrassCasingBounce(0.085 * atten), t1);
      }
      if (base.post === 'bolt') {
        setTimeout(() => this.playBoltCycle(), 380);
      } else if (base.post === 'pump') {
        setTimeout(() => this.playPumpCycle(), 260);
      } else if (base.post === 'belt') {
        this._playMechTick(4400, 0.012, 0.08 * atten, now + 0.030);
      } else if (base.post === 'hammer') {
        this._playMechTick(3300, 0.014, 0.12 * atten, now + 0.075);
      }
    }
  }

  _playBrassCasingBounce(gainVal = 0.08) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Realistic 3-bounce high-frequency metallic brass shell ping hitting floor
    for (const [dt, amp, f] of [[0, 1.0, 6200], [0.085, 0.55, 6450], [0.145, 0.25, 6100]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f + Math.random() * 450, now + dt);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainVal * amp, now + dt);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dt + 0.022);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + dt);
      osc.stop(now + dt + 0.025);
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

  playKnifeSlash(atten = 1, isHeavyOrLong = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 1. Sharp directional air-slice whoosh (sweeps high -> low like real blade whip)
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = isHeavyOrLong ? 2.8 : 3.8;
    filter.frequency.setValueAtTime(isHeavyOrLong ? 980 : 1450, now);
    filter.frequency.exponentialRampToValueAtTime(isHeavyOrLong ? 3400 : 4800, now + 0.055);
    filter.frequency.exponentialRampToValueAtTime(420, now + (isHeavyOrLong ? 0.22 : 0.15));

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime((isHeavyOrLong ? 0.68 : 0.54) * atten, now + 0.035);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isHeavyOrLong ? 0.24 : 0.17));
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + (isHeavyOrLong ? 0.25 : 0.18));

    // 2. Subtle forged-steel blade resonance whistle
    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(isHeavyOrLong ? 2400 : 3200, now + 0.02);
    ring.frequency.exponentialRampToValueAtTime(isHeavyOrLong ? 1150 : 1800, now + 0.14);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.08 * atten, now + 0.02);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    ring.connect(rg);
    rg.connect(this.masterGain);
    ring.start(now + 0.02);
    ring.stop(now + 0.16);
  }

  playWeaponDraw(weaponId = 'ak47') {
    const ctx = this.ensureContext();
    if (ctx && this._tryPlayExternalSample('draw', weaponId, 0.55, 0.04)) return;
    const wc = WEAPONS[weaponId];
    if (wc?.isMelee) {
      this._playFoleySlide(1600, 4400, 0.14, 0.28, 4.5);
      this._playMechTick(3600, 0.03, 0.18);
      return;
    }
    if (wc?.subClass === 'sniper' || wc?.subClass === 'lmg') {
      this._playFoleySlide(520, 1400, 0.14, 0.24, 1.8);
      setTimeout(() => this._playMechTick(1750, 0.032, 0.22), 70);
      return;
    }
    if (wc?.subClass === 'pistol') {
      this._playFoleySlide(900, 2600, 0.09, 0.20, 2.5);
      setTimeout(() => this._playMechTick(2800, 0.022, 0.18), 55);
      return;
    }
    this._playFoleySlide(680, 1850, 0.11, 0.22, 2.0);
    setTimeout(() => this._playMechTick(2200, 0.025, 0.20), 65);
  }

  playGrenadePinPull() {
    this._playMechTick(3600, 0.032, 0.28);
    setTimeout(() => this._playFoleySlide(2200, 4400, 0.07, 0.20, 3.8), 45);
  }

  playGrenadeThrow() {
    this._playMechTick(2800, 0.03, 0.22);
    setTimeout(() => this.playKnifeSlash(0.58, false), 35);
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

    if (WEAPONS[weaponId]?.isSniper) {
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

    if (WEAPONS[weaponId]?.subClass === 'pistol' && weaponId !== 'magnum') {
      const heavySlide = weaponId === 'deagle' || weaponId === 'm1911';
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

  playBulletImpact(surface = 'concrete', distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const atten = distance <= 2 ? 1.0 : Math.max(0.05, 1 / (1 + distance * 0.085));
    if (atten <= 0.06) return;

    const sampleKey = surface === 'metal' ? 'metal_impact' : 'impact';
    if (this._tryPlayExternalSample(sampleKey, null, 0.55 * atten, 0.08)) return;

    const now = ctx.currentTime;
    if (surface === 'metal') {
      // High-energy metallic ricochet ping + clang
      const ping = ctx.createOscillator();
      ping.type = 'triangle';
      const baseF = 2400 + Math.random() * 900;
      ping.frequency.setValueAtTime(baseF, now);
      ping.frequency.exponentialRampToValueAtTime(baseF * 0.52, now + 0.12);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.22 * atten, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      ping.connect(pg);
      pg.connect(this.masterGain);
      ping.start(now);
      ping.stop(now + 0.14);

      const sparkN = ctx.createBufferSource();
      sparkN.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4200;
      bp.Q.value = 3.2;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.28 * atten, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      sparkN.connect(bp);
      bp.connect(sg);
      sg.connect(this.masterGain);
      sparkN.start(now);
      sparkN.stop(now + 0.075);
    } else if (surface === 'wood') {
      // Dry wooden splinter thud
      const n = ctx.createBufferSource();
      n.buffer = this.brownBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 620 + Math.random() * 180;
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32 * atten, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      n.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      n.start(now);
      n.stop(now + 0.09);
    } else {
      // Concrete / stone crack + dust chip scatter
      const crack = ctx.createBufferSource();
      crack.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900 + Math.random() * 450, now);
      bp.frequency.exponentialRampToValueAtTime(420, now + 0.08);
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28 * atten, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      crack.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      crack.start(now);
      crack.stop(now + 0.10);
    }
  }

  playShellClink(isShotgun = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (isShotgun) {
      // Hollow plastic hull bounce
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680 + Math.random() * 140, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.035);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.065, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.045);
      return;
    }
    // Crisp high-pitched brass casing clink on concrete
    const f1 = 4400 + Math.random() * 900;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f1 * 0.88, now + 0.045);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  playAdsTransition(entering = true, isSniper = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this._tryPlayExternalSample('aim', null, 0.35, 0.04)) return;
    const now = ctx.currentTime;

    // Subtle tactical cloth/gear rustle
    const n = ctx.createBufferSource();
    n.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(entering ? 750 : 1200, now);
    bp.frequency.exponentialRampToValueAtTime(entering ? 1450 : 620, now + 0.07);
    bp.Q.value = 2.0;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.09, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.masterGain);
    n.start(now);
    n.stop(now + 0.08);

    // Crisp optic/rail click
    this.playMetallicClick(isSniper ? (entering ? 1180 : 880) : (entering ? 920 : 680), 0.032, isSniper ? 0.14 : 0.08);
  }

  playExplosion(distance = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const atten = distance <= 2 ? 1.0 : Math.max(0.12, 1 / (1 + distance * 0.04));
    if (this._tryPlayExternalSample('explosion', null, 1.0 * atten, 0.04)) return;
    const now = ctx.currentTime;

    // 1. Supersonic detonation transient crack
    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2200, now);
    hp.frequency.exponentialRampToValueAtTime(280, now + 0.18);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1.1 * atten, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    crack.connect(hp);
    hp.connect(cg);
    cg.connect(this.shaper);
    crack.start(now);
    crack.stop(now + 0.24);

    // 2. Sub-bass concussive shockwave thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.42);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.95 * atten, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    sub.connect(sg);
    sg.connect(this.shaper);
    sub.start(now);
    sub.stop(now + 0.50);

    // 3. Rolling fire blast & debris rumble
    const noise = ctx.createBufferSource();
    noise.buffer = this.brownBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.frequency.exponentialRampToValueAtTime(48, now + 1.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.18 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.10);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.shaper);
    if (this.reverbGain) {
      const send = ctx.createGain();
      send.gain.value = 0.88 * atten;
      g.connect(send);
      send.connect(this.reverbGain);
    }
    noise.start(now);
    noise.stop(now + 1.12);
  }

  /**
   * Distinct real-world tactical grenade audio signatures:
   * - frag: Concussive HE explosion
   * - flash: Sharp M84 magnesium bang + piercing tinnitus ear-ringing!
   * - smoke: Pressurized M18 canister pop + sustained gas hiss
   * - ap: Electric Thermite EMP discharge + Kevlar/steel armor shatter
   * - molotov: Glass bottle shatter + roaring flame ignition
   */
  playGrenadeDetonation(grenadeType = 'frag', distance = 0, blindIntensity = 0) {
    if (grenadeType === 'frag') {
      this.playExplosion(distance);
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    const atten = distance <= 2 ? 1.0 : Math.max(0.14, 1 / (1 + distance * 0.045));
    const now = ctx.currentTime;

    if (grenadeType === 'flash') {
      // Sharp magnesium percussive bang (very tight, high-energy transient)
      const bang = ctx.createBufferSource();
      bang.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3400, now);
      bp.frequency.exponentialRampToValueAtTime(520, now + 0.14);
      bp.Q.value = 1.1;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(1.25 * atten, now);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      bang.connect(bp); bp.connect(bg); bg.connect(this.shaper);
      bang.start(now); bang.stop(now + 0.26);

      // Tight chest thump
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(185, now);
      thump.frequency.exponentialRampToValueAtTime(52, now + 0.18);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.75 * atten, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
      thump.connect(tg); tg.connect(this.shaper);
      thump.start(now); thump.stop(now + 0.22);

      // Authentic FPS Flashbang Tinnitus Ear-Ringing when player is blinded!
      if (blindIntensity > 0.12) {
        const ringDur = 1.2 + blindIntensity * 2.6;
        for (const freq of [3880, 4040]) {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + 0.04);
          osc.frequency.linearRampToValueAtTime(freq * 0.96, now + ringDur);
          const rg = ctx.createGain();
          rg.gain.setValueAtTime(0.001, now);
          rg.gain.linearRampToValueAtTime(0.16 * blindIntensity, now + 0.08);
          rg.gain.setValueAtTime(0.14 * blindIntensity, now + ringDur * 0.45);
          rg.gain.exponentialRampToValueAtTime(0.0008, now + ringDur);
          osc.connect(rg); rg.connect(this.masterGain);
          osc.start(now); osc.stop(now + ringDur + 0.05);
        }
      }
      return;
    }

    if (grenadeType === 'smoke') {
      // Initial striker pop
      this.playMetallicClick(2400, 0.04, 0.35 * atten);
      // Sustained pressurized gas release hiss (2.3s)
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.whiteBuffer;
      hiss.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, now);
      bp.frequency.exponentialRampToValueAtTime(3600, now + 0.45);
      bp.frequency.exponentialRampToValueAtTime(1850, now + 2.3);
      bp.Q.value = 1.6;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.01, now);
      hg.gain.linearRampToValueAtTime(0.42 * atten, now + 0.12);
      hg.gain.setValueAtTime(0.36 * atten, now + 1.2);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
      hiss.connect(bp); bp.connect(hg); hg.connect(this.masterGain);
      hiss.start(now); hiss.stop(now + 2.45);
      return;
    }

    if (grenadeType === 'ap') {
      // Thermite EMP Armor-Breaker: deep bass discharge sweep + crackling electric plasma + metallic armor shatter
      const emp = ctx.createOscillator();
      emp.type = 'sawtooth';
      emp.frequency.setValueAtTime(340, now);
      emp.frequency.exponentialRampToValueAtTime(38, now + 0.48);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, now);
      lp.frequency.exponentialRampToValueAtTime(140, now + 0.50);
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.95 * atten, now);
      eg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      emp.connect(lp); lp.connect(eg); eg.connect(this.shaper);
      emp.start(now); emp.stop(now + 0.55);

      // Sharp electric shatter burst
      const crack = ctx.createBufferSource();
      crack.buffer = this.whiteBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2200, now);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.85 * atten, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      crack.connect(hp); hp.connect(cg); cg.connect(this.shaper);
      crack.start(now); crack.stop(now + 0.36);

      // Metallic armor plates shattering
      for (let k = 0; k < 3; k++) {
        setTimeout(() => this.playMetallicClick(2100 + k * 720, 0.055, 0.32 * atten), k * 38);
      }
      return;
    }

    if (grenadeType === 'molotov') {
      // 1. Crystalline glass bottle shatter bursts
      for (let k = 0; k < 5; k++) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const f = 3100 + Math.random() * 3400;
        const t0 = now + k * 0.018;
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.24 * atten, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
        osc.connect(g); g.connect(this.masterGain);
        osc.start(t0); osc.stop(t0 + 0.07);
      }
      // 2. Fuel ignition whoosh + roaring flames
      const flame = ctx.createBufferSource();
      flame.buffer = this.brownBuffer;
      flame.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.setValueAtTime(850, now);
      lp.frequency.exponentialRampToValueAtTime(420, now + 1.8);
      lp.Q.value = 0.7;
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.95 * atten, now + 0.02);
      fg.gain.exponentialRampToValueAtTime(0.28 * atten, now + 0.55);
      fg.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
      flame.connect(lp); lp.connect(fg); fg.connect(this.shaper);
      flame.start(now); flame.stop(now + 2.25);
    }
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
