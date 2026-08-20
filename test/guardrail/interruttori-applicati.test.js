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

/** I selettori che il foglio di stile generato usa per nascondere le porte. */
function selettoriNascosti(w) {
    const foglio = w.document.getElementById('feature-gate-style');
    assert.ok(foglio, 'feature-gate.js non ha scritto nessun foglio di stile');
    return foglio.textContent
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('{')[0]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

describe('guardrail — gli interruttori spengono davvero', () => {
    let w, nascosti;
    before(() => { w = apriIlGioco(); nascosti = selettoriNascosti(w); });

    test('ogni funzione spenta ha un meccanismo che la spegne', () => {
        const senzaMeccanismo = Object.entries(w.FEATURES)
            .filter(([nome, on]) => !on)
            .filter(([nome]) => !Object.values(w.TAB_DI).includes(nome))
            .map(([nome]) => nome);

        /* vtk e vip non hanno una scheda propria: vivono dentro schermate accese
           e vanno spenti nel punto in cui compaiono. Finche' quel lavoro non e'
           fatto, restano qui dichiarati — ma dichiarati, non dimenticati. */
        assert.deepEqual(senzaMeccanismo.sort(), ['vip', 'vtk'],
            'Una funzione risulta spenta in config.js ma niente la spegne davvero.\n' +
            'O le si associa una scheda in TAB_DI, o la si spegne nel punto in cui\n' +
            'compare. Dichiararla spenta e lasciarla giocabile e\' il caso peggiore:\n' +
            'la misura dice una cosa e il giocatore ne trova un\'altra.');
    });

    test('nessuna porta d\'ingresso resta aperta nella pagina vera', () => {
        const aperte = [];
        let esaminate = 0;
        for (const el of w.document.querySelectorAll('[data-tab]')) {
            const tab = el.getAttribute('data-tab');
            if (!w.tabSpenta(tab)) continue;
            esaminate++;
            if (!nascosti.some(sel => el.matches(sel))) aperte.push(tab);
        }
        /* Senza questa riga il test diventa verde proprio quando il guardiano
           smette di funzionare: se niente risulta spento, il ciclo non entra
           mai nel corpo e la lista dei guasti resta vuota per finta. */
        assert.ok(esaminate > 0,
            'Nessuna voce di menu risulta spenta: o config.js le ha accese tutte,\n' +
            'o tabSpenta() ha smesso di rispondere. In entrambi i casi questo test\n' +
            'non stava piu\' controllando niente.');
        assert.deepEqual([...new Set(aperte)], [],
            'Queste schede sono spente ma index.html ha ancora una voce di menu\n' +
            'visibile che ci porta. Il giocatore ci clicca sopra e non capisce.');
    });

    test('le scorciatoie della home puntano solo a schede accese', () => {
        const aperte = [];
        let esaminate = 0;
        for (const el of w.document.querySelectorAll('[data-ce-act="hubNavigate"]')) {
            const args = JSON.parse(el.getAttribute('data-ce-args') || '[]');
            const tab = args[0];
            if (typeof tab !== 'string' || !w.tabSpenta(tab)) continue;
            esaminate++;
            if (!nascosti.some(sel => el.matches(sel))) aperte.push(tab);
        }
        assert.ok(esaminate > 0, 'nessuna scorciatoia risulta spenta: il test non controlla piu\' niente');
        assert.deepEqual([...new Set(aperte)], [], 'scorciatoie ancora visibili');
    });

    test('switchTab rifiuta una scheda spenta e riporta alla home', () => {
        const spenta = Object.keys(w.TAB_DI).find(t => w.tabSpenta(t));
        assert.ok(spenta, 'nessuna scheda spenta: questo test non prova piu\' niente');

        let dove = null;
        const vero = w.switchTab;
        /* Si intercetta la seconda chiamata (il rimbalzo alla home) invece di
           guardare cosa e' finito a schermo: qui non ci sono le funzioni di
           rendering, e il punto da provare e' la decisione, non il disegno. */
        w.switchTab = function (tab) {
            if (dove === null) { dove = 'chiamata'; return vero.call(w, tab); }
            dove = tab;
        };
        w.switchTab(spenta);
        w.switchTab = vero;

        assert.equal(dove, 'home',
            `switchTab('${spenta}') doveva rimbalzare sulla home. Se non lo fa,\n` +
            'chiunque abbia un vecchio link o la console aperta entra lo stesso.');
    });

    test('una scheda accesa passa senza ostacoli', () => {
        assert.equal(w.tabSpenta('corse'), false);
        assert.equal(w.tabSpenta('fleet'), false, 'la flotta e\' accesa: non deve essere in TAB_DI da spenta');
        assert.equal(w.tabSpenta('home'), false, 'la home non si spegne mai');
    });
});
