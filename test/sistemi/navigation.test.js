'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/navigation — cambio scheda, hub, overlay mappa, sidebar.

   Fase 3 di PIANO-CHIUSURA.md, sistema 35. File fuori dai CORE_FILES del banco
   (dispatcher.js, ui-hub.js, ui-sidebar.js): qui vengono caricati in aggiunta,
   con render:true, per rendere collaudabili le loro azioni di sola interfaccia.

   · switchTab(tab)        — imposta la scheda attiva (titolo + classe .active);
     una scheda "spenta" (window.tabSpenta) rimanda a home.
   · openMapOverlay() / closeMapOverlay() — mostra/nasconde #map-overlay.
   · closeHub()            — nasconde #hub-modal.
   · hubNavigate(tab)      — chiude l'hub e poi cambia scheda.
   · _sidebarToggle(group) — apre un gruppo della sidebar e chiude gli altri.
   · toggleSidebar(open)   — fa scorrere dentro/fuori #sidebar-player.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

const EXTRA = ['dispatcher.js', 'ui-hub.js', 'ui-sidebar.js'];

function navEnv() {
    const env = createGameEnv([...CORE_FILES, ...EXTRA], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/navigation — switchTab / overlay mappa', () => {
    let env, w, doc;

    beforeEach(() => {
        env = navEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        const title = doc.createElement('div'); title.id = 'panel-title'; doc.body.appendChild(title);
        w._tabUnlock = () => ({ ok: true });
        w.tabSpenta = () => false;
        w.renderTabHome = () => { doc.getElementById('tab-container').innerHTML = 'HOME'; };
        w.kbMontaPulsanteAiuto = () => {};
        w.kbAggiornaPulsanteAiuto = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    function navBtn(tab) {
        const b = doc.createElement('button');
        b.className = 'nav-btn'; b.setAttribute('data-tab', tab);
        doc.body.appendChild(b);
        return b;
    }

    test('switchTab: imposta titolo e classe .active sulla scheda scelta', () => {
        const home = navBtn('home');
        w.switchTab('home');
        assert.equal(doc.getElementById('panel-title').innerText, '🏠 Command Center');
        assert.ok(home.classList.contains('active'), 'la scheda scelta non è attiva');
    });

    test('switchTab: una scheda spenta rimanda a home', () => {
        navBtn('home'); navBtn('crypto');
        w.tabSpenta = (t) => t === 'crypto';
        w.switchTab('crypto');
        assert.equal(doc.getElementById('panel-title').innerText, '🏠 Command Center', 'non è tornato a home');
    });

    test('openMapOverlay / closeMapOverlay: mostra e nasconde #map-overlay', () => {
        const ov = doc.createElement('div'); ov.id = 'map-overlay'; ov.classList.add('hidden');
        doc.body.appendChild(ov);

        w.openMapOverlay();
        assert.ok(!ov.classList.contains('hidden'), 'l\'overlay non è stato mostrato');
        assert.equal(w._mapOverlayOpen, true);

        w.closeMapOverlay();
        assert.ok(ov.classList.contains('hidden'), 'l\'overlay non è stato nascosto');
        assert.equal(w._mapOverlayOpen, false);
    });

    test('openMapOverlay: senza #map-overlay non esplode e non segna lo stato', () => {
        w.openMapOverlay();
        assert.notEqual(w._mapOverlayOpen, true);
    });
});

describe('sistemi/navigation — hub e sidebar', () => {
    let env, w, doc;

    beforeEach(() => {
        env = navEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
    });
    afterEach(() => env.stopAllIntervals());

    test('closeHub: nasconde #hub-modal', () => {
        const m = doc.createElement('div'); m.id = 'hub-modal';
        m.classList.add('hub-modal-open');
        doc.body.appendChild(m);

        w.closeHub();

        assert.ok(m.classList.contains('hidden'), 'l\'hub non è stato nascosto');
        assert.ok(!m.classList.contains('hub-modal-open'));
    });

    test('hubNavigate: chiude l\'hub e poi cambia scheda', () => {
        const m = doc.createElement('div'); m.id = 'hub-modal'; doc.body.appendChild(m);
        let andatoA = null;
        w.switchTab = (t) => { andatoA = t; };

        w.hubNavigate('fleet');
        assert.ok(m.classList.contains('hidden'), 'l\'hub non è stato chiuso subito');

        return new Promise(r => setTimeout(r, 120)).then(() => {
            assert.equal(andatoA, 'fleet', 'non è passato alla scheda richiesta');
        });
    });

    test('_sidebarToggle: apre il gruppo scelto e chiude gli altri', () => {
        const nav = doc.createElement('div'); nav.id = 'sidebar-nav'; doc.body.appendChild(nav);
        function group(name, open) {
            const g = doc.createElement('div'); g.className = 'sidebar-group'; g.dataset.group = name;
            const head = doc.createElement('div'); head.className = 'sidebar-group-head';
            if (open) head.classList.add('open');
            const body = doc.createElement('div'); body.className = 'sidebar-group-body';
            g.append(head, body); nav.appendChild(g);
            return { head, body };
        }
        const a = group('operations', true);
        const b = group('finance', false);

        w._sidebarToggle('finance');

        assert.ok(b.head.classList.contains('open'), 'il gruppo scelto non si è aperto');
        assert.ok(!a.head.classList.contains('open'), 'l\'altro gruppo non si è chiuso');
    });

    test('toggleSidebar: fa scorrere dentro/fuori #sidebar-player', () => {
        const sb = doc.createElement('div'); sb.id = 'sidebar-player'; doc.body.appendChild(sb);

        w.toggleSidebar(true);
        assert.equal(sb.style.transform, 'translateX(0)');

        w.toggleSidebar(false);
        assert.equal(sb.style.transform, 'translateX(-160px)');
    });
});
