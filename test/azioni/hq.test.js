'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Ambiente con l'interruttore HQ ACCESO solo dentro il banco (config.js resta com'è):
// hq.js legge window.HQ_ENABLED a ogni chiamata, quindi basta sovrascriverlo qui.
function envAcceso() {
    const env = freshEnv();
    env.sandbox.HQ_ENABLED = true;
    env.sandbox.window.hqInit();
    return env;
}

// Spiatura di CE_money.spend: registra le chiamate e poi fa fare il lavoro vero
// alla funzione originale (quella che parla col server). Così il test GUARDA
// che la spesa passi dalla porta unica senza sostituirla con un finto.
function spiaSpend(sandbox) {
    const spese = [];
    const originale = sandbox.CE_money.spend.bind(sandbox.CE_money);
    sandbox.CE_money.spend = (importo, motivo) => {
        spese.push({ importo, motivo });
        return originale(importo, motivo);
    };
    return spese;
}

describe('hq — interruttore SPENTO (stato attuale di config.js)', () => {
    test('hqAllEffects() restituisce effetti neutri anche se lo stato contiene stanze', () => {
        const { sandbox } = freshEnv();
        sandbox.window.hqInit();
        // Stanze di alto livello piantate nello stato: se l'interruttore fosse
        // acceso produrrebbero effetti misurabili. Spento, devono sparire.
        sandbox.gameState.hqs['roma'].rooms['workshop'] = 3;
        sandbox.gameState.hqs['roma'].rooms['mission_room'] = 2;

        assert.equal(sandbox.HQ_ENABLED, false, 'il banco parte com\u2019\u00e8 in config.js: spento');
        // Confronto per chiavi e non con deepStrictEqual: gli oggetti nati nella
        // sandbox VM hanno un prototipo di altro realm e il confronto diretto fallirebbe.
        assert.deepEqual(Object.keys(sandbox.window.hqAllEffects()), [],
            'a interruttore spento gli effetti devono essere neutri (nessuna chiave)');
    });

    test('_hqDailyTick a interruttore spento non ripara, non alza il morale, non ricarica', () => {
        const { sandbox } = freshEnv();
        sandbox.window.hqInit();
        sandbox.gameState.fleet = [{ id: 'car1', condition: 10, fuel: 5 }];
        sandbox.gameState.drivers = [{ id: 'd1', name: 'Autista', morale: 40 }];

        sandbox.window._hqDailyTick();

        assert.equal(sandbox.gameState.fleet[0].condition, 10, 'condizione intatta');
        assert.equal(sandbox.gameState.fleet[0].fuel, 5, 'carburante intatto');
        assert.equal(sandbox.gameState.drivers[0].morale, 40, 'morale intatto');
    });
});

describe('hq — costruzione stanza (interruttore acceso SOLO nel banco)', () => {
    test('hqUpgradeRoom scala il costo UNA volta sola, tramite CE_money, e costruisce', async () => {
        const env = envAcceso();
        const { sandbox, notifications } = env;
        const spese = spiaSpend(sandbox);

        sandbox.gameState.cash = 300000;
        // workshop tier 1: cost 180000, reqRep 0, prereq garage_main (già a Lv1 a nuova partita)
        await sandbox.window.hqUpgradeRoom('roma', 'workshop');

        assert.deepEqual(spese.map(s => s.importo), [180000],
            'la spesa deve passare da CE_money.spend esattamente una volta, per il costo del tier');
        assert.equal(spese[0].motivo, 'hq_upgrade', 'la spesa deve essere marcata hq_upgrade');
        assert.equal(sandbox.window.hqGetRoomLevel('roma', 'workshop'), 1, 'la stanza risulta costruita');
        assert.equal(sandbox.gameState.cash, 120000, 'cassa scalata una sola volta');
        assert.ok(notifications.some(n => n.type === 'success'), 'conferma mostrata al giocatore');
    });

    test('fondi insufficienti: rifiutato, NESSUNA spesa, NESSUNA stanza', async () => {
        const env = envAcceso();
        const { sandbox, notifications } = env;
        const spese = spiaSpend(sandbox);

        sandbox.gameState.cash = 100000; // meno di 180000
        await sandbox.window.hqUpgradeRoom('roma', 'workshop');

        assert.deepEqual(spese, [], 'CE_money.spend non deve nemmeno essere chiamato');
        assert.equal(sandbox.window.hqGetRoomLevel('roma', 'workshop'), 0, 'nessuna stanza costruita');
        assert.equal(sandbox.gameState.cash, 100000, 'cassa intatta');
        assert.ok(notifications.some(n => /Fondi insufficienti/.test(n.msg)),
            'il giocatore deve vedere il motivo del rifiuto');
    });

    test('reqRep: chi non ha la reputazione richiesta è bloccato prima di ogni spesa', async () => {
        const env = envAcceso();
        const { sandbox, notifications } = env;
        const spese = spiaSpend(sandbox);

        // garage_main Lv1→Lv2: cost 100000 ma reqRep 1. Cassa abbondante, reputazione zero.
        sandbox.gameState.cash = 500000;
        sandbox.gameState.reputation = 0;
        await sandbox.window.hqUpgradeRoom('roma', 'garage_main');

        assert.equal(sandbox.window.hqGetRoomLevel('roma', 'garage_main'), 1, 'livello invariato');
        assert.deepEqual(spese, [], 'nessuna spesa quando il requisito di reputazione blocca');
        assert.ok(notifications.some(n => /Reputazione insufficiente/.test(n.msg)));
    });

    test('il livello raggiunto sopravvive al ricaricamento', async () => {
        const env = envAcceso();
        const { sandbox } = env;
        sandbox.gameState.cash = 300000;
        sandbox.gameState.reputation = 0;
        await sandbox.window.hqUpgradeRoom('roma', 'workshop');
        assert.equal(sandbox.window.hqGetRoomLevel('roma', 'workshop'), 1);

        // Snapshot dello stato, come lo salverebbe il gioco.
        const salvato = JSON.parse(JSON.stringify(sandbox.gameState.hqs));

        // Ricaricamento: ambiente NUOVO, stato ripristinato dal salvataggio.
        const env2 = freshEnv();
        env2.sandbox.HQ_ENABLED = true;
        env2.sandbox.gameState.hqs = salvato;
        env2.sandbox.window.hqInit(); // la init NON deve azzerare ciò che è già lì

        assert.equal(env2.sandbox.window.hqGetRoomLevel('roma', 'workshop'), 1,
            'la stanza deve essere ancora lì dopo il ricaricamento');
        const fx = env2.sandbox.window.hqAllEffects();
        assert.equal(fx.autoRepairDaily, 10, 'gli effetti della stanza tornano attivi dopo il reload');
    });
});
