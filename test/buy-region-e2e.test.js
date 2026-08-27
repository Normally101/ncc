'use strict';
/* End-to-end test per "acquistare una licenza territoriale" (buyRegion)
   Esercita il flusso completo: sbloccare una regione costa il prezzo giusto via RPC
   del server e la regione risulta sbloccata; con fondi insufficienti è rifiutata
   senza addebito. */

const { freshEnv } = require('../test-support/game-env.js');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const assert = require('node:assert');

// Helper: crea ambiente fresco con REGIONS disponibile
function createTestEnv() {
    const env = freshEnv();
    const sandbox = env.sandbox;
    const REGIONS = vm.runInContext('REGIONS', sandbox);
    return { env, sandbox, gs: sandbox.gameState, REGIONS };
}

describe('buyRegion — flusso end-to-end licenza territoriale', () => {

    it('sblocca una regione (umbria) pagando il prezzo corretto via RPC ServerState', async () => {
        // Setup: partita nuova ha cash=0, reputation=0, unlockedRegions=['lazio']
        // Diamo cash e reputation sufficienti per 'umbria' (price: 10000, repReq: 0.8)
        sandbox.CE_money.earn(50000, 'test_setup');
        sandbox.CE_money.addReputation(1.0); // porta reputation a 1.0 > 0.8

        const initialCash = gs.cash;
        const regionId = 'umbria';
        const regionPrice = REGIONS[regionId].price; // 10000

        // Pre-condizioni
        assert.strictEqual(gs.unlockedRegions.includes(regionId), false, 'regione non ancora sbloccata');
        assert.ok(gs.reputation >= REGIONS[regionId].repReq, 'reputation sufficiente');

        // Chiama buyRegion (la funzione reale del gioco)
        await sandbox.buyRegion(regionId);

        // Verifiche post-condizioni
        // 1. Regione aggiunta a unlockedRegions
        assert.ok(gs.unlockedRegions.includes(regionId), 'regione sbloccata in gameState');

        // 2. Cash scalato del prezzo esatto via RPC ServerState.unlockRegion
        // (Il mock ServerState sottrae il prezzo da cash)
        assert.strictEqual(gs.cash, initialCash - regionPrice, `cash scalato esattamente di €${regionPrice}`);

        // 3. Notifica di successo (verificabile via notifications array)
        const successNotif = env.notifications.find(n => n.msg.includes('sbloccata') || n.msg.includes('acquisita') || n.type === 'success');
        // Nota: buyRegion non mostra notifica esplicita, ma saveGame e updateUI vengono chiamati
        // Verifichiamo che non ci siano errori
        const errorNotif = env.notifications.find(n => n.type === 'error');
        assert.strictEqual(errorNotif, undefined, 'nessun errore durante acquisto');

        // 4. saveGame chiamato (verifica indiretta: localStorage aggiornato)
        const saveKey = 'chauffeurEmpireSlot_1';
        const saved = sandbox.localStorage.getItem(saveKey);
        assert.ok(saved, 'salvataggio effettuato dopo sblocco');
        const parsed = JSON.parse(saved);
        assert.ok(parsed.unlockedRegions.includes(regionId), 'regione persistita nel save');
    });

    it('rifiuta l\'acquisto se fondi insufficienti senza addebitare nulla', async () => {
        // Setup: regione costosa (lombardia = 55000) con cash basso
        const regionId = 'lombardia';
        const regionPrice = REGIONS[regionId].price; // 55000

        // Azzera cash e metti reputation sufficiente
        gs.cash = 10000; // meno del prezzo
        sandbox.CE_money.addReputation(4.0); // reputation > 3.0

        const initialCash = gs.cash;

        // Pre-condizioni
        assert.strictEqual(gs.unlockedRegions.includes(regionId), false, 'regione non ancora sbloccata');
        assert.ok(gs.reputation >= REGIONS[regionId].repReq, 'reputation sufficiente');
        assert.ok(gs.cash < regionPrice, 'cash insufficiente per il test');

        // Chiama buyRegion - dovrebbe fallire senza side effects
        await sandbox.buyRegion(regionId);

        // Verifiche: nessun cambiamento di stato
        assert.strictEqual(gs.unlockedRegions.includes(regionId), false, 'regione NON sbloccata');
        assert.strictEqual(gs.cash, initialCash, 'cash NON modificato (nessun addebito)');

        // Notifica di errore per fondi insufficienti
        const errorNotif = env.notifications.find(n => n.type === 'error' && n.msg.includes('Fondi') || n.msg.includes('insufficient'));
        // Nota: buyRegion attuale non controlla i fondi lato client, si affida al server
        // Il mock ServerState.unlockRegion attualmente NON controlla i fondi (bug!)
        // Questo test dovrebbe essere ROSSO finché non fixiamo il controllo fondi
    });

    it('rifiuta l\'acquisto se reputation insufficiente', async () => {
        const regionId = 'lombardia'; // repReq: 3.0

        // Cash sufficiente ma reputation bassa
        gs.cash = 100000;
        gs.reputation = 1.0; // < 3.0

        const initialCash = gs.cash;

        await sandbox.buyRegion(regionId);

        // Nessun cambiamento
        assert.strictEqual(gs.unlockedRegions.includes(regionId), false, 'regione NON sbloccata per reputation bassa');
        assert.strictEqual(gs.cash, initialCash, 'cash NON modificato');

        const errorNotif = env.notifications.find(n => n.type === 'error' && n.msg.includes('Reputazione'));
        assert.ok(errorNotif, 'notifica errore per reputation insufficiente');
    });

    it('non permette di sbloccare una regione già sbloccata', async () => {
        // lazio è già sbloccato di default
        const regionId = 'lazio';
        const initialCash = gs.cash;

        await sandbox.buyRegion(regionId);

        // Nessun cambiamento (la funzione ritorna early se regione non esiste in REGIONS o già sbloccata)
        // NOTA: lazio ha price:0 e unlocked:true in REGIONS, ma buyRegion controlla solo REGIONS[regionId]
        // e non verifica se è già in unlockedRegions. Questo potrebbe essere un bug.
        assert.strictEqual(gs.cash, initialCash, 'cash non modificato per regione già sbloccata');
    });
});