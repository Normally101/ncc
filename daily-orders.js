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
    // target(gs) → obiettivo scalato in base alla progressione del giocatore
    function _tier(gs) {
        const r = gs.questStats?.totalRides || 0;
        if (r < 10)  return 'new';    // < 10 corse totali: principiante assoluto
        if (r < 50)  return 'early';  // 10–49: early game
        if (r < 200) return 'mid';    // 50–199: mid game
        return 'late';                // 200+: late game
    }

    const DB = [
        { id: 'rides',    icon: '🚗', label: t => `Completa ${t} corse`,
          target: gs => ({ new:3, early:5, mid:10, late:15 }[_tier(gs)]),
          metric: gs => gs.questStats?.totalRides || 0,    rw: { dc: 2 } },

        { id: 'vip',      icon: '👑', label: t => `Completa ${t} corse VIP`,
          target: gs => ({ new:1, early:2, mid:3, late:5 }[_tier(gs)]),
          metric: gs => gs.questStats?.vipRides || 0,      rw: { dc: 3 } },

        { id: 'ultra',    icon: '💎', label: t => `Completa ${t} corsa Ultra`,
          target: gs => ({ new:1, early:1, mid:1, late:2 }[_tier(gs)]),
          metric: gs => gs.questStats?.ultraRides || 0,    rw: { dc: 4 },
          minTier: 'early' },  // non appare ai principianti (Ultra arriva tardi)

        { id: 'contract', icon: '📑', label: t => `Completa ${t} corse a contratto`,
          target: gs => ({ new:1, early:2, mid:2, late:4 }[_tier(gs)]),
          metric: gs => gs.questStats?.contractRides || 0, rw: { dc: 3 } },

        { id: 'airport',  icon: '✈️', label: t => `Completa ${t} transfer aeroporto`,
          target: gs => ({ new:1, early:2, mid:4, late:6 }[_tier(gs)]),
          metric: gs => gs.questStats?.fcoRides || 0,      rw: { dc: 2 } },

        { id: 'earn',     icon: '💰', label: t => `Guadagna €${(t/1000)|0}k oggi`,
          target: gs => ({ new:2000, early:10000, mid:40000, late:80000 }[_tier(gs)]),
          metric: gs => gs.todayEarnings || 0,             rw: gs => {
              const t = _tier(gs);
              return t === 'new' ? { cash: 500 } : t === 'early' ? { cash: 2000 } : t === 'mid' ? { cash: 8000 } : { dc: 5 };
          }},

        { id: 'earnbig',  icon: '🤑', label: t => `Guadagna €${(t/1000)|0}k oggi`,
          target: gs => ({ new:5000, early:25000, mid:120000, late:300000 }[_tier(gs)]),
          metric: gs => gs.todayEarnings || 0,             rw: { dc: 5 },
          minTier: 'early' },

        { id: 'port',     icon: '🛳️', label: t => `Completa ${t} corse porto`,
          target: gs => ({ new:1, early:2, mid:2, late:3 }[_tier(gs)]),
          metric: gs => gs.questStats?.portRides || 0,     rw: { dc: 2 } },
    ];

    // filtra task non disponibili per tier
    function _availableDB(gs) {
        const t = _tier(gs);
        const tierOrder = ['new','early','mid','late'];
        return DB.filter(o => {
            if (!o.minTier) return true;
            return tierOrder.indexOf(t) >= tierOrder.indexOf(o.minTier);
        });
    }

    function _today() { return (window.gameState && gameState.day) || 1; }

    // (ri)genera i 3 ordini del giorno + snapshot baseline
    function ensure() {
        const gs = window.gameState; if (!gs) return null;
        const d = _today();
        if (!gs.dailyOrders || gs.dailyOrders.day !== d) {
            const avail = _availableDB(gs);
            const picks = [];
            const used = new Set();
            for (let i = 0; i < 3; i++) {
                let idx = (d * 7 + i * 3) % avail.length;
                let guard = 0;
                while (used.has(idx) && guard++ < avail.length) idx = (idx + 1) % avail.length;
                used.add(idx);
                const tpl = avail[idx];
                picks.push({ id: tpl.id, base: tpl.metric(gs) });
            }
            gs.dailyOrders = { day: d, picks, claimed: [] };
        }
        return gs.dailyOrders;
    }

    function tpl(id) { return DB.find(o => o.id === id); }

    function getTarget(o, gs) {
        return typeof o.target === 'function' ? o.target(gs) : o.target;
    }

    function getRw(o, gs) {
        return typeof o.rw === 'function' ? o.rw(gs) : (o.rw || {});
    }

    function progressOf(pick) {
        const gs = window.gameState;
        const o = tpl(pick.id); if (!o) return { prog: 0, target: 1, done: false };
        const cur  = o.metric(gs);
        const prog = Math.max(0, cur - (pick.base || 0));
        const tgt  = getTarget(o, gs);
        return { prog, target: tgt, done: prog >= tgt };
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
        const o = tpl(id);
        const gs = window.gameState;
        const rw = getRw(o, gs);
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
            const gs = window.gameState;
            const { prog, target, done } = progressOf(pick);
            const claimed = st.claimed.includes(pick.id);
            const pct = Math.min(100, Math.round(prog / target * 100));
            const rw  = getRw(o, gs);
            const cta = claimed
                ? `<span class="em-pill em-pill--green" style="flex-shrink:0">✓ Ritirato</span>`
                : done
                    ? `<button class="em-goldbtn" style="flex-shrink:0;padding:5px 12px" ${ceAct('claimDailyOrder', [pick.id])}>Ritira ${rwLabel(rw)}</button>`
                    : `<span style="flex-shrink:0;font-size:10px;font-weight:800;color:var(--em-gold)">${rwLabel(rw)}</span>`;
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 11px;border-top:1px solid var(--em-line2)">
                <div class="em-evi" style="background:${done?'#e7f6ee':'#eef1f5'};font-size:14px;line-height:1;flex-shrink:0">${o.icon}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:11.5px;color:var(--em-ink)">${o.label(getTarget(o, gs))}</div>
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
