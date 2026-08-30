'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   guardrail/regista — chi costruisce gli stati va controllato per primo.

   `test-support/regista.js` esiste per portare il gioco in una situazione
   nominata: essere in un consorzio, avere un cliente VIP che chiama, un'asta
   aperta. Da qui in poi decine di test si fideranno di lui, e un regista che
   sbaglia in silenzio è peggio di nessun regista: costruisce uno stato che
   ASSOMIGLIA al gioco senza esserlo, e i test che ci girano sopra passano
   senza aver provato niente.

   Per questo ogni funzione qui viene messa alla prova sul suo «GARANTISCE», e
   non su come è fatta dentro. `conClienteVIP` non deve «scrivere un'email»:
   deve mettere il mondo in uno stato in cui l'azione VERA del giocatore
   (`acceptVipGrigori`) arriva fino in fondo. È quello che si controlla.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('guardrail/regista', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
    });
    afterEach(() => env.stopAllIntervals());

    describe('fondamenta', () => {
        test('conSoldi porta il cash al valore chiesto passando dalla porta del denaro', () => {
            const sincronizzazioni = [];
            const vero = w.ServerState.syncCash;
            w.ServerState.syncCash = async (v) => { sincronizzazioni.push(v); return vero ? vero(v) : { success: true }; };

            R.conSoldi(env, 500000);

            assert.equal(env.sandbox.window.gameState.cash, 500000);
            assert.ok(sincronizzazioni.length > 0,
                'il denaro è comparso senza che il server lo sapesse: è esattamente il difetto che la suite cerca');
        });

        test('conSoldi sa anche togliere, non solo aggiungere', () => {
            R.conSoldi(env, 100000);
            R.conSoldi(env, 25000);
            assert.equal(env.sandbox.window.gameState.cash, 25000);
        });

        test('conGiocatoreCollegato fa superare la guardia `if (!_uid()) return`', async () => {
            const server = R.conGiocatoreCollegato(env);
            assert.ok(w.currentUser && w.currentUser.id, 'nessun utente collegato');

            // La prova vera: un'azione che comincia con quella guardia deve
            // arrivare a parlare col server invece di uscire alla prima riga.
            server.rispondiCon('rpc_join_consorzio', () => ({ data: { ok: true }, error: null }));
            await w.joinConsorzio('consorzio-x');

            assert.ok(server.chiamate.some(c => c.nome === 'rpc_join_consorzio'),
                'l\'azione è uscita prima di chiamare il server: la guardia del login non è stata superata');
        });

        test('conGiocatoreCollegato regge le catene lunghe di .from()', async () => {
            const server = R.conGiocatoreCollegato(env);
            server.tabella('market_listings', [{ id: 'x' }]);
            const r = await w.supabaseClient.from('market_listings').select('*').eq('a', 1).order('b').limit(5);
            assert.deepEqual(r.data, [{ id: 'x' }]);
            assert.equal(r.error, null);
        });

        test('conModulo riempie i campi che le azioni leggono dallo schermo', () => {
            R.conModulo(env, { 'al-name': 'Consorzio Prova', 'al-tag': 'PRV', 'al-open': true });
            assert.equal(env.sandbox.document.getElementById('al-name').value, 'Consorzio Prova');
            assert.equal(env.sandbox.document.getElementById('al-tag').value, 'PRV');
            assert.equal(env.sandbox.document.getElementById('al-open').checked, true);
        });

        test('conFlotta consegna auto utilizzabili della classe chiesta', () => {
            const auto = R.conFlotta(env, 3, { classe: 'stellar_v_carr', condizione: 100 });
            assert.equal(auto.length, 3);
            for (const a of auto) {
                assert.equal(a.vehicleClass, 'stellar_v_carr');
                assert.equal(a.condition, 100);
                assert.ok(!a.outOfService && !a.isSeized, 'un\'auto ferma non è un\'auto utilizzabile');
            }
        });

        test('conGiornoAvanzato fa passare i giorni VERI, non un contatore', () => {
            const gs = env.sandbox.window.gameState;
            const prima = gs.day;
            let tick = 0;
            const vero = w.processDailyRoutines;
            w.processDailyRoutines = function () { tick++; return vero.apply(this, arguments); };

            R.conGiornoAvanzato(env, 5);

            assert.equal(env.sandbox.window.gameState.day, prima + 5);
            assert.equal(tick, 5, 'i giorni sono stati contati senza far girare il motore: la prova non varrebbe niente');
        });

        test('conCorseCompletate muove TUTTI i contatori delle corse, non uno solo', () => {
            R.conCorseCompletate(env, 250);
            const gs = env.sandbox.window.gameState;
            assert.ok(gs.stats.totalRides >= 250);
            assert.ok(gs.questStats.totalRides >= 250,
                'onboarding-core.js legge questStats: lasciarlo indietro costruisce uno stato che nel gioco non esiste');
        });
    });

    describe('i clienti VIP', () => {
        // Il vero collaudo del regista: per ognuno, l'azione del giocatore deve
        // arrivare a creare la corsa invece di uscire su «Nessun veicolo».
        const casi = [
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

        for (const [chi, azione] of casi) {
            test(`conClienteVIP('${chi}') porta ${azione} fino alla corsa`, () => {
                const rifiuti = [];
                w.showNotification = (msg, tipo) => { if (tipo === 'error') rifiuti.push(msg); };

                const email = R.conClienteVIP(env, chi);
                assert.equal(email.status, 'unread');

                const primaCorse = (env.sandbox.window.gameState.pendingRides || []).length;
                w[azione](email.id);

                assert.deepEqual(rifiuti, [],
                    `${azione} ha rifiutato: lo stato costruito dal regista non basta`);
                assert.ok((env.sandbox.window.gameState.pendingRides || []).length > primaCorse,
                    `${azione} non ha creato nessuna corsa`);
                assert.equal(email.status, 'resolved', 'l\'email doveva risultare gestita');
            });
        }

        test('conClienteVIP protesta se il cliente non esiste, invece di non fare niente', () => {
            assert.throws(() => R.conClienteVIP(env, 'inventato'), /cliente VIP sconosciuto/);
        });
    });

    describe('gli stati dei sistemi', () => {
        test('conConsorzio mette il giocatore dentro, per entrambi i sistemi che lo chiamano così', () => {
            R.conGiocatoreCollegato(env);
            const { consorzio } = R.conConsorzio(env, { ruolo: 'leader' });
            assert.ok(w._p2pMarket.myConsorzio, 'il mercato P2P non vede il consorzio');
            assert.ok(w._allianceState.myAlliance, 'la scheda Consorzi non vede il consorzio');
            assert.equal(w._allianceState.myRole, 'leader');
            assert.equal(w._sindacatoState.consorzioId, consorzio.id);
        });

        test('conDepositoCarburante rende il rifornimento un\'operazione con un effetto', () => {
            R.conDepositoCarburante(env, { capienza: 20000 });
            const gs = env.sandbox.window.gameState;
            assert.ok(gs.investments.includes('inv_fuel_depot'));
            assert.equal(gs.fuelTank, 0);
            assert.ok(gs.fuelTankCapacity > 0, 'senza capienza comprare gasolio è un no-op');
        });

        test('conPrestito lascia un debito residuo da ripagare', () => {
            const p = R.conPrestito(env, { importo: 100000 });
            assert.equal(p.remaining, 100000);
            assert.ok(env.sandbox.window.gameState.loans.length > 0);
        });

        test('conNemesi lascia un bersaglio arrabbiato per le azioni di corruzione', () => {
            const n = R.conNemesi(env, { rabbia: 80 });
            assert.equal(n.anger, 80);
            assert.ok(env.sandbox.window.gameState.vipNemeses.grigori);
        });

        test('conAstaAperta lascia un\'asta su cui si può rilanciare', () => {
            const asta = R.conAstaAperta(env);
            assert.equal(asta.status, 'open');
            assert.ok(env.sandbox.window.gameState.activeAuction, 'manca l\'asta del motore locale');
        });

        test('conContrattoB2B lascia sia un bando aperto sia un contratto attivo', () => {
            const { bando, contratto } = R.conContrattoB2B(env);
            assert.equal(bando.status, 'open');
            assert.equal(contratto.status, 'active');
            assert.ok(env.sandbox.window.gameState.corporateTenders.length > 0);
        });
    });

    describe('le promesse rotte si vedono', () => {
        test('una funzione che non riesce a costruire lo stato lancia invece di tacere', () => {
            // Senza `money.js` non c'è porta del denaro: conSoldi deve dirlo.
            const senzaSoldi = { sandbox: { window: { gameState: { cash: 0 } }, document: null } };
            assert.throws(() => R.conSoldi(senzaSoldi, 100), /CE_money non è caricato/);
        });
    });
});
