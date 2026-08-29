'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   funzioni/tutorial-spotlight — lo Spotlight ancorato si comporta bene.

   Vlad ha scelto questa direzione fra i cinque mock-up del 29/08 sapendo che
   e' la piu' costosa: «se l'interfaccia cambia, il tutorial punta al vuoto —
   va progettato per reggerlo». Questi test sono quel progetto messo per
   iscritto: cosa deve succedere quando il bersaglio c'e', quando non c'e',
   quando ha misura zero, e quando la pagina si muove sotto i piedi.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('../../test-support/game-env.js');

function ambiente() {
    const env = createGameEnv(['events.js', 'onboarding-core.js', 'tutorial.js'], { render: true });
    const s = env.sandbox;
    s.window.gameState = { day: 1, cash: 100, prestige: 0, questStats: { totalRides: 0 } };
    return { env, s, doc: s.document };
}

/** Un bersaglio con misure vere: jsdom da' 0×0 a tutto, quindi le si impone. */
function piantaBersaglio(doc, id, rect) {
    const el = doc.createElement('div');
    el.id = id;
    doc.body.appendChild(el);
    el.getBoundingClientRect = () => ({
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top,
    });
    return el;
}

describe('funzioni/tutorial-spotlight', () => {
    let env, s, doc;
    beforeEach(() => { ({ env, s, doc } = ambiente()); });
    afterEach(() => { try { s.window.tutorialSkip(); } catch (e) {} env.stopAllIntervals(); });

    test('col bersaglio presente compaiono anello e bolla, e l\'anello lo circonda', () => {
        piantaBersaglio(doc, 'tb-cash', { left: 100, top: 60, width: 120, height: 30 });

        s.window.startTutorial();
        s.window.tutorialNext();     // dal passo 'intro' al primo spotlight (#tb-cash)

        const ring = doc.getElementById('tut-ring');
        const bolla = doc.getElementById('tut-box');
        assert.ok(ring, 'l\'anello deve essere disegnato attorno al bersaglio');
        assert.ok(bolla, 'la bolla con la spiegazione deve esserci');
        // l'anello sta attorno: parte prima e finisce dopo il bersaglio
        assert.ok(parseFloat(ring.style.left) < 100, `l'anello deve iniziare prima del bersaglio, letto ${ring.style.left}`);
        assert.ok(parseFloat(ring.style.width) > 120, `l'anello deve essere piu' largo del bersaglio, letto ${ring.style.width}`);
    });

    test('il bersaglio resta cliccabile: viene sollevato sopra lo scrim', () => {
        const el = piantaBersaglio(doc, 'tb-cash', { left: 100, top: 60, width: 120, height: 30 });

        s.window.startTutorial();
        s.window.tutorialNext();

        assert.ok(Number(el.style.zIndex) > 9500,
            `il bersaglio deve stare sopra lo scrim per restare cliccabile, letto z-index ${el.style.zIndex}`);
    });

    test('senza bersaglio la bolla si centra e NON compare nessun anello', () => {
        // #tb-cash non esiste in questo DOM: e' il caso "l'interfaccia e' cambiata".
        s.window.startTutorial();
        s.window.tutorialNext();

        const bolla = doc.getElementById('tut-box');
        assert.ok(bolla, 'la bolla deve comparire lo stesso: il passo non si perde');
        assert.equal(doc.getElementById('tut-ring'), null,
            'senza bersaglio non si illumina niente: puntare al vuoto e\' peggio di non puntare');
        assert.match(bolla.style.transform, /translate/,
            'la bolla deve centrarsi da sola');
    });

    test('un bersaglio presente ma di misura zero conta come assente', () => {
        piantaBersaglio(doc, 'tb-cash', { left: 0, top: 0, width: 0, height: 0 });

        s.window.startTutorial();
        s.window.tutorialNext();

        assert.equal(doc.getElementById('tut-ring'), null,
            'un elemento con display:none o dentro un tab chiuso non e\' un bersaglio');
        assert.ok(doc.getElementById('tut-box'), 'la spiegazione resta');
    });

    test('la bolla dice a che punto siamo e offre sempre la via d\'uscita', () => {
        s.window.startTutorial();
        const bolla = doc.getElementById('tut-box');
        assert.match(bolla.textContent, /Passo 1 di \d+/, 'deve dire il passo corrente');
        assert.ok(bolla.querySelector('[data-ce-act="tutorialSkip"]'),
            'saltare il tutorial deve essere sempre possibile: nessun soft-lock');
        assert.ok(bolla.querySelector('[data-ce-act="tutorialNext"]'), 'e si deve poter andare avanti');
    });

    test('chiudere il tutorial ripulisce tutto e restituisce il bersaglio com\'era', () => {
        const el = piantaBersaglio(doc, 'tb-cash', { left: 100, top: 60, width: 120, height: 30 });
        el.style.zIndex = '';   // parte senza z-index proprio

        s.window.startTutorial();
        s.window.tutorialNext();
        s.window.tutorialSkip();

        assert.equal(doc.getElementById('tut-box'), null, 'la bolla deve sparire');
        assert.equal(doc.getElementById('tut-ring'), null, 'l\'anello deve sparire');
        assert.equal(doc.getElementById('tut-overlay'), null, 'lo scrim deve sparire');
        assert.equal(el.style.zIndex, '', 'il bersaglio deve tornare com\'era, senza z-index appiccicato');
    });

    test('un passo alla volta: non restano bolle vecchie in pagina', () => {
        piantaBersaglio(doc, 'tb-cash', { left: 100, top: 60, width: 120, height: 30 });
        piantaBersaglio(doc, 'tb-rep',  { left: 260, top: 60, width: 90,  height: 30 });

        s.window.startTutorial();
        s.window.tutorialNext();
        s.window.tutorialNext();

        assert.equal(doc.querySelectorAll('.ce-spot-bolla').length, 1, 'una bolla sola alla volta');
        assert.equal(doc.querySelectorAll('.ce-spot-ring').length, 1, 'un anello solo alla volta');
    });

    test('Escape chiude il tutorial', () => {
        piantaBersaglio(doc, 'tb-cash', { left: 100, top: 60, width: 120, height: 30 });
        s.window.startTutorial();
        s.window.tutorialNext();
        assert.ok(doc.getElementById('tut-box'), 'la bolla deve esserci prima del tasto');

        const ev = new s.document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        s.document.dispatchEvent(ev);

        assert.equal(doc.getElementById('tut-box'), null, 'Escape deve chiudere');
    });

    test('quando la pagina scorre, anello e bolla seguono il bersaglio', () => {
        const el = piantaBersaglio(doc, 'tb-cash', { left: 100, top: 300, width: 120, height: 30 });
        s.window.startTutorial();
        s.window.tutorialNext();
        const primaTop = doc.getElementById('tut-ring').style.top;

        // il bersaglio si sposta come se la pagina fosse scorsa
        el.getBoundingClientRect = () => ({ left: 100, top: 120, width: 120, height: 30, right: 220, bottom: 150, x: 100, y: 120 });
        assert.equal(typeof s.window._tutRiposiziona, 'function',
            'lo spotlight deve esporre il riposizionamento: e\' quello che gli eventi di scroll e resize chiamano');
        s.window._tutRiposiziona();

        const dopoTop = doc.getElementById('tut-ring').style.top;
        assert.notEqual(dopoTop, primaTop,
            'l\'anello deve inseguire il bersaglio: era il difetto della versione a canvas, che dipingeva il buco una volta sola');
    });
});
