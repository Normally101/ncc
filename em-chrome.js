'use strict';
/* ================================================================
   em-chrome.js — Chauffeur Empire · FASE 2 (eRepublik-Modern)
   Telaio globale: highlight categoria attiva nella nav orizzontale.
   Caricato DOPO ui-sidebar.js (che patcha già switchTab per la
   vecchia sidebar nascosta). Qui aggiungiamo solo l'evidenziazione
   della categoria nella nuova #em-nav.
   ================================================================ */

(function () {
    function highlightCategory(tab) {
        const nav = document.getElementById('em-nav');
        if (!nav) return;
        nav.querySelectorAll('.emc-tab').forEach(t => t.classList.remove('active'));
        nav.querySelectorAll('.emc-menu a').forEach(a => a.classList.remove('active'));

        // Home è una tab diretta (senza menu)
        let cat = nav.querySelector(`.emc-tab[data-tab="${tab}"]`);
        if (!cat) {
            const link = nav.querySelector(`.emc-menu a[data-tab="${tab}"]`);
            if (link) {
                link.classList.add('active');
                cat = link.closest('.emc-tab');
            }
        }
        if (cat) cat.classList.add('active');
    }

    // Patch switchTab (sopra il patch di ui-sidebar.js)
    const _orig = window.switchTab;
    if (typeof _orig === 'function') {
        window.switchTab = function (tab) {
            _orig.apply(this, arguments);
            try { highlightCategory(tab); } catch (e) {}
        };
    }

    // ── Offset dinamico: main-panel parte SOTTO la chrome reale ──
    // Misura l'altezza EFFETTIVA di #em-chrome (topbar+nav, qualsiasi
    // font/wrapping) e ci posiziona sotto il #main-panel. Usa
    // setProperty(...,'important') per battere qualunque regola CSS.
    function syncChromeOffset() {
        const chrome = document.getElementById('em-chrome');
        const panel  = document.getElementById('main-panel');
        if (!chrome || !panel) return;
        const h = Math.ceil(chrome.getBoundingClientRect().height);
        if (h > 0) panel.style.setProperty('top', h + 'px', 'important');
    }

    function scheduleSync() {
        syncChromeOffset();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncChromeOffset);
        // ri-misura dopo il caricamento font (cambia l'altezza)
        [60, 200, 600, 1500].forEach(ms => setTimeout(syncChromeOffset, ms));
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(syncChromeOffset).catch(function(){});
        }
    }

    function initOffsetSync() {
        scheduleSync();
        window.addEventListener('resize', syncChromeOffset);
        const chrome = document.getElementById('em-chrome');
        if (chrome && typeof ResizeObserver === 'function') {
            try { new ResizeObserver(syncChromeOffset).observe(chrome); } catch (e) {}
        }
    }

    // Esegui SUBITO (defer ⇒ DOM pronto), senza attendere 'load'.
    try { highlightCategory('home'); } catch (e) {}
    try { initOffsetSync(); } catch (e) {}

    // E ancora su DOMContentLoaded / load per sicurezza.
    document.addEventListener('DOMContentLoaded', initOffsetSync);
    window.addEventListener('load', function () {
        try { highlightCategory('home'); } catch (e) {}
        scheduleSync();
    });
})();
