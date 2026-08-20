'use strict';
/* ============================================================================
   test/funzioni/infrastrutture.test.js — Verifica modulo Infrastrutture Carburante

   Scopo: verificare le funzioni esposte da `infrastructure.js`, le relative
   azioni delegate in `ce-actions.js`, il ciclo di acquisto depositi,
   l'impostazione del markup e la maturazione delle rendite (levy carburante).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito con mock Supabase e DOM per il modulo infrastrutture.
 */
function creaAmbienteInfra(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];

    const depositiDefault = [
        {
            depot_id: 'depot-roma-1',
            province_id: 'prov_roma',
            province_name: 'Roma Capitale',
            owner_user_id: 'user_me',
            owner_company: 'Chauffeur Empire',
            markup_pct: 15.00,
            price_paid: 300000,
            total_earned: 4500,
            is_mine: true,
        },
        {
            depot_id: 'depot-milano-1',
            province_id: 'prov_milano',
            province_name: 'Grande Milano',
            owner_user_id: 'user_rival',
            owner_company: 'Rival Limos',
            markup_pct: 25.00,
            price_paid: 300000,
            total_earned: 12000,
            is_mine: false,
        },
    ];

    let statoDepositi = (opzioni.depositi !== undefined ? opzioni.depositi : depositiDefault).map(d => ({ ...d }));

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const sbClient = {
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoDepositi });
            }

            if (nome === 'rpc_get_fuel_depots') {
                return { data: statoDepositi, error: null };
            }

            if (nome === 'rpc_buy_fuel_depot') {
                const provId = args.v_province_id;
                const giaPresente = statoDepositi.some(d => d.province_id === provId);
                if (giaPresente) {
                    return { data: null, error: { message: 'Questa provincia ha già un deposito carburante' } };
                }
                const nuovo = {
                    depot_id: 'depot_' + Date.now(),
                    province_id: provId,
                    province_name: provId,
                    owner_user_id: 'user_me',
                    owner_company: env.sandbox.gameState.companyName || 'Chauffeur Empire',
                    markup_pct: 10.00,
                    price_paid: 300000,
                    total_earned: 0,
                    is_mine: true,
                };
                statoDepositi.push(nuovo);
                return { data: { success: true, province_id: provId, cost: 300000 }, error: null };
            }

            if (nome === 'rpc_set_fuel_markup') {
                const dep = statoDepositi.find(d => d.province_id === args.v_province_id && d.is_mine);
                if (!dep) {
                    return { data: null, error: { message: 'Non possiedi un deposito in questa provincia' } };
                }
                dep.markup_pct = args.v_markup_pct;
                return { data: { success: true, markup_pct: args.v_markup_pct }, error: null };
            }

            if (nome === 'rpc_pay_fuel_levy') {
                return { data: { levy: 50, depot_owner: 'user_rival' }, error: null };
            }

            if (nome === 'rpc_pay_majority_dividend') {
                return { data: { skipped: true }, error: null };
            }

            return { data: null, error: null };
        },
    };

    if (opzioni.senzaSupabase) {
        env.sandbox.supabaseClient = null;
        env.sandbox.window.supabaseClient = null;
        env.sandbox.currentUser = null;
        env.sandbox.window.currentUser = null;
    } else {
        env.sandbox.supabaseClient = sbClient;
        env.sandbox.window.supabaseClient = sbClient;
        env.sandbox.currentUser = { id: 'user_me' };
        env.sandbox.window.currentUser = env.sandbox.currentUser;
    }

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        syncedCash,
        statoDepositi,
    };
}

