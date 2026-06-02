'use strict';
/* ════════════════════════════════════════════════════════════════════
   onboarding.js — Sblocco progressivo (soft-lock) + checklist Primi Passi
   • Le sezioni avanzate restano in nav, ma se non sbloccate switchTab
     mostra una schermata "sblocca" col progresso (mai un blank/lock-out).
   • Le soglie MORDONO SOLO i principianti: chi ha già corse/prestigio
     passa tutti i gate (basta soddisfare UNA delle condizioni).
   Esporta: window._tabUnlock(tab), window.renderTabLockHTML(tab),
            window.renderOnboardingHTML()
   ════════════════════════════════════════════════════════════════════ */
(function () {
    // tab → requisito. ok se (corse >= rides) OPPURE (prestigio >= prestige).
    // Tutto ciò che NON è qui è sempre aperto (home, corse, fleet, staff,
    // emails, ranking, consorzi, store, help, career, showroom, marketing…).
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

    function _rides() { const gs = window.gameState; return (gs && gs.questStats && gs.questStats.totalRides) || 0; }
    function _prestige() { const gs = window.gameState; return (gs && gs.prestige) || 0; }

    window._tabUnlock = function (tab) {
        const g = GATES[tab];
        if (!g) return { ok: true };
        if (_prestige() >= 1) return { ok: true };   // veterani/NG+ sbloccano sempre tutto
        const rides = _rides(), prestige = _prestige();
        let ok = false;
        if (g.rides != null && rides >= g.rides) ok = true;
        if (g.prestige != null && prestige >= g.prestige) ok = true;
        return { ok, rides, prestige, needRides: g.rides, needPrestige: g.prestige };
    };

    window.renderTabLockHTML = function (tab) {
        const u = window._tabUnlock(tab);
        const reqs = [];
        if (u.needRides != null) reqs.push(`${Math.min(u.rides, u.needRides)}/${u.needRides} corse`);
        if (u.needPrestige != null) reqs.push(`oppure ${u.needPrestige}★ prestigio`);
        const pct = u.needRides ? Math.min(100, Math.round(u.rides / u.needRides * 100)) : 0;
        return `<div class="em em-page"><div class="em-wrap">
            <div class="em-card" style="max-width:520px;margin:48px auto;padding:30px;text-align:center">
                <div style="font-size:42px;margin-bottom:12px">🔒</div>
                <div style="font-size:17px;font-weight:800;color:var(--em-ink)">Sezione bloccata</div>
                <div style="font-size:11.5px;color:var(--em-muted);margin:7px 0 18px;line-height:1.5">
                    Sblocca completando <b style="color:var(--em-ink)">${reqs.join(' ')}</b>.<br>
                    Fai crescere l'impero con le corse: ogni sezione si apre man mano che sali.</div>
                ${u.needRides ? `<div class="em-prog" style="max-width:280px;margin:0 auto 14px;height:7px"><i style="width:${pct}%;background:var(--em-blue)"></i></div>` : ''}
                <button class="em-gbtn" onclick="switchTab('corse')">Vai a guadagnare →</button>
            </div>
        </div></div>`;
    };

    // ── Checklist "Primi Passi" (solo per i nuovi giocatori) ──────────
    window.renderOnboardingHTML = function () {
        const gs = window.gameState; if (!gs) return '';
        const rides   = _rides();
        const drivers = (gs.drivers || []).filter(d => d.id !== 'ceo').length;
        const fleet   = (gs.fleet || []).length;
        if (_prestige() > 0 || rides >= 12) return '';          // non mostrare ai veterani

        const steps = [
            { ok: rides >= 1,  ic: '🚕', t: 'Assegna la tua prima corsa',     cta: 'corse' },
            { ok: drivers >= 1, ic: '👔', t: 'Assumi il tuo primo autista',   cta: 'staff' },
            { ok: fleet >= 2,  ic: '🚘', t: 'Acquista un secondo veicolo',    cta: 'showroom' },
            { ok: rides >= 10, ic: '⭐', t: 'Completa 10 corse',              cta: 'corse' },
        ];
        const done = steps.filter(s => s.ok).length;
        if (done === steps.length) return '';

        const rows = steps.map(s => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 11px;border-top:1px solid var(--em-line2)">
                <div class="em-evi" style="background:${s.ok ? '#e7f6ee' : '#eef1f5'};font-size:14px;line-height:1">${s.ok ? '✅' : s.ic}</div>
                <div style="flex:1;font-weight:700;font-size:12px;color:${s.ok ? 'var(--em-dim)' : 'var(--em-ink)'};${s.ok ? 'text-decoration:line-through' : ''}">${s.t}</div>
                ${s.ok ? '<span class="em-pill em-pill--green">Fatto</span>' : `<button class="em-bbtn" style="padding:5px 11px" onclick="switchTab('${s.cta}')">Vai →</button>`}
            </div>`).join('');

        return `<div class="em-card" style="margin-bottom:7px;border-color:#cfe0f1;background:#f7fbff">
            <div class="em-ch"><span class="t">🎯 Primi Passi</span><span class="a" style="color:var(--em-blue)">${done}/${steps.length}</span></div>
            ${rows}
        </div>`;
    };
})();
