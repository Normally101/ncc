'use strict';
// BLOCCO 1.3 — il livello del giocatore, finalmente collegato al gioco.
//
// player-level.js era scritto e testato dal 22/08 ma non era incluso in
// index.html: il sistema esisteva e non girava. L'unico segnale di crescita
// visibile era il grado, che dipende dal prestigio e quindi esiste solo sopra
// 5.0★ — circa 250 corse. Nella prima ora non saliva mai niente.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

describe('economia/livello — la crescita si vede subito', () => {

    test('il file e\' caricato dal gioco, non solo dai test', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(/player-level\.js/.test(html),
            'player-level.js deve essere in index.html: senza, il sistema e\' codice morto');
        // Deve stare PRIMA di engine.js, che lo usa in updateUI e in completeRide.
        assert.ok(html.indexOf('player-level.js') < html.indexOf('engine.js'),
            'va caricato prima di engine.js, che lo usa');
    });

    test('window.CE_level esiste nel gioco', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            assert.equal(typeof sandbox.window.CE_level, 'object', 'CE_level deve essere esposto su window');
            for (const fn of ['xpToNext', 'totalXpForLevel', 'levelFromXp', 'ensurePlayerLevel', 'addPlayerXp'])
                assert.equal(typeof sandbox.window.CE_level[fn], 'function', `CE_level.${fn} deve esistere`);
        } finally { stopAllIntervals(); }
    });

    test('una partita nuova parte dal livello 1', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            sandbox.window.CE_level.ensurePlayerLevel(sandbox.gameState);
            assert.equal(sandbox.gameState.playerLevel, 1);
            assert.equal(sandbox.gameState.playerXp, 0);
        } finally { stopAllIntervals(); }
    });

    test('completare una corsa fa salire il livello alla PRIMA corsa', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.playerXp = 0; gs.playerLevel = 1;
            gs.drivers.push({ id: 'd1', name: 'X', status: 'busy', queue: [],
                assignedCarId: 'c1', level: 0, trait: null,
                skill_efficiency: 50, skill_charisma: 50, skill_speed: 50,
                stress_level: 0, burnout_until: null });
            gs.fleet.push({ id: 'c1', name: 'Test', tier: 'business', vehicleClass: 'stellar_e_exec',
                condition: 100, fuel: 100, mileage: 0, tirePressure: 100,
                engineHealth: 100, outOfService: null, upgrades: [] });

            sandbox.completeRide({
                id: gs.nextId++, driverId: 'd1', tier: 'standard', price: 150,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio', type: 'city' },
                toPoi:   { id: 'mil',  name: 'Milano', region: 'lombardia', type: 'city' },
                duration: 20000, elapsed: 0,
            }, false);

            // La prima soglia costa 10 XP e una corsa standard ne da' 10: sale subito.
            assert.ok(gs.playerXp >= 10, `la corsa deve dare XP al giocatore, ne ha ${gs.playerXp}`);
            assert.equal(gs.playerLevel, 2, 'alla prima corsa il livello deve gia\' essere salito a 2');
        } finally { stopAllIntervals(); }
    });

    test('le corse di valore piu\' alto danno piu\' XP', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            const xpDopo = (tier) => {
                gs.playerXp = 0; gs.playerLevel = 1;
                sandbox.completeRide({
                    id: gs.nextId++, driverId: null, tier, price: 100,
                    fromPoi: { id: 'roma', name: 'Roma', region: 'lazio', type: 'city' },
                    toPoi:   { id: 'mil',  name: 'Milano', region: 'lombardia', type: 'city' },
                    duration: 20000, elapsed: 0,
                }, false);
                return gs.playerXp;
            };
            assert.ok(xpDopo('ultra') > xpDopo('standard'),
                'una corsa ultra deve valere piu\' XP di una standard');
        } finally { stopAllIntervals(); }
    });

    test('il livello non torna mai indietro', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.playerXp = 500; gs.playerLevel = 7;
            sandbox.window.CE_level.addPlayerXp(gs, -100);
            assert.equal(gs.playerLevel, 7, 'XP negativi non devono far scendere il livello');
            assert.equal(gs.playerXp, 500, 'e non devono nemmeno togliere XP');
        } finally { stopAllIntervals(); }
    });

    test('la barra in alto mostra il livello', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(/id="tb-level"/.test(html), 'la topbar deve avere il posto per il livello');
        const engine = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
        assert.ok(/tb-level/.test(engine), 'updateUI deve aggiornare il livello mostrato');
    });
});
