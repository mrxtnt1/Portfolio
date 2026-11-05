/* ==========================================================================
   AYMEN FERGANI · CHRONO PORTFOLIO · app shell
   Full-screen "time jumps" between sections: mouse wheel, arrow keys,
   swipes, the right-hand dial or the nav. No scrollbar anywhere.
   ========================================================================== */

/* ---------- Edit your details here ---------- */
const CONFIG = {
  email: 'aymandesanta@gmail.com',       // ← your contact email
  ringText: 'AYMEN FERGANI · FULL STACK WEB DEVELOPER · ALGERIA · SINCE 2023 · ',
  heroPortrait: 'assets/img/aymen-arms-crossed.webp',
};

window.__chronoReady = true;

const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const lite = matchMedia('(max-width: 760px)').matches || coarse || (navigator.hardwareConcurrency || 8) <= 4;
const flow = root.classList.contains('touch-flow'); // set in <head>: phones, tablets, narrow windows

const eras = $$('.era');
const ids = eras.map((e) => e.id);
const FOCUS_POINTS = [[.42, .2], [-.42, .26], [.34, -.12], [-.48, -.04], [.52, .3], [-.22, .3]];
let index = 0;
let busy = false;
let scene = null;
let menuOpen = false;

root.classList.add('is-booting');

/* ==========================================================================
   Preloader
   ========================================================================== */
const loader = { el: $('#loader'), pct: $('#loader-pct'), prog: $('#loader-prog'), shown: 0, target: 0 };
const CIRC = 2 * Math.PI * 54;
function setProgress(p) { loader.target = Math.max(loader.target, Math.min(p, 1)); }
(function loaderLoop() {
  loader.shown += (loader.target - loader.shown) * .12;
  if (loader.target - loader.shown < .002) loader.shown = loader.target;
  const v = loader.shown;
  loader.pct.textContent = String(Math.round(v * 100)).padStart(3, '0');
  loader.prog.style.strokeDashoffset = String(CIRC * (1 - v));
  if (!loader.el.classList.contains('is-done')) requestAnimationFrame(loaderLoop);
})();

// Load and decode every photo behind the loader, so nothing pops in half-drawn later.
function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    const timer = setTimeout(done, 8000);
    img.onload = () => {
      clearTimeout(timer);
      if (img.decode) img.decode().then(done, done); else done();
    };
    img.onerror = () => { clearTimeout(timer); done(); };
    img.src = src;
  });
}

/* ==========================================================================
   Text helpers
   ========================================================================== */
