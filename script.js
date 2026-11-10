const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const motion = !reduceMotion && 'gsap' in window;

/* ---------- theme ---------- */

const toggle = document.querySelector('.theme-toggle');
const themeNow = () => root.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

function paintToggle() {
  const next = themeNow() === 'dark' ? 'terang' : 'gelap';
  toggle.textContent = next;
  toggle.setAttribute('aria-label', `Ganti ke mode ${next}`);
}

toggle.addEventListener('click', () => {
  const next = themeNow() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* private mode: theme just won't persist */ }
  paintToggle();
  dispatchEvent(new Event('themechange'));
});
darkQuery.addEventListener('change', () => {
  if (root.dataset.theme) return;
  paintToggle();
  dispatchEvent(new Event('themechange'));
});
paintToggle();

/* ---------- smooth scroll (Lenis) ---------- */

let lenis = null;
if (motion && 'Lenis' in window) {
  gsap.registerPlugin(ScrollTrigger);
  lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Hash links: smooth-scroll with Lenis, then move focus so keyboard users land in the section.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const target = id === '#top' ? document.body : document.querySelector(id);
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { duration: 1.2 });
  else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  history.pushState(null, '', id);
});

/* ---------- ASCII background field ---------- */

// The whole page sits on a living field of characters: interference waves form bands and
// contour lines, the field thickens around the artwork, ripples under the cursor, and
// speeds up with scroll velocity.
// Each section gets its own character set (all 12 long, dark to dense), contour glyph, speed and
// threshold, so the field changes personality as you move down the page.
const MODES = {
  hero:    { ramp: ' .,:;-=+*#%@',  acc: '+', speed: 1,   cut: 0.42 },
  karya:   { ramp: ' .:/|\-<>=#@', acc: '/', speed: 0.7, cut: 0.46 }, // code-like
  tentang: { ramp: ' .,:;ocO0&8@',  acc: 'o', speed: 0.9, cut: 0.42 }, // rounder shapes
  kontak:  { ramp: ' .:101010+#@',  acc: '#', speed: 1.3, cut: 0.4 },  // binary
};
const FONT = '"IBM Plex Mono", ui-monospace, monospace';

