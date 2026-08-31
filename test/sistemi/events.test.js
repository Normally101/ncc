'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/events — i cinque adattatori generici dell'event-delegation (events.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 19. Nessuna logica di gioco: sono i
   mattoncini che i data-ce-act compongono — rimuovi un elemento, inoltra un
   click, "setta e ridisegna", "aggiorna e poi ridisegna", "setta e sposta la
   classe active". Il difetto che possono nascondere: agire sull'elemento o sulla
   proprietà sbagliata, o dimenticare il secondo passo (il render).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/events', () => {
    let env, w, doc;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        doc = env.sandbox.document;
    });
    afterEach(() => env.stopAllIntervals());

    test('ceRemove: toglie dal DOM l\'elemento con quell\'id', () => {
        const el = doc.createElement('div'); el.id = 'da-togliere';
        doc.body.appendChild(el);
        w.ceRemove('da-togliere');
        assert.equal(doc.getElementById('da-togliere'), null);
        w.ceRemove('inesistente');   // non deve esplodere
    });

    test('ceClick: inoltra il click all\'elemento con quell\'id', () => {
        const el = doc.createElement('button'); el.id = 'nascosto';
        let clicked = 0;
        el.addEventListener('click', () => clicked++);
        doc.body.appendChild(el);
        w.ceClick('nascosto');
        assert.equal(clicked, 1);
    });

    test('ceThen: chiama refreshFn(true) e POI renderFn(arg)', async () => {
        const ordine = [];
        w.mioRefresh = async (flag) => { ordine.push(['refresh', flag]); };
        w.mioRender  = (arg) => { ordine.push(['render', arg]); };

        w.ceThen('mioRefresh', 'mioRender', 'tab-x');
        await new Promise(r => setImmediate(r));

        assert.deepEqual(ordine, [['refresh', true], ['render', 'tab-x']]);
    });

    test('ceThen: se refreshFn non è una funzione, chiama comunque renderFn', () => {
        let reso = false;
        w.mioRender = () => { reso = true; };
        w.ceThen('nonEsiste', 'mioRender', null);
        assert.equal(reso, true);
    });

    test('ceSetRender: scrive window[obj][prop] e poi ridisegna', () => {
        let disegnato = 0;
        w.mioRender = () => disegnato++;
        w.ceSetRender('_mioStato', 'vista', 'griglia', 'mioRender');
        assert.equal(w._mioStato.vista, 'griglia');
        assert.equal(disegnato, 1);

        w.ceSetRender('_mioScalare', null, 42, 'mioRender');
        assert.equal(w._mioScalare, 42);
    });

    test('ceSetActive: setta il valore e sposta la classe "active" sul bottone premuto', () => {
        const a = doc.createElement('button'); a.className = 'grp active';
        const b = doc.createElement('button'); b.className = 'grp';
        doc.body.append(a, b);

        w.ceSetActive.call(b, '_filtro', 'stato', 'aperti', '.grp');

        assert.equal(w._filtro.stato, 'aperti');
        assert.equal(b.classList.contains('active'), true);
        assert.equal(a.classList.contains('active'), false, 'il vecchio attivo doveva perdere la classe');
    });
});
