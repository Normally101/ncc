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
    // Gate di sblocco + stato → sorgente unica (onboarding-core.js).
    // Il catalogo GATES e la logica di sblocco vivono in window.ceOnb.
    function _rides()    { return window.ceOnb.rides(); }
    function _prestige() { return window.ceOnb.prestige(); }
    window._tabUnlock = function (tab) { return window.ceOnb.tabUnlock(tab); };

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
                <button class="em-gbtn" ${ceAct('switchTab', ['corse'])}>Vai a guadagnare →</button>
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
            <div style="display:flex;align-items:center;gap:10px;padding:7px 11px;border-top:1px solid #21262d">
                <div class="em-evi" style="background:${s.ok ? '#0d2217' : '#21262d'};font-size:14px;line-height:1">${s.ok ? '✅' : s.ic}</div>
                <div style="flex:1;font-weight:700;font-size:12px;color:${s.ok ? '#6b7280' : '#e6edf3'};${s.ok ? 'text-decoration:line-through' : ''}">${s.t}</div>
                ${s.ok ? '<span class="em-pill em-pill--green">Fatto</span>' : `<button class="em-bbtn" style="padding:5px 11px" ${ceAct('switchTab', [s.cta])}>Vai →</button>`}
            </div>`).join('');

        return `<div class="em-card" style="margin-bottom:7px;border-color:#21262d;background:#161b22">
            <div class="em-ch"><span class="t">🎯 Primi Passi</span><span class="a" style="color:#58a6ff">${done}/${steps.length}</span></div>
            ${rows}
        </div>`;
    };
})();