function splitChars(el) {
  const text = el.textContent;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '';
  [...text].forEach((ch) => {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = ch;
    el.appendChild(s);
  });
}
const GLYPHS = '01<>/#*+=ΔABCDEFXZ';
function scramble(el, text, dur = 700) {
  cancelAnimationFrame(el._scr);
  if (reduced) { el.textContent = text; return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const shown = Math.floor(p * text.length);
    let out = '';
    for (let i = 0; i < text.length; i++) out += i < shown || text[i] === ' ' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (p < 1) el._scr = requestAnimationFrame(step);
  };
  el._scr = requestAnimationFrame(step);
}
function countUp(el) {
  const n = Number(el.dataset.count);
  const pad = Number(el.dataset.pad || 0);
  if (reduced) { el.textContent = String(n).padStart(pad, '0'); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / 1300, 1);
    el.textContent = String(Math.round(n * (1 - Math.pow(1 - p, 3)))).padStart(pad, '0');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ==========================================================================
   Section transitions
   ========================================================================== */
const heroChars = [];
const mixHex = (a, b, t) => '#' + [0, 2, 4].map((o) => Math.round(parseInt(a.substr(o + 1, 2), 16) * (1 - t) + parseInt(b.substr(o + 1, 2), 16) * t).toString(16).padStart(2, '0')).join('');
$$('[data-split]').forEach((el) => {
  splitChars(el);
  const chars = $$('.char', el);
  // the surname runs from brass (past) to flux (future)
  if (el.dataset.gradient) {
    const [a, b] = el.dataset.gradient.split(',');
    chars.forEach((c, i) => { c.style.color = mixHex(a, b, i / Math.max(chars.length - 1, 1)); });
  }
  heroChars.push(...chars);
});
$('#now-title').setAttribute('aria-label', "Hello, I'm Aymen Fergani");
$('.hero__hello').setAttribute('aria-hidden', 'true');

const itemsOf = (era) => $$('[data-r]', era);
const scrollerOf = (era) => $('.era__scroll', era);

function cancelAnims(els) { els.forEach((el) => el.getAnimations().forEach((a) => a.cancel())); }

function hideItems(items, dir) {
  if (!items.length) return Promise.resolve();
  return Promise.all(items.map((el, i) => el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate3d(0, ${-46 * dir}px, 0) scale(.985)` }],
    { duration: 420, delay: i * 26, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' },
  ).finished.catch(() => {})));
}
function showItems(items, dir, base = 120) {
  items.forEach((el, i) => el.animate(
    [{ opacity: 0, transform: `translate3d(0, ${64 * dir}px, 0) scale(.985)` }, { opacity: 1, transform: 'none' }],
    { duration: 1000, delay: base + i * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
  ));
}
function showHeroChars(delay = 150) {
  heroChars.forEach((c, i) => c.animate(
    [{ transform: 'translate3d(0, 112%, 0) rotate(7deg)' }, { transform: 'none' }],
    { duration: 1150, delay: delay + i * 42, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
  ));
}
function hideHeroChars() {
  return Promise.all(heroChars.map((c, i) => c.animate(
    [{ transform: 'none' }, { transform: 'translate3d(0, -112%, 0)' }],
    { duration: 420, delay: i * 14, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' },
  ).finished.catch(() => {})));
}

const sweepEl = $('#sweep');
function sweep(dir) {
  if (reduced) return;
  const a = dir > 0 ? -2 : 102;
  const b = dir > 0 ? 102 : -2;
  sweepEl.animate(
    [{ transform: `translateY(${a}vh)`, opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .88 }, { transform: `translateY(${b}vh)`, opacity: 0 }],
    { duration: 1050, easing: 'cubic-bezier(.65,0,.35,1)' },
  );
}

function setActive(era, on) {
  era.classList.toggle('is-active', on);
  if (flow) return; // in touch flow every section stays reachable
  era.inert = !on;
  if (on) era.removeAttribute('aria-hidden'); else era.setAttribute('aria-hidden', 'true');
}

function focusScene(i) {
  if (!scene) return;
  const anchor = $('[data-anchor]', eras[i]);
  scene.focus(anchor, anchor ? anchor.dataset.anchor : 'none');
  scene.setFocusPoint(...FOCUS_POINTS[i % FOCUS_POINTS.length]);
}

function onEnter(i) {
  const era = eras[i];
  $$('[data-count]', era).forEach(countUp);
  $$('[data-scramble]', era).forEach((el) => scramble(el, el.dataset.final || (el.dataset.final = el.textContent), 1100));
}

async function go(next, opts = {}) {
  if (flow) { flowGo(next); return; }
  if (busy || menuOpen && !opts.fromMenu) return;
  if (next < 0 || next >= eras.length || next === index) return;
  busy = true;
  const dir = next > index ? 1 : -1;
  const from = eras[index];
  const to = eras[next];
  const leavingHero = index === 0;
  index = next;
  updateHud();

  if (reduced) {
    from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    await wait(200);
    setActive(from, false);
    from.getAnimations().forEach((a) => a.cancel());
    setActive(to, true);
    scrollerOf(to).scrollTop = 0;
    focusScene(next);
    if (next === 0 && scene) scene.materialize(.01);
    if (leavingHero && scene) scene.dematerialize(.01);
    to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
    onEnter(next);
    await wait(260);
  } else {
    if (scene) scene.warp(1, 1.35);
    sweep(dir);
    if (leavingHero && scene) scene.dematerialize(.65);
    from.classList.add('is-leaving');
    const fromItems = itemsOf(from);
    await Promise.all([hideItems(fromItems, dir), leavingHero ? hideHeroChars() : null]);
    setActive(from, false);
    from.classList.remove('is-leaving');
    cancelAnims(fromItems);
    if (leavingHero) cancelAnims(heroChars);
    setActive(to, true);
    scrollerOf(to).scrollTop = 0;
    focusScene(next);
    showItems(itemsOf(to), dir);
    if (next === 0) {
      showHeroChars(120);
      if (scene) scene.materialize(1.5);
    }
    onEnter(next);
    await wait(650);
    if (scene) scene.relayout();
  }
  try { history.replaceState(null, '', '#' + ids[next]); } catch (e) { /* sandboxed frames may refuse */ }
  busy = false;
  if (opts.focus) { const h = $('[tabindex="-1"]', to); if (h) h.focus({ preventScroll: true }); }
  setTimeout(() => { if (scene && index === next) scene.relayout(); }, 500);
}

/* ==========================================================================
   HUD
   ========================================================================== */
const counterNum = $('#counter-num');
const counterName = $('#counter-name');
const needle = $('#dial-needle');
const prevBtn = $('#prev-btn');
const nextBtn = $('#next-btn');

function updateHud() {
  const id = ids[index];
  counterNum.textContent = String(index + 1).padStart(2, '0');
  scramble(counterName, eras[index].dataset.name, 500);
  $$('[data-goto]').forEach((el) => {
    if (el.closest('.dial, .topnav')) el.setAttribute('aria-current', String(el.dataset.goto === id));
  });
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === eras.length - 1;
  placeNeedle();
  $('#hero-tags').style.visibility = index === 0 ? 'visible' : 'hidden';
}
function placeNeedle() {
  const btn = $(`.dial [data-goto="${ids[index]}"]`);
  if (!btn || !btn.offsetParent) return;
  const li = btn.closest('li');
  needle.style.transform = `translateY(${li.offsetTop + li.offsetHeight / 2 - 2.5}px)`;
}

// Live clock: Algeria is UTC+1 all year (no daylight saving)
const clockEl = $('#clock-time');
function tickClock() {
  const d = new Date(Date.now() + 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  clockEl.textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  clockEl.setAttribute('datetime', d.toISOString().slice(0, 19).replace('T', ' '));
}
tickClock();
setInterval(tickClock, 1000);
$('#year').textContent = String(new Date().getFullYear());

/* ==========================================================================
   Input: wheel, keys, touch, clicks
   ========================================================================== */
const canScroll = (sc, dir) => (dir > 0 ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2 : sc.scrollTop > 2);

let wheelArmed = true;
let lastWheel = 0;
let wheelAcc = 0;
window.addEventListener('wheel', (e) => {
  if (flow || menuOpen) return;
  const now = performance.now();
  if (now - lastWheel > 220) { wheelArmed = true; wheelAcc = 0; }
  lastWheel = now;
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= window.innerHeight;
  if (Math.abs(dy) < Math.abs(e.deltaX)) return;
  const dir = Math.sign(dy);
  if (!dir) return;
  const sc = scrollerOf(eras[index]);
  e.preventDefault();
  if (!busy && canScroll(sc, dir)) { wheelArmed = false; sc.scrollTop += dy; return; } // a tall section scrolls first
  if (busy || !wheelArmed) return;
  wheelAcc += dy;
  if (Math.abs(wheelAcc) >= 30) { wheelArmed = false; wheelAcc = 0; go(index + dir); }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (menuOpen) { if (e.key === 'Escape') toggleMenu(false); return; }
  if (flow) return; // native scrolling handles keys
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const sc = scrollerOf(eras[index]);
  const nextKeys = ['ArrowDown', 'PageDown', 'ArrowRight'];
  const prevKeys = ['ArrowUp', 'PageUp', 'ArrowLeft'];
  if (e.key === ' ' && e.target.closest('button, a')) return;
  let dir = 0;
  if (nextKeys.includes(e.key) || (e.key === ' ' && !e.shiftKey)) dir = 1;
  else if (prevKeys.includes(e.key) || (e.key === ' ' && e.shiftKey)) dir = -1;
  else if (e.key === 'Home') { e.preventDefault(); go(0, { focus: true }); return; }
  else if (e.key === 'End') { e.preventDefault(); go(eras.length - 1, { focus: true }); return; }
  if (!dir) return;
  e.preventDefault();
  if (e.repeat && busy) return;
  if (canScroll(sc, dir)) {
    sc.scrollBy({ top: dir * sc.clientHeight * .6, behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  go(index + dir, { focus: true });
});

let touch = null;
window.addEventListener('touchstart', (e) => {
  if (flow || e.touches.length !== 1 || menuOpen) { touch = null; return; }
  const sc = scrollerOf(eras[index]);
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, top: !canScroll(sc, -1), bottom: !canScroll(sc, 1), t: performance.now() };
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = touch.x - e.changedTouches[0].clientX;
  const dy = touch.y - e.changedTouches[0].clientY;
  const quick = performance.now() - touch.t < 900;
  if (quick && Math.abs(dy) > 56 && Math.abs(dy) > Math.abs(dx) * 1.3) {
    if (dy > 0 && touch.bottom) go(index + 1);
    else if (dy < 0 && touch.top) go(index - 1);
  }
  touch = null;
}, { passive: true });

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-goto]');
  if (link) {
    e.preventDefault();
    const i = ids.indexOf(link.dataset.goto);
    const fromMenu = !!link.closest('.menu');
    if (fromMenu) toggleMenu(false);
    go(i, { focus: e.detail === 0, fromMenu });
    return;
  }
  if (e.target.closest('[data-next]')) go(index + 1);
});
prevBtn.addEventListener('click', () => go(index - 1));
nextBtn.addEventListener('click', () => go(index + 1));

window.addEventListener('hashchange', () => {
  const i = ids.indexOf(location.hash.slice(1));
  if (i >= 0 && i !== index) go(i);
});

// Mobile menu
const menuBtn = $('#menu-btn');
const menu = $('#menu');
function toggleMenu(open) {
  menuOpen = open;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) {
    $$('a', menu).forEach((a, i) => a.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: i * 50, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    const current = $(`a[data-goto="${ids[index]}"]`, menu);
    if (current) current.focus();
  } else {
    menuBtn.focus({ preventScroll: true });
  }
}
menuBtn.addEventListener('click', () => toggleMenu(!menuOpen));

/* ==========================================================================
   Micro-interactions
   ========================================================================== */
// Custom cursor
const cursorEl = $('#cursor');
const cursorLabel = $('#cursor-label');
function initCursor() {
  if (coarse || reduced || !matchMedia('(pointer: fine)').matches) return;
  root.classList.add('has-cursor');
  const dot = $('.cursor__dot', cursorEl);
  const ring = $('.cursor__ring', cursorEl);
  let x = -100, y = -100, rx = -100, ry = -100;
  let hoverEl = null;
  let lastLabel = '';
  cursorEl.style.opacity = '0';
  window.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    if (cursorEl.style.opacity === '0') { rx = x; ry = y; cursorEl.style.opacity = '1'; }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { cursorEl.style.opacity = '0'; });
  window.addEventListener('pointerdown', () => cursorEl.classList.add('is-down'));
  window.addEventListener('pointerup', () => cursorEl.classList.remove('is-down'));
  document.addEventListener('pointerover', (e) => { hoverEl = e.target.closest('[data-cursor]'); });
  (function loop() {
    rx += (x - rx) * .2;
    ry += (y - ry) * .2;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    const sceneHover = !!(scene && index === 0 && !busy && scene.hovered);
    const label = sceneHover ? 'Δt · click' : (hoverEl ? hoverEl.dataset.cursor : '');
    if (label !== lastLabel) { cursorLabel.textContent = label; lastLabel = label; }
    cursorEl.classList.toggle('is-hover', !!label);
    requestAnimationFrame(loop);
  })();
}

// Clicking the 3D portrait triggers a small time glitch
window.addEventListener('pointerdown', (e) => {
  if (!scene || index !== 0 || busy || !scene.hovered || e.target.closest('a, button')) return;
  scene.glitch(1);
  scene.warp(.35, .9);
});

// Magnetic buttons
$$('[data-magnetic]').forEach((el) => {
  if (coarse || reduced) return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const mx = e.clientX - (r.left + r.width / 2);
    const my = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${mx * .22}px, ${my * .35}px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
});

// 3D tilt (passport, project preview)
$$('[data-tilt]').forEach((el) => {
  if (coarse || reduced) return;
  const max = el.classList.contains('passport') ? 12 : 7;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.classList.add('is-tilting');
    el.style.setProperty('--ry', `${(px - .5) * max}deg`);
    el.style.setProperty('--rx', `${(.5 - py) * max}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  });
  el.addEventListener('pointerleave', () => {
    el.classList.remove('is-tilting');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  });
});

