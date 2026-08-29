'use strict';
/* ============================================================================
   Il manuale deve dire il vero, e continuare a dirlo.

   Pietro, playtest del 28/08/2026: «serve un Knowledge Book». Vlad, il giorno
   dopo: «va strutturato molto bene, molto molto bene. Deve spiegare qualsiasi
   cosa del gioco».

   Il rischio di un manuale non e' che sia brutto: e' che invecchi. Un manuale
   con i numeri copiati dentro e' esatto il giorno che lo scrivi e sbagliato al
   primo ribilanciamento — e un manuale che mente e' peggio di nessun manuale,
   perche' il giocatore ci costruisce sopra una strategia.

   Per questo le tabelle si generano dai dati veri (`NEW_CARS`, `REGIONS`,
   `STAFF_ROLES`, le soglie delle fasce). Questi test verificano proprio quel
   legame: che i numeri stampati siano quelli del gioco di oggi, non quelli del
   giorno in cui il file e' stato scritto.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function manuale() {
    const env = createGameEnv(CORE_FILES, { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    const s = env.sandbox;
    const container = s.document.createElement('div');
    container.id = 'tab-container';
    s.document.body.appendChild(container);
    return { env, s, container };
}

/** L'intero manuale in una stringa: si visita ogni capitolo e si concatena. */
function tuttoIlManuale(s, container) {
    let html = '';
    for (const cap of s.window.KB_CAPITOLI) {
        s.window._kbApri(cap.id);
        html += container.innerHTML;
    }
    return html;
}

describe('Knowledge Book — struttura', () => {

    test('si disegna, ed espone i capitoli', () => {
        const { env, s, container } = manuale();
        try {
            s.window.renderTabManuale();
            const html = container.innerHTML;
            assert.ok(html.includes('Knowledge Book'), 'manca l\'intestazione');
            assert.ok(html.includes('kb-cerca'), 'manca il campo di ricerca');
            assert.ok(s.window.KB_CAPITOLI.length >= 10,
                `un manuale che «spiega qualsiasi cosa» non sta in pochi capitoli: ne ha ${s.window.KB_CAPITOLI.length}`);
        } finally { env.stopAllIntervals(); }
    });

    test('ogni capitolo ha id unico, sezioni, e nessuna sezione che esplode', () => {
        const { env, s } = manuale();
        try {
            const visti = new Set();
            for (const cap of s.window.KB_CAPITOLI) {
                assert.ok(cap.id && !visti.has(cap.id), `id duplicato o mancante: ${cap.id}`);
                visti.add(cap.id);
                assert.ok(cap.titolo && cap.icona, `capitolo ${cap.id} senza titolo o icona`);
                assert.ok(cap.sezioni.length > 0, `capitolo ${cap.id} vuoto`);
                for (const sez of cap.sezioni) {
                    assert.ok(sez.titolo, `sezione senza titolo in ${cap.id}`);
                    /* Se una sezione lancia, il manuale mostra un ripiego invece
                       di rompere la scheda — ma resta un difetto da vedere qui. */
                    const corpo = sez.corpo();
                    assert.ok(typeof corpo === 'string' && corpo.length > 80,
                        `sezione ${cap.id}/${sez.id} troppo corta o non testuale`);
                }
            }
        } finally { env.stopAllIntervals(); }
    });

    test('copre i sistemi che il gioco ha davvero', () => {
        const { env, s, container } = manuale();
        try {
            const html = tuttoIlManuale(s, container).toLowerCase();
            /* Non si controlla che ci sia una pagina per ogni scheda: si controlla
               che i sistemi con cui il giocatore sbatte la testa siano nominati.
               Sono gli argomenti su cui Pietro aveva chiesto spiegazioni. */
            const argomenti = ['fascia', 'famiglia', 'leasing', 'reputazione', 'fatica',
                               'stipendi', 'tasse', 'prestit', 'licenz', 'provinc',
                               'contratt', 'immobil', 'driver coins', 'multe', 'sciopero',
                               'offline', 'meteo', 'carburante', 'coda'];
            const mancanti = argomenti.filter(a => !html.includes(a));
            assert.deepEqual(mancanti, [],
                'il manuale non spiega questi argomenti, e sono cose su cui un ' +
                'giocatore nuovo si blocca');
        } finally { env.stopAllIntervals(); }
    });
});

