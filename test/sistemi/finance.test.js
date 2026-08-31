'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/finance — prestiti, lusso, lobbying, venture capital.

   Fase 3 di PIANO-CHIUSURA.md, sistema 6 (lifestyle/lusso) + le azioni di
   `engine-finance.js` che gli stanno intorno. Sei azioni, tutte a **denaro
   locale**: passano da `CE_money.spend`/`earn`, nessuna RPC. Il server le vede
   solo come sincronizzazione della cassa.

     · takeLoan / repayLoan            — il prestito bancario
     · buyLifestyleAsset               — l'immobile di lusso
     · passLobbyLaw                    — la legge comprata coi punti lobbying
     · acquireVentureStake / divest…   — le quote nelle agenzie

   Per ognuna: l'effetto sullo stato locale, il denaro che si muove dalla porta,
   e il rifiuto pulito quando manca una precondizione (fondi, reputazione, punti).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/finance', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs      = () => env.sandbox.window.gameState;
    const errori  = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const cat     = (n) => R.catalogo(env, n) || [];

    // ── Prestiti ────────────────────────────────────────────────────────────

    describe('takeLoan / repayLoan', () => {

        test('takeLoan accredita l\'importo e registra il prestito', () => {
            gs().creditScore = 800;
            const prima = gs().cash;

            w.takeLoan(50000);

            assert.deepEqual(errori(), []);
            assert.equal(gs().cash, prima + 50000, 'il prestito non è entrato in cassa');
            const l = gs().loans[gs().loans.length - 1];
            assert.equal(l.amount, 50000);
        });

        test('takeLoan rifiuta un importo oltre il fido, senza dare soldi', () => {
            gs().creditScore = 300;              // tier più basso, fido piccolo
            const prima = gs().cash;

            w.takeLoan(5_000_000);

            assert.equal(gs().cash, prima, 'ha dato un prestito che il fido non copre');
            assert.ok(errori().some(m => /Credit Score|fido|credito/i.test(m)));
        });

        test('repayLoan salda il debito: paga l\'importo e alza il credit score', () => {
            gs().creditScore = 800;
            w.takeLoan(40000);
            const loanId = gs().loans[gs().loans.length - 1].id;
            const scorePrima = gs().creditScore;
            const cassaPrima = gs().cash;

            w.repayLoan(loanId);

            assert.deepEqual(errori(), []);
            assert.equal(gs().cash, cassaPrima - 40000, 'il rimborso non ha pagato l\'importo');
            assert.equal(gs().loans.find(l => l.id === loanId), undefined, 'il prestito è ancora lì');
            assert.equal(gs().creditScore, Math.min(900, scorePrima + 20));
        });

        test('repayLoan con fondi insufficienti non tocca né debito né cassa', () => {
            gs().creditScore = 800;
            w.takeLoan(40000);
            const loanId = gs().loans[gs().loans.length - 1].id;
            R.conSoldi(env, 1000);              // meno dei 40.000 da rimborsare
            const cassaPrima = gs().cash;

            w.repayLoan(loanId);

            assert.equal(gs().cash, cassaPrima, 'ha rimborsato senza avere i soldi');
            assert.ok(gs().loans.some(l => l.id === loanId), 'il prestito è stato tolto senza pagarlo');
        });
    });

    // ── Immobile di lusso ───────────────────────────────────────────────────

    describe('buyLifestyleAsset', () => {

        const assetSemplice = () => cat('LIFESTYLE_ASSETS').find(a => !a.intlUnlock);

        test('compra l\'immobile: scala il prezzo, lo aggiunge e accredita la reputazione', () => {
            const a = assetSemplice();
            R.conSoldi(env, a.price + 1_000_000);
            const cassaPrima = gs().cash;
            const repPrima = gs().reputation;

            w.buyLifestyleAsset(a.id);

            assert.deepEqual(errori(), []);
            assert.equal(gs().cash, cassaPrima - a.price);
            assert.ok(gs().lifestyleAssets.includes(a.id));
            if (a.repBonus) assert.ok(gs().reputation > repPrima, 'il bonus reputazione non è arrivato');
        });

        test('non si compra due volte lo stesso immobile', () => {
            const a = assetSemplice();
            R.conSoldi(env, a.price * 2 + 1_000_000);
            w.buyLifestyleAsset(a.id);
            const cassaDopoUno = gs().cash;

            w.buyLifestyleAsset(a.id);

            assert.equal(gs().cash, cassaDopoUno, 'ha pagato una seconda copia');
            assert.equal(gs().lifestyleAssets.filter(x => x === a.id).length, 1);
            assert.ok(errori().some(m => /già posseduto/i.test(m)));
        });

        test('fondi insufficienti: niente immobile, cassa intatta', () => {
            const a = assetSemplice();
            R.conSoldi(env, Math.floor(a.price / 2));
            const cassaPrima = gs().cash;

            w.buyLifestyleAsset(a.id);

            assert.equal(gs().cash, cassaPrima);
            assert.ok(!(gs().lifestyleAssets || []).includes(a.id));
        });
    });

    // ── Lobbying ────────────────────────────────────────────────────────────

    describe('passLobbyLaw', () => {

        test('approva la legge: spende i punti e l\'eventuale costo in denaro', () => {
            const law = cat('LOBBY_LAWS').find(l => l.cashCost > 0);
            gs().lobbyingPoints = law.pointsCost + 5;
            const cassaPrima = gs().cash;
            const puntiPrima = gs().lobbyingPoints;

            w.passLobbyLaw(law.id);

            assert.deepEqual(errori(), []);
            assert.ok(gs().activeLobbyLaws.includes(law.id));
            assert.equal(gs().lobbyingPoints, puntiPrima - law.pointsCost);
            assert.equal(gs().cash, cassaPrima - law.cashCost);
        });

        test('senza abbastanza punti lobbying non passa, e non spende denaro', () => {
            const law = cat('LOBBY_LAWS').find(l => l.cashCost > 0);
            gs().lobbyingPoints = 0;
            const cassaPrima = gs().cash;

            w.passLobbyLaw(law.id);

            assert.equal(gs().cash, cassaPrima, 'ha pagato il costo in denaro di una legge non approvata');
            assert.ok(!(gs().activeLobbyLaws || []).includes(law.id));
            assert.ok(errori().some(m => /punti lobbying/i.test(m)));
        });
    });

    // ── Venture capital ─────────────────────────────────────────────────────

    describe('acquireVentureStake / divestVentureStake', () => {

        test('acquisisce la quota: paga valuation × percentuale e la registra', () => {
            const ag = cat('VENTURE_AGENCIES')[0];
            gs().reputation = Math.max(gs().reputation, ag.minRep);
            R.conSoldi(env, ag.valuation + 1_000_000);
            const cassaPrima = gs().cash;

            w.acquireVentureStake(ag.id, 10);

            assert.deepEqual(errori(), []);
            const s = gs().ventureCapital.find(x => x.agencyId === ag.id);
            assert.ok(s, 'la quota non è stata registrata');
            assert.equal(gs().cash, cassaPrima - Math.floor(ag.valuation * s.stakePercent / 100));
        });

        test('reputazione sotto la soglia: nessuna quota, nessun addebito', () => {
            const ag = cat('VENTURE_AGENCIES')[0];
            gs().reputation = 0;
            const cassaPrima = gs().cash;

            w.acquireVentureStake(ag.id, 10);

            assert.equal(gs().cash, cassaPrima);
            assert.ok(!(gs().ventureCapital || []).some(x => x.agencyId === ag.id));
            assert.ok(errori().some(m => /Reputazione/i.test(m)));
        });

        test('divestVentureStake cede la quota e restituisce il 75% della valutazione', () => {
            const ag = cat('VENTURE_AGENCIES')[0];
            gs().reputation = Math.max(gs().reputation, ag.minRep);
            R.conSoldi(env, ag.valuation + 1_000_000);
            w.acquireVentureStake(ag.id, 10);
            const stake = gs().ventureCapital.find(x => x.agencyId === ag.id).stakePercent;
            const cassaPrima = gs().cash;

            w.divestVentureStake(ag.id);

            assert.equal(gs().ventureCapital.find(x => x.agencyId === ag.id), undefined, 'la quota è ancora lì');
            const atteso = Math.floor(ag.valuation * stake / 100 * 0.75);
            assert.equal(gs().cash, cassaPrima + atteso);
        });
    });
});
