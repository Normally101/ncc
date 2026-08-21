'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('hq — build modal firme distinte', () => {
    test('hq.js e hq-visual.js esportano funzioni distinte per stanza e slot', () => {
        const env = createGameEnv([...CORE_FILES, 'hq-visual.js'], { render: true });
        const { sandbox } = env;
        sandbox.initGame(true);
        env.stopAllIntervals();
        sandbox.window.hqInit();

        // Entrambe le funzioni devono essere distinte e raggiungibili
        assert.equal(typeof sandbox.window.hqOpenBuildModalStanza, 'function', 'hqOpenBuildModalStanza deve esistere su window');
        assert.equal(typeof sandbox.window.hqOpenBuildModalSlot, 'function', 'hqOpenBuildModalSlot deve esistere su window');

        // hqOpenBuildModalStanza accetta roomId e apre il modale di scelta slot
        sandbox.window.hqOpenBuildModalStanza('workshop');
        const modalStanza = sandbox.document.getElementById('hq-build-modal');
        assert.ok(modalStanza, 'hqOpenBuildModalStanza deve creare il modale nel DOM');
        assert.match(modalStanza.innerHTML, /Officina/, 'il modale stanza deve contenere il nome della stanza da posizionare');
        modalStanza.remove();

        // hqOpenBuildModalSlot accetta cityId, slotIndex e apre il modale di scelta stanza per quello slot
        sandbox.window.hqOpenBuildModalSlot('roma', 2);
        const modalSlot = sandbox.document.getElementById('hq-build-modal');
        assert.ok(modalSlot, 'hqOpenBuildModalSlot deve creare il modale nel DOM');
        assert.match(modalSlot.innerHTML, /Lotto 2/, 'il modale slot deve fare riferimento al lotto/slot indicato');
        modalSlot.remove();
    });
});
