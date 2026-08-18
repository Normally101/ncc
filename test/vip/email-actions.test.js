'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Le azioni sulle email VIP muovono cassa fuori dal completamento corsa. saveGame()
// scrive solo il blob del salvataggio: se non sincronizzano, `companies.cash` (quello
// che leggono le RPC) resta indietro ed è il debito #1 di docs/SYSTEMS.md.
describe('vip/email-actions — le azioni email VIP mandano il cash al server', () => {
    function envWithSync() {
        let synced = null;
        const env = freshEnv({
            serverState: { syncCash: async (cash) => { synced = cash; return { success: true, cash }; } },
        });
        return { ...env, synced: () => synced };
    }

    test('un incasso (saldo matrimonio) arriva al server, non solo nel salvataggio', () => {
        const { sandbox, synced } = envWithSync();
        const id = sandbox.gameState.nextId++;
        sandbox.gameState.emails.push({
            id, sender: 'White Lace', subject: 'Saldo', type: 'vip_wedding_payment', status: 'unread',
            vipEventData: { bonus: 2500 },
            expiresAt: sandbox.gameState.day * 24 + sandbox.gameState.hour + 8,
        });
        sandbox.gameState.cash = 10000;

        sandbox.vipWeddingPaymentCollect(id);

        assert.equal(sandbox.gameState.cash, 12500, 'il bonus deve entrare in cassa');
        assert.equal(synced(), 12500, 'e il nuovo saldo deve arrivare al server: altrimenti la prima RPC (P2P, alleanze, IPO) lavora su un cash vecchio');
    });

    test('anche una spesa (rerouting di Grigori) arriva al server', () => {
        const { sandbox, synced } = envWithSync();
        const id = sandbox.gameState.nextId++;
        sandbox.gameState.emails.push({
            id, sender: 'Grigori V.', subject: 'Rerouting', type: 'vip_grigori_event', status: 'unread',
            vipEventData: { cost: 500 },
            expiresAt: sandbox.gameState.day * 24 + sandbox.gameState.hour + 4,
        });
        sandbox.gameState.cash = 10000;

        sandbox.vipGrigoriEventAccept(id);

        assert.equal(sandbox.gameState.cash, 9500, 'il costo deve uscire dalla cassa');
        assert.equal(synced(), 9500, 'anche le uscite vanno sincronizzate, altrimenti il server crede che il giocatore abbia più soldi di quanti ne ha');
    });

    test("se i fondi non bastano non si tocca niente e non si sincronizza nulla", () => {
        const { sandbox, synced } = envWithSync();
        const id = sandbox.gameState.nextId++;
        sandbox.gameState.emails.push({
            id, sender: 'Grigori V.', subject: 'Rerouting', type: 'vip_grigori_event', status: 'unread',
            vipEventData: { cost: 500 },
            expiresAt: sandbox.gameState.day * 24 + sandbox.gameState.hour + 4,
        });
        sandbox.gameState.cash = 100;

        sandbox.vipGrigoriEventAccept(id);

        assert.equal(sandbox.gameState.cash, 100, 'senza fondi la cassa resta identica');
        assert.equal(synced(), null, 'e non deve partire nessuna sincronizzazione per un\'azione che non è avvenuta');
    });
});
