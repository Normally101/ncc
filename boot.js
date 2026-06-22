'use strict';
/* boot.js — codice di avvio esternalizzato da index.html (CSP-safe, no script inline).
   Caricato 'defer': gira dopo il parse del DOM e prima di DOMContentLoaded. */

    // onerror runs immediately (before deferred scripts) to catch load-time errors
    window.onerror = function(msg, src, line, col, err) {
      let banner = document.getElementById('_err_banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = '_err_banner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#ff0040;color:#fff;font:bold 11px monospace;padding:6px 12px;word-break:break-all;pointer-events:auto;cursor:pointer;';
        banner.title = 'Clicca per copiare';
        banner.onclick = () => { navigator.clipboard?.writeText(banner.textContent); banner.style.background='#005500'; };
        document.body.appendChild(banner);
      }
      const file = (src || '').split('/').pop();
      banner.textContent = `JS ERROR ${file} L${line}: ${msg}`;
      return false;
    };
    // DOMContentLoaded fires after all deferred scripts have executed
    document.addEventListener('DOMContentLoaded', function() {
      const track = document.getElementById('news-ticker-track');
      if (track && typeof WORLD_NEWS !== 'undefined') {
        const items = [...WORLD_NEWS, ...WORLD_NEWS, ...WORLD_NEWS];
        track.innerHTML = items.map(n => `<span>${n}</span>`).join('');
      }
      if (typeof window.switchTab === 'function') window.switchTab('corse');
    });

  /* ESC key: close overlays / modals, or return to main dispatch tab */
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;

    const mapOverlay = document.getElementById('map-overlay');
    if (mapOverlay && !mapOverlay.classList.contains('hidden')) {
      if (typeof window.closeMapOverlay === 'function') window.closeMapOverlay();
      return;
    }

    const hubModal = document.getElementById('hub-modal');
    if (hubModal && !hubModal.classList.contains('hidden')) {
      if (typeof window.closeHub === 'function') window.closeHub();
      return;
    }

    const dynModal = document.getElementById('modal-configurator');
    if (dynModal) { dynModal.remove(); return; }

    const activeItem = document.querySelector('.sidebar-item.active');
    if (activeItem && activeItem.getAttribute('data-tab') !== 'corse') {
      if (typeof window.switchTab === 'function') window.switchTab('corse');
    }
  });