// Tap toggles for portrait effects on touch screens
[['.echo', 'is-synced'], ['.holo', 'is-resolved'], ['.lab__photo', 'is-thinking']].forEach(([sel, cls]) => {
  const el = $(sel);
  if (el) el.addEventListener('click', () => el.classList.toggle(cls));
});

// DF Shoes screenshot gallery: auto-advances while Projects is on screen, pauses on hover
const shotImgs = $$('.shot');
const shotBtns = $$('.shots__nav button');
const shotLabel = $('#shot-label');
let shotIndex = 0;
function setShot(i) {
  if (!shotImgs.length) return;
  shotIndex = (i + shotImgs.length) % shotImgs.length;
  shotImgs.forEach((im, k) => im.classList.toggle('is-active', k === shotIndex));
  shotBtns.forEach((b, k) => {
    b.setAttribute('aria-pressed', String(k === shotIndex));
    b.classList.toggle('is-done', k < shotIndex);
  });
  if (shotLabel) shotLabel.textContent = ' · ' + shotBtns[shotIndex].dataset.label;
}
shotBtns.forEach((b, k) => {
  b.addEventListener('click', () => setShot(k));
  $('i', b).addEventListener('animationend', () => { if (!reduced && k === shotIndex) setShot(shotIndex + 1); });
});

