/** Küçük WebAudio ses motoru — dosya yok, hepsi sentez. */
let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const n = ctx.sampleRate * 0.4;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

function noise(dur, freq, q, gain, delay = 0) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime + delay;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone(freq, dur, gain, type = 'sine', delay = 0, slideTo = null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Raket vuruşu — güç 0..1 */
export function sfxHit(power = 0.5, smash = false) {
  noise(0.09 + power * 0.05, 900 + power * 1400, 1.1, 0.55 + power * 0.35);
  tone(150 + power * 120, 0.10, 0.18, 'triangle', 0, 70);
  if (smash) tone(90, 0.22, 0.22, 'sawtooth', 0.01, 45);
}

export function sfxServe() {
  noise(0.12, 1600, 1.4, 0.6);
  tone(220, 0.12, 0.16, 'triangle', 0, 90);
}

export function sfxBounce() {
  noise(0.07, 420, 2.2, 0.34);
  tone(110, 0.07, 0.12, 'sine', 0, 70);
}

export function sfxNet() {
  noise(0.20, 260, 0.7, 0.42);
}

export function sfxPoint(win) {
  if (win) {
    tone(523, 0.11, 0.20, 'triangle', 0.00);
    tone(659, 0.11, 0.20, 'triangle', 0.09);
    tone(880, 0.22, 0.22, 'triangle', 0.18);
  } else {
    tone(300, 0.16, 0.18, 'sawtooth', 0.00, 200);
    tone(190, 0.26, 0.16, 'sawtooth', 0.10, 120);
  }
}

export function sfxGame(win) {
  const notes = win ? [523, 659, 784, 1047] : [440, 392, 330, 262];
  notes.forEach((f, i) => tone(f, 0.26, 0.20, 'triangle', i * 0.11));
}
