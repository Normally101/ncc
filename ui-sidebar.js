'use strict';
/* ================================================================
   ui-sidebar.js — Chauffeur Empire
   Accordion nav state machine + topbar stat updates.
   Loaded after dispatcher.js.
   ================================================================ */

// ── Tab → group mapping ──────────────────────────────────────────
const _SIDEBAR_GROUP = {
    corse:'operativo', fleet:'operativo', staff:'operativo',
    hq:'operativo', showroom:'operativo', emails:'operativo',
    b2b:'business', contracts:'business', tourism:'business',
    infrastructure:'business', store:'business', auctions:'business', market:'business',
    finance:'finanza', realestate:'finanza', crypto:'finanza', invest:'finanza', marketing:'finanza',
    provinces:'potere', regions:'potere', politics:'potere',
    shadow:'potere', nemesis:'potere', opa:'potere',
    ranking:'info', career:'info', legal:'info', help:'info',
};

// ── Accordion open/close ─────────────────────────────────────────
window._sidebarToggle = function(group) {
    const groups = document.querySelectorAll('#sidebar-nav .sidebar-group');
    groups.forEach(g => {
        const isTarget = g.dataset.group === group;
        const body = g.querySelector('.sidebar-group-body');
        const head = g.querySelector('.sidebar-group-head');
        if (!body || !head) return;
        if (isTarget) {
            const isOpen = head.classList.contains('open');
            if (isOpen) {
                head.classList.remove('open');
                body.style.maxHeight = '0';
            } else {
                head.classList.add('open');
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        } else {
            head.classList.remove('open');
            body.style.maxHeight = '0';
        }
    });
};

// Open group that contains a tab, highlight that item ─────────────
window._sidebarActivateTab = function(tab) {
    const group = _SIDEBAR_GROUP[tab];
    if (group) window._sidebarToggle(group);
    // Update active highlight
    document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    // Update breadcrumb
    const crumb = document.getElementById('tb-breadcrumb');
    if (crumb) {
        const item = document.querySelector(`.sidebar-item[data-tab="${tab}"]`);
        crumb.textContent = item ? item.textContent.replace(/[!]/g,'').trim() : tab;
    }
};

// ── Patch switchTab to activate sidebar ──────────────────────────
(function() {
    const _orig = window.switchTab;
    if (!_orig) return;
    window.switchTab = function(tab) {
        _orig.apply(this, arguments);
        window._sidebarActivateTab(tab);
    };
})();

// ── updateSidebarStats: avatar + company name ────────────────────
window.updateSidebarStats = function() {
    if (typeof gameState === 'undefined') return;
    const gs = gameState;
    const name     = gs.companyName || 'CE';
    const initials = name.replace(/[^A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\xFF0-9]/g,'').slice(0,2).toUpperCase() || 'CE';
    const av = document.getElementById('sidebar-avatar');
    if (av) av.textContent = initials;
    const sc = document.getElementById('sidebar-company');
    if (sc) sc.textContent = name;
};

// ── Patch updateUI to also call updateSidebarStats ───────────────
(function() {
    const _orig = window.updateUI;
    window.updateUI = function() {
        if (_orig) _orig.apply(this, arguments);
        window.updateSidebarStats();
    };
})();

// ── Mobile toggle ─────────────────────────────────────────────────
window.toggleSidebar = function(open) {
    const sidebar   = document.getElementById('sidebar-player');
    const closeBtn  = document.getElementById('sidebar-close-btn');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (!sidebar) return;
    if (open) {
        sidebar.style.transform = 'translateX(0)';
        sidebar.style.boxShadow = '4px 0 24px rgba(0,0,0,0.5)';
        if (closeBtn)  closeBtn.classList.remove('hidden');
        if (toggleBtn) toggleBtn.classList.add('hidden');
    } else {
        sidebar.style.transform = 'translateX(-160px)';
        sidebar.style.boxShadow = '';
        if (closeBtn)  closeBtn.classList.add('hidden');
        if (toggleBtn) toggleBtn.classList.remove('hidden');
    }
};

// ── Init: open group for current tab + initial stats ─────────────
window.addEventListener('load', function() {
    window.updateSidebarStats();
    // Open the operativo group by default
    const opGrp = document.querySelector('#sidebar-nav .sidebar-group[data-group="operativo"] .sidebar-group-head');
    const opBody = document.querySelector('#sidebar-nav .sidebar-group[data-group="operativo"] .sidebar-group-body');
    if (opGrp && opBody) {
        opGrp.classList.add('open');
        opBody.style.maxHeight = opBody.scrollHeight + 'px';
    }
});
