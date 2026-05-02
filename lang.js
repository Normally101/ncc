'use strict';
/* ================================================================
   lang.js — Chauffeur Empire · Localizzazione IT/EN v1.0
   Default: Italiano. Toggle via window.setLang('en') / setLang('it')
   ================================================================ */

const _LANG_KEY = 'chauffeurEmpireLang';

const i18n = {
    it: {
        // Header
        cash: 'Cassa',
        rep: 'Rep.',
        energy: 'Energia',
        // Nav tabs
        tab_map: 'Mappa',
        tab_staff: 'Staff',
        tab_fleet: 'Flotta',
        tab_invest: 'Asset',
        tab_marketing: 'Marketing',
        tab_finance: 'Finanza',
        tab_politics: 'Politica',
        // Save selector
        slot_empty: 'Nuovo Impero',
        slot_cash: 'Liquidità',
        slot_rep: 'Reputazione',
        slot_fleet: 'Flotta',
        slot_drivers: 'Autisti',
        slot_day: 'Giorno',
        btn_enter: 'Entra ↗',
        btn_delete: '🗑',
        btn_new_game: 'Fondazione Impero',
        company_name_label: 'Nome Azienda',
        company_logo_label: 'Logo Aziendale',
        company_color_label: 'Colore Brand',
        btn_back: '← Indietro',
        btn_found: 'Fonda Azienda →',
        // Sync bar
        sync_connect: '📁 Collega Cartella',
        sync_import: '📥 Importa',
        sync_export: '📤 Esporta',
        sync_info_off: 'Collega la cartella del gioco per abilitare il sync Git.',
        // Staff
        staff_office: 'Ufficio Centralizzato',
        staff_drivers: 'I Tuoi Autisti',
        staff_market: 'Mercato Reclutamento',
        btn_hire: 'Assumi',
        btn_fire: 'Licenzia',
        btn_rest: 'Riposo',
        label_fatigue: 'Fatica',
        label_xp: 'XP',
        label_morale: 'Morale',
        label_satisfaction: 'Soddi.',
        label_specialty: 'Spec.',
        // Fleet
        fleet_depot: 'Deposito Aziendale',
        fleet_cars: 'Tua Flotta',
        // Investments
        inv_portfolio: 'Portfolio Asset',
        inv_credit: 'Linea di Credito',
        inv_vc: 'Venture Capital & M&A',
        btn_enter_stake: '+5%',
        btn_sell_stake: 'Vendi (75%)',
        // Finance
        finance_title: '$WALL-ST · Finance',
        // Politics
        pol_title: 'Politica & Lobbying',
        btn_approve: 'Approva',
        // Notifications
        notif_funds: 'Fondi insufficienti!',
        notif_saved: '💾 Salvato',
        // Tutorial
        tut_skip: 'Salta',
        tut_next: 'Avanti →',
        tut_done: 'Fine!',
    },
    en: {
        // Header
        cash: 'Cash',
        rep: 'Rep.',
        energy: 'Energy',
        // Nav tabs
        tab_map: 'Map',
        tab_staff: 'Staff',
        tab_fleet: 'Fleet',
        tab_invest: 'Assets',
        tab_marketing: 'Marketing',
        tab_finance: 'Finance',
        tab_politics: 'Politics',
        // Save selector
        slot_empty: 'New Empire',
        slot_cash: 'Cash',
        slot_rep: 'Reputation',
        slot_fleet: 'Fleet',
        slot_drivers: 'Drivers',
        slot_day: 'Day',
        btn_enter: 'Enter ↗',
        btn_delete: '🗑',
        btn_new_game: 'Found Empire',
        company_name_label: 'Company Name',
        company_logo_label: 'Company Logo',
        company_color_label: 'Brand Color',
        btn_back: '← Back',
        btn_found: 'Found Company →',
        // Sync bar
        sync_connect: '📁 Link Folder',
        sync_import: '📥 Import',
        sync_export: '📤 Export',
        sync_info_off: 'Link the game folder to enable Git sync.',
        // Staff
        staff_office: 'Central Office',
        staff_drivers: 'Your Drivers',
        staff_market: 'Recruitment Market',
        btn_hire: 'Hire',
        btn_fire: 'Fire',
        btn_rest: 'Rest',
        label_fatigue: 'Fatigue',
        label_xp: 'XP',
        label_morale: 'Morale',
        label_satisfaction: 'Satisf.',
        label_specialty: 'Spec.',
        // Fleet
        fleet_depot: 'Company Depot',
        fleet_cars: 'Your Fleet',
        // Investments
        inv_portfolio: 'Asset Portfolio',
        inv_credit: 'Credit Line',
        inv_vc: 'Venture Capital & M&A',
        btn_enter_stake: '+5%',
        btn_sell_stake: 'Sell (75%)',
        // Finance
        finance_title: '$WALL-ST · Finance',
        // Politics
        pol_title: 'Politics & Lobbying',
        btn_approve: 'Approve',
        // Notifications
        notif_funds: 'Insufficient funds!',
        notif_saved: '💾 Saved',
        // Tutorial
        tut_skip: 'Skip',
        tut_next: 'Next →',
        tut_done: 'Done!',
    },
};

// Active language
let _currentLang = localStorage.getItem(_LANG_KEY) || 'it';

// Translate a key
window.t = function(key) {
    return (i18n[_currentLang] || i18n.it)[key] || (i18n.it[key] || key);
};

window.getLang = function() { return _currentLang; };

window.setLang = function(lang) {
    if (!i18n[lang]) return;
    _currentLang = lang;
    localStorage.setItem(_LANG_KEY, lang);
    _applyLangToDOM();
    // Re-render active tab
    if (typeof renderCurrentTab === 'function') renderCurrentTab();
};

function _applyLangToDOM() {
    // Update lang toggle button if present
    const btn = document.getElementById('lang-toggle-btn');
    if (btn) btn.textContent = _currentLang === 'it' ? '🇬🇧 EN' : '🇮🇹 IT';
    // Update nav tab labels
    const tabLabels = {
        'tab_map':       '[data-tab="map"] .tab-label',
        'tab_staff':     '[data-tab="staff"] .tab-label',
        'tab_fleet':     '[data-tab="fleet"] .tab-label',
        'tab_invest':    '[data-tab="invest"] .tab-label',
        'tab_marketing': '[data-tab="marketing"] .tab-label',
        'tab_finance':   '[data-tab="finance"] .tab-label',
        'tab_politics':  '[data-tab="politics"] .tab-label',
    };
    Object.entries(tabLabels).forEach(([key, selector]) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = window.t(key);
    });
}

// Init on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    _applyLangToDOM();
});

// Inject lang toggle button into header when game starts
window._injectLangToggle = function() {
    if (document.getElementById('lang-toggle-btn')) return;
    const header = document.getElementById('game-header') || document.querySelector('header');
    if (!header) return;
    const btn = document.createElement('button');
    btn.id = 'lang-toggle-btn';
    btn.textContent = _currentLang === 'it' ? '🇬🇧 EN' : '🇮🇹 IT';
    btn.style.cssText = 'font-size:0.6rem;padding:0.2rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:0.35rem;cursor:pointer;color:#9ca3af;white-space:nowrap;flex-shrink:0;';
    btn.onclick = () => window.setLang(_currentLang === 'it' ? 'en' : 'it');
    header.appendChild(btn);
};
