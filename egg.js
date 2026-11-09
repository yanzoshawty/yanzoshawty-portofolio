/* Easter eggs, a homage to hacker-culture shows and games (Mr. Robot, Watch Dogs and friends).
   Everything runs locally: nothing here reads or sends anything beyond the visitor's own browser. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // `lenis` is the top-level let from script.js; classic scripts share that scope.
  const smooth = () => (typeof lenis !== 'undefined' ? lenis : null);
  const tick = (ms) => (reduce ? 0 : ms);

  /* ---------- console greeting ---------- */

  const msg = ['hello, friend.', 'kamu buka console, berarti kamu penasaran.', 'tekan ` di halaman, atau ketik fsociety.'];
  const w = Math.max(...msg.map((l) => l.length));
  const box = ['+' + '-'.repeat(w + 4) + '+', ...msg.map((l) => '|  ' + l.padEnd(w) + '  |'), '+' + '-'.repeat(w + 4) + '+'];
  console.log('%c' + box.join('\n'), 'color:#3ad6ff;font:12px/1.4 monospace');

  /* ---------- overlay shell (one at a time) ---------- */

  let current = null;
  let returnTo = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function openShell(title, label) {
    closeShell();
    const wrap = el('div', 'egg');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', label);
    wrap.setAttribute('data-lenis-prevent', '');
    const win = el('div', 'egg-win');
    const bar = el('div', 'egg-bar');
    const close = el('button', 'btn egg-x', 'esc');
    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup');
    close.addEventListener('click', closeShell);
    bar.append(el('span', '', title), close);
    win.append(bar);
    wrap.append(win);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeShell(); });
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [...wrap.querySelectorAll('button, input')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    returnTo = document.activeElement;
    document.body.append(wrap);
    smooth()?.stop();
    current = wrap;
    return { win, close };
  }

  function closeShell() {
    if (!current) return;
    current.remove();
    current = null;
    smooth()?.start();
    if (returnTo && returnTo.focus) returnTo.focus();
  }

  /* ---------- hidden terminal ---------- */

  // shortcut: URLs duplicate the links in index.html, update both when a project moves.
  const WORKS = {
    not4recon: 'https://not4recon-eight.vercel.app/',
    lazycustom: 'https://lazycustom.vercel.app/',
    'vtuber-yanzo': 'https://yeetpersonalweb.vercel.app/',
    'vtuber-kanekoi': 'https://kanekoi-otosaka.vercel.app/',
  };

  const FILES = {
    'tentang.txt': () => [document.querySelector('.about-copy > p')?.textContent ?? ''],
    'kontak.txt': () => [...document.querySelectorAll('.socials a')]
      .map((a) => `${a.querySelector('.platform').textContent.padEnd(14)}${a.querySelector('.handle').textContent}`),
    'flag.txt': () => ['flag{hello_friend}', 'kamu nemu. selamat datang.'],
    '.rahasia': () => ['coba: fsociety, ctos, dedsec', 'atau kode yang dikenal gamer lama.'],
  };

  function openTerminal(first) {
    const { win } = openShell('yanzoshawty@folio:~', 'Terminal');
    const out = el('div', 'egg-out');
    out.setAttribute('role', 'log');
    out.setAttribute('aria-live', 'polite');
    const form = el('form', 'egg-in');
    const label = el('label', 'sr-only', 'Perintah');
    label.htmlFor = 'egg-cmd';
    const input = el('input');
    Object.assign(input, { id: 'egg-cmd', type: 'text', autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'off');
    form.append(label, el('span', 'egg-ps', '$'), input);
    win.append(out, form);

    const history = [];
    let hi = 0;

    const print = (lines, cls) => {
      for (const l of [].concat(lines)) out.append(el('p', cls, l));
      out.scrollTop = out.scrollHeight;
    };
    // Lines arrive one by one so "hack" feels like something is happening.
    const printSlow = (lines) => lines.forEach((l, i) => setTimeout(() => current && print(l), tick(i * 450)));

    const commands = {
      help: () => print(['help  whoami  ls  cat <file>  open <karya>  theme  clear  exit', 'ada beberapa perintah yang tidak tercantum di sini.']),
      whoami: () => print(['yanzoshawty', 'programmer dan VTuber dari Indonesia']),
      ls: (a) => print(a[0] === 'karya' ? Object.keys(WORKS)
        : (a.includes('-a') ? ['.rahasia'] : []).concat(['karya/', 'tentang.txt', 'kontak.txt', 'flag.txt'])),
      cat: ([f]) => print(!f ? 'cat: nama file kosong' : Object.hasOwn(FILES, f) ? FILES[f]() : `cat: ${f}: tidak ada file itu`),
      open: ([n]) => {
        if (!Object.hasOwn(WORKS, n)) return print(['open: pilih salah satu:'].concat(Object.keys(WORKS)));
        print(`membuka ${n} ...`, 'ok');
        window.open(WORKS[n], '_blank', 'noopener');
      },
      theme: () => { document.querySelector('.theme-toggle').click(); print('tema diganti', 'ok'); },
      sudo: () => print('kamu tidak ada di file sudoers. Kejadian ini akan dilaporkan.'),
      hack: () => printSlow(['menyambung ke target ...', 'melewati firewall ...', 'ACCESS DENIED', 'ini cuma web portofolio. coba: cat flag.txt']),
      dedsec: () => print(["dedsec: node online. ketik 'ctos' untuk membaca perangkatmu."]),
      nullsec: () => print(['nullsec: ping 127.0.0.1 ... ok', 'semua trafik di sini lokal. tidak ada yang dikirim.']),
      clear: () => { out.textContent = ''; },
      exit: () => closeShell(),
      fsociety: () => { closeShell(); startGlitch(); },
      ctos: () => { closeShell(); openProfiler(); },
    };

    const run = (line) => {
      print(`$ ${line}`, 'cmd');
      const [name, ...args] = line.trim().split(/\s+/);
      if (!name) return;
      history.push(line);
      hi = history.length;
      (Object.hasOwn(commands, name) ? commands[name] : (() => print(`${name}: perintah tidak dikenal. ketik help`)))(args);
    };

    form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; run(v); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      hi = Math.max(0, Math.min(history.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hi] ?? '';
    });
    out.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });

    print('ketik help untuk daftar perintah.', 'cmd');
    if (first) run(first);
    input.focus();
  }

  /* ---------- ctOS-style profiler: reads only this browser ---------- */

  function openProfiler() {
    const { win } = openShell('ctOS // profil', 'Profil perangkat');
    const body = el('div', 'egg-out');
    body.append(el('p', 'cmd', 'dibaca dari browsermu sendiri. tidak dikirim ke mana pun.'));
    const dl = el('dl', 'egg-prof');
    body.append(dl);
    win.append(body);

    const rows = [
      ['perangkat', navigator.userAgentData?.platform || navigator.platform || 'tidak diketahui'],
      ['layar', `${screen.width}x${screen.height} @${devicePixelRatio}x`],
      ['jendela', `${innerWidth}x${innerHeight}`],
      ['bahasa', navigator.language],
      ['zona waktu', Intl.DateTimeFormat().resolvedOptions().timeZone],
      ['inti cpu', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'tidak diketahui'],
      ['tema', matchMedia('(prefers-color-scheme: dark)').matches ? 'gelap' : 'terang'],
      ['koneksi', navigator.onLine ? 'online' : 'offline'],
      ['status', 'tamu. bukan target.'],
    ];
    rows.forEach(([k, v], i) => setTimeout(() => {
      if (!current) return;
      dl.append(el('dt', '', k), el('dd', 'ok', v));
    }, tick(i * 220)));
  }

  /* ---------- glitch mode ---------- */

  let glitch = null;
  let glitchTimer = 0;
  let typer = 0;

  function startGlitch() {
    if (glitch) return;
    closeShell();
    root.classList.add('fsociety');
    dispatchEvent(new Event('themechange')); // the ASCII field re-reads its colors

    const msg = el('div', 'egg-msg');
    msg.setAttribute('role', 'status');
    const hello = el('p', 'egg-hello');
    msg.append(hello, el('p', 'egg-sub', 'kamu nemu easter egg-nya.'), el('p', 'egg-sub', '[ esc untuk keluar ]'));
    msg.addEventListener('click', endGlitch);
    glitch = el('div', 'egg-glitch');
    glitch.append(msg);
    document.body.append(glitch);

    const text = 'Hello, friend.';
    let i = 0;
    if (reduce) hello.textContent = text;
    else typer = setInterval(() => {
      hello.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typer);
    }, 90);
    glitchTimer = setTimeout(endGlitch, 15000);
  }

  function endGlitch() {
    if (!glitch) return;
    clearTimeout(glitchTimer);
    clearInterval(typer);
    glitch.remove();
    glitch = null;
    root.classList.remove('fsociety');
    dispatchEvent(new Event('themechange'));
  }

  /* ---------- triggers ---------- */

  const KONAMI = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
  let typed = '';
  let pad = [];

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (current) closeShell(); else endGlitch(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;

    if (e.key === '`') { e.preventDefault(); if (current) closeShell(); else openTerminal(); return; }

    pad = pad.concat(e.key.length === 1 ? e.key.toLowerCase() : e.key).slice(-10);
    if (pad.join() === KONAMI) { pad = []; startGlitch(); return; }

    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-8);
    if (typed.endsWith('fsociety')) { typed = ''; startGlitch(); }
    else if (typed.endsWith('sudo')) { typed = ''; openTerminal('sudo'); }
  });

  // Five quick clicks on the logo open the profiler; the fifth does not scroll to the top.
  let taps = 0;
  let lastTap = 0;
  document.querySelector('.brand')?.addEventListener('click', (e) => {
    const now = Date.now();
    taps = now - lastTap > 2500 ? 1 : taps + 1;
    lastTap = now;
    if (taps < 5) return;
    taps = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
    openProfiler();
  });

  document.querySelector('.egg-hint')?.addEventListener('click', () => openTerminal('cat flag.txt'));
})();
