'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('contracts/b2b — mappa tier catalogo->flotta (regressione fix 6 agosto 2026)', () => {
    test('REGRESSIONE: i requisiti B2B in MAIUSCOLO (catalogo) e i tier flotta in minuscolo si confrontano correttamente', () => {
        const { sandbox } = freshEnv();
        // Prima del fix del 6 agosto: confronto diretto via indexOf su un solo vocabolario
        // dava -1 per 'vip'/'group'/'standard' — un'auto VIP non contava MAI per un
        // requisito PRESIDENTIAL/ARMORED/ULTRA, anche se doveva.
        assert.ok(sandbox._b2bCarRank({ tier: 'vip' }) >= sandbox._b2bReqRank('PREMIUM'), 'un\'auto vip deve soddisfare un requisito PREMIUM (rank 3 >= 2)');
        assert.ok(sandbox._b2bCarRank({ tier: 'group' }) >= sandbox._b2bReqRank('BUSINESS'), 'un\'auto group deve soddisfare un requisito BUSINESS (rank 3 >= 2)');
        assert.ok(sandbox._b2bCarRank({ tier: 'vip' }) < sandbox._b2bReqRank('ULTRA'), 'un\'auto vip NON deve soddisfare un requisito ULTRA (rank 3 < 4) — solo ultra ci arriva');
        assert.equal(sandbox._b2bCarRank({ tier: 'ultra' }), sandbox._b2bReqRank('ULTRA'), 'un\'auto ultra deve soddisfare esattamente un requisito ULTRA');
        assert.ok(sandbox._b2bCarRank({ tier: 'standard' }) < sandbox._b2bReqRank('BUSINESS'), 'un\'auto standard NON deve soddisfare un requisito BUSINESS');
        assert.ok(sandbox._b2bCarRank({ tier: 'business' }) >= sandbox._b2bReqRank('BUSINESS'), 'un\'auto business deve soddisfare un requisito BUSINESS');
    });

    test('un tier sconosciuto non crasha e ottiene rank 0 (auto) / 2 (requisito, default prudente)', () => {
        const { sandbox } = freshEnv();
        assert.equal(sandbox._b2bCarRank({ tier: 'inesistente' }), 0);
        assert.equal(sandbox._b2bCarRank(null), 0);
        assert.equal(sandbox._b2bReqRank('INESISTENTE'), 2);
    });
});

describe('contracts/tourism — punteggio ed eleggibilità bandi turismo', () => {
    test('_tQualifyingCount conta solo veicoli del tier giusto, non in leasing, non fuori servizio', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.fleet = [
            { id: 'c1', tier: 'ultra', isLease: false, outOfService: null },
            { id: 'c2', tier: 'ultra', isLease: true,  outOfService: null }, // in leasing: non conta
            { id: 'c3', tier: 'ultra', isLease: false, outOfService: true }, // fuori servizio: non conta
            { id: 'c4', tier: 'standard', isLease: false, outOfService: null }, // tier troppo basso
            { id: 'c5', tier: 'vip', isLease: false, outOfService: null }, // vip >= business: conta per requisito business
        ];

        assert.equal(sandbox._tQualifyingCount('ultra'), 1, 'solo c1 è ultra, disponibile, non in leasing');
        assert.equal(sandbox._tQualifyingCount('business'), 2, 'c1 (ultra>=business) + c5 (vip>=business)');
    });

    test('_tMeetsReqs rifiuta per reputazione insufficiente prima ancora di controllare la flotta', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.reputation = 1;
        sandbox.gameState.fleet = [{ id: 'c1', tier: 'ultra', isLease: false, outOfService: null }];

        const result = sandbox._tMeetsReqs({ requirements: { min_reputation: 5, req_tier: 'standard', req_vehicle_count: 0 } });

        assert.equal(result.ok, false);
        assert.match(result.reason, /Reputazione insufficiente/);
    });

    test('_tMeetsReqs rifiuta per flotta insufficiente quando la reputazione è ok', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.reputation = 10;
        sandbox.gameState.fleet = [{ id: 'c1', tier: 'standard', isLease: false, outOfService: null }];

        const result = sandbox._tMeetsReqs({ requirements: { min_reputation: 0, req_tier: 'ultra', req_vehicle_count: 2 } });

        assert.equal(result.ok, false);
        assert.match(result.reason, /Veicoli insufficienti/);
    });

    test('_tMeetsReqs accetta quando reputazione e flotta bastano entrambe', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.reputation = 10;
        sandbox.gameState.fleet = [
            { id: 'c1', tier: 'ultra', isLease: false, outOfService: null },
            { id: 'c2', tier: 'ultra', isLease: false, outOfService: null },
        ];

        const result = sandbox._tMeetsReqs({ requirements: { min_reputation: 5, req_tier: 'ultra', req_vehicle_count: 2 } });

        assert.equal(result.ok, true);
    });

    test('_tPlayerScore è limitato a 100 (40 reputazione + 40 flotta + 20 pledge) e non va oltre anche con valori estremi', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.reputation = 9999; // dovrebbe saturare a 40, non esplodere
        sandbox.gameState.fleet = Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, tier: 'ultra', isLease: false, outOfService: null }));

        const score = sandbox._tPlayerScore('ultra', 2, 99999999);

        assert.equal(score.total, 100, 'il punteggio totale deve essere limitato a 100, non sballare con input estremi');
        assert.equal(score.rep, 40);
        assert.equal(score.fleet, 40);
        assert.equal(score.pledge, 20);
    });
});
