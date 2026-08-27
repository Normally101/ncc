'use strict';
/* ============================================================================
   test/funzioni/rivali.test.js — engine-rivals.js

   Il vero buco di copertura del repo: 5 funzioni VIVE con zero test.
   Era sfuggito a ogni censimento perche' il file non espone nulla su `window`
   (sono dichiarazioni `function` a top-level), quindi le ricerche per
   `window.X` lo saltavano. Eppure gira davvero — engine-daily.js chiama
   _tickRivalsDaily() e _tickPricewars(), engine.js chiama _tickRivalsActive()
   ogni 15 minuti di gioco — e muove il denaro dei rivali, danneggia le auto del
   giocatore e prova a rubargli gli autisti.
   ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Pilota Math.random: il sandbox del gioco condivide il Math del processo.
function conRandom(valori, fn) {
    const orig = Math.random;
    const coda = Array.isArray(valori) ? [...valori] : [valori];
    Math.random = () => (coda.length > 1 ? coda.shift() : coda[0]);
    try { return fn(); } finally { Math.random = orig; }
}

// I RIVALS sono globali e condivisi: ogni test riparte da uno stato noto.
function rivaliPuliti(sandbox, righe) {
    const vm = require('node:vm');
    const R = vm.runInContext('RIVALS', sandbox);
    R.length = 0;
    righe.forEach(r => R.push(r));
    return R;
}

describe('funzione Rivali — engine-rivals.js', () => {

    describe('_ensureRivalState', () => {
        test('completa i campi mancanti derivandoli dalla reputazione', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const r = { name: 'Test', rep: 3.0, cash: 10000 };
                sandbox._ensureRivalState(r);
                assert.equal(r.drivers, 3, 'gli autisti si ricavano dalla reputazione');
                assert.equal(r.fleet, 2, 'la flotta e\' rep × 0.8 arrotondata');
                assert.equal(r.missions, 0);
                assert.equal(r.lastAction, '');
            } finally { stopAllIntervals(); }
        });

        test('non sovrascrive uno stato gia\' presente', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const r = { name: 'Test', rep: 3.0, cash: 10000, drivers: 9, fleet: 7, missions: 42, lastAction: 'x' };
                sandbox._ensureRivalState(r);
                assert.equal(r.drivers, 9);
                assert.equal(r.missions, 42, 'lo storico non si azzera a ogni tick');
            } finally { stopAllIntervals(); }
        });

        test('un rivale a reputazione zero ha comunque un autista e un\'auto', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const r = { name: 'Fallito', rep: 0, cash: 0 };
                sandbox._ensureRivalState(r);
                assert.equal(r.drivers, 1, 'mai zero autisti: il rivale esisterebbe senza poter operare');
                assert.equal(r.fleet, 1);
            } finally { stopAllIntervals(); }
        });
    });

    describe('_tickRivalsActive — la vita dei rivali', () => {
        test('completare una missione porta soldi e un po\' di reputazione', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const [r] = rivaliPuliti(sandbox, [{ name: 'Alfa', rep: 2.0, cash: 1000, drivers: 2, fleet: 2, missions: 0 }]);
                sandbox.gameState.hour = 12;    // giorno: nessun bonus notturno
                // 0.01 supera ogni soglia di probabilita' → la missione avviene;
                // gli acquisti (auto/autista) restano fuori portata per mancanza di cassa.
                conRandom([0.01, 0.5, 0.99, 0.99, 0.99], () => sandbox._tickRivalsActive());
                assert.ok(r.cash > 1000, 'la missione deve fruttare denaro');
                assert.equal(r.missions, 1, 'il contatore delle missioni avanza');
                assert.ok(r.rep > 2.0, 'la reputazione cresce, lentamente');
            } finally { stopAllIntervals(); }
        });

        test('di notte si guadagna di piu\'', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const guadagno = (ora) => {
                    const [r] = rivaliPuliti(sandbox, [{ name: 'Alfa', rep: 2.0, cash: 0, drivers: 2, fleet: 2, missions: 0 }]);
                    sandbox.gameState.hour = ora;
                    conRandom([0.01, 0.5, 0.99, 0.99, 0.99], () => sandbox._tickRivalsActive());
                    return r.cash;
                };
                assert.ok(guadagno(23) > guadagno(12), 'la tariffa notturna vale il 25% in piu\'');
            } finally { stopAllIntervals(); }
        });

        test('un rivale ricco compra un\'auto', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const [r] = rivaliPuliti(sandbox, [{ name: 'Ricco', rep: 5.0, cash: 500000, drivers: 9, fleet: 1, missions: 0 }]);
                sandbox.gameState.hour = 12;
                const flottaPrima = r.fleet;
                // random basso: passa sia la missione sia l'acquisto.
                conRandom(0.01, () => sandbox._tickRivalsActive());
                assert.equal(r.fleet, flottaPrima + 1, 'il rivale con cassa alta amplia la flotta');
                assert.ok(/auto/.test(r.lastAction || ''), 'l\'ultima azione viene registrata');
            } finally { stopAllIntervals(); }
        });

        test('un rivale in difficolta\' perde reputazione', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const [r] = rivaliPuliti(sandbox, [{ name: 'Povero', rep: 2.0, cash: 100, drivers: 1, fleet: 1, missions: 0 }]);
                sandbox.gameState.hour = 12;
                const repPrima = r.rep;
                /* Due soli valori: il primo (alto) fa saltare la missione; il
                   secondo (basso) fa scattare il crollo. I rami «compra auto» e
                   «assumi autista» non consumano Math.random perche' la guardia
                   sulla cassa li corto-circuita prima. */
                conRandom([0.99, 0.01], () => sandbox._tickRivalsActive());
                assert.ok(r.rep < repPrima, 'senza cassa la reputazione scende');
                assert.ok(r.rep >= 0.1, 'ma non sotto il minimo: il rivale non sparisce');
            } finally { stopAllIntervals(); }
        });

        test('senza rivali non esplode', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                rivaliPuliti(sandbox, []);
                assert.doesNotThrow(() => sandbox._tickRivalsActive());
            } finally { stopAllIntervals(); }
        });
    });

    describe('_tickRivalsDaily — i costi fissi dei rivali', () => {
        test('le spese giornaliere scalano con autisti e flotta', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const [r] = rivaliPuliti(sandbox, [{ name: 'Alfa', rep: 2.0, cash: 100000, drivers: 5, fleet: 4, missions: 0 }]);
                conRandom(0.99, () => sandbox._tickRivalsDaily());   // niente sabotaggi
                // 5 autisti × 80 + 4 auto × 40 = 560
                assert.equal(r.cash, 100000 - 560, 'stipendi e leasing scalano dalla cassa del rivale');
            } finally { stopAllIntervals(); }
        });

        test('un rivale non scende mai sotto il minimo vitale', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const [r] = rivaliPuliti(sandbox, [{ name: 'Fallito', rep: 0.5, cash: 5100, drivers: 10, fleet: 10, missions: 0 }]);
                conRandom(0.99, () => sandbox._tickRivalsDaily());
                assert.equal(r.cash, 5000, 'la cassa si ferma a 5000: i rivali non falliscono davvero');
            } finally { stopAllIntervals(); }
        });
    });

    describe('_maybeRivalSabotage — quando i rivali attaccano', () => {
        test('il poaching arriva come email, non ruba l\'autista di nascosto', () => {
            const { sandbox, stopAllIntervals, notifications } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [{ name: 'Squalo SpA', rep: 4.0, cash: 900000, drivers: 5, fleet: 5, missions: 0 }]);
                gs.reputation = 1.0;
                gs.drivers = [{ id: 'ceo' }, { id: 'd1', name: 'Mario', xp: 500, salary: 3000 }];
                gs.emails = [];

                // 0.01: passa il poaching. La seconda soglia (fake client) resta chiusa
                // perche' il rank del giocatore e' migliore del numero dei rivali.
                conRandom(0.01, () => sandbox._maybeRivalSabotage());

                const mail = gs.emails.find(e => e.type === 'poaching');
                assert.ok(mail, 'il tentativo deve arrivare in inbox');
                assert.equal(mail.driverId, 'd1', 'il bersaglio e\' l\'autista con piu\' XP');
                assert.ok(mail.counterOffer > 3000, 'l\'offerta rivale supera lo stipendio attuale');
                assert.ok(gs.drivers.some(d => d.id === 'd1'),
                    'l\'autista resta finche\' il giocatore non decide: niente furto silenzioso');
                assert.ok(notifications.some(n => /rubarti/.test(n.msg || '')), 'il giocatore viene avvisato');
            } finally { stopAllIntervals(); }
        });

        test('senza autisti non c\'e\' nessuno da rubare', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [{ name: 'Squalo SpA', rep: 4.0, cash: 900000, drivers: 5, fleet: 5, missions: 0 }]);
                gs.drivers = [{ id: 'ceo' }];
                gs.emails = [];
                conRandom(0.01, () => sandbox._maybeRivalSabotage());
                assert.equal(gs.emails.filter(e => e.type === 'poaching').length, 0);
            } finally { stopAllIntervals(); }
        });

        test('il cliente-truffa danneggia un\'auto solo a chi e\' ultimo in classifica', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                // Un solo rivale, con reputazione superiore ⇒ il giocatore e' 2°,
                // cioe' rank >= RIVALS.length + 1: e' il caso in cui scatta.
                rivaliPuliti(sandbox, [{ name: 'Nemico', rep: 5.0, cash: 10000, drivers: 2, fleet: 2, missions: 0 }]);
                gs.reputation = 0.1;
                gs.drivers = [{ id: 'ceo' }];
                gs.emails = [];
                gs.fleet = [{ id: 'c1', name: 'Berlina', condition: 100, outOfService: null }];

                conRandom(0.01, () => sandbox._maybeRivalSabotage());

                assert.ok(gs.fleet[0].condition < 100, 'l\'auto deve aver subito danni');
                assert.ok(gs.fleet[0].condition >= 5, 'ma non viene distrutta');
            } finally { stopAllIntervals(); }
        });

        test('chi e\' in testa alla classifica e\' immune al cliente-truffa', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [{ name: 'Nemico', rep: 0.5, cash: 10000, drivers: 2, fleet: 2, missions: 0 }]);
                gs.reputation = 5.0;         // primo posto
                gs.drivers = [{ id: 'ceo' }];
                gs.emails = [];
                gs.fleet = [{ id: 'c1', name: 'Berlina', condition: 100, outOfService: null }];

                conRandom(0.01, () => sandbox._maybeRivalSabotage());

                assert.equal(gs.fleet[0].condition, 100,
                    'in testa alla classifica non si subiscono sabotaggi: e\' la ricompensa del primato');
            } finally { stopAllIntervals(); }
        });

        test('un\'auto gia\' malandata non viene presa di mira', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [{ name: 'Nemico', rep: 5.0, cash: 10000, drivers: 2, fleet: 2, missions: 0 }]);
                gs.reputation = 0.1;
                gs.drivers = [{ id: 'ceo' }];
                gs.emails = [];
                gs.fleet = [{ id: 'c1', name: 'Rottame', condition: 20, outOfService: null }];

                conRandom(0.01, () => sandbox._maybeRivalSabotage());

                assert.equal(gs.fleet[0].condition, 20, 'sotto il 30% di condizione l\'auto non e\' un bersaglio');
            } finally { stopAllIntervals(); }
        });
    });

    describe('_tickPricewars — guerre di prezzo e monopoli', () => {
        test('con due rivali in ginocchio la guerra sfocia nel monopolio', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [
                    { name: 'A', rep: 0.1, cash: 5000, drivers: 1, fleet: 1, missions: 0 },
                    { name: 'B', rep: 0.2, cash: 5000, drivers: 1, fleet: 1, missions: 0 },
                ]);
                gs.day = 20;
                gs.pricewars = [{ regionId: 'lazio', endsDay: 20 }];

                sandbox._tickPricewars();

                const pw = gs.pricewars.find(p => p.regionId === 'lazio');
                assert.ok(pw, 'la guerra resta attiva perche\' e\' diventata monopolio');
                assert.equal(pw.monopolyEndsDay, 27, 'il monopolio dura 7 giorni');
            } finally { stopAllIntervals(); }
        });

        test('senza rivali abbastanza deboli la guerra finisce e basta', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [
                    { name: 'A', rep: 3.0, cash: 90000, drivers: 3, fleet: 3, missions: 0 },
                    { name: 'B', rep: 2.5, cash: 80000, drivers: 3, fleet: 3, missions: 0 },
                ]);
                gs.day = 20;
                gs.pricewars = [{ regionId: 'lazio', endsDay: 20 }];

                sandbox._tickPricewars();

                assert.equal(gs.pricewars.length, 0, 'la guerra si chiude senza monopolio');
            } finally { stopAllIntervals(); }
        });

        test('il monopolio scaduto viene rimosso', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                rivaliPuliti(sandbox, [{ name: 'A', rep: 3.0, cash: 9000, drivers: 1, fleet: 1, missions: 0 }]);
                gs.day = 30;
                gs.pricewars = [{ regionId: 'lazio', endsDay: 20, monopolyEndsDay: 27 }];

                sandbox._tickPricewars();

                assert.equal(gs.pricewars.length, 0, 'a monopolio scaduto la regione torna normale');
            } finally { stopAllIntervals(); }
        });

        test('senza guerre in corso non succede niente', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                sandbox.gameState.pricewars = [];
                assert.doesNotThrow(() => sandbox._tickPricewars());
                sandbox.gameState.pricewars = null;
                assert.doesNotThrow(() => sandbox._tickPricewars());
            } finally { stopAllIntervals(); }
        });
    });
});