/* Portrait effects are drawn on canvas from the photos themselves.
   (CSS image masks were dropped: they need same-origin image URLs and failed to paint on some desktop browsers.) */
function whenLoaded(img) {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) { resolve(img); return; }
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}
function drawSilhouette(img, colour, scale = .5) {
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, c.height);
  fade.addColorStop(0, '#000');
  fade.addColorStop(.7, '#000');
  fade.addColorStop(.98, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
function drawHologram(img, c) {
  const w = (c.width = Math.round(img.naturalWidth * .6));
  const h = (c.height = Math.round(img.naturalHeight * .6));
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'color';
  const tint = g.createLinearGradient(0, 0, 0, h);
  tint.addColorStop(0, '#62e8ff');
  tint.addColorStop(1, '#8a6cff');
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'screen';
  g.fillStyle = 'rgba(98, 232, 255, .16)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0, w, h);
}
async function buildPortraitEffects() {
  try {
    const echoImg = $('.echo__stage img');
    if (echoImg && await whenLoaded(echoImg)) {
      $$('.echo__ghost').forEach((ghost) => {
        if (!ghost.firstChild) ghost.appendChild(drawSilhouette(echoImg, ghost.classList.contains('echo__ghost--future') ? '#62e8ff' : '#f0b35a'));
      });
    }
    const holoImg = $('.holo__body img');
    const proj = $('.holo__proj');
    if (holoImg && proj && await whenLoaded(holoImg)) {
      drawHologram(holoImg, proj);
      proj.classList.add('is-ready');
    }
  } catch (err) {
    console.warn('Portrait effects skipped.', err);
  }
}

// Keep the 3D frame aligned when a section scrolls internally (small screens)
eras.forEach((era) => scrollerOf(era).addEventListener('scroll', () => { if (scene) scene.relayout(); }, { passive: true }));
window.addEventListener('resize', () => { placeNeedle(); if (scene) scene.relayout(); });

/* ==========================================================================
   Contact
   ========================================================================== */
const emailText = $('#direct-email');
emailText.textContent = CONFIG.email;
$('#copy-email').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const done = (msg) => { btn.textContent = msg; setTimeout(() => { btn.textContent = 'Copy'; }, 1800); };
  const selectText = () => {
    const range = document.createRange();
    range.selectNodeContents(emailText);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    done('Selected');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(CONFIG.email).then(() => done('Copied'), selectText);
  } else selectText();
});