function asciiField(cv) {
  const ctx = cv.getContext('2d');
  // Small cells: fine enough that the bands and contours read as shapes, not as dots.
  const CW = 6, LH = 11;
  const KX = CW / 10, KY = LH / 18; // the wave maths was tuned on 10x18 cells; this keeps the pattern size
  const RR = 22 * 10 / CW;          // cursor ripple radius in cells (= 220px)
  const s = { cols: 0, rows: 0, dpr: 1, lo: '', hi: '', acc: '', ready: false, mx: -999, my: -999, heat: 0, phase: 0, t: 0, last: 0, inside: false,
    name: 'hero', from: MODES.hero, to: MODES.hero, b: 1, noise: null };
  const sections = Object.keys(MODES).map((k) => [k, document.querySelector(`[data-field="${k}"]`)]).filter(([, el]) => el);
  const spots = [...document.querySelectorAll('[data-hotspot]')];

  function colors() {
    const css = getComputedStyle(root);
    s.lo = css.getPropertyValue('--field-lo').trim();
    s.hi = css.getPropertyValue('--field-hi').trim();
    s.acc = css.getPropertyValue('--field-acc').trim();
  }

  function resize() {
    s.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = innerWidth, h = innerHeight;
    s.cols = Math.ceil(w / CW);
    s.rows = Math.ceil(h / LH);
    cv.width = Math.round(w * s.dpr);
    cv.height = Math.round(h * s.dpr);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.font = `400 ${CW / 0.6}px ${FONT}`; // advance is exactly CW, so a row string lands on the cell grid
    ctx.textBaseline = 'top';
    // Fixed random threshold per cell: a mode change dissolves cell by cell instead of flipping at once.
    s.noise = Float32Array.from({ length: s.cols * s.rows }, Math.random);
    colors();
    s.ready = true;
    draw(s.last);
  }

  function draw(now) {
    if (!s.ready) return;
    const T = s.t + s.phase;
    const { from, to, b: blend } = s;
    const cut = from.cut + (to.cut - from.cut) * blend;
    const { cols, rows } = s;
    ctx.clearRect(0, 0, cols * CW, rows * LH);

    // Hotspots as ellipses in cell space, read once per frame (two elements, cheap).
    const holes = [];
    for (const el of spots) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      holes.push({ x: (r.left + r.width / 2) / CW, y: (r.top + r.height / 2) / LH, rx: r.width / CW * 0.75, ry: r.height / LH * 0.7 });
    }

    const sx = new Float32Array(cols);
    for (let x = 0; x < cols; x++) sx[x] = Math.sin(x * KX * 0.07 + T);
    const cx = cols * KX * 0.7, cy = rows * KY * 0.3;
    // One string per color per row, blank elsewhere: ~250 fillText calls a frame instead of ~12k.
    const lines = [new Array(cols), new Array(cols), new Array(cols)];
    const used = [0, 0, 0];

    for (let y = 0; y < rows; y++) {
      const yk = y * KY;
      const sy = Math.sin(yk * 0.19 - T * 0.8);
      for (let k = 0; k < 3; k++) { lines[k].fill(' '); used[k] = 0; }
      for (let x = 0; x < cols; x++) {
        const xk = x * KX;
        let v = (sx[x] + sy + Math.sin((xk * 0.4 + yk) * 0.09 + T * 0.6)
          + Math.sin(Math.hypot(xk - cx, (yk - cy) * 2) * 0.12 - T * 1.3) + 4) / 8;

        let boost = 0;
        for (const hl of holes) {
          const dx = (x - hl.x) / hl.rx;
          if (dx > 1 || dx < -1) continue;
          const dy = (y - hl.y) / hl.ry;
          if (dy > 1 || dy < -1) continue;
          const b = 1 - Math.sqrt(dx * dx + dy * dy);
          if (b > boost) boost = b;
        }
        if (boost > 0) v += boost * 0.55;

        if (s.heat > 0) {
          const d = Math.hypot(x - s.mx, (y - s.my) * (LH / CW));
          if (d < RR) v += s.heat * (Math.sin(d * 0.7 * CW / 10 - now / 90) * 0.25 + 0.35) * (1 - d / RR);
        }

        if (v < cut) continue; // blank troughs give the field its bands
        const m = s.noise[y * cols + x] < blend ? to : from;
        let row, i;
        if ((v * 7) % 1 > 0.47 && (v * 7) % 1 < 0.53) { row = 2; lines[2][x] = m.acc; used[2]++; continue; } // contour lines in the accent
        else {
          i = Math.min(11, ((v - cut) * 1.9 * 12) | 0);
          if (i === 0) continue;
          row = boost > 0.15 || v > 0.95 ? 1 : 0;
        }
        lines[row][x] = m.ramp[i];
        used[row]++;
      }
      for (let k = 0; k < 3; k++) {
        if (!used[k]) continue;
        ctx.fillStyle = k === 0 ? s.lo : k === 1 ? s.hi : s.acc;
        ctx.fillText(lines[k].join(''), 0, y * LH);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - s.last < 33) return; // ~30fps is plenty for a background
    if (lenis) s.phase += Math.min(Math.abs(lenis.velocity), 60) * 0.004;
    if (s.heat > 0 && !s.inside) s.heat = Math.max(0, s.heat - 0.03);

    // The section whose top has passed the middle of the screen sets the mode.
    let name = 'hero';
    for (const [k, el] of sections) if (el.getBoundingClientRect().top <= innerHeight / 2) name = k;
    if (name !== s.name) { s.name = name; s.from = s.to; s.to = MODES[name]; s.b = 0; }
    s.b = Math.min(1, s.b + 0.04);
    s.t += Math.min(now - (s.prev || now), 100) / 1000 * 0.35 * (s.from.speed + (s.to.speed - s.from.speed) * s.b);
    s.prev = now;
    s.last = now;
    draw(now);
  }

  addEventListener('resize', resize);
  addEventListener('themechange', () => { colors(); draw(s.last); });
  darkQuery.addEventListener('change', () => { colors(); draw(s.last); });
  document.fonts.load(`400 12px ${FONT}`).catch(() => {}).then(resize);

  if (reduceMotion) return; // static field: drawn once and on theme change only
  addEventListener('pointermove', (e) => {
    s.mx = e.clientX / CW; s.my = e.clientY / LH; s.heat = 1; s.inside = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { s.inside = false; });
  requestAnimationFrame(frame);
}

asciiField(document.querySelector('.field'));

/* ---------- ASCII banners behind section titles ---------- */

// Each word is rasterised once in the display face and re-typed as # with a : drop shadow.
function renderBanner(pre) {
  const word = pre.dataset.banner;
  const rows = innerWidth < 640 ? 8 : 14, S = 8; // finer glyph grid than before; fewer rows keep phones legible
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const font = `700 ${rows * S * 1.28}px "Martian Mono", monospace`;
  c.font = font;
  const cols = Math.ceil((c.measureText(word).width * 2) / S) + 3; // x2: a cell is twice as tall as wide
  c.canvas.width = cols * S;
  c.canvas.height = rows * S;
  c.font = font;
  c.textBaseline = 'middle';
  c.setTransform(2, 0, 0, 1, 0, 0);
  c.fillText(word, S / 2, rows * S * 0.54);
  const px = c.getImageData(0, 0, cols * S, rows * S).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows
    && px[((y * S + S / 2) * cols * S + x * S + S / 2) * 4 + 3] > 110;

  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) line += on(x, y) ? '#' : on(x - 1, y - 1) ? ':' : ' ';
    lines.push(line.replace(/\s+$/, ''));
  }
  // Drop the blank columns the glyph side-bearing leaves on the left so the word lines up with its title.
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  const trimmed = lines.map((l) => l.slice(indent));
  pre.style.setProperty('--cols', Math.max(...trimmed.map((l) => l.length)));
  pre.textContent = trimmed.join('\n');
}

