'use strict';
// Primo collaudo delle azioni del sistema "staff & quartier generale" che nessun
// test esercitava davvero (solo controlli `typeof` nei guardrail).
//
// Azioni qui sotto, con la porta del denaro:
//   - fireStaff        : NON muove denaro → si verifica l'effetto sullo stato.
//   - hireOfficeStaff  : muove denaro SOLO tramite la RPC ServerState.hireDriver
//                        (contratto rpc_hire_driver: costo = salary*2, scala il server,
//                        il client non tocca cash in locale) → si spiatura la RPC.
//   - hqSwitchCity     : non muove denaro → effetto sullo stato.
//   - _hqBuildFromList : passa da hqUpgradeRoom → CE_money.spend (già coperto dallo
//                        spy in test/azioni/hq.test.js); qui si verifica il flusso
//                        lista→slot griglia che nessuno esercitava.
//   - closeModals      : solo DOM.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

// STAFF_ROLES è dichiarato `const` in data.js: dentro il contesto VM vive nel binding
// lessicale globale e NON diventa proprietà della sandbox. Si legge rivalutando il
// simbolo nel contesto (stesso identico oggetto che vede hireOfficeStaff).
function simboloContesto(sandbox, nome) {
    return vm.runInContext(nome, sandbox);
}

// Spiatura di ServerState.hireDriver: registra le chiamate e poi fa fare il lavoro
// vero al mock fedele (che scala cash di salary*2 come rpc_hire_driver). Se un domani
// hireOfficeStaff mutasse cash direttamente senza passare dalla RPC, lo spy registrerebbe
// zero chiamate mentre la cassa cambia: il test diventa ROSSO.
function spiaHireDriver(sandbox) {
    const chiamate = [];
    const originale = sandbox.ServerState.hireDriver.bind(sandbox.ServerState);
    sandbox.ServerState.hireDriver = async (name, salary, tier) => {
        chiamate.push({ name, salary, tier });
        return originale(name, salary, tier);
    };
    return chiamate;
}

describe('ui-staff — fireStaff (licenzia staff d\u2019ufficio)', () => {
    test('rimuove il membro dal roster dopo conferma e avvisa il giocatore', () => {
        const { sandbox, notifications } = freshEnv();
        sandbox.gameState.staff.push({ id: 'hr', name: 'HR Manager', salary: 1200 });
        const prima = sandbox.gameState.staff.length;

        sandbox.window.fireStaff('hr');

        assert.equal(sandbox.gameState.staff.length, prima - 1, 'un membro in meno');
        assert.ok(!sandbox.gameState.staff.some(s => s.id === 'hr'), 'non deve pi\u00f9 essere nel roster');
        assert.ok(notifications.some(n => n.type === 'warning'), 'notifica di licenziamento mostrata');
    });

    test('id inesistente: nessun cambiamento, nessuna notifica', () => {
        const { sandbox, notifications } = freshEnv();
        sandbox.gameState.staff.push({ id: 'hr', name: 'HR Manager', salary: 1200 });

        sandbox.window.fireStaff('inesistente');

        assert.equal(sandbox.gameState.staff.length, 1, 'roster intatto');
        assert.equal(notifications.filter(n => n.type === 'warning').length, 0,
            'nessun licenziamento \u00e8 avvenuto, nessun avviso');
    });
});

