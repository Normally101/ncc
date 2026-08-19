'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   onboarding-core.js — SORGENTE DI VERITÀ UNICA per lo stato di onboarding.
   Caricato PRIMA di onboarding.js / zero-to-hero.js / objective-tracker.js /
   vittorio.js: questi 4 sistemi delegano qui invece di ricalcolare ognuno
   rides/prestige/fase (prima erano 4 copie divergenti).

   Stato derivato da: gameState.questStats.totalRides + gameState.prestige.
   Soglie pacing (17/08/2026, ~dimezzate rispetto all'originale — misurato dal
   vivo: 25 corse ≈ 9 ore reali con 1 autista, troppo lento a partire):
     • prestige > 0           → veterano/NG+  → fase 'free', esente da tutto
     • rides < 6              → 'survival'    (Zero-to-Hero: fondo del barile)
     • 6 ≤ rides < 15         → 'restricted'  (nav ridotta: solo Corse + Staff)
     • rides ≥ 15             → 'free'
   ⚠️ zero-to-hero.js (trigger evento capitalismo) e objective-tracker.js
   (EARLY_GATES, solo display) hanno soglie proprie che DEVONO restare
   allineate a queste — vedi commenti lì.
   Esporta: window.ceOnb { rides, prestige, veteran, phase, restricted, tabUnlock, GATES }
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    function _gs() { return window.gameState; }

    // tab → requisito di sblocco. ok se (corse ≥ rides) OPPURE (prestigio ≥ prestige).
    // Tutto ciò che NON è qui è sempre aperto. (Catalogo storico di onboarding.js.)
    // Soglie dimezzate 17/08/2026 (pacing) — proporzioni/ordine relativo invariati.
    const GATES = {
        finance:        { rides: 3 },
        market:         { rides: 5 },
        b2b:            { rides: 7 },
        regions:        { rides: 7 },
        hq:             { rides: 9 },
        invest:         { rides: 9,  prestige: 1 },
        realestate:     { rides: 9,  prestige: 1 },
        contracts:      { rides: 11 },
        infrastructure: { rides: 15 },
        tourism:        { rides: 18 },
        lifestyle:      { rides: 18 },
        auctions:       { rides: 18 },
        provinces:      { rides: 24, prestige: 3 },
        politics:       { rides: 24, prestige: 3 },
        crypto:         { rides: 27, prestige: 4 },
        shadow:         { rides: 36, prestige: 5 },
        nemesis:        { rides: 36, prestige: 5 },
        opa:            { rides: 48, prestige: 6 },
    };

    function rides()    { const g = _gs(); return (g && g.questStats && g.questStats.totalRides) || 0; }
    function prestige() { const g = _gs(); return (g && g.prestige) || 0; }
    function veteran()  { return prestige() > 0; }

    function phase() {
        if (veteran()) return 'free';
        const r = rides();
        if (r < 6) return 'survival';
        if (r < 15) return 'restricted';
        return 'free';
    }

    // Fase transitoria Staff (recruit ridotto, niente HR/Academy).
    function restricted() { return !veteran() && rides() < 15; }

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
