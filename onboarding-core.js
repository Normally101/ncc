'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   onboarding-core.js — SORGENTE DI VERITÀ UNICA per lo stato di onboarding.
   Caricato PRIMA di onboarding.js / zero-to-hero.js / objective-tracker.js /
   vittorio.js: questi 4 sistemi delegano qui invece di ricalcolare ognuno
   rides/prestige/fase (prima erano 4 copie divergenti).

   Stato derivato da: gameState.questStats.totalRides + gameState.prestige.
   Soglie (INVARIATE rispetto alla logica storica sparsa — behavior-preserving):
     • prestige > 0           → veterano/NG+  → fase 'free', esente da tutto
     • rides < 10             → 'survival'    (Zero-to-Hero: fondo del barile)
     • 10 ≤ rides < 25        → 'restricted'  (nav ridotta: solo Corse + Staff)
     • rides ≥ 25             → 'free'
   Esporta: window.ceOnb { rides, prestige, veteran, phase, restricted, tabUnlock, GATES }
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    function _gs() { return window.gameState; }

    // tab → requisito di sblocco. ok se (corse ≥ rides) OPPURE (prestigio ≥ prestige).
    // Tutto ciò che NON è qui è sempre aperto. (Catalogo storico di onboarding.js.)
    const GATES = {
        finance:        { rides: 5 },
        market:         { rides: 8 },
        b2b:            { rides: 12 },
        regions:        { rides: 12 },
        hq:             { rides: 15 },
        invest:         { rides: 15, prestige: 1 },
        realestate:     { rides: 15, prestige: 1 },
        contracts:      { rides: 18 },
        infrastructure: { rides: 25 },
        tourism:        { rides: 30 },
        lifestyle:      { rides: 30 },
        auctions:       { rides: 30 },
        provinces:      { rides: 40, prestige: 3 },
        politics:       { rides: 40, prestige: 3 },
        crypto:         { rides: 45, prestige: 4 },
        shadow:         { rides: 60, prestige: 5 },
        nemesis:        { rides: 60, prestige: 5 },
        opa:            { rides: 80, prestige: 6 },
    };

    function rides()    { const g = _gs(); return (g && g.questStats && g.questStats.totalRides) || 0; }
    function prestige() { const g = _gs(); return (g && g.prestige) || 0; }
    function veteran()  { return prestige() > 0; }

    function phase() {
        if (veteran()) return 'free';
        const r = rides();
        if (r < 10) return 'survival';
        if (r < 25) return 'restricted';
        return 'free';
    }

    // Fase transitoria Staff (recruit ridotto, niente HR/Academy).
    function restricted() { return !veteran() && rides() < 25; }

    function tabUnlock(tab) {
        const g = GATES[tab];
        if (!g) return { ok: true };
        if (prestige() >= 1) return { ok: true };       // veterani/NG+ sbloccano sempre tutto
        const r = rides(), p = prestige();
        let ok = false;
        if (g.rides != null && r >= g.rides) ok = true;
        if (g.prestige != null && p >= g.prestige) ok = true;
        return { ok, rides: r, prestige: p, needRides: g.rides, needPrestige: g.prestige };
    }

    window.ceOnb = { rides, prestige, veteran, phase, restricted, tabUnlock, GATES };
})();
