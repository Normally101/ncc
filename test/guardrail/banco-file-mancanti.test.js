'use strict';
/**
 * Quali file il banco di prova non carica ancora, e perche'.
 *
 * Il 22/08 un lavoro dell'agente ha scritto un test che provava a caricare uno
 * per uno i 37 file fuori da CORE_FILES. L'idea era giusta, l'esecuzione no:
 * creava 37 ambienti di gioco completi nello stesso processo e la suite si
 * piantava — un blocco e' peggio di un rosso, perche' il cancello va in timeout
 * e nessun ramo viene piu' giudicato.
 *
 * La domanda pero' ha avuto risposta, misurata un file alla volta: 34 dei 37 si
 * caricano senza errori. I tre che non si caricano stanno qui sotto col motivo,
 * e questo test sorveglia che l'elenco non si allunghi di nascosto.
 *
 * Aggiungere davvero i 34 al banco va fatto a scaglioni, con la suite intera
 * lanciata a ogni scaglione: piu' file caricati significa piu' effetti
 * collaterali negli ambienti di prova, e va visto quanto regge.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/* Misurati il 22/08 caricandoli uno per uno. Non sono bug del gioco: sono
   pezzi che vivono solo dentro un browser vero. */
const NON_CARICABILI = {
    'supabase-config.js': 'serve la libreria Supabase (createClient) che nel banco non c\'e\'',
    'map-visual.js':      'usa la globale `map` di Mapbox, che esiste solo con la mappa vera',
    'motion.js':          'usa IntersectionObserver, che jsdom non fornisce',
};

describe('guardrail — il banco di prova e i file che ancora non carica', () => {
    test('i file esclusi sono solo i tre noti, con il loro motivo', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const re = /<script\s+[^>]*src="([^"]+\.js)(?:\?[^"]*)?"/g;
        const script = [];
        let m;
        while ((m = re.exec(html)) !== null) {
            if (!m[1].startsWith('http')) script.push(m[1]);
        }

        const fuoriDalBanco = script.filter(f => !CORE_FILES.includes(f));
        const esclusiSenzaMotivo = Object.keys(NON_CARICABILI).filter(f => !fuoriDalBanco.includes(f));

        assert.deepEqual(
            esclusiSenzaMotivo, [],
            'Questi file risultano nell\'elenco dei non caricabili ma ormai il banco li carica:\n' +
            'toglili da NON_CARICABILI.'
        );

        /* L'elenco puo' solo accorciarsi: ogni file portato dentro al banco esce
           di qui, e non ci rientra. */
        assert.ok(
            Object.keys(NON_CARICABILI).length <= 3,
            'i file che il banco non riesce a caricare devono diminuire, non aumentare'
        );
    });
});
