'use strict';
/* ============================================================================
   test/contracts/azioni-scoperte.test.js

   Audit del buco di copertura sul sistema contratti B2B/corporate.
   La gran parte delle azioni e' gia' collaudata in test/funzioni/contratti.test.js,
   test/contracts/corporate-bid.test.js, contracts-sync.test.js e b2b-sync.test.js.
   Questo file copre SOLO i rami rimasti scoperti:

     - _generateBatch: le aziende con bando aperto o contratto attivo NON devono
                       ricomparire nel batch successivo (_usedIds / dedup)
     - _resolve:       chiusura di un bando su cui il giocatore NON ha mai offerto
                       (nessun rimborso, storico con won=false, nessun denaro mosso)
     - b2bOpenAcceptModal: le auto in leasing/edizione limitata non sono selezionabili
     - b2bCheckLimit:  al raggiungimento del limite i checkbox restanti si disabilitano

   Nessuna di queste strade muove denaro nuovo: qui si verifica l'effetto principale
   sullo stato e l'ASSENZA di movimenti non mediati da CE_money/syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('contracts — _generateBatch: dedup aziende già impegnate', () => {
    test('il nuovo batch esclude le aziende con bando ancora aperto o contratto attivo', async () => {
        const syncedCash = [];
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; } },
        });
        const gs = sandbox.gameState;
        sandbox.CE_Contracts.initState();

        gs.day = 20;
        gs.nextTenderDay = 20; // il tick rigenera il batch
        // Un bando ancora APERTO per una società...
        gs.corporateTenders = [{
            id: 't_open',
            companyId: 'Pear Technologies',
            company: {
                company_name: 'Pear Technologies',
                tier: 5, payout_per_hour: 6500, contract_duration_days: 30,
                tender_requirements: { min_fleet_size: 15, required_vehicle_type: 'luxury_electric', min_reputation: 95 },
            },
            openedDay: 19,
            closingDay: 22, // ancora aperto al giorno 20: sopravvive a _resolve
            playerBid: null,
            status: 'open',
        }];
        // ...e un contratto ATTIVO per un'altra (payout 0: non deve muovere cassa in questo test)
        gs.corporateContracts = [{
            id: 'ctr_live',
            companyId: 'OmniSphere Cloud',
            company: { company_name: 'OmniSphere Cloud', tier: 5, contract_duration_days: 30 },
            startDay: 10, endDay: 40,
            dailyPayout: 0, totalEarned: 0, status: 'active',
        }];
        const cashPrima = gs.cash;

        sandbox.CE_Contracts.dailyTick();
        await new Promise(r => setImmediate(r));

        // Il tenders aperto originale sopravvive al tick: valutiamo solo le NUOVE voci.
        const nuovi = gs.corporateTenders.filter(t => t.id !== 't_open');
        assert.equal(nuovi.length, 4, 'il batch rigenerato contiene 4 bandi');
        const nuoviIds = nuovi.map(t => t.companyId);
        assert.equal(nuoviIds.includes('Pear Technologies'), false,
            'una società con bando ancora aperto non deve ricevere un secondo bando');
        assert.equal(nuoviIds.includes('OmniSphere Cloud'), false,
            'una società con contratto attivo non deve comparire nei nuovi bandi');
        assert.equal(new Set(nuoviIds).size, 4, 'nessun duplicato dentro lo stesso batch');
        assert.equal(gs.nextTenderDay, 23, 'il prossimo batch arriva tra CYCLE_DAYS=3 giorni');
        assert.equal(gs.cash, cashPrima, 'generare bandi non deve muovere cassa');
    });
});

describe('contracts — _resolve: chiusura bando senza offerta del giocatore', () => {
    test('nessun rimborso, nessun contratto, storico con won=false e nessun denaro mosso', async () => {
        const syncedCash = [];
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; } },
        });
        const gs = sandbox.gameState;
        sandbox.CE_Contracts.initState();

        gs.day = 3;
        gs.cash = 4321;
        gs.nextTenderDay = 99; // niente generazione in questo tick
        gs.corporateTenders = [{
            id: 't_ignored',
            companyId: 'Nimbus Delivery',
            company: {
                company_name: 'Nimbus Delivery',
                tier: 2, payout_per_hour: 1500, contract_duration_days: 7,
                tender_requirements: { min_fleet_size: 4, required_vehicle_type: 'compact_ev', min_reputation: 60 },
            },
            openedDay: 1,
            closingDay: 3, // scade oggi, ma il giocatore non ha mai offerto
            playerBid: null,
            status: 'open',
        }];
        gs.corporateContracts = [];

        sandbox.CE_Contracts.dailyTick();
        await new Promise(r => setImmediate(r));

        assert.equal(gs.corporateContracts.length, 0, 'senza offerta non si vince nulla');
        assert.equal(gs.cash, 4321, 'nessun pledge da rimborsare: cassa intatta');
        assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione: nessun movimento');
        assert.equal(gs.tenderHistory.length, 1, 'il bando chiuso finisce comunque nello storico');
        const res = gs.tenderHistory[0].result;
        assert.equal(res.won, false, 'il flag di esito deve essere un booleano, non null');
        assert.equal(res.pScore, -1, 'score -1 segnala assenza di offerta');
        assert.equal(gs.corporateTenders.length, 0, 'il bando risolto esce dai tenders aperti');
    });
});

describe('b2b — modale di accettazione: filtri veicoli e limite selezione', () => {
    function setupModal(fleet) {
        const { sandbox } = freshEnv({ render: true });
        const gs = sandbox.gameState;
        sandbox.currentUser = { id: 'usr_b2b_modal' };
        sandbox._b2bState.contracts = [{
            id: 'cat_test',
            title: 'Navetta Test',
            client_name: 'Client Test',
            client_icon: '💼',
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 0,
            daily_payout: 3000,
            duration_days: 7,
            penalty_amount: 10000,
            province_id: null,
        }];
        gs.fleet = fleet;
        gs.reputation = 5;
        return { sandbox, gs };
    }

    test('le auto in leasing o edizione limitata NON compaiono tra i veicoli selezionabili', () => {
        const { sandbox } = setupModal([
            { id: 'car_lease', name: 'Leased Business', tier: 'business', condition: 95, isLease: true,  outOfService: null },
            { id: 'car_ltd',   name: 'Limited Business', tier: 'business', condition: 95, isLease: false, outOfService: null, isLimitedEdition: true },
            { id: 'car_own1',  name: 'Own Business 1',   tier: 'business', condition: 95, isLease: false, outOfService: null },
            { id: 'car_own2',  name: 'Own Business 2',   tier: 'vip',      condition: 95, isLease: false, outOfService: null },
        ]);

        sandbox.b2bOpenAcceptModal('cat_test');

        const modal = sandbox.document.getElementById('b2b-select-modal');
        assert.ok(modal, 'con 2 auto proprie disponibili il modale deve aprirsi');

        const values = [...modal.querySelectorAll('.b2b-car-check')].map(cb => cb.value);
        assert.equal(values.includes('car_lease'), false, 'un\'auto in leasing non è vincolabile a un appalto');
        assert.equal(values.includes('car_ltd'), false, 'un\'auto edizione limitata non è vincolabile');
        assert.deepEqual(Array.from(values), ['car_own1', 'car_own2'],
            'solo le auto di proprietà (tier >= richiesto) sono selezionabili');
    });

    test('b2bCheckLimit disabilita i checkbox restanti quando si raggiunge il limite, e li riabilita se si deseleziona', () => {
        const { sandbox } = setupModal([
            { id: 'car_a', name: 'A', tier: 'business', condition: 95, isLease: false, outOfService: null },
            { id: 'car_b', name: 'B', tier: 'business', condition: 95, isLease: false, outOfService: null },
            { id: 'car_c', name: 'C', tier: 'vip',      condition: 95, isLease: false, outOfService: null },
        ]);
        sandbox.b2bOpenAcceptModal('cat_test');

        const checks = [...sandbox.document.querySelectorAll('.b2b-car-check')];
        assert.equal(checks.length, 3);

        checks[0].checked = true;
        sandbox.b2bCheckLimit(2);
        assert.equal(checks.every(cb => !cb.disabled), true, 'sotto il limite tutto resta selezionabile');

        checks[1].checked = true;
        sandbox.b2bCheckLimit(2);
        assert.equal(checks[2].disabled, true, 'al limite il terzo veicolo deve essere disabilitato');

        checks[0].checked = false;
        sandbox.b2bCheckLimit(2);
        assert.equal(checks[2].disabled, false, 'deselezionando torna disponibile');
    });
});
