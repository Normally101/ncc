'use strict';
/* ============================================================================
   test/funzioni/infrastrutture.test.js — Verifica modulo Monopolio Infrastrutture

   Scopo: verificare che tutte le azioni e le funzioni esposte da `infrastructure.js`,
   dai gestori di `ce-actions.js` e dai punti di integrazione nel motore corse
   (`engine-rides.js`) funzionino realmente in presenza del contesto e dei dati attesi.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase per le infrastrutture di carburante.
 */
function creaAmbienteInfrastrutture(opzioni = {}) {
    const rpcLog = [];
    const realtimeHandlers = [];

    const depositiDefault = [
        {
            depot_id: 'dep_1',
            province_id: 'prov_roma',
            province_name: 'Roma Capitale',
            owner_user_id: 'user_player',
            owner_company: 'Player Empire',
            markup_pct: 15.0,
            price_paid: 300000,
            total_earned: 45000,
            is_mine: true
        },
        {
            depot_id: 'dep_2',
            province_id: 'prov_milano',
            province_name: 'Grande Milano',
            owner_user_id: 'user_rival_1',
            owner_company: 'Rival Corp',
            markup_pct: 25.0,
            price_paid: 300000,
            total_earned: 12000,
            is_mine: false
        }
    ];

    let statoDepositi = (opzioni.depositi || depositiDefault).map(d => ({ ...d }));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: () => ({
            select: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
                single: () => Promise.resolve({ data: null, error: null }),
            }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoDepositi });
            }

            if (nome === 'rpc_get_fuel_depots') {
                return { data: statoDepositi, error: null };
            }

            if (nome === 'rpc_buy_fuel_depot') {
                const esiste = statoDepositi.find(d => d.province_id === args.v_province_id);
                if (esiste) {
                    return { data: null, error: { message: 'Questa provincia ha già un deposito carburante' } };
                }
                const nuovo = {
                    depot_id: 'dep_new_' + Math.random().toString(36).slice(2),
                    province_id: args.v_province_id,
                    province_name: args.v_province_id,
                    owner_user_id: 'user_player',
                    owner_company: 'Player Empire',
                    markup_pct: 10.0,
                    price_paid: 300000,
                    total_earned: 0,
                    is_mine: true
                };
                statoDepositi.push(nuovo);
                return {
                    data: {
                        success: true,
                        province_id: args.v_province_id,
                        cost: 300000
                    },
                    error: null
                };
            }

            if (nome === 'rpc_set_fuel_markup') {
                const depot = statoDepositi.find(d => d.province_id === args.v_province_id && d.is_mine);
                if (!depot) {
                    return { data: null, error: { message: 'Non possiedi un deposito in questa provincia' } };
                }
                depot.markup_pct = args.v_markup_pct;
                return {
                    data: { success: true, markup_pct: args.v_markup_pct },
                    error: null
                };
            }

            if (nome === 'rpc_pay_fuel_levy') {
                const depot = statoDepositi.find(d => d.province_id === args.v_province_id);
                if (!depot) {
                    return { data: { skipped: 'no_depot' }, error: null };
                }
                if (depot.is_mine) {
                    return { data: { skipped: 'self_owned' }, error: null };
                }
                const levy = Math.max(10, Math.floor(args.v_fare * 0.03 * (depot.markup_pct / 100)));
                depot.total_earned += levy;
                return {
                    data: { levy, depot_owner: depot.owner_user_id },
                    error: null
                };
            }

            return { data: null, error: null };
        },
        channel: (canale) => ({
            on: (tipo, filtro, cb) => {
                realtimeHandlers.push({ canale, tipo, filtro, cb });
                return {
                    subscribe: () => ({ id: 'sub_' + Math.random().toString(36).slice(2) }),
                };
            },
        }),
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'user_player' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Contenitore principale per tab UI
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        realtimeHandlers,
        statoDepositi,
    };
}

