'use strict';
/* ================================================================
   premium-ui.js — Chauffeur Empire
   Hash-based tab routing. Loaded LAST.
   All sidebar/stats logic is in ui-sidebar.js.
   ================================================================ */

// ── Patch switchTab for hash routing ─────────────────────────────
(function() {
    const _origSwitch = window.switchTab;
    if (!_origSwitch) { console.warn('[premium-ui] switchTab not yet defined'); return; }
    window.switchTab = function(tab) {
        _origSwitch.apply(this, arguments);
        if (tab && typeof history !== 'undefined') {
            history.replaceState(null, '', '#' + tab);
        }
    };
})();

// ── Restore tab from URL hash on load ────────────────────────────
window.addEventListener('load', function() {
    const VALID_TABS = [
        'corse','fleet','staff','emails','finance','marketing','showroom',
        'shadow','provinces','ranking','career','market','hq','regions',
        'politics','invest','realestate','crypto','b2b','contracts',
        'tourism','infrastructure','store','legal','help','auctions',
        'nemesis','opa'
    ];
    const hash = (window.location.hash || '').replace('#','').trim();
    if (hash && VALID_TABS.includes(hash) && typeof window.switchTab === 'function') {
        window.switchTab(hash);
    }
});
