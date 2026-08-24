'use strict';
/* ============================================================================
   test-support/dc-catalog.js
   Catalogo prezzi Driver Coins mirror del listino SQL (66_server_priced_purchases.sql).
   Serve ai test per simulare rpc_purchase senza duplicare i numeri.
   ============================================================================ */

const LISTINO_DC = {
    executive_pass:       { unit: 150, min: 0 },
    fuel_boost:           { unit:   3, min: 0 },
    energy_boost:         { unit:   4, min: 0 },
    ops_bundle:           { unit:   9, min: 0 },
    full_bundle:          { unit:  35, min: 0 },
    skip_construction:    { unit:   8, min: 0 },
    construction_skip:    { unit:   8, min: 0 },
    wake_driver:          { unit:   3, min: 0 },
    insta_heal:           { unit:   2, min: 0 },
    wake_all_drivers:     { unit:   2, min: 3 },
    heal_all_drivers:     { unit:   2, min: 4 },
    academy_skip:         { unit:   5, min: 0 },
};

function costoServer(itemId, quantita) {
    const voce = LISTINO_DC[itemId];
    if (!voce) return null;
    const qty = Math.max(1, Math.floor(quantita || 1));
    return Math.max(voce.min, voce.unit * qty);
}

/**
 * Crea un mock di ServerState.purchaseItem per i test.
 * @param {Object} gs - gameState (per leggere driverCoins/cash)
 * @param {Array} calls - array in cui pushare le chiamate osservate
 * @returns {Function} async (currency, itemId, qty) => {ok, spent, balance}
 */
function createPurchaseItemMock(gs, calls) {
    return async function purchaseItem(currency, itemId, qty) {
        calls.push({ currency, itemId, qty });
        if (currency !== 'driver_coins') return null; // solo DC nei test qui
        const cost = costoServer(itemId, qty);
        if (cost === null) return null;
        if ((gs.driverCoins || 0) < cost) return null;
        gs.driverCoins = (gs.driverCoins || 0) - cost;
        return { ok: true, item_id: itemId, currency, spent: cost, balance: gs.driverCoins };
    };
}

/**
 * Versione che legge gameState da una closure (per compatibilità con vecchi test)
 * @deprecated usa createPurchaseItemMock(gs, calls) direttamente
 */
function createPurchaseItemMockFromEnv(env, calls) {
    return async function purchaseItem(currency, itemId, qty) {
        const gs = env.sandbox.gameState;
        calls.push({ currency, itemId, qty });
        if (currency !== 'driver_coins') return null;
        const cost = costoServer(itemId, qty);
        if (cost === null) return null;
        if ((gs.driverCoins || 0) < cost) return null;
        gs.driverCoins = (gs.driverCoins || 0) - cost;
        return { ok: true, item_id: itemId, currency, spent: cost, balance: gs.driverCoins };
    };
}

module.exports = { LISTINO_DC, costoServer, createPurchaseItemMock };