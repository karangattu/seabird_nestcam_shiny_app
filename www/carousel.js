(function(){
  // Smoothly center selected thumbnail
  function centerSelectedThumb() {
    const container = document.querySelector('.image-preview-grid-container');
    if (!container) return;
    const selected = container.querySelector('.selected-preview-image');
    if (!selected) return;
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function runCrossFade() {
    const viewer = document.getElementById('main-image-viewer');
    if (!viewer) return;
    const cur = viewer.querySelector('img.main-image-img[data-role="current"]');
    const prev = viewer.querySelector('img.main-image-img[data-role="prev"]');
    if (!cur) return;

    // Ensure starting states
    cur.style.opacity = '0';
    if (prev) prev.style.opacity = '1';

    // Trigger transition on next frame
    requestAnimationFrame(() => {
      // small delay helps after DOM mount
      setTimeout(() => {
        cur.style.opacity = '1';
        if (prev) prev.style.opacity = '0';
        // Cleanup previous node after transition ends
        if (prev) {
          const cleanup = () => {
            prev.removeEventListener('transitionend', cleanup);
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
          };
          prev.addEventListener('transitionend', cleanup, { once: true });
        }
      }, 10);
    });
  }

  function enhanceMainImageTransitions() {
    runCrossFade();
  }

  // Observe UI updates to re-run animations and center thumb
  const observer = new MutationObserver((mutations) => {
    let shouldRecentre = false;
    let shouldAnimate = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(n => {
          if (!(n instanceof HTMLElement)) return;
          if (n.id === 'main-image-viewer' || (n.querySelector && n.querySelector('#main-image-viewer'))) {
            shouldAnimate = true;
          }
          if (n.matches && (n.matches('.image-preview-grid-container') || (n.querySelector && n.querySelector('.image-preview-grid-container')))) {
            shouldRecentre = true;
          }
        });
      }
    }
    if (shouldAnimate) enhanceMainImageTransitions();
    if (shouldRecentre) centerSelectedThumb();
  });

  document.addEventListener('DOMContentLoaded', function(){
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial kicks
    centerSelectedThumb();
    enhanceMainImageTransitions();

    // Keyboard navigation hardening: use keydown on window and avoid inputs
    window.addEventListener('keydown', function(e){
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === 'ArrowLeft') {
        const btn = document.getElementById('prev_img');
        if (btn) { btn.click(); e.preventDefault(); }
      } else if (e.key === 'ArrowRight') {
        const btn = document.getElementById('next_img');
        if (btn) { btn.click(); e.preventDefault(); }
      } else if (['s','S','e','E','i','I'].includes(e.key)) {
        // Forward S/E/I to server reliably; let keyboard-nav handle DOM, but ensure server sees it
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          // include timestamp to ensure distinct events
          window.Shiny.setInputValue('kb_toggle', { key: e.key, t: Date.now() }, { priority: 'event' });
        }
        // Do not preventDefault here; keyboard-nav may also handle it
      }
    }, { passive: false });
  });
})();