describe('ui-staff — hireOfficeStaff (assunzione staff d\u2019ufficio)', () => {
    test('passa DALLA RPC ServerState.hireDriver e il costo salary*2 arriva in cassa una volta sola', async () => {
        const { sandbox, notifications } = freshEnv();
        sandbox.gameState.cash = 200000;
        // Il costo vero lo detta STAFF_ROLES (fonte unica del prezzo), non il test.
        const staffRoles = simboloContesto(sandbox, 'STAFF_ROLES');
        const ruolo = Object.values(staffRoles).find(r => r.id === 'hr');
        const chiamate = spiaHireDriver(sandbox);

        await sandbox.window.hireOfficeStaff('hr');

        assert.deepEqual(chiamate.map(c => c.tier), ['STANDARD'],
            'il tier inviato al server deve restare nella whitelist di rpc_hire_driver');
        assert.equal(chiamate[0].salary, ruolo.salary, 'stipendio dichiarato = stipendio del ruolo');
        assert.ok(sandbox.gameState.staff.some(s => s.id === 'hr'), 'il ruolo risulta attivo');
        assert.equal(sandbox.gameState.cash, 200000 - ruolo.salary * 2,
            'cassa scalata esattamente del costo di assunzione salary*2, una sola volta');
        assert.ok(notifications.some(n => n.type === 'success'));
    });

    test('server che RIFIUTA (RPC tolta/null): nessun assunto, NESSUN movimento di cassa', async () => {
        // Questo \u00e8 il test che arrossisce se qualcuno "ottimizza" hireOfficeStaff
        // scrivendo la cassa in locale invece di aspettare l'esito della RPC.
        const env = freshEnv({ serverState: { hireDriver: async () => null } });
        const { sandbox, notifications } = env;
        sandbox.gameState.cash = 200000;

        await sandbox.window.hireOfficeStaff('hr');

        assert.equal(sandbox.gameState.staff.filter(s => s.id === 'hr').length, 0,
            'nessun membro aggiunto se il server non conferma');
        assert.equal(sandbox.gameState.cash, 200000, 'cassa intatta');
        assert.equal(notifications.filter(n => n.type === 'success').length, 0);
    });

    test('limite posti raggiunto: bloccato PRIMA della RPC', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 200000;
        const chiamate = spiaHireDriver(sandbox);
        // Nuova partita: maxStaff 2, 1 CEO → servono 2 occupanti per saturare.
        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Uno' });
        sandbox.gameState.drivers.push({ id: 'd2', name: 'Autista Due' });

        await sandbox.window.hireOfficeStaff('hr');

        assert.deepEqual(chiamate, [], 'nessuna RPC quando i posti sono finiti');
        assert.equal(sandbox.gameState.staff.length, 0, 'nessun assunto');
        assert.equal(sandbox.gameState.cash, 200000, 'cassa intatta');
    });
});

describe('hq — hqSwitchCity e _hqBuildFromList (flusso lista)', () => {
    test('hqSwitchCity cambia la sede corrente', () => {
        const env = freshEnv();
        const { sandbox } = env;
        env.sandbox.HQ_ENABLED = true;
        sandbox.window.hqInit();

        const altra = sandbox.HQ_CITIES.find(c => c.id !== 'roma');
        sandbox.window.hqSwitchCity(altra.id);

        assert.equal(sandbox.gameState.currentHQCity, altra.id, 'la sede corrente \u00e8 cambiata');
    });

    test('_hqBuildFromList costruisce la stanza E la aggancia al primo slot libero della griglia', async () => {
        const env = freshEnv();
        const { sandbox, notifications } = env;
        env.sandbox.HQ_ENABLED = true;
        sandbox.window.hqInit();
        sandbox.gameState.currentHQCity = 'roma';
        sandbox.gameState.cash = 300000;

        sandbox.window._hqBuildFromList('workshop'); // tier 1: €180.000

        assert.equal(sandbox.window.hqGetRoomLevel('roma', 'workshop'), 1, 'stanza costruita');
        assert.ok(Object.values(sandbox.gameState.hqs['roma'].grid).includes('workshop'),
            'la stanza deve occupare uno slot della griglia cittadina');
        assert.equal(sandbox.gameState.cash, 120000, 'costo scalato una volta sola via CE_money.spend');
        assert.ok(notifications.some(n => n.type === 'success'));
    });
});

describe('ui-staff — closeModals', () => {
    test('nasconde tutti i modali aperti', () => {
        const { sandbox } = freshEnv();
        const doc = sandbox.document;
        const m1 = doc.createElement('div'); m1.id = 'modal-car';
        const m2 = doc.createElement('div'); m2.id = 'modal-academy';
        doc.body.appendChild(m1); doc.body.appendChild(m2);

        sandbox.window.closeModals();

        for (const m of [m1, m2]) {
            assert.ok(m.classList.contains('hidden'), `${m.id} deve avere la classe hidden`);
            assert.equal(m.style.display, 'none', `${m.id} deve essere display:none`);
        }
    });
});
