'use strict';
/* ================================================================
   engine-holding.js — Chauffeur Empire
   Holding finanziaria, sussidiarie, azioni $CEMP, IPO aziendale.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, updateUI)
   ================================================================ */

// ── SUSSIDIARIE DISPONIBILI ───────────────────────────────────────
const HOLDING_SUBSIDIARIES = [
    { id:'sub_fleet',  name:'FleetPro Italia',           cost:150000, dailyIncome:800,  fuelFree:false, desc:'Agenzia NCC Milano/Torino — 8 veicoli. Dividendi automatici.' },
    { id:'sub_hotel',  name:'Grand Palace Hotel ★★★★★',  cost:250000, dailyIncome:1500, fuelFree:false, desc:'Hotel di lusso a Roma. 3 corse VIP garantite/g + dividendi.' },
    { id:'sub_fuel',   name:'Rete Distributori ENI',     cost:180000, dailyIncome:1200, fuelFree:true,  desc:'5 distributori stradali. Carburante gratis + dividendi €1.200/g.' },
    { id:'sub_park',   name:'Park & Fly Fiumicino',      cost:120000, dailyIncome:600,  fuelFree:false, desc:'Parcheggio aeroportuale FCO. Clienti Meet & Greet automatici.' },
    { id:'sub_tech',   name:'DriveAI S.r.l.',            cost:300000, dailyIncome:2000, fuelFree:false, desc:'Startup AI per ottimizzazione flotta. I dividendi crescono con la tua rep.' },
];
window.HOLDING_SUBSIDIARIES = HOLDING_SUBSIDIARIES;