const form = $('#transmit');
const statusEl = $('#transmit-status');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.elements.name;
  const email = form.elements.email;
  const msg = form.elements.message;
  let bad = null;
  [[name, (v) => v.trim().length > 1], [email, (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())], [msg, (v) => v.trim().length > 4]].forEach(([field, ok]) => {
    const valid = ok(field.value);
    field.closest('.field').classList.toggle('is-invalid', !valid);
    field.setAttribute('aria-invalid', String(!valid));
    if (!valid && !bad) bad = field;
  });
  if (bad) {
    statusEl.classList.add('is-error');
    statusEl.textContent = bad === email ? 'Enter a valid email address so I can reply.' : 'Add your name and a few words about the project.';
    bad.focus();
    return;
  }
  statusEl.classList.remove('is-error');
  const subject = `Project inquiry from ${name.value.trim()}`;
  const body = `${msg.value.trim()}\n\n${name.value.trim()}\n${email.value.trim()}`;
  window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  statusEl.textContent = 'Your email app should open with the message ready. If it does not, copy the address below.';
});

/* ==========================================================================
   Hero tags follow the 3D portrait
   ========================================================================== */
const tagEls = $$('#hero-tags .tag');
function updateTags() {
  if (!scene || index !== 0) return;
  const show = !busy && scene.revealed > .97;
  const pts = scene.tagPositions();
  tagEls.forEach((el, i) => {
    el.style.setProperty('--x', `${pts[i].x}px`);
    el.style.setProperty('--y', `${pts[i].y}px`);
    el.style.opacity = show ? '1' : '0';
  });
}

