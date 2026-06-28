/* ============================================
   Mahjong Roguelike — Shared Immersion Layer
   Auto-injects ambient layers + scroll reveal
   No configuration needed — just link it.
   ============================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== 1. Inject ambient atmosphere layers =====
  if (!reduceMotion) {
    // Dust motes (drift upward like particles in lamplight)
    var ambient = document.createElement('div');
    ambient.className = 'mri-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    var moteCount = 18;
    for (var i = 0; i < moteCount; i++) {
      var mote = document.createElement('span');
      mote.className = 'mri-mote';
      mote.style.left = (Math.random() * 100) + '%';
      mote.style.animationDuration = (16 + Math.random() * 18) + 's';
      mote.style.animationDelay = (-Math.random() * 30) + 's';
      var size = 1.5 + Math.random() * 1.5;
      mote.style.width = size + 'px';
      mote.style.height = size + 'px';
      ambient.appendChild(mote);
    }
    document.body.appendChild(ambient);

    // Warm top glow (izakaya lamplight)
    var glow = document.createElement('div');
    glow.className = 'mri-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    // Paper texture overlay (washi grain)
    var texture = document.createElement('div');
    texture.className = 'mri-texture';
    texture.setAttribute('aria-hidden', 'true');
    document.body.appendChild(texture);

    // Vignette (focus to center)
    var vignette = document.createElement('div');
    vignette.className = 'mri-vignette';
    vignette.setAttribute('aria-hidden', 'true');
    document.body.appendChild(vignette);
  }

  // ===== 2. Auto-apply scroll reveal to common content patterns =====
  var revealSelectors = [
    '.section-inner',
    '.step-card',
    '.yaku-entry',
    '.game-card',
    '.faq-item',
    '.concept-card',
    '.page-hero > *',
    '.hero-content > *',
    '.bottom-cta',
    '.cta-box',
    '.seo-intro',
    '.faq-section',
    '.disambig'
  ].join(',');

  var revealTargets = document.querySelectorAll(revealSelectors);
  revealTargets.forEach(function (el) {
    el.classList.add('mri-reveal');
  });

  // ===== 3. Set up IntersectionObserver for scroll reveal =====
  if ('IntersectionObserver' in window && !reduceMotion) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          // Stagger reveal if multiple elements enter together
          var delay = 0;
          entry.target.classList.add('mri-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });
    revealTargets.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback: just reveal everything
    revealTargets.forEach(function (el) {
      el.classList.add('mri-visible');
    });
  }
})();