// ── INCORPORA HOLDING ─────────────────────────────────────────────
window.incorporateHolding = function() {
    const cost = 200000;
    const repReq = 4.0;
    if ((gameState.reputation || 0) < repReq) {
        showNotification(`Reputazione insufficiente — serve ${repReq}★ per fondare una Holding.`, 'error'); return;
    }
    if (gameState.holding?.incorporated) { showNotification('Holding già incorporata.', 'info'); return; }
    if (!window.CE_money.spend(cost, 'incorporate_holding')) return;
    gameState.holding = { incorporated: true, incorporationDay: gameState.day, subsidiaries: [] };
    logToMap('🏢 Holding Finanziaria fondata! Ora puoi acquisire aziende subsidiarie.');
    showBigEvent('🏢', 'Holding Finanziaria Fondata!', 'La tua holding è operativa. Acquisisci aziende subsidiarie per generare reddito passivo ogni giorno.');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── ACQUISISCI SUSSIDIARIA ────────────────────────────────────────
window.acquireSubsidiary = function(subId) {
    if (!gameState.holding?.incorporated) { showNotification('Devi prima fondare una Holding.', 'error'); return; }
    const sub = HOLDING_SUBSIDIARIES.find(s => s.id === subId);
    if (!sub) return;
    if ((gameState.holding.subsidiaries || []).includes(subId)) { showNotification('Sussidiaria già acquisita.', 'info'); return; }
    if (!window.CE_money.spend(sub.cost, 'acquire_subsidiary')) return;
    if (!gameState.holding.subsidiaries) gameState.holding.subsidiaries = [];
    gameState.holding.subsidiaries.push(subId);
    logToMap(`🏢 Acquisita: ${sub.name} — +€${sub.dailyIncome.toLocaleString()}/g dividendi`);
    showBigEvent('🏢', `Acquisita: ${sub.name}`, `La tua holding incassa +€${sub.dailyIncome.toLocaleString()} ogni giorno da questa sussidiaria.`);
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── CEDI SUSSIDIARIA ──────────────────────────────────────────────
window.divestSubsidiary = function(subId) {
    const sub = HOLDING_SUBSIDIARIES.find(s => s.id === subId);
    if (!sub) return;
    const idx = (gameState.holding?.subsidiaries || []).indexOf(subId);
    if (idx === -1) return;
    const resale = Math.floor(sub.cost * 0.60);
    gameState.holding.subsidiaries.splice(idx, 1);
    window.CE_money.earn(resale, 'divest_subsidiary');
    logToMap(`💸 Ceduta: ${sub.name} — +€${resale.toLocaleString()} (60% del costo)`);
    showNotification(`${sub.name} ceduta. +€${resale.toLocaleString()}`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── AZIONI $CEMP ──────────────────────────────────────────────────
window.buyCempShares = function(qty) {
    qty = Math.max(1, Math.round(Number(qty) || 0));
    const price = gameState.cempPrice || 10;
    const cost  = Math.round(price * qty);
    if (!window.CE_money.spend(cost, 'buy_cemp_shares')) return;
    gameState.cempOwnedShares = (gameState.cempOwnedShares || 0) + qty;
    logToMap(`📈 Acquistate ${qty} azioni $CEMP a €${price.toFixed(2)} — Tot. ${gameState.cempOwnedShares} azioni`);
    showNotification(`✅ ${qty} azioni $CEMP acquistate a €${price.toFixed(2)}.`, 'success');
    saveGame();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

window.sellCempShares = function(qty) {
    qty = Math.max(1, Math.round(Number(qty) || 0));
    if ((gameState.cempOwnedShares || 0) < qty) { showNotification('Azioni insufficienti.', 'error'); return; }
    const price   = gameState.cempPrice || 10;
    const revenue = Math.round(price * qty);
    gameState.cempOwnedShares -= qty;
    window.CE_money.earn(revenue, 'sell_cemp_shares');
    logToMap(`📉 Vendute ${qty} azioni $CEMP a €${price.toFixed(2)} — +€${revenue.toLocaleString()}`);
    showNotification(`📉 ${qty} azioni $CEMP vendute. +€${revenue.toLocaleString()}`, 'success');
    saveGame();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

// ── IPO AZIENDALE (NPC fallback) ──────────────────────────────────
// La versione reale P2P è in p2p_market.js e sovrascrive questa.
window._listCompanyIPO_NPC = function() {
    const cost = 50000;
    const repReq = 3.5;
    if (gameState.companyIPO?.listed) { showNotification('Azienda già quotata in borsa.', 'info'); return; }
    if ((gameState.reputation || 0) < repReq) {
        showNotification(`Reputazione insufficiente — serve ${repReq}★ per la quotazione.`, 'error'); return;
    }
    if (!window.CE_money.spend(cost, 'list_company_ipo_fee')) return;
    if (!gameState.companyIPO) gameState.companyIPO = {};
    gameState.companyIPO = {
        listed: true,
        listedDay: gameState.day,
        sharesTotal: 1000,
        sharePrice: Math.max(10, Math.round(gameState.cash / 1000)),
        npcSharesOwned: 300,
        dividendsPaid: 0,
    };
    const npcBuy = Math.round(gameState.companyIPO.sharePrice * gameState.companyIPO.npcSharesOwned);
    window.CE_money.earn(npcBuy, 'list_company_ipo_npc_buy');
    logToMap(`📈 ${gameState.companyName} quotata in borsa! 1.000 azioni a €${gameState.companyIPO.sharePrice} — incassati €${npcBuy.toLocaleString()} dagli investitori NPC.`);
    showBigEvent('📈', `${gameState.companyName} è in Borsa!`, `La tua azienda è ora quotata. Ogni giorno il 10% dei profitti viene distribuito agli azionisti. Gli investitori NPC hanno comprato 300 azioni per €${npcBuy.toLocaleString()}.`);
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

// ── DIVIDENDI HOLDING / IPO (rpc_daily_dividends) ─────────────────
window.claimHoldingDividends = async function() {
    if (!window.supabaseClient?.rpc) return { success: false, reason: 'no_client' };
    try {
        const { data, error } = await window.supabaseClient.rpc('rpc_daily_dividends');
        if (error) {
            if (typeof showNotification === 'function') {
                showNotification(error.message || 'Errore dividendi', 'error');
            }
            return { success: false, error };
        }
        if (!data) return { success: false, reason: 'empty_response' };

        // Se il server risponde "già pagato", non accredita niente
        if (data.status === 'already_paid' || data.message === 'già pagato' || data.reason === 'already_paid') {
            if (typeof showNotification === 'function') {
                showNotification('Dividendi di oggi già pagati.', 'info');
            }
            return data;
        }

        if (data.total_paid > 0 || data.credited_count > 0) {
            if (typeof showNotification === 'function') {
                showNotification(`Dividendi accreditati: €${(data.total_paid || 0).toLocaleString()}`, 'success');
            }
        }
        return data;
    } catch(e) {
        if (typeof showNotification === 'function') {
            showNotification(e.message || 'Errore dividendi', 'error');
        }
        return { success: false, error: e };
    }
};
window.claimDailyDividends = window.claimHoldingDividends;
