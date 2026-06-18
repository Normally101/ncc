'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   objective-tracker.js — Chauffeur Empire · Tracker Obiettivi (diegetico)
   Backbone UX onboarding/missioni (pezzo 1):
   • Barra fissa, sempre visibile, che mostra UN solo "prossimo passo" concreto.
   • Click → naviga al tab pertinente. Rende interattivo ciò che prima era passivo.
   • Risolve i gap dell'audit: quest invisibili (solo pallino) + "lasciato solo
     dopo SVEGLIATI". È ADDITIVO: legge lo stato esistente (z2h + quests + gates),
     non tocca i 3 sistemi di onboarding (la loro unificazione è il pezzo 2).
   • Si nasconde: in survival (la UI manuale guida già), per i veterani (prestige>0),
     o quando non c'è nulla da fare.
   Carica DOPO engine/ui-sidebar/onboarding/quests. Espone window.renderObjectiveTracker.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    function gs()        { return window.gameState; }
    function rides()     { const g = gs(); return (g && g.questStats && g.questStats.totalRides) || 0; }
    function nDrivers()  { const g = gs(); return ((g && g.drivers) || []).filter(d => d.id !== 'ceo').length; }
    function nFleet()    { const g = gs(); return ((g && g.fleet) || []).length; }
    function prestige()  { const g = gs(); return (g && g.prestige) || 0; }

    // Gate di sblocco precoci (specchio leggero di onboarding.js GATES) per indicare
    // il prossimo traguardo una volta superato l'onboarding base.
    const EARLY_GATES = [
        { rides: 5,  label: 'Finanza',        tab: 'finance' },
        { rides: 8,  label: 'Mercato',        tab: 'market' },
        { rides: 12, label: 'Contratti B2B',  tab: 'b2b' },
        { rides: 15, label: 'Quartier Generale', tab: 'hq' },
        { rides: 18, label: 'Contratti',      tab: 'contracts' },
        { rides: 25, label: 'Infrastrutture', tab: 'infrastructure' },
        { rides: 30, label: 'Turismo',        tab: 'tourism' },
    ];

    function nextGate() {
        const r = rides();
        for (const g of EARLY_GATES) if (r < g.rides) return g;
        return null;
    }

    // Restituisce { icon, text, tab, glow } oppure null (→ nascondi la barra).
    function currentObjective() {
        const g = gs();
        if (!g) return null;                                   // pre-partita / login
        if (prestige() > 0) return null;                       // veterani: niente guida
        if (typeof window._z2hState === 'function' && window._z2hState() === 'survival') return null;

        // 1) Reward quest riscuotibile → priorità massima (prima era solo un pallino)
        if ((g.claimableQuests || []).length > 0)
            return { icon: '🏆', text: 'Ricompensa quest pronta — riscuotila', tab: 'career', glow: true };

        // 2) Catena onboarding "povero → ricco"
        if (nDrivers() < 1)
            return { icon: '👔', text: 'Assumi il Ragazzo di Quartiere (gratis): guida la tua auto e incassa mentre riposi', tab: 'staff' };
        if (nFleet() < 2)
            return { icon: '🚘', text: 'Espandi la flotta: compra un secondo veicolo', tab: 'showroom' };

        // 3) Prossimo sblocco di sistema
        const ng = nextGate();
        if (ng) return { icon: '🔓', text: `Prossimo sblocco: ${ng.label} a ${ng.rides} corse (ne hai ${rides()})`, tab: 'corse' };

        return null;
    }

    function injectStyle() {
        if (document.getElementById('obj-tracker-css')) return;
        const s = document.createElement('style');
        s.id = 'obj-tracker-css';
        s.textContent = `
#obj-tracker{
    position:fixed; left:50%; transform:translateX(-50%);
    bottom:14px; z-index:var(--z-sticky,1500);
    display:none; align-items:center; gap:10px;
    max-width:min(680px,calc(100vw - 24px));
    padding:8px 14px; border-radius:10px; cursor:pointer;
    background:linear-gradient(180deg,#0c0f18,#080b12);
    border:1px solid var(--gold-border,rgba(212,175,55,0.28));
    box-shadow:0 8px 28px rgba(0,0,0,0.55);
    font-size:12.5px; color:#e6edf3; user-select:none;
    animation:ot-in .35s ease both;
}
#obj-tracker:hover{ border-color:var(--gold,#d4af37); }
#obj-tracker .ot-ic{ font-size:16px; line-height:1; }
#obj-tracker .ot-label{ font-size:9px; font-weight:800; letter-spacing:1.5px; color:var(--gold,#d4af37); text-transform:uppercase; }
#obj-tracker .ot-text{ flex:1; min-width:0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#obj-tracker .ot-go{ font-weight:800; color:var(--gold,#d4af37); white-space:nowrap; }
#obj-tracker.ot-glow{ border-color:var(--gold,#d4af37); animation:ot-pulse 1.6s ease-in-out infinite; }
@keyframes ot-in{ from{opacity:0; transform:translate(-50%,10px);} to{opacity:1; transform:translate(-50%,0);} }
@keyframes ot-pulse{ 0%,100%{box-shadow:0 8px 28px rgba(0,0,0,0.55);} 50%{box-shadow:0 0 22px rgba(212,175,55,0.45);} }
body.theme-survival #obj-tracker{ display:none !important; }
@media (max-width:640px){ #obj-tracker{ font-size:11.5px; bottom:10px; } #obj-tracker .ot-text{ white-space:normal; } }
@media (prefers-reduced-motion: reduce){ #obj-tracker, #obj-tracker.ot-glow{ animation:none; } }`;
        document.head.appendChild(s);
    }

    function mount() {
        if (document.getElementById('obj-tracker')) return;
        injectStyle();
        const el = document.createElement('div');
        el.id = 'obj-tracker';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Prossimo obiettivo');
        document.body.appendChild(el);
    }

    window.renderObjectiveTracker = function () {
        mount();
        const el = document.getElementById('obj-tracker');
        if (!el) return;
        const o = currentObjective();
        if (!o) { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        el.classList.toggle('ot-glow', !!o.glow);
        el.innerHTML =
            `<span class="ot-ic">${o.icon}</span>` +
            `<span class="ot-label">Prossimo</span>` +
            `<span class="ot-text">${o.text}</span>` +
            `<span class="ot-go">Vai →</span>`;
        el.onclick = function () { if (typeof window.switchTab === 'function') window.switchTab(o.tab); };
    };

    // Aggancia updateUI così la barra si aggiorna ad ogni refresh della UI.
    function hook() {
        if (window.__objTrackerHooked) return;
        const orig = window.updateUI;
        if (typeof orig === 'function') {
            window.updateUI = function () {
                const r = orig.apply(this, arguments);
                try { window.renderObjectiveTracker(); } catch (e) {}
                return r;
            };
            window.__objTrackerHooked = true;
        }
    }

    window.addEventListener('load', function () {
        hook();
        try { window.renderObjectiveTracker(); } catch (e) {}
        // Fallback: ritenta l'aggancio (se updateUI è definito tardi) e tieni fresca la barra.
        setInterval(function () { hook(); try { window.renderObjectiveTracker(); } catch (e) {} }, 3000);
    });
})();
