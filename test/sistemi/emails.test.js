'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/emails — inbox CEO (ui-emails.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 37. File fuori dai CORE_FILES: caricato
   in aggiunta (renderTabEmails resta stub del banco).

   · resolveEmail(id)            — segna l'email `resolved` e ridisegna.
   · collectBrokerEmail(id,gain) — idem, con effetto particelle se chiamata da un
     elemento (this).
   · setInboxTab(tab)            — cambia la sotto-scheda (`window._inboxTab`) e
     ridisegna.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function emailsEnv() {
    const env = createGameEnv([...CORE_FILES, 'ui-emails.js'], {});
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/emails', () => {
    let env, w, ridisegni;

    beforeEach(() => {
        env = emailsEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        ridisegni = 0;
        w.renderTabEmails = () => { ridisegni++; };
        w.gameState.emails = [
            { id: 'e1', type: 'ceo_event', status: 'unread' },
            { id: 'e2', type: 'broker', status: 'unread' },
        ];
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;
    const email = (id) => gs().emails.find(e => e.id === id);

    test('resolveEmail: segna l\'email risolta e ridisegna', () => {
        w.resolveEmail('e1');
        assert.equal(email('e1').status, 'resolved');
        assert.equal(ridisegni, 1, 'la scheda non è stata ridisegnata');
    });

    test('collectBrokerEmail: segna risolta e ridisegna (senza this non tenta le particelle)', () => {
        w.collectBrokerEmail('e2', 5000);
        assert.equal(email('e2').status, 'resolved');
        assert.equal(ridisegni, 1);
    });

    test('setInboxTab: cambia la sotto-scheda e ridisegna', () => {
        w.setInboxTab('archivio');
        assert.equal(w._inboxTab, 'archivio');
        assert.equal(ridisegni, 1);
    });
});
