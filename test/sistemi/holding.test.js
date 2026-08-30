'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/holding — la holding, le sussidiarie, le azioni proprie e altrui.

   Fase 3 di PIANO-CHIUSURA.md, sistema 3. È il sistema dove il denaro si muove
   di più per singolo clic — una sussidiaria costa fino a €300.000 — e dove
   convivono due economie diverse:

   · quella **locale**: fondare la holding, comprare e cedere sussidiarie,
     comprare e vendere azioni proprie ($CEMP). Passa tutta da `CE_money`, e il
     server la vede come sincronizzazione della cassa.
   · quella **condivisa**: quotarsi in borsa, comprare le azioni di un altro
     giocatore, entrare in una holding altrui. Passa da RPC, e il denaro si muove
     solo dopo la risposta del server.

   Il difetto che questo sistema può nascondere è sempre lo stesso: scalare il
   denaro prima di sapere se il server è d'accordo. Per questo ogni azione della
   seconda famiglia ha il suo test «se il server dice no, il giocatore non paga».
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/holding — l\'economia locale', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
        w.showBigEvent = () => {};
        w.renderTabInvestments = () => {};
        w.renderTabFinance = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.tipo === 'error').map(a => a.msg);
    const sussidiarie = () => R.catalogo(env, 'HOLDING_SUBSIDIARIES') || [];

    test('incorporateHolding fonda la holding e paga i 200.000', () => {
        gs().reputation = 5.0;
        const prima = gs().cash;

        w.incorporateHolding();

        assert.deepEqual(errori(), []);
        assert.equal(gs().holding.incorporated, true);
        assert.equal(gs().cash, prima - 200000);
        /* `.length` e non `deepEqual` con `[]`: gli array del gioco nascono dentro
           la macchina virtuale del banco, hanno il loro `Array.prototype`, e il
           confronto stretto li considera diversi da un array scritto qui — due
           elenchi vuoti che risultano diversi. */
        assert.equal(gs().holding.subsidiaries.length, 0, 'una holding appena fondata non possiede niente');
    });

    test('incorporateHolding rifiuta senza reputazione, e non fonda niente a metà', () => {
        gs().reputation = 1.0;
        const prima = gs().cash;

        w.incorporateHolding();

        assert.equal(gs().cash, prima, 'ha pagato per una holding che non ha fondato');
        assert.ok(!gs().holding || !gs().holding.incorporated);
        assert.ok(errori().some(m => /Reputazione/i.test(m)));
    });

    test('incorporateHolding due volte non paga due volte', () => {
        gs().reputation = 5.0;
        w.incorporateHolding();
        const dopoLaPrima = gs().cash;

        w.incorporateHolding();

        assert.equal(gs().cash, dopoLaPrima, 'la seconda fondazione ha pagato di nuovo');
    });

    test('acquireSubsidiary compra al prezzo di listino e la mette nell\'elenco', () => {
        R.conHolding(env, { conSussidiaria: false });
        const sub = sussidiarie()[0];
        const prima = gs().cash;

        w.acquireSubsidiary(sub.id);

        assert.deepEqual(errori(), []);
        assert.equal(gs().cash, prima - sub.cost);
        assert.ok(gs().holding.subsidiaries.includes(sub.id),
            'l\'elenco contiene ID, non oggetti: il controllo «già acquisita» si fa con includes');
    });

    test('acquireSubsidiary non compra due volte la stessa azienda', () => {
        R.conHolding(env, { conSussidiaria: false });
        const sub = sussidiarie()[0];
        w.acquireSubsidiary(sub.id);
        const dopoLaPrima = gs().cash;

        w.acquireSubsidiary(sub.id);

        assert.equal(gs().cash, dopoLaPrima);
        assert.equal(gs().holding.subsidiaries.filter(s => s === sub.id).length, 1);
    });

    test('acquireSubsidiary senza holding dice di no e non spende', () => {
        const sub = sussidiarie()[0];
        const prima = gs().cash;

        w.acquireSubsidiary(sub.id);

        assert.equal(gs().cash, prima);
        assert.ok(errori().some(m => /Holding/i.test(m)));
    });

    test('divestSubsidiary restituisce il 60% e toglie l\'azienda dall\'elenco', () => {
        R.conHolding(env);
        const posseduta = gs().holding.subsidiaries[0];
        const sub = sussidiarie().find(s => s.id === posseduta);
        const prima = gs().cash;

        w.divestSubsidiary(posseduta);

        assert.equal(gs().cash, prima + Math.floor(sub.cost * 0.60));
        assert.ok(!gs().holding.subsidiaries.includes(posseduta));
    });

    test('divestSubsidiary non vende quello che non possiedi', () => {
        R.conHolding(env, { conSussidiaria: false });
        const prima = gs().cash;

        w.divestSubsidiary(sussidiarie()[0].id);

        assert.equal(gs().cash, prima, 'ha incassato la vendita di un\'azienda che non aveva');
    });

    test('buyCempShares e sellCempShares muovono azioni e cassa nella stessa misura', () => {
        R.conHolding(env);
        gs().cempPrice = 12;
        const azioniPrima = gs().cempOwnedShares;
        const cassaPrima  = gs().cash;

        w.buyCempShares(100);
        assert.equal(gs().cempOwnedShares, azioniPrima + 100);
        assert.equal(gs().cash, cassaPrima - 1200);

        w.sellCempShares(100);
        assert.equal(gs().cempOwnedShares, azioniPrima);
        assert.equal(gs().cash, cassaPrima, 'comprare e rivendere allo stesso prezzo non deve creare né bruciare denaro');
    });

    test('sellCempShares non vende più azioni di quante ne hai', () => {
        R.conHolding(env);
        gs().cempOwnedShares = 10;
        const prima = gs().cash;

        w.sellCempShares(1000);

        assert.equal(gs().cash, prima, 'ha incassato la vendita di azioni inesistenti');
        assert.equal(gs().cempOwnedShares, 10);
    });
});