document.fonts.load('700 40px "Martian Mono"').catch(() => {}).then(() => {
  document.querySelectorAll('[data-banner]').forEach(renderBanner);
  if (motion) ScrollTrigger.refresh();
});

/* ---------- motion ---------- */

if (!motion) {
  root.classList.remove('js-motion');
} else {
  gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);
  const chars = '/\\|+*=-_:01'; // no < or >: ScrambleText writes HTML, so those would form entities mid-scramble

  // Load: the name decodes first (focal point), the artwork wipes up into place,
  // then the supporting copy settles in.
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.to('.hero-name', { duration: 1.2, scrambleText: { text: '{original}', chars, revealDelay: 0.25, speed: 0.5 } }, 0)
    .to('.hero-role', { duration: 0.9, scrambleText: { text: '{original}', chars, speed: 0.6 } }, 0.35)
    .fromTo('.hero-art img', { clipPath: 'inset(100% 0 0 0)', y: 40 }, { clipPath: 'inset(0% 0 0 0)', y: 0, duration: 1.4, ease: 'expo.out' }, 0.15)
    .fromTo('[data-intro]', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12 }, 0.6)
    .add(() => root.classList.remove('js-motion'));

  // The portrait drifts slower than the page, so it reads as a layer above the field.
  gsap.to('.hero-art', {
    yPercent: 14, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  gsap.utils.toArray('.section-title').forEach((el) => {
    gsap.to(el, {
      duration: 0.9,
      scrambleText: { text: '{original}', chars, speed: 0.6 },
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  // Banners type themselves out left to right in hard steps, like a line printer.
  gsap.utils.toArray('.banner').forEach((el) => {
    gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0)' }, {
      clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'steps(28)',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0, y: 40, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  gsap.from('.about-art img', {
    y: 80, rotate: -6, autoAlpha: 0, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: '.about-art', start: 'top 80%', once: true },
  });
  // Marquee: one endless loop. Scrolling speeds it up, hovering slows it to a crawl.
  const marquee = document.querySelector('.marquee');
  if (marquee) {
    marquee.classList.add('is-live');
    const loop = gsap.to(marquee.querySelector('.marquee-track'), { xPercent: -100 / 3, ease: 'none', duration: 40, repeat: -1 });
    let slow = false;
    marquee.addEventListener('pointerenter', () => { slow = true; });
    marquee.addEventListener('pointerleave', () => { slow = false; });
    gsap.ticker.add(() => {
      const target = slow ? 0.15 : 1 + Math.min(Math.abs(lenis ? lenis.velocity : 0), 40) * 0.3;
      loop.timeScale(loop.timeScale() + (target - loop.timeScale()) * 0.08);
    });
  }

  // Everything below follows a mouse, so it is skipped on touch screens.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // Nav labels decode again on hover or focus, echoing the title scramble.
    document.querySelectorAll('.nav a').forEach((a) => {
      const label = a.textContent;
      const go = () => gsap.to(a, { duration: 0.45, scrambleText: { text: label, chars, speed: 0.7 }, overwrite: true });
      a.addEventListener('pointerenter', go);
      a.addEventListener('focus', go);
    });

    // Hero portrait: leans toward the pointer in 3D, so it reads as a layer above the field.
    const hero = document.querySelector('.hero');
    const img = document.querySelector('.hero-art img');
    gsap.set(img, { transformPerspective: 900, transformOrigin: '50% 85%' });
    const hx = gsap.quickTo(img, 'x', { duration: 0.9, ease: 'power3' });
    const hry = gsap.quickTo(img, 'rotationY', { duration: 0.9, ease: 'power3' });
    const hrx = gsap.quickTo(img, 'rotationX', { duration: 0.9, ease: 'power3' });
    hero.addEventListener('pointermove', (e) => {
      const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
      hx(nx * -18); hry(nx * 7); hrx(ny * -4);
    });
    hero.addEventListener('pointerleave', () => { hx(0); hry(0); hrx(0); });

    // Screenshots: tilt toward the pointer, and a scan line sweeps across as the color comes in.
    document.querySelectorAll('.shot').forEach((shot) => {
      const scan = document.createElement('span');
      scan.className = 'scan';
      scan.setAttribute('aria-hidden', 'true');
      shot.append(scan);
      gsap.set(shot, { transformPerspective: 1100 });
      const rx = gsap.quickTo(shot, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(shot, 'rotationY', { duration: 0.6, ease: 'power3' });
      shot.addEventListener('pointermove', (e) => {
        const r = shot.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 7);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 5);
      });
      shot.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });

    // Primary hero button leans toward the pointer.
    const mag = document.querySelector('.hero-actions .btn-accent');
    const mx = gsap.quickTo(mag, 'x', { duration: 0.5, ease: 'power3' });
    const my = gsap.quickTo(mag, 'y', { duration: 0.5, ease: 'power3' });
    mag.addEventListener('pointermove', (e) => {
      const r = mag.getBoundingClientRect();
      mx((e.clientX - (r.left + r.width / 2)) * 0.25);
      my((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    mag.addEventListener('pointerleave', () => { mx(0); my(0); });
  }
}
