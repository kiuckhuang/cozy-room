// Cozy Room — procedural audio engine (WebAudio, zero asset files).
// Soft room tone + distant birds + a quiet lo-fi pentatonic bed, plus tiny
// UI/game SFX. Everything is generated with oscillators and filtered noise and
// politely ramped so there are never clicks or pops.
//
// Ambient bed sits around -32 dBFS; SFX peak around -19 dBFS.

const SCALE = [0, 2, 4, 7, 9];             // major pentatonic (semitones)
const ROOT = 146.832;                       // D3
const MOODS = {
  golden: { cut: 1000, wind: 0.55, birds: 0.55, room: 0.85, arp: 1.0, pad: 1.0 },
  day:    { cut: 1350, wind: 0.40, birds: 0.95, room: 0.90, arp: 1.1, pad: 0.92 },
  dusk:   { cut: 760,  wind: 0.80, birds: 0.30, room: 0.80, arp: 0.9, pad: 1.05 },
  night:  { cut: 520,  wind: 1.00, birds: 0.08, room: 0.65, arp: 0.6, pad: 0.95 }
};

const hz = (semi) => ROOT * Math.pow(2, semi / 12);

export function createAudio() {
  let ac = null;
  let master = null, limiter = null;
  let sfxBus = null, ambBus = null, musicBus = null, verbSend = null;
  let reverb = null;
  let noiseBuf = null;
  let pad = null, padGain = null, padFilter = null;
  let roomGain = null, windGain = null;
  let started = false;
  let muted = false;
  let volume = 0.9;
  let moodName = 'golden';
  const mood = () => MOODS[moodName] || MOODS.golden;
  const timers = [];
  let lastFoot = 0;
  let arpStep = 0;

  /* ------------------------------------------------------------- helpers */
  const now = () => (ac ? ac.currentTime : 0);

  function makeNoise(seconds = 2.4) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      // pink-ish: one-pole lowpassed white noise keeps it soft, no hiss
      let b = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b = 0.94 * b + 0.06 * w;
        d[i] = w * 0.45 + b * 1.2;
      }
    }
    return buf;
  }

  function makeReverb(seconds = 1.9, decay = 2.6) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.7;
      }
    }
    return buf;
  }

  function noiseSrc(loop = true) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop;
    s.loopStart = Math.random() * 0.5;
    return s;
  }

  /** short filtered-noise hit with a clean envelope */
  function burst({ t0 = 0, dur = 0.08, gain = 0.2, type = 'bandpass', freq = 900, q = 1.1, pan = 0, bus = null, attack = 0.004 }) {
    if (!ac || muted) return;
    const t = now() + t0;
    const src = noiseSrc(false);
    src.playbackRate.value = 0.85 + Math.random() * 0.35;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dest = bus || sfxBus;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      src.connect(f).connect(g).connect(p).connect(dest);
    } else src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.06);
    src.onended = () => { try { src.disconnect(); } catch { /* noop */ } };
  }

  /** little pitched blip; optional 2nd harmonic for bell-ish sparkle */
  function tone({ t0 = 0, freq = 880, dur = 0.2, gain = 0.12, type = 'sine', bus = null, pan = 0, attack = 0.006, slide = 0, harmonic = 0 }) {
    if (!ac || muted) return;
    const t = now() + t0;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dest = bus || sfxBus;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(dest); } else o.connect(g).connect(dest);
    if (harmonic) {
      const o2 = ac.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * harmonic;
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(gain * 0.22, t + attack);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (p) o2.connect(g2).connect(p); else o2.connect(g2).connect(dest);
      o2.start(t);
      o2.stop(t + dur + 0.06);
      o2.onended = () => { try { o2.disconnect(); } catch { /* noop */ } };
    }
    o.start(t);
    o.stop(t + dur + 0.06);
    o.onended = () => { try { o.disconnect(); } catch { /* noop */ } };
  }

  /* --------------------------------------------------------------- graph */
  function build() {
    master = ac.createGain();
    master.gain.value = 0.0001;
    limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 6;
    limiter.attack.value = 0.004; limiter.release.value = 0.22;
    master.connect(limiter).connect(ac.destination);

    sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0.6; ambBus.connect(master);

    reverb = ac.createConvolver();
    reverb.buffer = makeReverb();
    verbSend = ac.createGain(); verbSend.gain.value = 0.5;
    verbSend.connect(reverb).connect(master);

    noiseBuf = makeNoise();

    /* --- room tone: very soft low air --- */
    const room = noiseSrc();
    const roomLp = ac.createBiquadFilter();
    roomLp.type = 'lowpass'; roomLp.frequency.value = 340; roomLp.Q.value = 0.5;
    roomGain = ac.createGain(); roomGain.gain.value = 0.11;
    room.connect(roomLp).connect(roomGain).connect(ambBus);
    room.start(0, Math.random() * 1.6);

    // gentle breathing on the room tone so it never feels static
    const breath = ac.createOscillator(); breath.type = 'sine'; breath.frequency.value = 0.07;
    const breathAmt = ac.createGain(); breathAmt.gain.value = 0.02;
    breath.connect(breathAmt).connect(roomGain.gain);
    breath.start();

    /* --- wind at the windows --- */
    const wind = noiseSrc();
    const windBp = ac.createBiquadFilter();
    windBp.type = 'bandpass'; windBp.frequency.value = 780; windBp.Q.value = 0.6;
    windGain = ac.createGain(); windGain.gain.value = 0.09;
    wind.connect(windBp).connect(windGain).connect(ambBus);
    wind.start(0, Math.random() * 1.4);
    const gust = ac.createOscillator(); gust.type = 'sine'; gust.frequency.value = 0.045;
    const gustAmt = ac.createGain(); gustAmt.gain.value = 0.045;
    gust.connect(gustAmt).connect(windGain.gain);
    gust.start();

    /* --- lo-fi pad --- */
    padFilter = ac.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.Q.value = 0.35;
    padGain = ac.createGain(); padGain.gain.value = 0.25;
    padFilter.connect(padGain).connect(musicBus);
    padGain.connect(verbSend);

    pad = [];
    const chord = [0, 7, 12, 16];        // D, A, D, F#
    for (const semi of chord) {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(semi) / 2;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ac.createGain(); g.gain.value = 0.055;
      o.connect(g).connect(padFilter);
      o.start();
      pad.push({ o, g });
    }
    // a slow shared tremolo so the pad breathes
    const trem = ac.createOscillator(); trem.type = 'sine'; trem.frequency.value = 0.085;
    const tremAmt = ac.createGain(); tremAmt.gain.value = 0.06;
    trem.connect(tremAmt).connect(padGain.gain);
    trem.start();

    scheduleLoops();
    setAmbient(moodName, true);
  }

  /* ----------------------------------------------------- generative loops */
  function scheduleLoops() {
    // sparse birdsong, only while the tab is focused
    timers.push(setInterval(() => {
      if (!ac || muted || document.hidden) return;
      if (Math.random() > mood().birds * 0.45) return;
      const pan = (Math.random() * 2 - 1) * 0.75;
      const base = 1900 + Math.random() * 900;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        tone({
          t0: i * (0.075 + Math.random() * 0.05), freq: base * (0.92 + Math.random() * 0.2),
          dur: 0.06 + Math.random() * 0.05, gain: 0.05, type: 'sine', pan,
          slide: 1.18 + Math.random() * 0.15, bus: ambBus
        });
      }
    }, 900));

    // soft pentatonic lullaby notes
    timers.push(setInterval(() => {
      if (!ac || muted || document.hidden) return;
      if (Math.random() > 0.8 * mood().arp) return;
      arpStep++;
      const octave = arpStep % 7 === 0 ? 1 : 0;
      const semi = SCALE[Math.floor(Math.random() * SCALE.length)] + 24 + octave * 12;
      tone({
        t0: Math.random() * 0.12, freq: hz(semi), dur: 0.9 + Math.random() * 0.6,
        gain: 0.075, type: 'sine', pan: (Math.random() * 2 - 1) * 0.45,
        bus: musicBus, harmonic: 2, attack: 0.02
      });
    }, 1750));
  }

  /* -------------------------------------------------------------- public */
  function start() {
    if (started) {
      if (ac && ac.state === 'suspended' && !muted) ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    started = true;
    build();
    // gentle fade-in so the room "wakes up"
    master.gain.cancelScheduledValues(now());
    master.gain.setValueAtTime(0.0001, now());
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : volume, now() + 1.4);
    if (ac.state === 'suspended') ac.resume();
    window.addEventListener('pointerdown', () => {
      if (ac && ac.state === 'suspended' && !muted) ac.resume();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ac && ac.state === 'suspended' && !muted) ac.resume();
    });
  }

  function setMuted(v) {
    muted = !!v;
    if (!master || !ac) return;
    const t = now();
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(muted ? 0.0001 : volume, t, 0.05);
    if (!muted && ac.state === 'suspended') ac.resume();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && ac && !muted) master.gain.setTargetAtTime(volume, now(), 0.08);
  }

  function setAmbient(name, instant = false) {
    moodName = MOODS[name] ? name : 'golden';
    if (!ac) return;
    const m = mood();
    const t = now();
    const k = instant ? 0.02 : 0.5;
    if (padFilter) padFilter.frequency.setTargetAtTime(m.cut, t, k);
    if (windGain) windGain.gain.setTargetAtTime(0.09 * m.wind, t, k);
    if (roomGain) roomGain.gain.setTargetAtTime(0.11 * m.room, t, k);
    if (padGain) padGain.gain.setTargetAtTime(0.25 * m.pad, t, k);
    // nudge the pad slightly darker at night
    if (pad) {
      const d = name === 'night' ? -7 : name === 'dusk' ? -3 : 0;
      pad.forEach(({ o }, i) => o.detune.setTargetAtTime(d + (Math.random() - 0.5) * 1.5, t, k * 2));
    }
  }

  /* ----------------------------------------------------------------- SFX */
  function click(pitch = 720) {
    if (!ac || muted) return;
    tone({ freq: pitch, dur: 0.055, gain: 0.07, type: 'triangle', attack: 0.002 });
    burst({ dur: 0.035, gain: 0.05, freq: 2600, q: 0.9 });
  }

  function footstep(strength = 0.75) {
    if (!ac || muted) return;
    const t = now();
    if (t - lastFoot < 0.08) return;
    lastFoot = t;
    const s = Math.max(0.15, Math.min(1.2, strength));
    const f = 150 + Math.random() * 90;
    burst({ dur: 0.095, gain: 0.18 * s, type: 'bandpass', freq: f, q: 1.15, pan: (Math.random() - 0.5) * 0.2 });
    burst({ dur: 0.055, gain: 0.06 * s, type: 'lowpass', freq: 1100, q: 0.4 });
    tone({ freq: 82 + Math.random() * 12, dur: 0.09, gain: 0.06 * s, type: 'sine', attack: 0.004, slide: 0.72 });
  }

  function cloth() {
    if (!ac || muted) return;
    const t = now();
    const src = noiseSrc(false);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.55);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, Math.random() * 1.2);
    src.stop(t + 0.65);
    src.onended = () => { try { src.disconnect(); } catch { /* noop */ } };
  }

  function chime() {
    if (!ac || muted) return;
    [0, 7, 12, 19].forEach((semi, i) => tone({
      t0: i * 0.075, freq: hz(24 + semi), dur: 0.7, gain: 0.055,
      type: 'sine', harmonic: 2
    }));
    tone({ t0: 0.28, freq: hz(36), dur: 1.1, gain: 0.03, type: 'triangle' });
  }

  function pickup() {
    if (!ac || muted) return;
    // bright little sparkle run + airy shimmer
    const seq = [24, 29, 31, 36, 41];
    seq.forEach((semi, i) => tone({
      t0: i * 0.052, freq: hz(semi), dur: 0.34 + i * 0.03,
      gain: 0.1 - i * 0.008, type: 'sine', harmonic: 2, pan: (i - 2) * 0.16
    }));
    burst({ t0: 0.01, dur: 0.34, gain: 0.045, type: 'highpass', freq: 4200, q: 0.6 });
    tone({ t0: 0.26, freq: hz(48), dur: 0.9, gain: 0.035, type: 'triangle' });
  }

  function sparkle() {
    if (!ac || muted) return;
    tone({ freq: hz(43 + Math.floor(Math.random() * 5)), dur: 0.18, gain: 0.028, type: 'sine' });
  }

  function toggle() {
    if (!ac || muted) return;
    tone({ freq: 520, dur: 0.05, gain: 0.045, type: 'triangle' });
    tone({ t0: 0.06, freq: 780, dur: 0.07, gain: 0.04, type: 'triangle' });
  }

  function completion() {
    if (!ac || muted) return;
    [0, 4, 7, 11, 14].forEach((semi, i) => tone({
      t0: 0.02 * i, freq: hz(24 + semi), dur: 2.2, gain: 0.045,
      type: 'triangle', harmonic: 2, bus: musicBus, attack: 0.03
    }));
    [24, 26, 28, 31, 36, 38, 43].forEach((semi, i) => tone({
      t0: 0.06 + i * 0.065, freq: hz(semi + 12), dur: 0.5,
      gain: 0.05, type: 'sine', harmonic: 2, pan: (i - 3) * 0.1
    }));
    burst({ t0: 0.02, dur: 0.9, gain: 0.04, type: 'highpass', freq: 5200, q: 0.5 });
    tone({ t0: 0.5, freq: hz(12), dur: 2.4, gain: 0.045, type: 'sine', attack: 0.06 });
  }

  function whoosh() {
    if (!ac || muted) return;
    const t = now();
    const src = noiseSrc(false);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.75);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.85);
    src.onended = () => { try { src.disconnect(); } catch { /* noop */ } };
  }

  /** tiny 3-note "yes!" for mood changes and the completion button */
  function confirm() {
    if (!ac || muted) return;
    [0, 7, 12].forEach((s, i) => tone({ t0: i * 0.07, freq: hz(31 + s), dur: 0.5, gain: 0.055, type: 'sine', harmonic: 2 }));
  }

  return {
    start,
    stop() {
      timers.forEach(clearInterval);
      timers.length = 0;
      try { ac?.close(); } catch { /* noop */ }
      started = false; ac = null;
    },
    click, footstep, cloth, chime, pickup, sparkle, toggle, completion, confirm, whoosh,
    setMuted,
    setVolume,
    setAmbient,
    get isMuted() { return muted; },
    get ready() { return started && !!ac; },
    get context() { return ac; },
    get mood() { return moodName; }
  };
}
