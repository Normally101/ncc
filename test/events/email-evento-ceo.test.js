'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   events/email-evento-ceo — i quattro difetti visti da Vlad nello stesso
   screenshot il 29/08:
     · «Camera di Commercio di» — il nome della citta' mancava (il chiamante non
       passava `city` e la sostituzione ripiegava sulla stringa vuota);
     · «organizza 302» e «Si terra' 302 il Gala» — al posto della data compariva
       il CONTATORE dei giorni di gioco;
     · l'oggetto dell'email era quello del template a caso («Cena di Gala
       Rotary»), non dell'evento che i bottoni sotto proponevano;
     · «I prezzi sono sempre fissi, messi cosi' non mi spingono a pagare»: la
       quota stava scritta a mano dentro l'etichetta del bottone.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

// I mesi con un evento CEO in calendario (CEO_EVENTS).
const MESE_CON_EVENTO = 8;   // Festival del Cinema di Venezia

function generaFinoAdEvento(s, gs, tentativi = 200) {
    for (let i = 0; i < tentativi; i++) {
        s.generateEmailEvent();
        const mail = gs.emails.filter(e => e.type === 'ceo_event');
        if (mail.length) return mail[mail.length - 1];
    }
    return null;
}

describe('events/email-evento-ceo', () => {
    let env, s, gs;
    beforeEach(() => {
        env = freshEnv();
        s = env.sandbox; gs = s.gameState;
        gs.month = MESE_CON_EVENTO;
        gs.day = 302;             // il contatore vero del giorno della segnalazione
        gs.emails = [];
    });
    afterEach(() => env.stopAllIntervals());

    test('nessun segnaposto resta vuoto o mostra il contatore dei giorni', () => {
        const mail = generaFinoAdEvento(s, gs);
        assert.ok(mail, 'in un mese con evento in calendario deve nascere un invito');

        const testo = [mail.subject, mail.body, mail.senderName, mail.senderRole, mail.signature].join('\n');
        assert.ok(!/\{\{\w+\}\}/.test(testo), `nessun segnaposto puo' restare nel testo: "${testo}"`);
        assert.ok(!/\b302\b/.test(testo), `il contatore dei giorni non deve finire nel testo: "${testo}"`);
        assert.ok(!/ di\s*$|di\s*\n|Commercio di\s*[,\n]/.test(testo),
            `un "di" senza nome dietro significa citta' mancante: "${testo}"`);
        assert.ok(!/€(?![\d])/.test(testo), `un "€" senza cifra significa importo mancante: "${testo}"`);
    });

    test('la citta\' e\' un capoluogo vero fra le regioni sbloccate', () => {
        gs.unlockedRegions = ['lazio'];
        const citta = vm.runInContext('_cittaPerEmail()', s);
        assert.equal(citta, 'Roma', 'con il solo Lazio sbloccato la citta\' deve essere Roma');

        gs.unlockedRegions = ['lombardia'];
        assert.equal(vm.runInContext('_cittaPerEmail()', s), 'Milano');
    });

    test('la data e\' una data leggibile, non un numero', () => {
        const data = vm.runInContext('_dataPerEmail(7)', s);
        assert.ok(!/^\d+$/.test(data), `"${data}" e' ancora un numero nudo`);
        assert.match(data, /\d/, 'la data deve contenere il giorno');
    });

    test('l\'oggetto nomina l\'evento a cui i bottoni si riferiscono', () => {
        const mail = generaFinoAdEvento(s, gs);
        assert.ok(mail.subject.includes(mail.eventData.name),
            `l'oggetto "${mail.subject}" deve nominare l'evento "${mail.eventData.name}"`);
    });

    test('la quota non e\' piu\' fissa: due inviti allo stesso evento chiedono cifre diverse', () => {
        const quote = new Set();
        for (let i = 0; i < 40; i++) {
            gs.emails = [];
            const mail = generaFinoAdEvento(s, gs, 40);
            if (!mail) continue;
            const pagante = mail.eventData.choices.find(c => c.cost > 0);
            if (pagante) quote.add(pagante.cost);
        }
        assert.ok(quote.size > 1,
            `la quota deve oscillare fra un invito e l'altro, trovata sempre la stessa: ${[...quote]}`);
    });

    test('l\'etichetta del bottone dice esattamente la cifra che verra\' addebitata', () => {
        for (let giro = 0; giro < 20; giro++) {
            gs.emails = [];
            const mail = generaFinoAdEvento(s, gs, 40);
            if (!mail) continue;
            for (const scelta of mail.eventData.choices) {
                if (!(scelta.cost > 0)) continue;
                const scritta = scelta.text.replace(/\./g, '').match(/€\s*(\d+)/);
                assert.ok(scritta, `l'etichetta deve mostrare una cifra: "${scelta.text}"`);
                assert.equal(Number(scritta[1]), scelta.cost,
                    `bottone e addebito devono coincidere: "${scelta.text}" contro ${scelta.cost}`);
            }
        }
    });

    test('scegliere addebita la cifra scritta sul bottone, non quella di listino', () => {
        const mail = generaFinoAdEvento(s, gs);
        const idx = mail.eventData.choices.findIndex(c => c.cost > 0);
        assert.ok(idx >= 0, 'l\'evento deve avere almeno una scelta a pagamento');
        const costo = mail.eventData.choices[idx].cost;

        gs.cash = costo + 100000;
        const prima = gs.cash;
        s.negotiateEmail(mail.id, 0, idx);

        assert.equal(prima - gs.cash, costo, 'la cassa deve scendere esattamente della quota mostrata');
    });

    test('le scelte senza quota (rifiuti, servizi pagati) restano intatte', () => {
        const originale = vm.runInContext("CEO_EVENTS.find(e => e.id === 'g20')", s);
        const variato = s._eventoConPrezzoDelGiorno(originale);
        const rifiuto = variato.choices.find(c => !(c.cost > 0));
        const rifiutoOrig = originale.choices.find(c => !(c.cost > 0));
        assert.equal(rifiuto.text, rifiutoOrig.text, 'la scelta senza quota non deve cambiare etichetta');
        assert.equal(rifiuto.cost, rifiutoOrig.cost, 'la scelta senza quota non deve cambiare costo');
    });

    test('il listino CEO_EVENTS non viene mutato: la variazione e\' una copia', () => {
        const primaListino = vm.runInContext("JSON.stringify(CEO_EVENTS.find(e => e.id === 'venice'))", s);
        for (let i = 0; i < 20; i++) { gs.emails = []; generaFinoAdEvento(s, gs, 20); }
        const dopoListino = vm.runInContext("JSON.stringify(CEO_EVENTS.find(e => e.id === 'venice'))", s);
        assert.equal(dopoListino, primaListino, 'il catalogo degli eventi deve restare quello scritto nei dati');
    });

    test('anche le email di caccia agli autisti hanno una citta\' vera', () => {
        const email = {};
        s._applyEmailTemplate(email, 'poaching', { driverName: 'Mario Rossi', rivalName: 'Elite NCC', amount: 3000 });
        const testo = [email.subject, email.body, email.senderName, email.signature].join('\n');
        assert.ok(!/\{\{\w+\}\}/.test(testo), `nessun segnaposto puo' restare: "${testo}"`);
        assert.ok(!/ in \s|NCC\s+—/.test(email.body || ''), 'la citta\' non deve mancare nel corpo');
    });
});
