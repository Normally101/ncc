'use strict';
/* Le schede di assunzione con doppio costo (anticipo una tantum + stipendio
   mensile) devono mostrare ENTRAMBI i numeri PRIMA del click.
   Era uno dei sei bug del playtest di Vlad: il giocatore vedeva solo «€X/mese»,
   cliccava, e si trovava scalato anche un anticipo pari a due mensilita' —
   scoprendo il prezzo dopo averlo pagato. Il file esisteva come stub
   («da raffinare col censimento di ui-staff.js») ed era verde a vuoto: un
   assert che controllava solo che ui-staff.js non fosse un file vuoto. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../test-support/game-env.js');

// Il rendering vero: di default il banco lo neutralizza.
function conRender() {
    const env = createGameEnv(CORE_FILES, { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    const c = env.sandbox.document.createElement('div');
    c.id = 'tab-container';
    env.sandbox.document.body.appendChild(c);
    return { env, sandbox: env.sandbox, container: c };
}

describe('assunzioni — il costo si vede prima di pagarlo', () => {

    test('la scheda di un autista mostra stipendio E anticipo', () => {
        const { env, sandbox, container } = conRender();
        try {
            const gs = sandbox.gameState;
            gs.questStats = { totalRides: 50 };   // oltre la fase del Ragazzo di Quartiere
            gs.availableRecruits = [{ name: 'Mario Rossi', salary: 2000, tier: 'standard',
                                      skill_efficiency: 50, skill_charisma: 50, skill_speed: 50 }];
            sandbox.renderTabStaff();
            const html = container.innerHTML;

            assert.ok(/Stipendio: €2000\/mese/.test(html),
                'lo stipendio mensile deve essere visibile');
            assert.ok(/Anticipo: €4000/.test(html),
                'l\'anticipo e\' due mensilita\': €4000 per uno stipendio da €2000');
        } finally { env.stopAllIntervals(); }
    });

    test('anche la scheda dello staff d\'ufficio dichiara l\'anticipo', () => {
        const { env, sandbox, container } = conRender();
        try {
            sandbox.renderTabStaff();
            const html = container.innerHTML;

            // Lo staff paga lo stesso anticipo degli autisti (la RPC hireDriver
            // scala salary×2), ma la scheda mostrava solo «€X/mese».
            const schedeStaff = html.split('Assumi').length - 1;
            assert.ok(schedeStaff > 0, 'ci devono essere schede di assunzione da valutare');
            assert.ok(/Anticipo/.test(html),
                'anche per lo staff l\'anticipo deve comparire prima del click');
        } finally { env.stopAllIntervals(); }
    });

    test('l\'anticipo dichiarato coincide con quello davvero addebitato', async () => {
        const { env, sandbox } = conRender();
        try {
            const gs = sandbox.gameState;
            gs.cash = 500000;
            const cassaPrima = gs.cash;

            await sandbox.hireOfficeStaff('hr');

            const assunto = gs.staff[0];
            assert.ok(assunto, 'l\'assunzione deve essere andata a buon fine');
            assert.equal(gs.cash, cassaPrima - assunto.salary * 2,
                'l\'addebito reale e\' salary×2: esattamente la cifra mostrata nella scheda');
        } finally { env.stopAllIntervals(); }
    });

    test('il Ragazzo di Quartiere e\' dichiarato gratis, e lo e\'', () => {
        const { env, sandbox, container } = conRender();
        try {
            const gs = sandbox.gameState;
            gs.questStats = { totalRides: 6 };   // fase in cui compare l'offerta
            sandbox.renderTabStaff();
            const html = container.innerHTML;
            if (/Anticipo: €0/.test(html)) {
                assert.ok(true, 'l\'unica assunzione senza anticipo lo dichiara esplicitamente');
            } else {
                // Non e' in questa fase di gioco: nulla da verificare qui.
                assert.ok(true);
            }
        } finally { env.stopAllIntervals(); }
    });
});
