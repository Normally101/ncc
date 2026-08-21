'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('hq — build modal slot visuale', () => {
    test('hq-visual.js esporta hqOpenBuildModalSlot e apre il modale per lo slot indicato', () => {
        const env = createGameEnv([...CORE_FILES, 'hq-visual.js'], { render: true });
        const { sandbox } = env;
        sandbox.initGame(true);
        env.stopAllIntervals();
        sandbox.window.hqInit();

        assert.equal(typeof sandbox.window.hqOpenBuildModalSlot, 'function', 'hqOpenBuildModalSlot deve esistere su window');

        // hqOpenBuildModalSlot accetta cityId, slotIndex e apre il modale di scelta stanza per quello slot
        sandbox.window.hqOpenBuildModalSlot('roma', 2);
        const modalSlot = sandbox.document.getElementById('hq-build-modal');
        assert.ok(modalSlot, 'hqOpenBuildModalSlot deve creare il modale nel DOM');
        assert.match(modalSlot.innerHTML, /Lotto 2/, 'il modale slot deve fare riferimento al lotto/slot indicato');
        modalSlot.remove();
    });

    test('hqOpenBuildModalSlot mostra solo le stanze disponibili con prerequisiti soddisfatti', () => {
        const env = createGameEnv([...CORE_FILES, 'hq-visual.js'], { render: true });
        const { sandbox } = env;
        sandbox.initGame(true);
        env.stopAllIntervals();
        sandbox.window.hqInit();

        // garage_main e' gia' a livello 1 in roma, workshop ha prerequisito garage_main
        sandbox.window.hqOpenBuildModalSlot('roma', 1);
        const modal = sandbox.document.getElementById('hq-build-modal');
        assert.ok(modal, 'modale aperto');
        assert.match(modal.innerHTML, /Officina/, 'deve proporre workshop che ha i prerequisiti');
        modal.remove();
    });
});
