'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   events/eventi-ceo-varieta — «ci sono sempre le stesse scelte e gli stessi
   eventi» (Vlad, 30/08).

   La ripetizione non era sfortuna, era la selezione: SEI eventi in catalogo,
   uno per mese, pescati con `find(e => e.month === gameState.month)`. Per
   trenta giorni arrivava sempre quello, con le stesse due scelte.

   Questi test difendono le tre cose che rendono il sistema vario, e ognuna
   sarebbe invisibile guardando solo il numero di eventi in catalogo:
     · la SELEZIONE non ripete finche' ci sono alternative fresche;
     · i REQUISITI decidono chi vede cosa (l'ambasciata non scrive a chi ha due
       auto), e non vengono mai violati;
     · gli EFFETTI di una scelta sono piu' di «paga e prendi reputazione»:
       incassi veri, corse generate, scommesse che possono andare male.

   In piu' un guardrail sui dati: con sessantatre lettere scritte a mano, un
   segnaposto sbagliato o un `ko` senza `prob` si trova solo contandoli tutti.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

const CATALOGO = (s) => vm.runInContext('CEO_EVENTS', s);

/* Un giocatore avviato: soddisfa quasi tutti i requisiti, cosi' il campione
   degli eventi generati e' ampio. */
function veterano(gs) {
    gs.questStats = gs.questStats || {};
    gs.questStats.totalRides = 40;
    gs.reputation = 4.2;
    gs.fleet = [1, 2, 3, 4, 5].map(i => ({ id: 'c' + i, name: 'Auto ' + i, condition: 90 }));
    gs.drivers = [{ id: 'ceo' }, { id: 'd1' }, { id: 'd2' }, { id: 'd3' }];
    gs.unlockedRegions = ['lazio', 'lombardia'];
    gs.emails = [];
}

/* Un giocatore appena partito. */
function principiante(gs) {
    gs.questStats = { totalRides: 0 };
    gs.reputation = 0;
    gs.fleet = [{ id: 'c1', name: 'Berlina', condition: 80 }];
    gs.drivers = [{ id: 'ceo' }];
    gs.unlockedRegions = ['lazio'];
    gs.emails = [];
}

// generateEmailEvent tira una moneta: meta' delle volte manda un'offerta B2B.
// Qui interessano solo gli inviti, quindi si insiste finche' ne nasce uno.
function invito(s, gs, tentativi = 60) {
    for (let i = 0; i < tentativi; i++) {
        gs.emails = [];
        s.generateEmailEvent();
        const m = gs.emails.filter(e => e.type === 'ceo_event');
        if (m.length) return m[m.length - 1];
    }
    return null;
}

function raccogli(s, gs, quanti) {
    const out = [];
    for (let i = 0; i < quanti; i++) {
        const m = invito(s, gs);
        if (m) out.push(m);
    }
    return out;
}

