'use strict';
// BLOCCO 1.4 — l'energia del CEO si recupera anche per chi comincia.
//
// Il consumo e' −5%/ora reale, ma tutta la rigenerazione viveva dentro un ramo
// che richiedeva staff HR, VIP Lounge o un asset lifestyle: un giocatore nuovo
// non ha nessuno dei tre, quindi scendeva e basta. Fuori dalla fase survival
// non esiste piu' nemmeno il «Dormi in auto» gratuito.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economia/energia — chi comincia non trova un muro', () => {

    test('un giocatore senza HR, Lounge e lifestyle recupera comunque', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.staff = [];                 // niente HR
            gs.investments = [];           // niente VIP Lounge
            gs.lifestyleAssets = [];       // niente attico o villa
            gs.activeRides = [];           // il CEO non e' in corsa
            gs.energy = 40;

            sandbox._tickFatigue();

            assert.ok(gs.energy > 40,
                `senza nessun bonus l'energia deve comunque risalire, invece e' ${gs.energy}`);
            assert.equal(gs.energy, 41, 'il riposo di base vale +1,0 punti per tick orario');
        } finally { stopAllIntervals(); }
    });

    test('lo staff HR resta un vantaggio: recupera piu\' in fretta', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.lifestyleAssets = []; gs.investments = []; gs.activeRides = [];

            gs.staff = []; gs.energy = 40;
            sandbox._tickFatigue();
            const senzaHR = gs.energy;

            gs.staff = [{ id: 'hr', name: 'HR' }]; gs.energy = 40;
            sandbox._tickFatigue();
            const conHR = gs.energy;

            assert.ok(conHR > senzaHR,
                `HR deve restare un bonus SOPRA la base (con ${conHR} vs senza ${senzaHR})`);
        } finally { stopAllIntervals(); }
    });

    test('mentre il CEO guida non si riposa', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.staff = []; gs.investments = []; gs.lifestyleAssets = [];
            gs.energy = 40;
            gs.activeRides = [{ id: 1, driverId: 'ceo' }];

            sandbox._tickFatigue();

            assert.equal(gs.energy, 40, 'guidando non si recupera energia');
        } finally { stopAllIntervals(); }
    });

    test('il riposo non supera mai il 100%', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.staff = []; gs.investments = []; gs.lifestyleAssets = []; gs.activeRides = [];
            gs.energy = 100;
            sandbox._tickFatigue();
            assert.equal(gs.energy, 100, 'l\'energia si ferma a 100');
        } finally { stopAllIntervals(); }
    });
});
