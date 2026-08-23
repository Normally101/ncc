'use strict';
/* ============================================================================
   test/store/executive-pack-payment.test.js

   Regressione per il bypass totale della cassa nell'Executive Club (report
   Vlad 23/08): il bottone "Acquista" dei pacchetti DC chiamava _dcSimPurchase,
   che accreditava i Driver Coins con CE_money.earnDC SENZA alcun pagamento:
   nessuna richiesta di conferma, nessuna RPC, solo minting dal nulla.

   Dopo la correzione i pacchetti passano SOLO dalla RPC dedicata
   server-authoritative (ServerState.purchaseDriverCoinPack -> rpc_purchase_dc_pack):
   - senza conferma del pagamento nessun coin viene accreditato;
   - il credito arriva una volta sola, allineato al saldo che dichiara il server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Finto ServerState fedele: quando la RPC di acquisto ha successo il SERVER ha
   gia' accreditato (companies.driver_coins aggiornato), quindi il mock muove
   gs().driverCoins lui stesso e restituisce il saldo vero — come farebbe il
   bridge Realtime dopo una RPC reale. */
function setupEnv(esitoRPC) {
    const chiamateRPC = [];
    const env = freshEnv({
        serverState: {
            purchaseDriverCoinPack: async (packId) => {
                chiamateRPC.push({ packId });
                if (!esitoRPC) return null; // server irraggiungibile / pagamento rifiutato
                const esito = esitoRPC(packId);
                if (esito && esito.ok && esito.driver_coins != null) {
                    env.sandbox.gameState.driverCoins = esito.driver_coins;
                }
                return esito;
            },
        },
    });
    return { sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateRPC };
}

describe('Executive Club — i pacchetti DC passano solo dal pagamento confermato', () => {

    test('click sul pacchetto Starter (€4,99): ZERO DC se il pagamento non e\' confermato', async () => {
        // La firma numerica e' quella che il bottone usava PRIMA della correzione
        // (ceAct('_dcSimPurchase', [p.dc])): deve aver smesso di coniare valuta.
        const { sandbox, gs, chiamateRPC } = setupEnv(null);
        gs.driverCoins = 0;
        sandbox._dcSimPurchase(50);
        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 0, 'nessun DC senza conferma pagamento');
        assert.equal(chiamateRPC.length, 0, 'un importo grezzo non raggiunge la RPC di acquisto');
    });

    test('acquisto legittimo del Corporate Pack: i DC arrivono solo dopo la RPC confermata', async () => {
        const { sandbox, gs, chiamateRPC } = setupEnv((packId) => {
            assert.equal(packId, 'corporate');
            return { ok: true, driver_coins: 220 }; // il server ha gia' accreditato
        });
        gs.driverCoins = 0;
        sandbox._dcSimPurchase('corporate');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1, 'esattamente una chiamata alla RPC dedicata');
        assert.equal(gs.driverCoins, 220, 'credito allineato al saldo dichiarato dal server');
    });

    test('la RPC rifiuta il pagamento: nessun accredito, nessuna eccezione', async () => {
        const { sandbox, gs } = setupEnv(() => ({ ok: false }));
        gs.driverCoins = 10;
        sandbox._dcSimPurchase('offshore');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 10, 'saldo intatto se il server rifiuta');
    });

    test('server irraggiungibile (RPC assente): nessun accredito', async () => {
        const env = freshEnv({});
        env.sandbox.gameState.driverCoins = 7;
        env.sandbox._dcSimPurchase('sovrano');
        await new Promise(r => setImmediate(r));
        assert.equal(env.sandbox.gameState.driverCoins, 7, 'saldo intatto senza porta di pagamento');
    });
});
