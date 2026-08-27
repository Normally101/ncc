'use strict';
// BLOCCO 1 del bilanciamento — la prima ora deve essere invitante.
//
// Due difetti misurati: la catena delle 168 missioni era chiusa dietro un muro
// da 35.000€ al suo primo anello, e l'unica azione disponibile dava una cifra
// fissa. Qui si blinda che la catena si apra seguendo il tutorial e che la
// ricompensa sia un'estrazione, non un contatore.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Pilota Math.random SOLO dentro fn e lo ripristina sempre: il sandbox del gioco
// condivide lo stesso oggetto Math del processo di test.
function conRandom(valori, fn) {
    const orig = Math.random;
    const coda = Array.isArray(valori) ? [...valori] : [valori];
    Math.random = () => (coda.length > 1 ? coda.shift() : coda[0]);
    try { return fn(); } finally { Math.random = orig; }
}

describe('economia/prima-ora — l\'inizio invita invece di bloccare', () => {

    describe('t01: la radice dell\'albero delle missioni', () => {
        const t01 = () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            const q = sandbox.QUEST_DB.find(x => x.id === 't01');
            stopAllIntervals();
            return { sandbox, q };
        };

        test('non chiede piu\' un\'auto da 35.000€ a chi ne ha 90', () => {
            const { q } = t01();
            assert.ok(q, 't01 deve esistere');
            // .length e non deepEqual: gli array creati dentro la VM del banco hanno
            // un prototipo diverso da quelli del processo di test.
            assert.equal(q.prereqs.length, 0, 't01 e\' la radice: nessun prerequisito');
            const fonte = q.check.toString();
            assert.ok(!/nexus_h_line/.test(fonte),
                'il muro da 35.000€ non deve piu\' esistere: bloccava tutte le 168 missioni');
        });

        test('si completa con la berlina che il giocatore ha gia\' a inizio partita', () => {
            const { sandbox, q } = t01();
            const gs = sandbox.gameState;

            // La berlina starter e' esattamente cio' che il lore di t01 descrive.
            gs.fleet = [{ id: 'c1', vehicleClass: 'volt_3_urban', condition: 62 }];
            assert.equal(q.check(gs).cur, 1,
                't01 deve completarsi con il veicolo di partenza: e\' il primo premio, non un pedaggio');

            gs.fleet = [];
            assert.equal(q.check(gs).cur, 0, 'senza nessun veicolo non e\' completa');
        });

        test('una partita nuova apre subito la catena delle missioni', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                const q = sandbox.QUEST_DB.find(x => x.id === 't01');
                // freshEnv = initGame(true): lo stato reale di chi apre il gioco adesso.
                assert.ok(gs.fleet.length >= 1, 'la partita nuova parte con la berlina riscattata');
                assert.equal(q.check(gs).cur, 1,
                    'appena entrato, il giocatore ha gia\' la prima missione da riscuotere');
            } finally { stopAllIntervals(); }
        });

        test('t02 resta distinta: e\' li\' che si impara a delegare', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                const t02 = sandbox.QUEST_DB.find(x => x.id === 't02');
                gs.fleet = [{ id: 'c1' }];
                gs.drivers = [{ id: 'ceo' }];
                assert.equal(t02.check(gs).cur, 0,
                    'la sola berlina non completa t02: serve un autista vero');
            } finally { stopAllIntervals(); }
        });
    });

    describe('la corsa manuale: un\'estrazione, non un contatore', () => {
        test('il guadagno normale sta fra 12 e 18 euro', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                // random alto → nessun cliente generoso; il secondo valore sceglie l'importo
                for (const r of [0.5, 0.99, 0.11]) {
                    const { importo, generoso } = conRandom([r, r], () => sandbox._z2hGuadagnoCorsa());
                    assert.equal(generoso, false, 'sopra la soglia non e\' un cliente generoso');
                    assert.ok(importo >= 12 && importo <= 18, `importo ${importo} fuori dalla forbice 12-18`);
                }
            } finally { stopAllIntervals(); }
        });

        test('un cliente su dieci lascia una mancia da 45-60 euro', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const { importo, generoso } = conRandom([0.05, 0.5], () => sandbox._z2hGuadagnoCorsa());
                assert.equal(generoso, true, 'sotto la soglia del 10% scatta il cliente generoso');
                assert.ok(importo >= 45 && importo <= 60, `mancia ${importo} fuori dalla forbice 45-60`);
            } finally { stopAllIntervals(); }
        });

        test('guidare accredita l\'importo estratto, non una cifra fissa', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                gs.cash = 0; gs.energy = 100;
                gs.questStats = { totalRides: 0 };

                conRandom([0.5, 0.5], () => sandbox.executeManualDrive());
                const primo = gs.cash;
                assert.ok(primo >= 12 && primo <= 18, `la corsa deve accreditare 12-18€, non ${primo}`);
                assert.equal(gs.energy, 90, 'la corsa costa 10 punti di energia');

                // Il cliente generoso accredita di piu': la variabilita' e' reale.
                gs.cash = 0;
                conRandom([0.05, 0.5], () => sandbox.executeManualDrive());
                assert.ok(gs.cash >= 45, `il cliente generoso deve accreditare 45-60€, non ${gs.cash}`);
            } finally { stopAllIntervals(); }
        });

        test('il pulsante non promette piu\' una cifra fissa', () => {
            const fs = require('node:fs'), path = require('node:path');
            const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'zero-to-hero.js'), 'utf8');
            assert.ok(!/\+15€\)/.test(src), 'l\'etichetta «+15€» non deve piu\' comparire nel pulsante');
        });
    });
});