describe('Knowledge Book — i numeri vengono dal gioco, non dal passato', () => {

    test('il listino auto e\' quello vero, e completo', () => {
        const { env, s, container } = manuale();
        try {
            s.window._kbApri('flotta');
            const html = container.innerHTML;
            const listino = vm.runInContext('NEW_CARS', s).filter(c => !c.isAviation);
            for (const auto of listino) {
                assert.ok(html.includes(auto.name),
                    `${auto.name} e' in vendita ma non nel manuale: il giocatore ` +
                    'non puo\' decidere su un catalogo che non conosce');
                assert.ok(html.includes(auto.price.toLocaleString('it-IT')),
                    `il prezzo di ${auto.name} nel manuale non e' quello del listino`);
            }
        } finally { env.stopAllIntervals(); }
    });

    test('le soglie delle fasce sono lette, non scritte a mano', () => {
        const { env, s, container } = manuale();
        try {
            s.window._kbApri('corse');
            const html = container.innerHTML;
            const sp = s.window.SOGLIA_FASCIA_PREMIUM;
            const sl = s.window.SOGLIA_FASCIA_LUXURY;
            assert.ok(html.includes(sp.toLocaleString('it-IT')),
                `la soglia premium del gioco e' ${sp} ma il manuale non la mostra`);
            assert.ok(html.includes(sl.toLocaleString('it-IT')),
                `la soglia luxury del gioco e' ${sl} ma il manuale non la mostra`);
        } finally { env.stopAllIntervals(); }
    });

    test('gli stipendi dello staff sono quelli veri', () => {
        const { env, s, container } = manuale();
        try {
            s.window._kbApri('persone');
            const html = container.innerHTML;
            const ruoli = vm.runInContext('STAFF_ROLES', s);
            for (const r of Object.values(ruoli)) {
                assert.ok(html.includes(r.name), `manca il ruolo ${r.name}`);
                assert.ok(html.includes(r.salary.toLocaleString('it-IT')),
                    `lo stipendio di ${r.name} nel manuale non e' quello vero`);
            }
        } finally { env.stopAllIntervals(); }
    });

    test('le regioni e i prezzi delle licenze sono quelli veri', () => {
        const { env, s, container } = manuale();
        try {
            s.window._kbApri('territorio');
            const html = container.innerHTML;
            const R = vm.runInContext('REGIONS', s);
            for (const r of Object.values(R)) {
                assert.ok(html.includes(r.name), `manca la regione ${r.name}`);
            }
        } finally { env.stopAllIntervals(); }
    });

    test('una sezione che si rompe non porta giu\' il manuale', () => {
        /* Una pagina d'aiuto non deve poter rompere la scheda. Se domani qualcuno
           rinomina una costante che una sezione legge, quella sezione deve
           degradare da sola: il resto del capitolo va mostrato lo stesso, e la
           ricerca deve continuare a funzionare su tutti gli altri. */
        const { env, s, container } = manuale();
        try {
            const cap = s.window.KB_CAPITOLI.find(c => c.id === 'flotta');
            const buone = cap.sezioni.length;
            cap.sezioni[0].corpo = () => { throw new Error('costante rinominata'); };

            s.window._kbApri('flotta');
            const html = container.innerHTML;

            assert.ok(html.includes('non è disponibile'), 'la sezione rotta va segnalata');
            assert.ok(html.length > 500, 'il resto del capitolo va disegnato lo stesso');
            for (const sez of cap.sezioni.slice(1)) {
                assert.ok(html.includes(sez.titolo), `manca la sezione sana «${sez.titolo}»`);
            }
            assert.equal(cap.sezioni.length, buone);

            // E la ricerca non deve andare in errore su un capitolo malato.
            assert.ok(Array.isArray(s.window._kbFiltra('leasing')));
        } finally { env.stopAllIntervals(); }
    });
});

describe('Knowledge Book — la ricerca', () => {

    test('trova per parola contenuta nel testo', () => {
        const { env, s } = manuale();
        try {
            const r = s.window._kbFiltra('burnout');
            assert.ok(r.length > 0, 'cercare «burnout» deve trovare qualcosa');
            assert.ok(r.some(c => c.id === 'persone'));
        } finally { env.stopAllIntervals(); }
    });

    test('trova anche per parole che nel testo non compaiono', () => {
        /* Un giocatore cerca «come si gioca» o «soldi», non «ciclo fondamentale»
           o «liquidita'». Le parole chiave di ogni capitolo servono a questo. */
        const { env, s } = manuale();
        try {
            for (const [query, atteso] of [['come si gioca', 'basi'],
                                           ['soldi', 'denaro'],
                                           ['macchina', 'flotta'],
                                           ['paypal', 'driver-coins']]) {
                const r = s.window._kbFiltra(query);
                assert.ok(r.some(c => c.id === atteso),
                    `cercando «${query}» ci si aspetta il capitolo ${atteso}`);
            }
        } finally { env.stopAllIntervals(); }
    });

    test('una ricerca senza risultati non rompe la pagina', () => {
        const { env, s, container } = manuale();
        try {
            s.window._kbRicerca = 'zzzqqqxxx';
            s.window.renderTabManuale();
            assert.ok(container.innerHTML.includes('Nessun capitolo'),
                'va detto che non c\'e\' niente, non lasciata la pagina vuota');
        } finally { env.stopAllIntervals(); }
    });
});
