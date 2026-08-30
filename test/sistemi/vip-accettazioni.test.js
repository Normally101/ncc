'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/vip-accettazioni — i dieci «accetto» dei clienti VIP.

   Fase 3 di PIANO-CHIUSURA.md, sistema 2. Sono le azioni che nessun test aveva
   mai eseguito, e non per pigrizia: ognuna pretende una flotta precisa —
   «Serve G-Overlord o Majestic Spirit non elettrica, condizione ≥85%», «Servono
   quattro veicoli VIP/Ultra ≥80%», «Servono due Stellar V-Carrier a 100» — e
   costruire quella flotta a mano per dieci clienti diversi era mezz'ora a testa.
   Da quando c'è `conClienteVIP` nel regista costa una riga.

   Cosa si guarda, per ognuno dei dieci:

     1. **La corsa nasce.** L'accettazione mette in coda una corsa vera, col
        prezzo e la classe che l'email prometteva.
     2. **L'email si chiude.** Se resta `unread`, il bottone si può premere
        ancora — ed è il difetto vero del 27/08: due clic sullo stesso invito
        creavano DUE corse VIP e pagavano due volte.
     3. **Il rifiuto è pulito.** Con la flotta sbagliata l'azione dice di no e
        non lascia niente a metà: nessuna corsa, nessuna email consumata.

   Il denaro qui non si muove, ed è giusto così: il VIP paga a corsa finita. Chi
   cercasse un movimento di cassa dentro l'accettazione starebbe cercando un
   difetto al posto sbagliato.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

/* I dieci clienti e il bottone che li accetta. L'elenco è l'indice del sistema:
   se domani ne nasce un undicesimo e non compare qui, la prova finale in fondo
   se ne accorge. */
const CLIENTI = [
    ['grigori',   'acceptVipGrigori'],
    ['strata',    'acceptVipStrata'],
    ['platinum',  'acceptVipPlatinum'],
    ['onorevole', 'acceptVipOnorevole'],
    ['emiro',     'acceptVipEmiro'],
    ['garante',   'acceptVipGarante'],
    ['erede',     'acceptVipErede'],
    ['wedding',   'acceptVipWedding'],
    ['golden',    'acceptVipGolden'],
    ['techbro',   'acceptVipTechBro'],
];

describe('sistemi/vip — le dieci accettazioni', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conGiocatoreCollegato(env);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
    });
    afterEach(() => env.stopAllIntervals());

    const corse = () => env.sandbox.window.gameState.pendingRides || [];
    const errori = () => avvisi.filter(a => a.tipo === 'error').map(a => a.msg);

    for (const [chi, azione] of CLIENTI) {
        test(`${azione}: mette in coda la corsa promessa e chiude l'invito`, () => {
            const email = R.conClienteVIP(env, chi);
            const prezzoPromesso = email.vipData && email.vipData.price;
            const primaCorse = corse().length;

            w[azione](email.id);

            assert.deepEqual(errori(), [], `${azione} ha rifiutato uno stato che doveva bastargli`);
            const nuove = corse().slice(primaCorse);
            assert.ok(nuove.length >= 1, 'nessuna corsa messa in coda');
            assert.equal(email.status, 'resolved', 'l\'invito è rimasto aperto');

            if (prezzoPromesso) {
                const totale = nuove.reduce((s, c) => s + (c.price || 0), 0);
                assert.ok(totale > 0, 'la corsa non porta nessun compenso');
                /* Alcuni clienti spezzano il compenso su più veicoli (il convoglio
                   dell'Emiro, le due auto delle nozze): si controlla il totale, non
                   la singola corsa. */
                assert.ok(totale >= prezzoPromesso * 0.5 && totale <= prezzoPromesso * 4,
                    `il compenso in coda (${totale}) non somiglia a quello promesso (${prezzoPromesso})`);
            }
            for (const c of nuove) {
                assert.equal(c.isVipRide, true, 'la corsa non risulta VIP: i bonus del cliente non si applicheranno');
                assert.ok(c.fromPoi && c.toPoi, 'corsa senza partenza o destinazione');
            }
        });

        test(`${azione}: due clic non creano due corse`, () => {
            const email = R.conClienteVIP(env, chi);
            const primaCorse = corse().length;

            w[azione](email.id);
            const dopoIlPrimo = corse().length;
            w[azione](email.id);

            assert.equal(corse().length, dopoIlPrimo,
                'il secondo clic ha creato altre corse: è il doppio pagamento trovato il 27/08');
            assert.ok(dopoIlPrimo > primaCorse, 'il primo clic non ha fatto niente');
        });

        test(`${azione}: con la flotta sbagliata dice di no e non lascia niente a metà`, () => {
            const email = R.conClienteVIP(env, chi);
            // Si svuota la flotta DOPO che l'invito è arrivato: è il caso vero in
            // cui il giocatore vende o si fa sequestrare le auto prima di accettare.
            env.sandbox.window.gameState.fleet = [];
            const primaCorse = corse().length;

            w[azione](email.id);

            assert.equal(corse().length, primaCorse, 'ha creato la corsa senza avere i veicoli');
            assert.equal(email.status, 'unread',
                'ha consumato l\'invito rifiutandolo: il giocatore perde l\'occasione senza aver fatto niente');
        });
    }

    test('un invito inesistente non fa niente e non esplode', () => {
        for (const [, azione] of CLIENTI) {
            assert.doesNotThrow(() => w[azione]('email-che-non-esiste'));
        }
        assert.equal(corse().length, 0);
    });

    test('l\'elenco qui sopra copre tutti gli «accetto» del gioco', () => {
        const nelGioco = Object.keys(w).filter(k => /^acceptVip[A-Z]/.test(k));
        const provati = CLIENTI.map(([, a]) => a);
        assert.deepEqual(nelGioco.sort(), provati.sort(),
            'c\'è un cliente VIP che nessuno prova: aggiungilo a CLIENTI e al regista');
    });
});
