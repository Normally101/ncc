'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('Funzione carriera — Smoke test', () => {
    test('caricamento corretto e presenza globali', () => {
        const env = freshEnv({ render: true });
        assert.equal(typeof env.sandbox.openCareerModal, 'function');
        assert.equal(typeof env.sandbox.closeCareerModal, 'function');
        assert.equal(typeof env.sandbox.renderTabCareer, 'function');
        assert.equal(typeof env.sandbox.startMissionRun, 'function');
        assert.equal(typeof env.sandbox._showBivioModal, 'function');
        assert.equal(typeof env.sandbox._applyBivioChoice, 'function');
        assert.equal(typeof env.sandbox.claimQuestReward, 'function');
        assert.equal(typeof env.sandbox.checkQuestProgress, 'function');
        assert.equal(typeof env.sandbox.completeMissionRun, 'function');
        assert.equal(typeof env.sandbox.getMissionRequires, 'function');
        env.stopAllIntervals();
    });
});
