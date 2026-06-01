'use strict';
/* ════════════════════════════════════════════════════════════════════
   daily-orders.js — "Ordini del Giorno"
   3 obiettivi diretti che si resettano ogni giorno di gioco, con
   ricompense da RITIRARE (dopamina + motivo per rientrare domani).
   Usa i contatori già esistenti (questStats, todayEarnings).
   Esporta: window.renderDailyOrdersHTML(), window.claimDailyOrder(id)
   ════════════════════════════════════════════════════════════════════ */
(function () {
    // metric(gs) → valore corrente cumulativo (il progresso è cur - baseline)
    const DB = [
        { id: 'rides',     icon: '🚗', label: t => `Completa ${t} corse`,            target: 10, metric: gs => gs.questStats?.totalRides || 0,    rw: { dc: 2 } },
        { id: 'vip',       icon: '👑', label: t => `Completa ${t} corse VIP`,        target: 3,  metric: gs => gs.questStats?.vipRides || 0,      rw: { dc: 3 } },
        { id: 'ultra',     icon: '💎', label: t => `Completa ${t} corsa Ultra`,      target: 1,  metric: gs => gs.questStats?.ultraRides || 0,    rw: { dc: 4 } },
        { id: 'contract',  icon: '📑', label: t => `Completa ${t} corse a contratto`,target: 2,  metric: gs => gs.questStats?.contractRides || 0, rw: { dc: 3 } },
        { id: 'airport',   icon: '✈️', label: t => `Completa ${t} transfer aeroporto`,target: 4, metric: gs => gs.questStats?.fcoRides || 0,      rw: { dc: 2 } },
        { id: 'earn',      icon: '💰', label: t => `Guadagna €${(t/1000)|0}k oggi`,  target: 40000, metric: gs => gs.todayEarnings || 0,          rw: { cash: 8000 } },
        { id: 'earnbig',   icon: '🤑', label: t => `Guadagna €${(t/1000)|0}k oggi`,  target: 120000, metric: gs => gs.todayEarnings || 0,         rw: { dc: 5 } },
        { id: 'port',      icon: '🛳️', label: t => `Completa ${t} corse porto`,      target: 2,  metric: gs => gs.questStats?.portRides || 0,     rw: { dc: 2 } },
    ];

    function _today() { return (window.gameState && gameState.day) || 1; }

    // (ri)genera i 3 ordini del giorno + snapshot baseline
    function ensure() {
        const gs = window.gameState; if (!gs) return null;
        const d = _today();
        if (!gs.dailyOrders || gs.dailyOrders.day !== d) {
            // scelta deterministica per-giorno (tutti vedono lo stesso set quel giorno)
            const picks = [];
            const used = new Set();
            for (let i = 0; i < 3; i++) {
                let idx = (d * 7 + i * 3) % DB.length;
                let guard = 0;
                while (used.has(idx) && guard++ < DB.length) idx = (idx + 1) % DB.length;
                used.add(idx);
                const tpl = DB[idx];
                picks.push({ id: tpl.id, base: tpl.metric(gs) });
            }
            gs.dailyOrders = { day: d, picks, claimed: [] };
        }
        return gs.dailyOrders;
    }

    function tpl(id) { return DB.find(o => o.id === id); }

    function progressOf(pick) {
        const gs = window.gameState;
        const o = tpl(pick.id); if (!o) return { prog: 0, target: 1, done: false };
        const cur = o.metric(gs);
        const prog = Math.max(0, cur - (pick.base || 0));
        return { prog, target: o.target, done: prog >= o.target };
    }

    function rwLabel(rw) {
        if (rw.dc)   return `+${rw.dc} DC`;
        if (rw.cash) return `+€${rw.cash.toLocaleString('it-IT')}`;
        if (rw.rep)  return `+${rw.rep}★`;
        return '';
    }

    window.claimDailyOrder = function (id) {
        const st = ensure(); if (!st) return;
        const pick = st.picks.find(p => p.id === id); if (!pick) return;
        if (st.claimed.includes(id)) return;
        const { done } = progressOf(pick);
        if (!done) return;
        const o = tpl(id); const rw = o.rw || {};
        if (rw.dc)   gameState.driverCoins = (gameState.driverCoins || 0) + rw.dc;
        if (rw.cash) { typeof window._addCash === 'function' ? window._addCash(rw.cash) : (gameState.cash = (gameState.cash || 0) + rw.cash); }
        if (rw.rep)  gameState.reputation = Math.min(5, (gameState.reputation || 0) + rw.rep);
        st.claimed.push(id);
        if (typeof showNotification === 'function') showNotification(`Ordine completato! ${rwLabel(rw)}`, 'success');
        if (typeof window.spawnMoneyParticles === 'function' && rw.cash) { try { window.spawnMoneyParticles(window.innerWidth/2, 120, rw.cash); } catch (e) {} }
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();
        if (typeof window.renderTabHome === 'function') window.renderTabHome();
    };

    // HTML card per la home
    window.renderDailyOrdersHTML = function () {
        const st = ensure(); if (!st) return '';
        const doneCount = st.picks.filter(p => progressOf(p).done).length;
        const rows = st.picks.map(pick => {
            const o = tpl(pick.id); if (!o) return '';
            const { prog, target, done } = progressOf(pick);
            const claimed = st.claimed.includes(pick.id);
            const pct = Math.min(100, Math.round(prog / target * 100));
            const cta = claimed
                ? `<span class="em-pill em-pill--green" style="flex-shrink:0">✓ Ritirato</span>`
                : done
                    ? `<button class="em-goldbtn" style="flex-shrink:0;padding:5px 12px" onclick="window.claimDailyOrder('${pick.id}')">Ritira ${rwLabel(o.rw)}</button>`
                    : `<span style="flex-shrink:0;font-size:10px;font-weight:800;color:var(--em-gold)">${rwLabel(o.rw)}</span>`;
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 11px;border-top:1px solid var(--em-line2)">
                <div class="em-evi" style="background:${done?'#e7f6ee':'#eef1f5'};font-size:14px;line-height:1;flex-shrink:0">${o.icon}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:11.5px;color:var(--em-ink)">${o.label(target)}</div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                        <span class="em-prog" style="flex:1"><i style="width:${pct}%;background:${done?'var(--em-green)':'var(--em-blue)'}"></i></span>
                        <span style="font-size:9.5px;font-weight:700;color:var(--em-dim);flex-shrink:0">${Math.min(prog,target).toLocaleString('it-IT')}/${target.toLocaleString('it-IT')}</span>
                    </div>
                </div>
                ${cta}
            </div>`;
        }).join('');
        return `<div class="em-card" style="margin-bottom:7px">
            <div class="em-ch"><span class="t">⚡ Ordini del Giorno</span><span class="a">${doneCount}/3 completati</span></div>
            ${rows}
        </div>`;
    };
})();