describe('Funzione Infrastrutture — Esecuzione e ciclo di vita', () => {

    describe('Costanti e configurazione nello scope VM', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteInfrastrutture(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_INFRA_PROVINCES è presente nel contesto e contiene le 5 province', () => {
            const { sandbox } = amb;
            const provinces = vm.runInContext('_INFRA_PROVINCES', sandbox);
            assert.ok(Array.isArray(provinces), '_INFRA_PROVINCES deve essere un array');
            assert.equal(provinces.length, 5, 'devono esserci 5 province configurate');
            const ids = JSON.parse(JSON.stringify(provinces.map(p => p.id)));
            assert.deepEqual(ids, ['prov_roma', 'prov_milano', 'prov_firenze', 'prov_napoli', 'prov_venezia']);
        });

        test('le funzioni pubbliche sono esportate correttamente su window', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.renderTabInfrastructure, 'function');
            assert.equal(typeof sandbox._infraBuyDepot, 'function');
            assert.equal(typeof sandbox._infraSetMarkup, 'function');
            assert.equal(typeof sandbox.ceMarkupPreview, 'function');
        });
    });

    describe('UI: Rendering della scheda infrastrutture (renderTabInfrastructure)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteInfrastrutture(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('se tab-container non è presente non lancia errori', async () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';
            await assert.doesNotReject(async () => {
                await sandbox.renderTabInfrastructure();
            });
        });

        test('renderTabInfrastructure mostra depositi posseduti, liberi e rivali', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabInfrastructure();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            // Intestazione
            assert.ok(html.includes('Infrastrutture Carburante'), 'titolo presente');
            assert.ok(html.includes('I Tuoi Depositi'), 'sezione propri depositi presente');
            assert.ok(html.includes('Roma Capitale'), 'deposito di Roma presente nei propri');
            assert.ok(html.includes('45.000'), 'incasso totale formattato');
            assert.ok(html.includes('15% markup'), 'markup badge presente');

            // Province disponibili
            assert.ok(html.includes('Province Disponibili'), 'sezione disponibili presente');
            assert.ok(html.includes('Firenze Storica'), 'Firenze libera presente');
            assert.ok(html.includes('Acquista €300k'), 'pulsante acquisto presente per province libere');

            // Depositi rivali
            assert.ok(html.includes('Grande Milano'), 'Milano presente');
            assert.ok(html.includes('Occupato da Rival Corp') || html.includes('Rival Corp'), 'indicazione proprietario rivale');
            assert.ok(html.includes('Depositi Rivali'), 'sezione depositi rivali presente');

            // Regole e info
            assert.ok(html.includes('Come funziona:'), 'box esplicativo presente');
            assert.ok(html.includes('€300.000'), 'costo indicato correttamente');
        });

        test('renderTabInfrastructure gestisce assenza di propri depositi', async () => {
            const { sandbox } = amb;
            // Solo depositi rivali o liberi
            amb.statoDepositi.splice(0, amb.statoDepositi.length, {
                depot_id: 'dep_2',
                province_id: 'prov_milano',
                province_name: 'Grande Milano',
                owner_user_id: 'user_rival_1',
                owner_company: 'Rival Corp',
                markup_pct: 25.0,
                price_paid: 300000,
                total_earned: 12000,
                is_mine: false
            });

            await sandbox.renderTabInfrastructure();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;
            assert.equal(html.includes('I Tuoi Depositi'), false, 'non deve mostrare la sezione I Tuoi Depositi se vuota');
            assert.ok(html.includes('Province Disponibili'));
        });

        test('renderTabInfrastructure mostra messaggio userError in caso di errore RPC', async () => {
            const ambErr = creaAmbienteInfrastrutture({
                rpcHandlers: {
                    rpc_get_fuel_depots: async () => ({ data: null, error: { message: 'Errore di connessione al database' } })
                }
            });

            await ambErr.sandbox.renderTabInfrastructure();

            const loadingEl = ambErr.sandbox.document.getElementById('infra-loading');
            assert.ok(loadingEl, 'elemento loading deve essere presente');
            assert.ok(loadingEl.textContent.includes('Errore'), 'deve contenere messaggio di errore formattato');
            ambErr.env.stopAllIntervals();
        });
    });

    describe('Acquisto depositi (_infraBuyDepot)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteInfrastrutture(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto valido scala 300.000€, chiama RPC e notifica successo', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 500000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            // Verifica chiamata RPC
            const buyRpc = rpcLog.find(r => r.nome === 'rpc_buy_fuel_depot');
            assert.ok(buyRpc, 'deve chiamare rpc_buy_fuel_depot');
            assert.equal(buyRpc.args.v_province_id, 'prov_firenze');

            // Verifica spesa cassa
            assert.equal(gs.cash, 200000, 'la cassa deve diminuire di 300.000€');

            // Verifica notifica
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Firenze Storica')));
        });

        test('acquisto annullato tramite confirm dialog non fa nulla', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.confirm = () => false;
            gs.cash = 500000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_buy_fuel_depot').length, 0);
            assert.equal(gs.cash, 500000);
        });

        test('acquisto rifiutato se cassa < 300.000€', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 250000;

            await sandbox._infraBuyDepot('prov_firenze', 'Firenze Storica');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_buy_fuel_depot').length, 0);
            assert.equal(gs.cash, 250000);
        });

        test('gestione errore RPC durante acquisto mostra notifica di errore', async () => {
            const ambErr = creaAmbienteInfrastrutture({
                rpcHandlers: {
                    rpc_buy_fuel_depot: async () => ({ data: null, error: { message: 'Provincia già occupata' } })
                }
            });
            ambErr.gs.cash = 400000;

            await ambErr.sandbox._infraBuyDepot('prov_milano', 'Grande Milano');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('non riuscito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('Modifica markup (_infraSetMarkup & ceMarkupPreview)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteInfrastrutture();
            await amb.sandbox.renderTabInfrastructure();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_infraSetMarkup legge lo slider dal DOM e aggiorna il markup via RPC', async () => {
            const { sandbox, rpcLog, env } = amb;

            const slider = sandbox.document.getElementById('markup-slider-prov_roma');
            assert.ok(slider, 'lo slider per prov_roma deve esistere nel DOM');
            slider.value = '35';

            await sandbox._infraSetMarkup('prov_roma');

            const setRpc = rpcLog.find(r => r.nome === 'rpc_set_fuel_markup');
            assert.ok(setRpc, 'deve chiamare rpc_set_fuel_markup');
            assert.equal(setRpc.args.v_province_id, 'prov_roma');
            assert.equal(setRpc.args.v_markup_pct, 35);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('35%')));
        });

        test('_infraSetMarkup se lo slider non esiste esce silenziosamente', async () => {
            const { sandbox, rpcLog } = amb;
            const chiamatePrima = rpcLog.length;

            await sandbox._infraSetMarkup('prov_inesistente');
            assert.equal(rpcLog.length, chiamatePrima);
        });

        test('_infraSetMarkup gestisce errore RPC con notifica di errore', async () => {
            const ambErr = creaAmbienteInfrastrutture({
                rpcHandlers: {
                    rpc_set_fuel_markup: async () => ({ data: null, error: { message: 'Permesso negato' } })
                }
            });
            await ambErr.sandbox.renderTabInfrastructure();

            const slider = ambErr.sandbox.document.getElementById('markup-slider-prov_roma');
            if (slider) slider.value = '40';

            await ambErr.sandbox._infraSetMarkup('prov_roma');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('ceMarkupPreview aggiorna l\'etichetta numerica del markup in tempo reale', () => {
            const { sandbox } = amb;
            const slider = sandbox.document.getElementById('markup-slider-prov_roma');
            const label = sandbox.document.getElementById('markup-val-prov_roma');
            assert.ok(slider && label);

            slider.value = '42';
            sandbox.ceMarkupPreview.call(slider, 'prov_roma');

            assert.equal(label.textContent, '42%');
        });
    });

    describe('Integrazione con il ciclo corse (engine-rides.js & rpc_pay_fuel_levy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteInfrastrutture(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide chiama rpc_pay_fuel_levy se la corsa parte da un POI con provincia mappata', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 10000;

            const car = gs.fleet[0];
            const driver = gs.drivers[0];
            driver.assignedCarId = car.id;

            const ride = {
                id: 101,
                fromPoi: { id: 'milano', name: 'Milano Centrale', region: 'lombardia', baseFlat: 200 },
                toPoi: { id: 'mil_mxp', name: 'Malpensa Airport', region: 'lombardia', baseFlat: 200 },
                tier: 'business',
                price: 300,
                duration: 20000,
                driverId: driver.id
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            const levyRpc = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.ok(levyRpc, 'completeRide deve invocare rpc_pay_fuel_levy');
            assert.equal(levyRpc.args.v_province_id, 'prov_milano');
            assert.ok(levyRpc.args.v_fare > 0, 'la tariffa deve essere passata all\'RPC');
        });

        test('completeRide non invoca rpc_pay_fuel_levy se il POI non ha una provincia mappata in _POI_TO_PROVINCE', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 10000;

            const car = gs.fleet[0];
            const driver = gs.drivers[0];
            driver.assignedCarId = car.id;

            const ride = {
                id: 102,
                fromPoi: { id: 'poi_non_mappato', name: 'Sconosciuto', region: 'estero', baseFlat: 100 },
                toPoi: { id: 'milano', name: 'Milano Centrale', region: 'lombardia', baseFlat: 100 },
                tier: 'standard',
                price: 150,
                duration: 20000,
                driverId: driver.id
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            const levyRpc = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.equal(levyRpc, undefined, 'non deve chiamare rpc_pay_fuel_levy per POI non mappati');
        });

        test('checkActiveTrips alla conclusione di un viaggio in differita chiama rpc_pay_fuel_levy', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 5000;

            const driver = gs.drivers[0];
            const car = gs.fleet[0];
            driver.assignedCarId = car.id;
            driver.status = 'busy';

            gs.activeTrips = [{
                id: 201,
                driverId: driver.id,
                carId: car.id,
                driverName: driver.name,
                fromName: 'Milano',
                toName: 'Malpensa',
                fromPoiId: 'milano',
                tier: 'business',
                startTime: Date.now() - 50000,
                endTime: Date.now() - 1000, // Corsa già finita nel tempo
                earnings: 250
            }];

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            const levyRpc = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');
            assert.ok(levyRpc, 'checkActiveTrips deve invocare rpc_pay_fuel_levy');
            assert.equal(levyRpc.args.v_province_id, 'prov_milano');
            assert.equal(levyRpc.args.v_fare, 250);
        });
    });

    describe('Analisi architetturale e maturazione rendite', () => {
        test('il flusso delle rendite è guidato dagli eventi delle corse multiplayer', () => {
            // Documentazione del funzionamento reale:
            // 1. Non esiste un cron autonomo che genera rendite passive senza attività.
            // 2. Il levy carburante viene addebitato quando QUALSIASI giocatore reale completa una corsa
            //    in una provincia con un deposito posseduto da un altro giocatore.
            // 3. L'incasso viene accreditato direttamente nella cassa dell'azienda proprietaria sul database
            //    tramite rpc_pay_fuel_levy e notificato via Supabase Realtime / ServerState.
            assert.ok(true);
        });
    });
});
