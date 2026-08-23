'use strict';
/* ============================================================================
   Gli interruttori spengono davvero.

   `interruttori.test.js` sorveglia l'elenco di config.js: quali funzioni si
   dichiarano accese. Questo test sorveglia una cosa diversa e piu' importante:
   che la dichiarazione abbia un effetto.

   Il motivo per cui esiste e' un errore vero, del 20/08/2026. `config.js`
   elencava 16 funzioni spente e `window.attiva()` era definita — ma nessun file
   la chiamava. L'elenco era una promessa senza un meccanismo dietro: il gioco
   mostrava tutte e 21 le funzioni come prima, e la misura "5 su 21" descriveva
   un'intenzione, non la partita che un giocatore avrebbe trovato.

   Qui il codice vero (config.js, feature-gate.js, dispatcher.js) gira sulla
   pagina vera (index.html), e si controllano le due strade per arrivare a una
   parte del gioco: il menu e la chiamata diretta.

   DAL 22/08/2026 la politica si è ribaltata di nuovo (decisione di Vlad,
   HANDOFF.md): tutto il gioco resta disponibile dall'inizio, nessuna area
   sbloccabile. Le stesse due strade ora sorvegliano il contrario: che nessuna
   voce di menu stia dietro un gate. Il meccanismo (tabSpenta, foglio di stile,
   guardia in switchTab) resta caricato e funzionante — è la rete di sicurezza
   se un giorno una funzione tornerà da collaudare — ma con tutte le voci di
   FEATURES a true non deve nascondere nulla.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** La pagina vera, con i suoi script disattivati: li carichiamo noi, scelti. */
function apriIlGioco() {
    const dom = new JSDOM(leggi('index.html'), { runScripts: 'outside-only' });
    const w = dom.window;
    const ctx = dom.getInternalVMContext();
    w.console.warn = () => {};   // il rifiuto di una scheda spenta e' atteso, non un guasto

    for (const file of ['config.js', 'feature-gate.js', 'dispatcher.js']) {
        vm.runInContext(leggi(file), ctx, { filename: file });
    }
    w.applicaInterruttori();
    return w;
}

describe('guardrail — gli interruttori spengono davvero (e ora non spengono niente)', () => {
    let w;
    before(() => { w = apriIlGioco(); });

    test('ogni funzione spenta ha un meccanismo che la spegne', () => {
        const senzaMeccanismo = Object.entries(w.FEATURES)
            .filter(([nome, on]) => !on)
            .filter(([nome]) => !Object.values(w.TAB_DI).includes(nome))
            .map(([nome]) => nome);

        /* Vuoto, e deve restarci. Fino al 21/08 qui stavano vtk e vip: erano
           dichiarati spenti ma nessuna scheda li spegneva, perche' vivono dentro
           schermate accese. Ora sono accesi entrambi dopo il collaudo, quindi il
           debito e' chiuso. Se un nome ricompare qui vuol dire che qualcuno ha
           spento una funzione senza darle un modo di sparire davvero: e' il caso
           peggiore, perche' la misura dice una cosa e il giocatore ne trova
           un'altra. */
        assert.deepEqual(senzaMeccanismo.sort(), [],
            'Una funzione risulta spenta in config.js ma niente la spegne davvero.\n' +
            'O le si associa una scheda in TAB_DI, o la si spegne nel punto in cui\n' +
            'compare. Dichiararla spenta e lasciarla giocabile e\' il caso peggiore:\n' +
            'la misura dice una cosa e il giocatore ne trova un\'altra.');
    });

    test('nessuna voce di menu della pagina vera sta dietro un gate', () => {
        const voci = [...w.document.querySelectorAll('[data-tab]')];
        /* Senza questa riga il test sarebbe verde anche se la pagina restasse
           senza voci di menu: il ciclo non entri mai e la lista dei guasti
           resta vuota per finta. */
        assert.ok(voci.length > 0,
            'index.html non ha nessuna voce [data-tab]: il test non controlla niente.');

        const nascoste = [...new Set(
            voci.map(el => el.getAttribute('data-tab')).filter(tab => w.tabSpenta(tab))
        )];
        /* Vuoto dal 22/08, e deve restarci: una scheda che ricompare qui è
           stata rispenta in config.js contro la decisione che tutto il gioco
           sia disponibile dall'inizio. */
        assert.deepEqual(nascoste, [],
            'Queste schede risultano spente ma sono nel menu del giocatore.\n' +
            'Nessuna area del gioco deve stare dietro un gate.');
    });

    test('le scorciatoie della home portano tutte a schede raggiungibili', () => {
        const target = [...w.document.querySelectorAll('[data-ce-act="hubNavigate"]')]
            .map(el => JSON.parse(el.getAttribute('data-ce-args') || '[]')[0])
            .filter(tab => typeof tab === 'string');

        const chiuse = [...new Set(target.filter(tab => w.tabSpenta(tab)))];
        assert.deepEqual(chiuse, [],
            'Queste scorciatoie della home puntano a schede dietro un gate:\n' +
            'il giocatore ci clicca sopra e non capisce.');
    });

    test('switchTab non ha piu\u0300 nulla da rifiutare', () => {
        /* La guardia in dispatcher.js resta in piedi per il futuro; con tutte
           le funzioni accese nessuna scheda deve finirci dentro. */
        const spente = Object.keys(w.TAB_DI).filter(t => w.tabSpenta(t));
        assert.deepEqual(spente, [],
            'tabSpenta() spegne ancora qualcosa: switchTab la bloccherebbe e la\n' +
            'scheda risulterebbe invisibile o cliccata a vuoto per il giocatore.');
    });

    test('una scheda accesa passa senza ostacoli', () => {
        assert.equal(w.tabSpenta('corse'), false);
        assert.equal(w.tabSpenta('fleet'), false, 'la flotta e\' accesa: non deve essere in TAB_DI da spenta');
        assert.equal(w.tabSpenta('home'), false, 'la home non si spegne mai');
    });
});
