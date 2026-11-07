const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

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

/* ---------- ASCII renderer ---------- */

// Ramp from empty to dense. The picture is redrawn from these characters on a canvas.
const RAMP = ' .:-=+*#%@';
const NOISE = '/\\|<>+*=-_:;01';
const FONT = '"IBM Plex Mono", ui-monospace, monospace';

function asciiArt(fig, startHidden) {
  const img = fig.querySelector('img');
  const cv = fig.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const maxCols = Number(fig.dataset.cols) || 96;
  // data-crop="x y w h" as fractions of the image; default is the whole picture.
  const [cx, cy, cwF, chF] = (fig.dataset.crop || '0 0 1 1').split(' ').map(Number);

  const s = {
    cols: 0, rows: 0, cw: 0, lh: 0, w: 0, h: 0,
    cells: null, accent: null, seed: null,
    ink: '', muted: '', hot: '',
    reveal: startHidden ? 0 : 1,
    px: -999, py: -999, inside: false, heat: 0, raf: 0,
  };

  function build() {
    const w = fig.clientWidth;
    if (!w || !img.naturalWidth) return;
    const cols = Math.max(32, Math.min(maxCols, Math.floor(w / 4.6)));
    const cw = w / cols;
    const fs = cw / 0.6; // monospace advance is ~0.6em
    const lh = fs * 1.08;
    const srcW = img.naturalWidth * cwF, srcH = img.naturalHeight * chF;
    const rows = Math.round((cols * srcH / srcW) * (cw / lh));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    Object.assign(s, { cols, rows, cw, lh, w, h: rows * lh });
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(s.h * dpr);
    cv.style.height = `${s.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `500 ${fs}px ${FONT}`;
    ctx.textBaseline = 'top';

    sampler.canvas.width = cols;
    sampler.canvas.height = rows;
    sampler.clearRect(0, 0, cols, rows);
    sampler.drawImage(img, img.naturalWidth * cx, img.naturalHeight * cy, srcW, srcH, 0, 0, cols, rows);
    const px = sampler.getImageData(0, 0, cols, rows).data;

    const css = getComputedStyle(root);
    const dark = css.getPropertyValue('--scheme').trim() === 'dark';
    s.ink = css.getPropertyValue('--ink').trim();
    s.muted = css.getPropertyValue('--muted').trim();
    s.hot = css.getPropertyValue('--accent').trim();

    const n = cols * rows;
    s.cells = new Int8Array(n);
    s.accent = new Uint8Array(n);
    if (!s.seed || s.seed.length !== n) s.seed = Float32Array.from({ length: n }, Math.random);

    // Histogram-equalize the opaque pixels: the art is mostly black jacket and hair, so a plain
    // luminance ramp spends almost every glyph on one shade and the face loses its features.
    const lums = new Uint8Array(n);
    const hist = new Float32Array(256);
    let opaque = 0;
    for (let i = 0; i < n; i++) {
      if (px[i * 4 + 3] < 31) continue;
      const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) | 0;
      lums[i] = l; hist[l]++; opaque++;
    }
    for (let l = 1; l < 256; l++) hist[l] += hist[l - 1];
    for (let l = 0; l < 256; l++) hist[l] /= opaque || 1;

    for (let i = 0; i < n; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3] / 255;
      if (a < 0.12) { s.cells[i] = -1; continue; }
      const lum = hist[lums[i]];
      // Dense glyphs mean "contrast with the page": bright pixels on dark, dark pixels on light.
      // The floor keeps black hair and jacket readable as a silhouette instead of vanishing.
      const v = dark ? lum : 1 - lum;
      s.cells[i] = Math.max(1, Math.round(a * (0.22 + 0.78 * v) * (RAMP.length - 1)));
      // The brand's light-blue collar keeps its color; everything else is ink.
      s.accent[i] = b > 140 && g > 110 && b - r > 70 ? 1 : 0;
    }
    draw();
  }

  function draw() {
    const { cols, rows, cw, lh, cells, accent, seed, reveal } = s;
    if (!cells) return;
    ctx.clearRect(0, 0, s.w, s.h);
    const tick = (performance.now() / 60) | 0;
    const radius = 7 * s.heat;
    const r2 = radius * radius;
    let color = '';

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const k = cells[i];
        if (k < 0) continue;

        let ch, c;
        if (seed[i] > reveal) {
          // Not resolved yet: a thin band of noise runs ahead of the reveal edge.
          if (seed[i] > reveal + 0.12) continue;
          ch = NOISE[(i + tick) % NOISE.length];
          c = s.muted;
        } else {
          const dx = x - s.px, dy = (y - s.py) * (lh / cw);
          if (r2 > 0 && dx * dx + dy * dy < r2) {
            ch = NOISE[(i * 7 + tick) % NOISE.length];
            c = s.hot;
          } else {
            ch = RAMP[k];
            c = accent[i] ? s.hot : s.ink;
          }
        }
        if (c !== color) { ctx.fillStyle = c; color = c; }
        ctx.fillText(ch, x * cw, y * lh);
      }
    }
  }

  // Only animate while something is changing; an idle portrait costs nothing.
  function loop() {
    if (!s.inside) s.heat = Math.max(0, s.heat - 0.04);
    draw();
    s.raf = s.heat > 0 ? requestAnimationFrame(loop) : 0;
  }
  const kick = () => { if (!s.raf) s.raf = requestAnimationFrame(loop); };

  if (!reduceMotion) {
    fig.addEventListener('pointermove', (e) => {
      const box = cv.getBoundingClientRect();
      s.px = (e.clientX - box.left) / s.cw;
      s.py = (e.clientY - box.top) / s.lh;
      s.inside = true;
      s.heat = 1;
      kick();
    });
    fig.addEventListener('pointerleave', () => { s.inside = false; kick(); });
  }

  let lastW = 0;
  new ResizeObserver(() => {
    if (fig.clientWidth === lastW) return;
    lastW = fig.clientWidth;
    build();
  }).observe(fig);
  addEventListener('themechange', build);
  darkQuery.addEventListener('change', build);

  const ready = img.complete ? Promise.resolve() : img.decode().catch(() => {});
  Promise.all([ready, document.fonts.load(`500 12px ${FONT}`).catch(() => {})]).then(() => {
    if (!img.naturalWidth) return; // image failed: leave the plain <img> visible
    fig.classList.add('is-live');
    build();
  });

  return {
    state: s,
    reveal(gsap, duration) {
      return gsap.to(s, { reveal: 1, duration, ease: 'power2.inOut', onUpdate: draw });
    },
  };
}

const heroArt = document.querySelector('[data-intro-ascii]');
const aboutArt = document.querySelector('[data-scroll-ascii]');
const motion = !reduceMotion && 'gsap' in window;
const hero = heroArt && asciiArt(heroArt, motion);
const about = aboutArt && asciiArt(aboutArt, motion);

/* ---------- motion ---------- */

if (!motion) {
  root.classList.remove('js-motion');
} else {
  gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);
  const chars = '/\\|<>+*=-_:01';

  // Load: the name decodes first (it is the focal point), the portrait assembles itself
  // out of characters next to it, then the supporting copy settles in.
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.to('.hero-name', { duration: 1.2, scrambleText: { text: '{original}', chars, revealDelay: 0.25, speed: 0.5 } }, 0)
    .to('.hero-role', { duration: 0.9, scrambleText: { text: '{original}', chars, speed: 0.6 } }, 0.35)
    .add(hero.reveal(gsap, 1.8), 0.1)
    .fromTo('[data-intro]', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12 }, 0.6)
    .add(() => root.classList.remove('js-motion'));

  // Section titles decode once as they arrive, echoing the hero.
  gsap.utils.toArray('.section-title').forEach((el) => {
    gsap.to(el, {
      duration: 0.9,
      scrambleText: { text: '{original}', chars, speed: 0.6 },
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0, y: 40, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  ScrollTrigger.create({
    trigger: aboutArt, start: 'top 80%', once: true,
    onEnter: () => about.reveal(gsap, 1.4),
  });
}
