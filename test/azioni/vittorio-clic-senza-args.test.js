'use strict';
// Regressione 29/08: cliccare "Ripaga" nel modal di Vittorio mandava la cassa a NaN.
// Il bottone e' generato con data-ce-act="repayVittorio" e SENZA data-ce-args, quindi
// events.js invoca fn.apply(el, [].concat([ev])) => il primo parametro `amount` e' un
// Event. `amount != null` era true, Math.min(Event, ...) = NaN, la guardia `pay <= 0`
// non scattava (NaN <= 0 e' false) e g.cash diventava NaN. Da li' i tre sintomi visti
// da Vlad: "Pagati €0 a Vittorio. Residuo: €0", il not-null constraint sulla colonna
// cash lato server, e "Saldo non valido corretto automaticamente" al giro dopo.
//
// Il test esercita il CLIC VERO (jsdom + events.js), non la chiamata diretta: e' la
// differenza fra vedere il bug e non vederlo.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('../../test-support/game-env.js');

function envConDebito({ outstanding, cash }) {
    // onboarding-core.js serve perche' ensureDebt() interroga window.ceOnb.veteran().
    // { render: true } perche' il banco stubba di default ogni `open*Modal`: qui il
    // modal VERO serve, e' il bottone che genera a portare il bug.
    const { sandbox } = createGameEnv(['events.js', 'onboarding-core.js', 'vittorio.js'], { render: true });
    sandbox.window.gameState = {
        day: 1,
        cash,
        prestige: 0,
        reputation: 5.0,
        drivers: [],
        fleet: [],
        vittorioDebt: {
            principal: 500, outstanding, status: 'active',
            startDay: 1, lastAccrualDay: 1, lastNagDay: 1, finalNoticeShown: false,
        },
    };
    return sandbox;
}

// Apre il modal e clicca davvero il bottone "Ripaga", come fa il giocatore.
function cliccaRipaga(sandbox) {
    sandbox.window.openVittorioModal();
    const modal = sandbox.document.getElementById('vittorio-modal');
    assert.ok(modal, 'il modal di Vittorio deve essere montato nel DOM');
    const btn = modal.querySelector('[data-ce-act="repayVittorio"]');
    assert.ok(btn, 'il bottone di pagamento deve esistere nel modal');
    btn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
    return btn;
}

describe('azioni/vittorio-clic-senza-args — il clic non manda la cassa a NaN', () => {

    test('cliccare "Ripaga" con contanti paga davvero e lascia la cassa un numero finito', () => {
        const sandbox = envConDebito({ outstanding: 200, cash: 500 });

        cliccaRipaga(sandbox);

        const g = sandbox.window.gameState;
        assert.ok(Number.isFinite(g.cash), `la cassa deve restare un numero finito, letto: ${g.cash}`);
        assert.equal(g.cash, 300, 'il clic deve scalare i 200 del debito dalla cassa');
        assert.equal(g.vittorioDebt.outstanding, 0, 'il debito deve chiudersi');
        assert.equal(g.vittorioDebt.status, 'repaid', 'lo stato deve passare a saldato');
    });

    test('cliccare "Ripaga" con cassa inferiore al debito paga il parziale, non NaN', () => {
        const sandbox = envConDebito({ outstanding: 800, cash: 300 });

        cliccaRipaga(sandbox);

        const g = sandbox.window.gameState;
        assert.ok(Number.isFinite(g.cash), `la cassa deve restare un numero finito, letto: ${g.cash}`);
        assert.equal(g.cash, 0, 'con 300 in cassa e 800 di debito il clic deve svuotare la cassa');
        assert.equal(g.vittorioDebt.outstanding, 500, 'il residuo deve scendere di quanto pagato');
        assert.equal(g.vittorioDebt.status, 'active', 'il debito resta aperto');
    });

    test('cliccare "Ripaga" col debito gia\' a zero non tocca il saldo', () => {
        const sandbox = envConDebito({ outstanding: 0, cash: 1000 });

        sandbox.window.openVittorioModal();
        const modal = sandbox.document.getElementById('vittorio-modal');
        if (modal) {
            const btn = modal.querySelector('[data-ce-act="repayVittorio"]');
            if (btn) btn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
        }

        const g = sandbox.window.gameState;
        assert.equal(g.cash, 1000, 'con residuo 0 la cassa non deve muoversi di un centesimo');
        assert.ok(Number.isFinite(g.cash), 'la cassa non deve diventare NaN');
    });

    test('repayVittorio invocata con un valore non numerico ripaga il possibile invece di corrompere la cassa', () => {
        const sandbox = envConDebito({ outstanding: 200, cash: 500 });

        // Chiamata diretta col tipo sbagliato: e' quello che arriva dal DOM.
        sandbox.window.repayVittorio({ type: 'click' });

        const g = sandbox.window.gameState;
        assert.ok(Number.isFinite(g.cash), `la cassa deve restare un numero finito, letto: ${g.cash}`);
        assert.equal(g.cash, 300, 'un argomento non numerico significa "paga quanto consente la cassa"');
    });

    test('il saldo mandato al server non e\' mai NaN (era la causa del not-null constraint)', () => {
        let inviati = [];
        const sandbox = envConDebito({ outstanding: 200, cash: 500 });
        sandbox.window.ServerState = {
            syncCash: async (cash) => { inviati.push(cash); return { success: true, cash }; },
        };

        cliccaRipaga(sandbox);

        assert.equal(inviati.length, 1, 'il pagamento deve produrre una sola scrittura verso il server');
        assert.ok(
            Number.isFinite(inviati[0]),
            `il valore inviato al server sarebbe serializzato come null se non finito, inviato: ${inviati[0]}`
        );
        assert.equal(inviati[0], 300, 'il server deve ricevere il saldo aggiornato');
    });
});
