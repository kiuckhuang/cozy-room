// Cozy Room — HUD / overlays. Light DOM, built once, updated by class toggles.
// All visuals live in style.css; the only inline art is tiny SVG (no images).

const DEFAULT_MOODS = [
  { name: 'golden', label: 'Golden hour' },
  { name: 'day', label: 'Soft daylight' },
  { name: 'dusk', label: 'Lavender dusk' },
  { name: 'night', label: 'Quiet night' }
];

const STAR_PATH = 'M12 2.8c.31 0 .59.18.72.46l2.36 4.78 5.27.77c.6.09.84.83.4 1.26l-3.81 3.72.9 5.25c.1.6-.52 1.05-1.06.78L12 17.35l-4.72 2.47c-.54.27-1.16-.18-1.06-.78l.9-5.25-3.81-3.72c-.44-.43-.2-1.17.4-1.26l5.27-.77 2.36-4.78A.81.81 0 0 1 12 2.8z';

const ICONS = {
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs>
      <linearGradient id="starGrad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#ffe9a8"/><stop offset="0.55" stop-color="#ffca6b"/><stop offset="1" stop-color="#f7a55c"/>
      </linearGradient></defs>
      <path class="star-base" d="${STAR_PATH}"/><path class="star-fill" d="${STAR_PATH}"/></svg>`,
  spark: `<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.1 7.1 7.1 2.1-7.1 2.1L12 20.2l-2.1-7.1L2.8 11l7.1-2.1z" fill="currentColor" opacity=".95"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9.4h3.1L12 6v12l-4.9-3.4H4z" fill="rgba(114,104,144,.14)"/>
      <path class="wave" d="M15.4 9.1a4.2 4.2 0 0 1 0 5.8M17.9 6.7a7.6 7.6 0 0 1 0 10.6"/>
      <path class="slash" d="M3.4 3.6l17 16.8" stroke-width="2"/></svg>`,
  lens: `<span class="lens" aria-hidden="true"></span>`,
  catBadge: `<svg class="intro-badge" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="skyG" cx="36%" cy="22%" r="88%">
          <stop offset="0" stop-color="#fff6e2"/><stop offset=".42" stop-color="#ffd4ae"/>
          <stop offset=".76" stop-color="#ecb7d9"/><stop offset="1" stop-color="#bca7e7"/>
        </radialGradient>
        <linearGradient id="catG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#eddbf7"/>
        </linearGradient>
        <linearGradient id="bowG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffb3cb"/><stop offset="1" stop-color="#f58fb0"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#skyG)"/>
      <circle cx="60" cy="60" r="55" fill="none" stroke="#fffaf2" stroke-opacity=".8" stroke-width="2.5"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="#fffaf2" stroke-opacity=".22"/>
      <path d="M90 26a11.5 11.5 0 1 0 7.6 19.2A13 13 0 0 1 90 26z" fill="#fff7e2" opacity=".85"/>
      <path d="M29 31l1.9 4.5 4.5 1.9-4.5 1.9L29 43.8l-1.9-4.5-4.5-1.9 4.5-1.9z" fill="#fffaf0"/>
      <path d="M88 62l1.2 2.9 2.9 1.2-2.9 1.2L88 70.2l-1.2-2.9-2.9-1.2 2.9-1.2z" fill="#fffaf0" opacity=".85"/>
      <ellipse cx="60" cy="95" rx="35" ry="9.5" fill="#f7c4d8" opacity=".5"/>
      <path d="M40 73c-1-15.5 7-23 20-23s21 7.5 20 23c0 12.2-9 19.2-20 19.2S40 85.2 40 73z" fill="url(#catG)" stroke="#ddc6ee" stroke-width="1"/>
      <path d="M43.5 61l-5.2-15.6 16.4 8.4z" fill="url(#catG)" stroke="#ddc6ee" stroke-width="1"/>
      <path d="M76.5 61l5.2-15.6-16.4 8.4z" fill="url(#catG)" stroke="#ddc6ee" stroke-width="1"/>
      <path d="M45.5 59.2l-3.2-9.4 10.2 5.4z" fill="#ffc4d6" opacity=".92"/>
      <path d="M74.5 59.2l3.2-9.4-10.2 5.4z" fill="#ffc4d6" opacity=".92"/>
      <path d="M49 72.4q4 4.8 8 0M63 72.4q4 4.8 8 0" stroke="#55406e" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="45.8" cy="79.4" rx="4.7" ry="2.7" fill="#ffadc6" opacity=".72"/>
      <ellipse cx="74.2" cy="79.4" rx="4.7" ry="2.7" fill="#ffadc6" opacity=".72"/>
      <path d="M58.6 77.6l1.4 1.7 1.4-1.7" fill="none" stroke="#c98aa6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M40 77l-8.4-2M40 81.4l-8.2 1.2M80 77l8.4-2M80 81.4l8.2 1.2" stroke="#b9a6cc" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
      <ellipse cx="52" cy="92.4" rx="5.2" ry="3.4" fill="#fffdf8"/>
      <ellipse cx="68" cy="92.4" rx="5.2" ry="3.4" fill="#fffdf8"/>
      <path d="M55.5 55.6l4.5 3.1 4.5-3.1-1 5.6h-7z" fill="url(#bowG)"/>
      <circle cx="60" cy="58.6" r="1.35" fill="#fff2f7" opacity=".9"/>
    </svg>`,
  ribbon: `<svg class="ribbon" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffeeb4"/><stop offset=".5" stop-color="#ffcd74"/><stop offset="1" stop-color="#eea64d"/>
        </linearGradient>
        <linearGradient id="ribTailG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f9a9c4"/><stop offset="1" stop-color="#e17fa8"/>
        </linearGradient>
      </defs>
      <path d="M42 64L30 106l18.5-9.4 9 12.6 5-34z" fill="url(#ribTailG)" opacity=".95"/>
      <path d="M78 64l12 42-18.5-9.4-9 12.6-5-34z" fill="url(#ribTailG)" opacity=".82"/>
      <circle cx="60" cy="52" r="34" fill="url(#goldG)" stroke="#fff4d4" stroke-width="2.5"/>
      <circle cx="60" cy="52" r="28" fill="none" stroke="#fff6dc" stroke-opacity=".55" stroke-width="1.2"/>
      <path d="M60 32l5.1 13 14 .8-10.8 8.9 3.6 13.5L60 60.6l-11.9 7.6 3.6-13.5-10.8-8.9 14-.8z" fill="#fffaf0" opacity=".94"/>
      <path d="M92 22l1.4 3.4 3.4 1.4-3.4 1.4L92 31.6l-1.4-3.4-3.4-1.4 3.4-1.4z" fill="#fff8e8"/>
      <path d="M26 40l1.1 2.6 2.6 1.1-2.6 1.1L26 47.4l-1.1-2.6-2.6-1.1 2.6-1.1z" fill="#fff8e8" opacity=".9"/>
    </svg>`
};

const MODE_HINTS = [
  { keys: ['W', 'A', 'S', 'D'], text: 'move' },
  { keys: ['Mouse'], text: 'look' },
  { keys: ['E'], text: 'interact' },
  { keys: ['Shift'], text: 'sprint' },
  { keys: ['T'], text: 'time of day' },
  { keys: ['P'], text: 'photo mode' },
  { keys: ['M'], text: 'mute' },
  { keys: ['Ctrl'], text: 'crouch' }
];

const kbd = (k) => `<span class="kbd">${k}</span>`;

function pipsHTML(n) {
  return Array.from({ length: n }, () => `<span class="pip">${ICONS.star}</span>`).join('');
}

/**
 * @param {object} handlers { onStart, onResume, onMood, onMute, onContinue, moods }
 */
export function createUI(handlers = {}) {
  const moods = (handlers.moods && handlers.moods.length ? handlers.moods : DEFAULT_MOODS)
    .map((m) => (typeof m === 'string' ? { name: m, label: m } : m));

  let root = document.getElementById('ui');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="hud">
      <div class="hud-corner hud-tl">
        <div class="room-tag glass">
          <div class="room-title"><span class="tiny-star">${ICONS.spark}</span><span>Cozy Room</span></div>
          <div class="mood-chip" data-mood="golden"><span class="mood-dot"></span><span class="mood-label">Golden hour</span></div>
        </div>
      </div>
      <div class="hud-corner hud-tr">
        <div class="progress-card glass">
          <div class="pips" aria-label="pals found">${pipsHTML(5)}</div>
          <div class="progress-label"><b class="found-count">0</b> / <span class="total-count">5</span> pals</div>
        </div>
      </div>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="prompt glass" role="status"><span class="kbd">E</span><span class="prompt-label"></span></div>
      <div class="lock-hint glass">Click once to look around</div>
      <div class="toast-stack" aria-live="polite"></div>
      <div class="hint-card glass">
        <div class="hint-title">Find the 5 little pals</div>
        ${MODE_HINTS.slice(0, 4).map((h) => `<div class="hint-row"><span class="hint-keys">${h.keys.map(kbd).join('')}</span><span>${h.text}</span></div>`).join('')}
      </div>
      <button class="sound-toggle" type="button" data-action="mute" aria-pressed="false" aria-label="Mute sound">${ICONS.sound}</button>
    </div>

    <div class="photo-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="photo-chip glass">${ICONS.lens}<span>Photo mode · P to exit</span></div>

    <div class="veil intro">
      <div class="card-wrap">
        <div class="card intro-card">
          ${ICONS.catBadge}
          <div class="intro-eyebrow">a tiny first-person room</div>
          <h1 class="intro-title">Cozy Room</h1>
          <p class="intro-sub">Five little plush pals are hiding in the golden light.<br><b>Wander, look closely, and pick them all up.</b></p>
          <button class="btn intro-start" type="button" data-action="start">
            ${ICONS.spark}<span>Click to enter the room</span>
            <svg class="arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>
          </button>
          <div class="keygrid">
            ${MODE_HINTS.map((h) => `<div class="krow"><span class="hint-keys">${h.keys.map(kbd).join('')}</span><span>${h.text}</span></div>`).join('')}
          </div>
          <div class="intro-foot">Best with headphones · find 5 pals · made with three.js</div>
        </div>
      </div>
    </div>

    <div class="veil pause" aria-hidden="true">
      <div class="card-wrap">
        <div class="card pause-card">
          <button class="sound-toggle pause-sound" type="button" data-action="mute" aria-pressed="false" aria-label="Mute sound">${ICONS.sound}</button>
          <h2 class="pause-title">Taking a tiny pause</h2>
          <p class="pause-sub">The room will wait for you.</p>
          <div class="pause-actions">
            <button class="btn" type="button" data-action="resume">${ICONS.spark}<span>Resume exploring</span></button>
          </div>
          <div class="mood-row">
            ${moods.map((m) => `<button class="mood-btn" type="button" data-action="mood" data-mood-name="${m.name}">${m.label}</button>`).join('')}
          </div>
          <div class="pause-hints">
            ${MODE_HINTS.slice(0, 5).map((h) => `<span class="hint-mini"><span class="hint-keys">${h.keys.map(kbd).join('')}</span>${h.text}</span>`).join('')}
          </div>
          <div class="pause-foot">Mute with <span class="kbd">M</span> · pal progress is kept for this visit</div>
        </div>
      </div>
    </div>

    <div class="veil complete" aria-hidden="true">
      <div class="confetti" aria-hidden="true"></div>
      <div class="card-wrap">
        <div class="card complete-card">
          ${ICONS.ribbon}
          <h2 class="complete-title">You found every little pal!</h2>
          <p class="complete-sub">Star, kitten, bunny, duckling and cloud are all tucked safely in your arms.<br>The room feels extra cozy now.</p>
          <div class="complete-stars">${pipsHTML(5)}</div>
          <div class="complete-actions">
            <button class="btn" type="button" data-action="continue">${ICONS.spark}<span>Stay in the room</span></button>
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => Array.from(root.querySelectorAll(sel));
  const hud = $('.hud');
  const intro = $('.intro');
  const pause = $('.pause');
  const complete = $('.complete');
  const prompt = $('.prompt');
  const promptLabel = $('.prompt-label');
  const crosshair = $('.crosshair');
  const toasts = $('.toast-stack');
  const hintCard = $('.hint-card');
  const lockHint = $('.lock-hint');
  const photoChip = $('.photo-chip');
  const photoFrame = $('.photo-frame');
  const moodChip = $('.mood-chip');
  const moodLabel = $('.mood-label');
  const foundCount = $('.found-count');
  const totalCount = $('.total-count');
  const pips = $$('.pips .pip');
  const completeStars = $$('.complete-stars .pip');
  const confetti = $('.confetti');

  let found = 0;
  let total = 5;
  let introOpen = false;
  let pauseOpen = false;
  let completeOpen = false;
  let hintsTimer = 0;
  let lockTimer = 0;
  let lastPrompt = '';

  /* ------------------------------------------------------------- overlays */
  function showIntro() {
    introOpen = true;
    intro.classList.add('show');
    intro.setAttribute('aria-hidden', 'false');
    // focus the primary action for keyboard players
    requestAnimationFrame(() => $('.intro-start')?.focus({ preventScroll: true }));
  }
  function hideIntro() {
    introOpen = false;
    intro.classList.remove('show');
    intro.setAttribute('aria-hidden', 'true');
    $('.intro-start')?.blur();
    armHints();
  }
  function showPause() {
    if (introOpen || completeOpen) return;
    pauseOpen = true;
    pause.classList.add('show');
    pause.setAttribute('aria-hidden', 'false');
    clearTimeout(lockTimer);
    lockHint.classList.remove('show');
    requestAnimationFrame(() => $('[data-action="resume"]')?.focus({ preventScroll: true }));
  }
  function hidePause() {
    if (!pauseOpen) return;
    pauseOpen = false;
    pause.classList.remove('show');
    pause.setAttribute('aria-hidden', 'true');
  }
  function showComplete() {
    completeOpen = true;
    root.classList.add('celebrating');
    clearPrompt();
    complete.classList.add('show');
    complete.setAttribute('aria-hidden', 'false');
    completeStars.forEach((p) => p.classList.add('on'));
    // confetti only while visible, capped and cheap
    confetti.innerHTML = '';
    const colors = ['#ffc2a1', '#ff9fbe', '#c9b6ef', '#a9e3cb', '#ffdf9c', '#fffaf0'];
    const shapes = ['50%', '3px', '40% 50% 50% 50%'];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      const size = 5 + Math.random() * 7;
      s.style.left = `${Math.random() * 100}%`;
      s.style.width = `${size}px`;
      s.style.height = `${size * (0.5 + Math.random() * 0.9)}px`;
      s.style.background = colors[i % colors.length];
      s.style.borderRadius = shapes[i % shapes.length];
      s.style.setProperty('--dur', `${3.4 + Math.random() * 2.6}s`);
      s.style.setProperty('--delay', `${Math.random() * 3.2}s`);
      s.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      s.style.setProperty('--spin', `${(Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 480)}deg`);
      s.style.opacity = '0';
      confetti.appendChild(s);
    }
    requestAnimationFrame(() => $('[data-action="continue"]')?.focus({ preventScroll: true }));
  }
  function hideComplete() {
    completeOpen = false;
    root.classList.remove('celebrating');
    complete.classList.remove('show');
    complete.setAttribute('aria-hidden', 'true');
    $('[data-action="continue"]')?.blur();
  }

  /* ------------------------------------------------------------------ hud */
  function setProgress(n, max = total, animate = true) {
    const prev = found;
    found = Math.max(0, Math.min(max, n));
    total = max;
    foundCount.textContent = String(found);
    totalCount.textContent = String(total);
    pips.forEach((p, i) => {
      const on = i < found;
      if (on && animate && i >= prev) {
        p.classList.remove('pop');
        void p.offsetWidth;
        p.classList.add('pop');
      }
      p.classList.toggle('on', on);
    });
    pips.forEach((p) => { if (!p.classList.contains('on')) p.classList.remove('pop'); });
  }

  function setMood(name, label) {
    const meta = moods.find((m) => m.name === name) || moods[0];
    moodChip.dataset.mood = meta.name;
    moodLabel.textContent = label || meta.label;
    $$('.mood-btn').forEach((b) => b.classList.toggle('active', b.dataset.moodName === meta.name));
  }

  function setPrompt(label) {
    if (!label) { clearPrompt(); return; }
    if (label === lastPrompt) return;
    lastPrompt = label;
    promptLabel.textContent = label;
    prompt.classList.add('show');
    crosshair.classList.add('hot');
  }
  function clearPrompt() {
    if (!lastPrompt) return;
    lastPrompt = '';
    prompt.classList.remove('show');
    crosshair.classList.remove('hot');
  }

  function toast(msg, ms = 3400) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toasts.appendChild(el);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }, ms);
  }

  function setMuted(muted) {
    $$('.sound-toggle').forEach((b) => {
      b.classList.toggle('muted', !!muted);
      b.setAttribute('aria-pressed', muted ? 'true' : 'false');
      b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    });
  }

  function setPhoto(on) {
    root.classList.toggle('photo', !!on);
    photoChip.classList.toggle('show', !!on);
    photoFrame.classList.toggle('show', !!on);
    if (on) { clearPrompt(); hideLockHint(); }
  }

  function armHints() {
    clearTimeout(hintsTimer);
    hintCard.classList.remove('fade');
    hintsTimer = setTimeout(() => hintCard.classList.add('fade'), 12000);
  }

  function showLockHint() {
    lockHint.classList.add('show');
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => lockHint.classList.remove('show'), 3200);
  }
  function hideLockHint() {
    lockHint.classList.remove('show');
    clearTimeout(lockTimer);
  }

  /* --------------------------------------------------------------- events */
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    // the intro veil handles every click itself (see listener below) so that
    // the start gesture is never handled twice
    if (action === 'resume') handlers.onResume?.();
    else if (action === 'continue') handlers.onContinue?.();
    else if (action === 'mute') handlers.onMute?.();
    else if (action === 'mood') {
      const name = btn.dataset.moodName;
      handlers.onMood?.(name);
      setMood(name);
    }
  });

  // click anywhere on the intro veil to begin (pointer lock needs a gesture)
  intro.addEventListener('click', (e) => {
    if (!introOpen) return;
    e.preventDefault();
    handlers.onStart?.();
  });
  // clicking the dimmed pause background resumes; buttons handle themselves
  pause.addEventListener('click', (e) => {
    if (!pauseOpen) return;
    if (e.target.closest('button')) return;
    handlers.onResume?.();
  });

  function onKey(e) {
    if (e.repeat) return;
    if (introOpen && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      handlers.onStart?.();
    } else if (pauseOpen && e.code === 'Enter') {
      e.preventDefault();
      handlers.onResume?.();
    }
  }
  window.addEventListener('keydown', onKey);

  setProgress(0, 5, false);
  setMood(moods[0].name, moods[0].label);

  return {
    root, hud,
    showIntro, hideIntro, showPause, hidePause, showComplete, hideComplete,
    setProgress, setMood, setPrompt, clearPrompt, toast, setMuted, setPhoto,
    armHints, showLockHint, hideLockHint,
    get introOpen() { return introOpen; },
    get pauseOpen() { return pauseOpen; },
    get completeOpen() { return completeOpen; },
    get found() { return found; },
    get total() { return total; },
    dispose() {
      window.removeEventListener('keydown', onKey);
      root.remove();
    }
  };
}

export default createUI;
