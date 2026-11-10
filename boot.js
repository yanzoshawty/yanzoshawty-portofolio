// Runs before first paint: restore the saved theme, and hide intro elements only when motion is allowed.
// Kept as a file (not inline) so the Content-Security-Policy can stay script-src 'self'.
(function () {
  var d = document.documentElement;
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') d.dataset.theme = t; // anything else in storage is ignored
  } catch (e) { /* storage blocked: follow the system theme */ }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    d.classList.add('js-motion');
    setTimeout(function () { d.classList.remove('js-motion'); }, 3000); // failsafe if GSAP never loads
  }
})();