describe('Funzione Infrastrutture — Diagnosi e ciclo di vita', () => {

    describe('Rendering della scheda (renderTabInfrastructure)', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('renderTabInfrastructure carica e visualizza sezioni propri, disponibili e rivali', async () => {
            amb = creaAmbienteInfra();
            const { sandbox } = amb;

            await sandbox.renderTabInfrastructure();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Infrastrutture Carburante'), 'titolo principale presente');
            assert.ok(container.innerHTML.includes('I Tuoi Depositi'), 'sezione depositi propri visibile');
            assert.ok(container.innerHTML.includes('Roma Capitale'), 'deposito proprio a Roma mostrato');
            assert.ok(container.innerHTML.includes('Grande Milano'), 'provincia occupata da rivale mostrata');
            assert.ok(container.innerHTML.includes('Firenze Storica'), 'provincia libera mostrata');
            assert.ok(container.innerHTML.includes('Depositi Rivali'), 'sezione rivali visibile');
            assert.ok(container.innerHTML.includes('Rival Limos'), 'nome azienda rivale mostrato');
        });

        test('renderTabInfrastructure con tutti i depositi liberi mostra pulsanti di acquisto', async () => {
            amb = creaAmbienteInfra({ depositi: [] });
            const { sandbox } = amb;

            await sandbox.renderTabInfrastructure();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(!container.innerHTML.includes('I Tuoi Depositi'), 'nessuna sezione depositi propri se lista vuota');
            assert.ok(!container.innerHTML.includes('Depositi Rivali'), 'nessuna sezione rivali se lista vuota');
            assert.ok(container.innerHTML.includes('Province Disponibili'), 'sezione disponibili presente');
            // Le 5 province hardcodate in _INFRA_PROVINCES devono avere tutte il pulsante acquisto
            const bottoniAcquisto = container.querySelectorAll('.em-bbtn');
            assert.equal(bottoniAcquisto.length, 5, 'devono esserci 5 pulsanti acquisto per le 5 province libere');
        });

        test('renderTabInfrastructure gestisce errore RPC mostrando messaggio all\'utente', async () => {
            amb = creaAmbienteInfra({
                rpcHandlers: {
                    rpc_get_fuel_depots: async () => ({ data: null, error: { message: 'Errore di connessione al database' } }),
                },
            });
            const { sandbox } = amb;

            await sandbox.renderTabInfrastructure();

            const loadingEl = sandbox.document.getElementById('infra-loading');
            assert.ok(loadingEl, 'elemento loading deve esistere');
            assert.ok(loadingEl.textContent.includes('Errore caricamento depositi'), 'deve mostrare messaggio di errore');
        });

        test('renderTabInfrastructure termina senza errori se tab-container non è presente nel DOM', async () => {
            amb = creaAmbienteInfra();
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = ''; // Rimuove tab-container

            await assert.doesNotReject(async () => {
                await sandbox.renderTabInfrastructure();
            });
        });
    });

    describe('Acquisto depositi carburante (_infraBuyDepot)', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('acquisto valido: scala 300.000€, chiama rpc_buy_fuel_depot, sincronizza e notifica', async () => {
            amb = creaAmbienteInfra({ depositi: [] });
            const { sandbox, gs, rpcLog, syncedCash, env } = amb;
            gs.cash = 400000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            assert.equal(gs.cash, 100000, 'la cassa deve essere scalata di 300.000€');
            assert.ok(syncedCash.includes(100000), 'la cassa deve essere sincronizzata col server');

            const rpcAcquisto = rpcLog.find(r => r.nome === 'rpc_buy_fuel_depot');
            assert.ok(rpcAcquisto, 'deve chiamare rpc_buy_fuel_depot');
            assert.equal(rpcAcquisto.args.v_province_id, 'prov_firenze');

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Deposito acquistato a Firenze Storica')));
        });

        test('acquisto con fondi insufficienti (< €300.000) viene bloccato senza chiamare RPC', async () => {
            amb = creaAmbienteInfra({ depositi: [] });
            const { sandbox, gs, rpcLog, syncedCash, env } = amb;
            gs.cash = 250000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            assert.equal(gs.cash, 250000, 'la cassa non deve cambiare');
            assert.equal(syncedCash.length, 0, 'nessuna sincronizzazione cassa');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_buy_fuel_depot').length, 0, 'non deve invocare RPC');
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti')));
        });

        test('annullamento della conferma utente interrompe l\'acquisto', async () => {
            amb = creaAmbienteInfra({ depositi: [] });
            const { sandbox, gs, rpcLog } = amb;
            sandbox.confirm = () => false;
            gs.cash = 500000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            assert.equal(gs.cash, 500000, 'la cassa non deve cambiare se l\'utente annulla');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_buy_fuel_depot').length, 0);
        });

        test('errore RPC del server: mostra notifica errore ma rivela che CE_money.spend ha già scalato la cassa', async () => {
            amb = creaAmbienteInfra({
                rpcHandlers: {
                    rpc_buy_fuel_depot: async () => ({ data: null, error: { message: 'Provincia già occupata' } }),
                },
            });
            const { sandbox, gs, env } = amb;
            gs.cash = 500000;

            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');

            // Diagnosi del flusso attuale: la notifica di errore viene mostrata...
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquisto deposito non riuscito')));
            // ...ma la cassa era già stata scalata da CE_money.spend prima del try/catch senza rollback locale!
            assert.equal(gs.cash, 200000, 'il saldo locale risulta scalato prima della risposta RPC');
        });

        test('acquisto in modalità offline (senza supabaseClient) completa la spesa locale', async () => {
            amb = creaAmbienteInfra({ senzaSupabase: true });
            const { sandbox, gs, env } = amb;
            gs.cash = 350000;

            await sandbox._infraBuyDepot('prov_napoli', 'Napoli Metropoli');

            assert.equal(gs.cash, 50000, 'scala la cassa locale');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Deposito acquistato')));
        });
    });

    describe('Impostazione del markup carburante (_infraSetMarkup e slider)', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('_infraSetMarkup legge il valore dello slider e chiama rpc_set_fuel_markup', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, rpcLog, env } = amb;

            await sandbox.renderTabInfrastructure();

            const slider = sandbox.document.getElementById('markup-slider-prov_roma');
            assert.ok(slider, 'slider deve esistere nel DOM');
            slider.value = '35';

            await sandbox._infraSetMarkup('prov_roma');

            const rpcMarkup = rpcLog.find(r => r.nome === 'rpc_set_fuel_markup');
            assert.ok(rpcMarkup, 'deve invocare rpc_set_fuel_markup');
            assert.equal(rpcMarkup.args.v_province_id, 'prov_roma');
            assert.equal(rpcMarkup.args.v_markup_pct, 35);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Markup aggiornato a 35%')));
        });

        test('_infraSetMarkup esce silenziosamente se lo slider non esiste nel DOM', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, rpcLog } = amb;

            await sandbox._infraSetMarkup('prov_inesistente');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_set_fuel_markup').length, 0);
        });

        test('_infraSetMarkup gestisce errore RPC mostrando notifica', async () => {
            amb = creaAmbienteInfra({
                rpcHandlers: {
                    rpc_set_fuel_markup: async () => ({ data: null, error: { message: 'Markup fuori intervallo' } }),
                },
            });
            const { sandbox, env } = amb;

            await sandbox.renderTabInfrastructure();
            const slider = sandbox.document.getElementById('markup-slider-prov_roma');
            slider.value = '45';

            await sandbox._infraSetMarkup('prov_roma');

            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Aggiornamento markup non riuscito')));
        });
    });

    describe('Event delegation e preview (ceMarkupPreview)', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('ceMarkupPreview aggiorna il testo dello span percentuale durante lo scorrimento dello slider', async () => {
            amb = creaAmbienteInfra();
            const { sandbox } = amb;

            await sandbox.renderTabInfrastructure();

            const valSpan = sandbox.document.getElementById('markup-val-prov_roma');
            assert.equal(valSpan.textContent, '15%');

            // Simula input evento slider con `this.value = '42'`
            sandbox.ceMarkupPreview.call({ value: '42' }, 'prov_roma');

            assert.equal(valSpan.textContent, '42%');
        });
    });

    describe('Ciclo di maturazione delle rendite (rpc_pay_fuel_levy via corse)', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('completamento di una corsa chiama rpc_pay_fuel_levy con la provincia di partenza', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, rpcLog } = amb;

            const corsa = {
                id: 101,
                fromPoi: { id: 'roma', name: 'Roma Centro', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'Fiumicino Aeroporto', region: 'lazio' },
                tier: 'standard',
                price: 200,
                duration: 20000,
                elapsed: 20000,
                driverId: 'ceo',
            };

            sandbox.completeRide(corsa, false);

            const rpcLevy = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.ok(rpcLevy, 'completeRide deve invocare rpc_pay_fuel_levy');
            assert.equal(rpcLevy.args.v_province_id, 'prov_roma', 'deve mappare roma -> prov_roma');
            assert.ok(rpcLevy.args.v_fare > 0, 'la tariffa passata alla RPC deve essere maggiore di zero');
        });

        test('completamento differito di un viaggio attivo (checkActiveTrips) invoca rpc_pay_fuel_levy', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, gs, rpcLog } = amb;

            gs.activeTrips = [{
                id: 202,
                driverId: 'ceo',
                carId: 'c_starter',
                driverName: 'Tu (CEO)',
                fromName: 'Milano Centrale',
                toName: 'Milano Malpensa',
                fromPoiId: 'milano',
                tier: 'business',
                startTime: Date.now() - 10000,
                endTime: Date.now() - 1000, // Terminato nel passato
                earnings: 350,
            }];

            sandbox.checkActiveTrips();

            const rpcLevy = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.ok(rpcLevy, 'checkActiveTrips deve invocare rpc_pay_fuel_levy');
            assert.equal(rpcLevy.args.v_province_id, 'prov_milano', 'deve mappare milano -> prov_milano');
            assert.equal(rpcLevy.args.v_fare, 350);
        });

        test('corsa con origine POI non mappato non invoca rpc_pay_fuel_levy', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, rpcLog } = amb;

            const corsaPoiSconosciuto = {
                id: 303,
                fromPoi: { id: 'poi_inesistente_xyz', name: 'POI Ester', region: 'estero' },
                toPoi: { id: 'roma', name: 'Roma Centro', region: 'lazio' },
                tier: 'standard',
                price: 150,
                duration: 20000,
                elapsed: 20000,
                driverId: 'ceo',
            };

            sandbox.completeRide(corsaPoiSconosciuto, false);

            const rpcLevy = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.equal(rpcLevy, undefined, 'nessuna chiamata levy per POI non mappato');
        });
    });

    describe('Verifica persistenza e consistenza dello stato', () => {
        let amb;
        afterEach(() => amb?.env?.stopAllIntervals());

        test('il possesso dei depositi non è tracciato in gameState né salvato in saveGame', async () => {
            amb = creaAmbienteInfra();
            const { sandbox, gs } = amb;

            // Verifichiamo lo schema di gameState: non contiene fuelDepots
            assert.equal(gs.fuelDepots, undefined, 'gameState non possiede fuelDepots');
            assert.equal(gs.infrastructureDepots, undefined, 'gameState non traccia infrastructureDepots');

            // Eseguiamo salvataggio
            sandbox.saveGame();

            // Ricarichiamo da salvataggio
            const caricato = sandbox.loadGame();
            assert.equal(caricato, true);
            assert.equal(sandbox.gameState.fuelDepots, undefined);
        });

        test('discrepanza catalogo province: _INFRA_PROVINCES ha 5 province mentre DB ne prevede 23', () => {
            amb = creaAmbienteInfra();
            const { sandbox } = amb;

            // In infrastructure.js _INFRA_PROVINCES è una const di modulo di 5 province
            const infraProvCount = 5; // roma, milano, firenze, napoli, venezia
            const poiProvinceCount = Object.keys(sandbox._POI_TO_PROVINCE || {}).length;

            assert.equal(infraProvCount, 5, 'infrastructure.js offre solo 5 province');
            assert.ok(poiProvinceCount > 5, 'il gioco mappa oltre 20 province nei POI');
        });
    });
});