/* ==========================================================================
   Touch flow: native scroll, the HUD and 3D rings follow the section in view
   ========================================================================== */
function flowGo(i) {
  if (i < 0 || i >= eras.length) return;
  eras[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
function setFlowIndex(i) {
  const prev = index;
  index = i;
  eras.forEach((era, k) => era.classList.toggle('is-active', k === i));
  updateHud();
  focusScene(i);
  if (scene) {
    if (prev === 0 && i !== 0) scene.dematerialize(.6);
    if (i === 0 && prev !== 0) { scene.materialize(1.2); }
    scene.warp(.3, .9);
  }
  onEnter(i);
  try { history.replaceState(null, '', '#' + ids[i]); } catch (e) { /* sandboxed frames may refuse */ }
}
function flowTick() {
  const mid = window.innerHeight * .45;
  let cur = index;
  eras.forEach((era, i) => {
    const r = era.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) cur = i;
  });
  if (cur !== index) setFlowIndex(cur);
  if (scene) scene.relayout();
}
function initFlow() {
  let raf = 0;
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; flowTick(); }); }, { passive: true });
  // reveal each block once, just before it scrolls into view
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.filter((en) => en.isIntersecting).forEach((en, k) => {
        io.unobserve(en.target);
        en.target.animate(
          [{ opacity: 0, transform: 'translate3d(0, 36px, 0)' }, { opacity: 1, transform: 'none' }],
          { duration: 800, delay: k * 70, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
        );
      });
    }, { rootMargin: '0px 0px 8% 0px' });
    $$('[data-r]').forEach((el) => { if (!el.closest('.era--now')) io.observe(el); });
  }
  if (scene) scene.setFollow(14);
  flowTick();
}