describe('events/eventi-ceo-varieta', () => {
    let env, s, gs;
    beforeEach(() => {
        env = freshEnv();
        s = env.sandbox; gs = s.gameState;
        gs.month = 8;
        gs.day = 302;
    });
    afterEach(() => env.stopAllIntervals());

    /* ── SELEZIONE ─────────────────────────────────────────────────────── */

    test('il catalogo non e\' piu\' un evento al mese', () => {
        const cat = CATALOGO(s);
        assert.ok(cat.length >= 40,
            `sei eventi in catalogo significano lo stesso invito per trenta giorni: trovati ${cat.length}`);
        const senzaMese = cat.filter(e => e.month == null);
        assert.ok(senzaMese.length >= 15,
            'servono eventi validi tutto l\'anno, se no i mesi poveri restano poveri');
    });

    test('venti inviti di fila non sono venti volte lo stesso', () => {
        veterano(gs);
        const nomi = raccogli(s, gs, 20).map(m => m.eventData.name);

        assert.equal(nomi.length, 20, 'devono nascere venti inviti');
        const distinti = new Set(nomi).size;
        assert.equal(distinti, 20,
            `finche' ci sono alternative fresche non deve tornare lo stesso evento: ${distinti}/20 distinti`);
    });

    test('la memoria degli eventi visti non cresce all\'infinito', () => {
        veterano(gs);
        raccogli(s, gs, 30);
        assert.ok(Array.isArray(gs.eventiCEOVisti));
        assert.ok(gs.eventiCEOVisti.length <= 25,
            `la memoria e' un anello di 25, letti ${gs.eventiCEOVisti.length} — un salvataggio non deve gonfiarsi`);
    });

    test('un salvataggio vecchio senza memoria eventi non rompe niente', () => {
        veterano(gs);
        delete gs.eventiCEOVisti;
        const m = invito(s, gs);
        assert.ok(m, 'con la memoria assente si deve comunque generare un invito');
        assert.ok(Array.isArray(gs.eventiCEOVisti), 'e la memoria si crea da sola');
    });

    /* ── CALENDARIO ────────────────────────────────────────────────────── */

    test('un evento di stagione non arriva fuori stagione', () => {
        veterano(gs);
        gs.month = 2;                       // febbraio
        const cat = CATALOGO(s);
        const nomi = raccogli(s, gs, 25).map(m => m.eventData.name);

        for (const nome of nomi) {
            const ev = cat.find(e => e.name === nome);
            assert.ok(ev, `evento "${nome}" non trovato in catalogo`);
            assert.ok(ev.month == null || ev.month === 2,
                `"${nome}" e' di ${ev.month} e non deve comparire a febbraio`);
        }
        /* E gli eventi di febbraio devono essere raggiungibili davvero. Pescare
           finche' non escono sarebbe una prova a dadi: si mette in memoria tutto
           il resto del catalogo, cosi' gli unici freschi restano i tre di
           febbraio e la scelta non ha scampo. */
        const diFebbraio = cat.filter(e => e.month === 2).map(e => e.id);
        assert.ok(diFebbraio.length >= 3, 'febbraio deve avere i suoi eventi in catalogo');
        gs.eventiCEOVisti = cat.map(e => e.id).filter(id => !diFebbraio.includes(id));
        const m = invito(s, gs);
        assert.ok(m, 'a febbraio deve arrivare un invito');
        const scelto = cat.find(e => e.name === m.eventData.name);
        assert.ok(diFebbraio.includes(scelto.id),
            `con tutto il resto gia' visto doveva uscire un evento di febbraio, uscito "${scelto.id}"`);
    });

    test('ogni mese dell\'anno ha degli inviti', () => {
        veterano(gs);
        for (let mese = 1; mese <= 12; mese++) {
            gs.month = mese;
            gs.eventiCEOVisti = [];
            const m = invito(s, gs);
            assert.ok(m, `il mese ${mese} non genera nessun invito: quel mese la posta tace`);
        }
    });

    /* ── REQUISITI ─────────────────────────────────────────────────────── */

    test('a un principiante non arrivano gli incarichi da veterano', () => {
        principiante(gs);
        const cat = CATALOGO(s);
        const nomi = raccogli(s, gs, 25).map(m => m.eventData.name);

        for (const nome of nomi) {
            const ev = cat.find(e => e.name === nome);
            const r = ev.requires || {};
            assert.ok(r.rides == null || r.rides <= 0, `"${nome}" chiede ${r.rides} corse a chi ne ha zero`);
            assert.ok(r.fleet == null || r.fleet <= 1, `"${nome}" chiede ${r.fleet} auto a chi ne ha una`);
            assert.ok(r.rep == null || r.rep <= 0, `"${nome}" chiede reputazione ${r.rep} a chi e' a zero`);
        }
        assert.ok(!nomi.includes('G20 Summit'),
            'il G20 chiede 18 corse, reputazione 3 e quattro auto: a chi comincia non deve arrivare');
    });

    test('crescendo si aprono eventi che prima non arrivavano', () => {
        principiante(gs);
        gs.month = null;                     // solo eventi di tutto l'anno
        const cat = CATALOGO(s);
        const perTutti = cat.filter(e => e.month == null);
        const conta = (filtro) => perTutti.filter(filtro).length;

        const perPrincipiante = conta(e => !e.requires);
        const perVeterano = conta(e => !e.requires
            || ((e.requires.rides || 0) <= 40 && (e.requires.fleet || 0) <= 5 && (e.requires.rep || 0) <= 4.2));

        assert.ok(perVeterano > perPrincipiante * 1.5,
            `un veterano deve vedere molti piu' eventi: ${perPrincipiante} contro ${perVeterano}`);
    });

    /* ── EFFETTI ───────────────────────────────────────────────────────── */

    function emailFinta(gs, scelte) {
        const mail = { id: 999, type: 'ceo_event', status: 'unread', subject: 'test',
                       eventData: { id: 'test', name: 'Prova', desc: 'x', choices: scelte } };
        gs.emails = [mail];
        return mail;
    }

    test('una scelta che promette un incasso lo paga davvero', async () => {
        gs.cash = 10000;
        emailFinta(gs, [{ text: 'Servizio pagato', gain: 5000 }]);

        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 15000,
            'la vecchia forma «cost: -5000» veniva azzerata da Math.max(0, cost): ' +
            'il bottone prometteva cinquemila euro e non ne arrivava nessuno');
    });

    test('una scelta genera davvero le corse che annuncia, della categoria giusta', async () => {
        gs.cash = 50000;
        // generatePOIRide vera puo' tornare a mani vuote (POI insufficienti,
        // coda piena, strategia premium): qui interessa che l'evento la chiami
        // il numero di volte promesso e con la categoria dichiarata.
        const chiamate = [];
        s.generatePOIRide = (tier) => { chiamate.push(tier); return null; };
        emailFinta(gs, [{ text: 'Contratto', cost: 1000, rides: 3, tier: 'vip' }]);

        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.deepEqual(chiamate, ['vip', 'vip', 'vip'],
            'le corse promesse dall\'evento devono essere richieste davvero');
    });

    test('un evento non puo\' inondare la coda di corse', async () => {
        gs.cash = 50000;
        const chiamate = [];
        s.generatePOIRide = (tier) => { chiamate.push(tier); return null; };
        emailFinta(gs, [{ text: 'Dato sbagliato', rides: 999 }]);

        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.equal(chiamate.length, 8,
            'il tetto e\' una difesa contro un catalogo scritto male, non una regola di gioco');
    });

    test('una scommessa persa applica il malus, non il bonus — ma il costo resta pagato', async () => {
        gs.cash = 50000;
        gs.reputation = 3.0;
        // Math del solo ambiente di prova: il vero Math del processo resta intatto.
        s.Math = Object.create(Math);
        s.Math.random = () => 0.99;          // sopra qualunque prob: la scommessa fallisce

        emailFinta(gs, [{ text: 'Rischio', cost: 2000, gain: 20000, repBonus: 1.5, prob: 0.7,
                          ko: { repBonus: -0.8, msg: 'andata male' } }]);
        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 48000, 'il costo si paga anche quando va male: e\' questo che la rende una scommessa');
        assert.ok(gs.reputation < 3.0, `la reputazione doveva scendere, letta ${gs.reputation}`);
    });

    test('una scommessa vinta paga il premio', async () => {
        gs.cash = 50000;
        gs.reputation = 3.0;
        s.Math = Object.create(Math);
        s.Math.random = () => 0.01;          // sotto qualunque prob: riesce

        emailFinta(gs, [{ text: 'Rischio', cost: 2000, gain: 20000, repBonus: 1.5, prob: 0.7,
                          ko: { repBonus: -0.8 } }]);
        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 68000, '50.000 − 2.000 + 20.000');
        assert.ok(gs.reputation > 3.0, 'e la reputazione sale');
    });

    test('senza fondi la scelta non parte e non regala niente', async () => {
        gs.cash = 500;
        gs.reputation = 3.0;
        const mail = emailFinta(gs, [{ text: 'Caro', cost: 9000, gain: 20000, repBonus: 2 }]);

        s.negotiateEmail(999, 0, 0);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500, 'niente si muove');
        assert.equal(gs.reputation, 3.0, 'nessun bonus senza aver pagato');
        assert.equal(mail.status, 'unread', 'l\'invito resta aperto: il giocatore puo\' riprovare dopo');
    });

    /* ── LETTERA ───────────────────────────────────────────────────────── */

    test('la lettera parla dell\'evento che i bottoni propongono', () => {
        veterano(gs);
        const cat = CATALOGO(s);
        const inviti = raccogli(s, gs, 12);

        for (const m of inviti) {
            const ev = cat.find(e => e.name === m.eventData.name);
            assert.ok(m.subject.includes(ev.name), `l'oggetto deve nominare l'evento: "${m.subject}"`);
            if (ev.da) {
                const atteso = ev.da.nome.replace(/\{\{\w+\}\}/g, '').trim();
                assert.ok(m.senderName.includes(atteso.split(' ')[0]),
                    `il mittente deve essere quello dell'evento "${ev.name}", letto "${m.senderName}"`);
            }
        }
    });

    test('l\'email salvata non si porta dietro il testo del modello', () => {
        veterano(gs);
        const m = invito(s, gs);
        assert.ok(m.body && m.body.length > 40, 'la lettera scritta sta in body');
        assert.equal(m.eventData.testo, undefined,
            'il modello con i {{segnaposti}} non deve finire nel salvataggio: e\' gia' +
            '\' stato usato per scrivere body');
        assert.ok(m.eventData.desc && m.eventData.choices, 'ma la scheda Inbox deve avere quello che le serve');
    });

    test('nessuna lettera lascia segnaposti o il contatore dei giorni', () => {
        veterano(gs);
        const inviti = raccogli(s, gs, 25);
        for (const m of inviti) {
            const testo = [m.subject, m.body, m.senderName, m.senderRole, m.signature].join('\n');
            assert.ok(!/\{\{\w+\}\}/.test(testo), `segnaposto non sostituito in "${m.subject}": ${testo}`);
            assert.ok(!/\b302\b/.test(testo), `il contatore dei giorni non deve finire nel testo di "${m.subject}"`);
            assert.ok(!/€(?![\d])/.test(testo), `un "€" senza cifra in "${m.subject}"`);
        }
    });

    /* ── GUARDRAIL SUL CATALOGO ────────────────────────────────────────── */

    test('il catalogo e\' coerente: id unici, scelte sensate, niente ko orfani', () => {
        const cat = CATALOGO(s);
        const visti = new Set();
        const tierAmmessi = new Set(['standard', 'business', 'vip', 'ultra', 'group']);

        for (const e of cat) {
            assert.ok(!visti.has(e.id), `id duplicato: ${e.id} — la memoria degli eventi visti lavora sugli id`);
            visti.add(e.id);
            assert.ok(e.name && e.desc, `${e.id}: servono nome e descrizione`);
            // name e desc finiscono nell'email salvata SENZA passare dalla
            // sostituzione: un {{segnaposto}} qui resterebbe visibile per sempre.
            assert.ok(!/\{\{/.test(e.name + e.desc), `${e.id}: segnaposto in nome o descrizione`);
            assert.ok(Array.isArray(e.choices) && e.choices.length >= 2,
                `${e.id}: un evento con una scelta sola non e' una decisione`);
            assert.ok(e.month == null || (e.month >= 1 && e.month <= 12), `${e.id}: mese fuori scala`);

            for (const c of e.choices) {
                assert.ok(c.text, `${e.id}: una scelta senza etichetta`);
                assert.ok(!(c.cost > 0) || c.cost >= 500, `${e.id}: costo troppo basso per la variazione ±30%`);
                assert.ok(!(c.cost < 0), `${e.id}: un costo negativo non incassa niente, usa "gain"`);
                if (c.ko) assert.ok(typeof c.prob === 'number',
                    `${e.id}: "ko" senza "prob" e' un esito che non si verifichera' mai`);
                if (c.prob != null) assert.ok(c.prob > 0 && c.prob < 1, `${e.id}: prob fuori da (0,1)`);
                if (c.tier) assert.ok(tierAmmessi.has(c.tier), `${e.id}: categoria corsa sconosciuta "${c.tier}"`);
                if (c.rides) assert.ok(c.rides <= 8, `${e.id}: ${c.rides} corse in un colpo sono troppe`);
                if (c.ko && c.ko.tier) assert.ok(tierAmmessi.has(c.ko.tier), `${e.id}: tier sconosciuto nel ko`);
            }
        }
    });

    test('ogni evento porta la propria lettera', () => {
        const cat = CATALOGO(s);
        const senza = [...cat.filter(e => !e.da || !e.testo).map(e => e.id)];
        assert.equal(senza.length, 0, senza.join(', ') + ' — ' +
            'una lettera generica pescata a caso sopra un evento qualunque e\' il difetto ' +
            'per cui l\'invito parlava di una «Cena di Gala Rotary» mentre i bottoni vendevano il G20');
    });
});