describe('sistemi/holding — l\'economia condivisa (passa dal server)', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        R.conHolding(env);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
        w.renderTabFinance = () => {};
        w.renderTabInvestments = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;
    const chiamata = (nome) => server.chiamate.find(c => c.nome === nome);

    test('buyCompanyShares paga solo dopo il sì del server', async () => {
        server.rispondiCon('rpc_buy_company_shares', () => ({ data: { ok: true, shares: 10 }, error: null }));
        const prima = gs().cash;

        await w.buyCompanyShares('quota-di-prova', 10);

        assert.ok(chiamata('rpc_buy_company_shares'), 'l\'acquisto non è arrivato al server');
        assert.ok(gs().cash < prima, 'il server ha detto sì e il giocatore non ha pagato');
    });

    test('buyCompanyShares non paga se il server rifiuta', async () => {
        server.rispondiCon('rpc_buy_company_shares', () => ({ data: null, error: { message: 'quote esaurite' } }));
        const prima = gs().cash;

        await w.buyCompanyShares('quota-di-prova', 10);

        assert.equal(gs().cash, prima);
    });

    test('buyCompanyShares rifiuta se le quote costano più di quanto hai', async () => {
        R.conSoldi(env, 100);
        await w.buyCompanyShares('quota-di-prova', 10);
        assert.equal(chiamata('rpc_buy_company_shares'), undefined,
            'ha chiesto al server un acquisto che non poteva pagare');
    });

    test('listCompanyIPO vuole reputazione e quota, e le controlla prima di chiamare il server', async () => {
        gs().reputation = 1.0;
        await w.listCompanyIPO();
        assert.equal(chiamata('rpc_list_company_shares'), undefined, 'si è quotata senza reputazione');

        gs().reputation = 5.0;
        R.conSoldi(env, 100);
        await w.listCompanyIPO();
        assert.equal(chiamata('rpc_list_company_shares'), undefined, 'si è quotata senza poter pagare la quota');
    });

    test('joinHolding e leaveHolding parlano col server', async () => {
        await w.joinHolding('holding-9');
        assert.ok(server.chiamate.some(c => /holding/i.test(c.nome)),
            'entrare in una holding non è arrivato al server');

        server.chiamate.length = 0;
        await w.leaveHolding('holding-9');
        assert.ok(server.chiamate.some(c => /holding/i.test(c.nome)),
            'uscire da una holding non è arrivato al server');
    });

    test('senza login nessuna azione condivisa tocca il server', async () => {
        w.currentUser = null;
        env.sandbox.currentUser = null;

        await w.buyCompanyShares('quota-di-prova', 10);
        await w.sellCompanyShares('quota-di-prova', 10);
        await w.listCompanyIPO();
        await w.joinHolding('h');
        await w.leaveHolding('h');

        assert.deepEqual(server.chiamate, []);
    });
});