/* ==========================================================================
   Boot
   ========================================================================== */
async function boot() {
  const startIndex = Math.max(0, ids.indexOf(location.hash.slice(1)));
  eras.forEach((era, i) => setActive(era, i === startIndex));
  index = startIndex;

  const images = [
    'assets/img/aymen-arms-crossed.webp', 'assets/img/aymen-arms-crossed-fade.webp', 'assets/img/aymen-thinking.webp', 'assets/img/aymen-lab-fade.webp', 'assets/img/aymen-face.webp',
    'assets/img/dfshoes/01-intro.webp', 'assets/img/dfshoes/02-models.webp', 'assets/img/dfshoes/03-views.webp', 'assets/img/dfshoes/04-detail.webp', 'assets/img/dfshoes/mobile.webp',
  ];
  const total = images.length + 4;
  let done = 0;
  const tick = () => setProgress(++done / total);
  const fonts = (document.fonts ? document.fonts.ready : Promise.resolve()).then(tick);
  const imgs = Promise.all(images.map((src) => preloadImage(src).then(tick)));
  imgs.then(buildPortraitEffects);

  const sceneTask = (async () => {
    try {
      await fonts; // the 3D dial draws text with the mono face
      const mod = await import('./chrono-scene.js');
      const s = await mod.createChronoScene({
        canvas: $('#chrono-canvas'), portraitSrc: CONFIG.heroPortrait, ringText: CONFIG.ringText, lite, reduced,
      });
      done += 3; setProgress(done / total);
      return s;
    } catch (err) {
      console.warn('3D layer unavailable, using the 2D fallback.', err);
      root.classList.add('no-webgl');
      done += 3; setProgress(done / total);
      return null;
    }
  })();

  const timeout = wait(9000).then(() => 'timeout');
  const [result] = await Promise.all([Promise.race([sceneTask, timeout]), imgs, wait(reduced ? 200 : 1100)]);
  if (result === 'timeout') { root.classList.add('no-webgl'); scene = null; } else scene = result;
  setProgress(1);
  await wait(reduced ? 50 : 450);

  if (scene) scene.onFrame(updateTags);
  const playIntro = !!scene && !reduced;
  if (playIntro) root.classList.add('is-intro');
  loader.el.classList.add('is-done');
  setTimeout(() => { loader.el.hidden = true; }, 1400);
  if (playIntro) await scene.enterWormhole(lite ? 2.3 : 2.7);
  root.classList.remove('is-intro');
  root.classList.remove('is-booting');
  if (flow && index > 0) eras[index].scrollIntoView({ block: 'start' });
  updateHud();
  focusScene(index);
  initCursor();

  const era = eras[index];
  if (flow) initFlow(); else showItems(itemsOf(era), 1, 350);
  if (flow && index === 0) showItems(itemsOf(era), 1, 350);
  if (index === 0) {
    showHeroChars(380);
    if (scene) scene.materialize(reduced ? .01 : 2.2);
  }
  onEnter(index);
  setTimeout(() => { if (scene) scene.relayout(); placeNeedle(); }, 900);
}

boot();
