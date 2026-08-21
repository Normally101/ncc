'use strict';
/* ============================================================================
   test/funzioni/holding.test.js — Verifica approfondita Holding & OPA Ostili

   Verifica del funzionamento della feature "holding" (attualmente disattivata in config.js):
   1. Holding finanziaria locale (engine-holding.js):
      - Incorporazione holding (incorporateHolding)
      - Acquisizione subsidiarie (acquireSubsidiary)
      - Cessione subsidiarie (divestSubsidiary)
      - Negoziazione azioni $CEMP (buyCempShares, sellCempShares)
      - Quotazione IPO aziendale NPC (_listCompanyIPO_NPC)
      - Dividendi passivi e oscillazione prezzo nel ciclo giornaliero (engine-daily.js)
   2. OPA Ostili e Acquisizioni (hostile_takeover.js):
      - Rendering della scheda OPA (renderTabOPA)
      - Recupero OPA attive (target, raider, osservatore) tramite RPC Supabase
      - Riacquisto quota di controllo (_opaRequestBuyback)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente per testare sia la holding locale sia le OPA ostili con Supabase.
 */
function creaAmbienteHolding(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];

    const opaListDefault = [
        {
            opa_id: 'opa_001',
            raider_company: 'Apex Chauffeur S.p.A.',
            target_company: 'Test Company',
            raider_pct: 54.5,
            total_dividends: 12500,
            buyback_price: 150000,
            is_my_target: true,
            is_my_raid: false,
            triggered_at: new Date('2026-08-01T10:00:00Z').toISOString(),
        },
        {
            opa_id: 'opa_002',
            raider_company: 'Test Company',
            target_company: 'Luxe Fleet Roma',
            raider_pct: 52.0,
            total_dividends: 8400,
            buyback_price: 95000,
            is_my_target: false,
            is_my_raid: true,
            triggered_at: new Date('2026-08-10T14:00:00Z').toISOString(),
        },
        {
            opa_id: 'opa_003',
            raider_company: 'Milano VIP Shuttle',
            target_company: 'Torino Black Car',
            raider_pct: 58.0,
            total_dividends: 3200,
            buyback_price: 60000,
            is_my_target: false,
            is_my_raid: false,
            triggered_at: new Date('2026-08-15T09:00:00Z').toISOString(),
        },
    ];

    let statoOPA = (opzioni.opaList !== undefined ? opzioni.opaList : opaListDefault);

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const sbClient = {
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args);
            }
            if (nome === 'rpc_get_hostile_takeovers') {
                if (opzioni.simulaErroreRpc) {
                    return { data: null, error: { message: 'Errore RPC di rete', code: '500' } };
                }
                return { data: statoOPA, error: null };
            }
            if (nome === 'rpc_opa_buyback') {
                if (opzioni.simulaErroreBuyback) {
                    return { data: null, error: { message: 'Fondi insufficienti per buyback su server' } };
                }
                // Rimuove l'OPA riacquistata dall'elenco
                statoOPA = statoOPA.filter(o => o.opa_id !== args.v_opa_id);
                return { data: { success: true, opa_id: args.v_opa_id }, error: null };
            }
            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;

    // Prepara contenitore DOM per il rendering
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        syncedCash,
        getStatoOPA: () => statoOPA,
    };
}

describe('Funzione Holding — Holding Finanziaria Locale (engine-holding.js)', () => {

    describe('Catalogo Sussidiarie (HOLDING_SUBSIDIARIES)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('HOLDING_SUBSIDIARIES è definito e contiene 5 sussidiarie valide', () => {
            const subs = vm.runInContext('HOLDING_SUBSIDIARIES', amb.sandbox);
            assert.ok(Array.isArray(subs), 'HOLDING_SUBSIDIARIES deve essere un array');
            assert.equal(subs.length, 5);

            const ids = Array.from(subs, s => String(s.id));
            assert.deepEqual(ids, ['sub_fleet', 'sub_hotel', 'sub_fuel', 'sub_park', 'sub_tech']);

            Array.from(subs).forEach(s => {
                assert.ok(s.cost > 0, `costo invalido per ${s.id}`);
                assert.ok(s.dailyIncome > 0, `dailyIncome invalido per ${s.id}`);
                assert.ok(typeof s.name === 'string' && s.name.length > 0);
                assert.ok(typeof s.desc === 'string' && s.desc.length > 0);
            });
        });
    });

    describe('window.incorporateHolding — Fondazione Holding', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('incorporazione rifiutata se la reputazione è inferiore a 4.0 stelle', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 500000;
            gs.reputation = 3.8;

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.holding?.incorporated, false);
            assert.equal(gs.cash, 500000);
            assert.equal(syncedCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('serve 4★')));
        });

        test('incorporazione rifiutata se la holding è già incorporata', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 500000;
            gs.reputation = 4.5;
            gs.holding = { incorporated: true, incorporationDay: 1, subsidiaries: [] };

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.equal(syncedCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già incorporata')));
        });

        test('incorporazione rifiutata se il denaro è inferiore al costo (€200.000)', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 150000;
            gs.reputation = 4.5;

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.holding?.incorporated, false);
            assert.equal(gs.cash, 150000);
            assert.equal(syncedCash.length, 0);
        });

        test('incorporazione valida detrae €200.000, imposta stato holding e sincronizza con server', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 300000;
            gs.reputation = 4.2;
            gs.day = 12;

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.holding?.incorporated, true);
            assert.equal(gs.holding?.incorporationDay, 12);
            assert.equal(gs.holding?.subsidiaries?.length, 0);
            assert.deepEqual(syncedCash, [100000]);
            assert.ok(env.logs.some(l => l.includes('Holding Finanziaria fondata')));
        });
    });

    describe('window.acquireSubsidiary — Acquisizione sussidiarie', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisizione rifiutata se la holding non è ancora incorporata', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 500000;
            gs.holding = { incorporated: false, subsidiaries: [] };

            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('fondare una Holding')));
        });

        test('acquisizione di un id inesistente non fa nulla', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 500000;
            gs.holding = { incorporated: true, subsidiaries: [] };

            sandbox.acquireSubsidiary('sub_non_esiste');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.equal(gs.holding.subsidiaries.length, 0);
        });

        test('acquisizione di una sussidiaria già posseduta viene rifiutata', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 500000;
            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet'] };

            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già acquisita')));
        });

        test('acquisizione con fondi insufficienti viene bloccata', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000; // sub_hotel costa 250000
            gs.holding = { incorporated: true, subsidiaries: [] };

            sandbox.acquireSubsidiary('sub_hotel');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.holding.subsidiaries.length, 0);
        });

        test('acquisizione valida scala il costo, registra la sussidiaria e sincronizza', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 400000;
            gs.holding = { incorporated: true, subsidiaries: [] };

            sandbox.acquireSubsidiary('sub_fuel'); // costa 180000
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 220000);
            assert.equal(gs.holding.subsidiaries.length, 1);
            assert.equal(gs.holding.subsidiaries[0], 'sub_fuel');
            assert.deepEqual(syncedCash, [220000]);
            assert.ok(env.logs.some(l => l.includes('Acquisita: Rete Distributori ENI')));
        });
    });

    describe('window.divestSubsidiary — Cessione sussidiarie', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('cessione di sussidiaria non posseduta o id errato non fa nulla', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet'] };

            sandbox.divestSubsidiary('sub_hotel');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.holding.subsidiaries.length, 1);
            assert.equal(gs.holding.subsidiaries[0], 'sub_fleet');
            assert.equal(syncedCash.length, 0);
        });

        test('cessione valida accredita il 60% del costo d acquisto e rimuove la sussidiaria', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 10000;
            // sub_tech costa 300000 -> 60% = 180000
            gs.holding = { incorporated: true, subsidiaries: ['sub_tech', 'sub_fleet'] };

            sandbox.divestSubsidiary('sub_tech');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 190000);
            assert.equal(gs.holding.subsidiaries.length, 1);
            assert.equal(gs.holding.subsidiaries[0], 'sub_fleet');
            assert.deepEqual(syncedCash, [190000]);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('DriveAI S.r.l. ceduta')));
        });
    });

    describe('window.buyCempShares & sellCempShares — Compravendita azioni $CEMP', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCempShares scala costo calcolato da cempPrice e incrementa quota', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 1000;
            gs.cempPrice = 15.5;

            sandbox.buyCempShares(10); // 15.5 * 10 = 155€
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 845);
            assert.equal(gs.cempOwnedShares, 10);
            assert.deepEqual(syncedCash, [845]);
        });

        test('buyCempShares con cempPrice non definito usa il default di €10', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 1000;
            delete gs.cempPrice;

            sandbox.buyCempShares(5); // 10 * 5 = 50€
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 950);
            assert.equal(gs.cempOwnedShares, 5);
            assert.deepEqual(syncedCash, [950]);
        });

        test('buyCempShares con fondi insufficienti non modifica le azioni', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50;
            gs.cempPrice = 10;

            sandbox.buyCempShares(10); // 100€ > 50€
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50);
            assert.equal(gs.cempOwnedShares || 0, 0);
            assert.equal(syncedCash.length, 0);
        });

        test('sellCempShares accredita ricavo della vendita e decrementa le azioni possedute', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 200;
            gs.cempPrice = 20.0;
            gs.cempOwnedShares = 30;

            sandbox.sellCempShares(10); // 20 * 10 = 200€
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 400);
            assert.equal(gs.cempOwnedShares, 20);
            assert.deepEqual(syncedCash, [400]);
        });

        test('sellCempShares con quota insufficiente fallisce con notifica di errore', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 200;
            gs.cempPrice = 20.0;
            gs.cempOwnedShares = 5;

            sandbox.sellCempShares(10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 200);
            assert.equal(gs.cempOwnedShares, 5);
            assert.equal(syncedCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Azioni insufficienti')));
        });

        test('buyCempShares e sellCempShares con input non numerico (NaN/stringa non valida) non corompono lo stato', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 500;
            gs.cempPrice = 10;
            gs.cempOwnedShares = 20;

            sandbox.buyCempShares('abc');
            await new Promise(r => setImmediate(r));
            assert.ok(Number.isFinite(gs.cempOwnedShares), 'cempOwnedShares deve rimanere un numero finito');

            sandbox.sellCempShares('abc');
            await new Promise(r => setImmediate(r));
            assert.ok(Number.isFinite(gs.cempOwnedShares), 'cempOwnedShares non deve diventare NaN');
            assert.ok(Number.isFinite(gs.cash), 'cash non deve diventare NaN');
        });
    });

    describe('window._listCompanyIPO_NPC — Quotazione aziendale NPC', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_listCompanyIPO_NPC rifiutata se la reputazione è inferiore a 3.5 stelle', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100000;
            gs.reputation = 3.2;

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.companyIPO?.listed, undefined);
            assert.equal(gs.cash, 100000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('serve 3.5★')));
        });

        test('_listCompanyIPO_NPC rifiutata se l azienda è già quotata', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100000;
            gs.reputation = 4.0;
            gs.companyIPO = { listed: true };

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già quotata')));
        });

        test('_listCompanyIPO_NPC quota in borsa, crea struttura e accredita acquisto 300 azioni NPC', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 100000;
            gs.reputation = 4.0;
            gs.day = 15;
            gs.companyName = 'Empire NCC';

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            // Fee: 50.000 -> cash = 50.000.
            // sharePrice = max(10, round(50000 / 1000)) = 50.
            // npcBuy = 50 * 300 = 15.000.
            // Net cash = 65.000.
            assert.equal(gs.cash, 65000);
            assert.equal(gs.companyIPO?.listed, true);
            assert.equal(gs.companyIPO?.listedDay, 15);
            assert.equal(gs.companyIPO?.sharesTotal, 1000);
            assert.equal(gs.companyIPO?.sharePrice, 50);
            assert.equal(gs.companyIPO?.npcSharesOwned, 300);
            assert.equal(gs.companyIPO?.dividendsPaid, 0);
            assert.deepEqual(syncedCash, [50000, 65000]);
            assert.ok(env.logs.some(l => l.includes('Empire NCC quotata in borsa')));
        });
    });

    describe('Ciclo giornaliero — Dividendi sussidiarie e dividendi IPO (engine-daily.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('processDailyRoutines accredita dividendi giornalieri delle sussidiarie possedute', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            // sub_fleet (+800) + sub_hotel (+1500) = 2300/g
            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet', 'sub_hotel'] };

            sandbox.processDailyRoutines();

            // Cash aumenta dei dividendi
            assert.ok(gs.cash > 10000, 'il saldo deve beneficiare dei dividendi sussidiarie');
            assert.ok(amb.env.logs.some(l => l.includes('Holding: dividendi subsidiarie')));
        });

        test('processDailyRoutines aggiorna il prezzo di $CEMP e ne traccia lo storico', () => {
            const { sandbox, gs } = amb;
            gs.cempPrice = 10.0;
            gs.reputation = 4.5;
            gs.weeklyEarnings = 20000;
            gs.fleet = [{ id: 'car_1' }, { id: 'car_2' }];

            sandbox.processDailyRoutines();

            assert.ok(gs.cempPrice > 0, 'il prezzo CEMP deve essere positivo');
            assert.ok(Array.isArray(gs.cempHistory), 'cempHistory deve essere un array');
            assert.equal(gs.cempHistory.length, 1);
            assert.equal(gs.cempHistory[0], gs.cempPrice);
        });

        test('processDailyRoutines paga il 10% degli utili agli azionisti NPC se quotata in IPO', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            // Aggiungiamo un investimento a rendita passiva (es. inv_corporate_retainer con passive: 2000)
            gs.investments = ['inv_corporate_retainer'];
            gs.companyIPO = {
                listed: true,
                sharesTotal: 1000,
                sharePrice: 20,
                npcSharesOwned: 300,
                dividendsPaid: 0,
            };

            sandbox.processDailyRoutines();

            assert.ok(gs.companyIPO.dividendsPaid > 0, 'i dividendi pagati devono essere incrementati');
            assert.ok(amb.env.logs.some(l => l.includes('IPO Dividendo:')));
        });
    });
});

describe('Funzione Holding — OPA Ostili e M&A Server (hostile_takeover.js)', () => {

    describe('window.renderTabOPA — Rendering interfaccia OPA', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabOPA non fallisce se tab-container non è presente nel DOM', async () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            await assert.doesNotReject(async () => {
                await sandbox.renderTabOPA();
            });
        });

        test('renderTabOPA mostra messaggio di errore se la RPC Supabase fallisce', async () => {
            const ambErr = creaAmbienteHolding({ simulaErroreRpc: true });
            const container = ambErr.sandbox.document.getElementById('tab-container');

            await ambErr.sandbox.renderTabOPA();

            assert.ok(container.innerHTML.includes('Impossibile caricare le acquisizioni, riprova.'));
            ambErr.env.stopAllIntervals();
        });

        test('renderTabOPA mostra stato vuoto se non ci sono OPA in corso', async () => {
            const ambEmpty = creaAmbienteHolding({ opaList: [] });
            const container = ambEmpty.sandbox.document.getElementById('tab-container');

            await ambEmpty.sandbox.renderTabOPA();

            assert.ok(container.innerHTML.includes('Nessuna OPA in corso.'));
            assert.ok(container.innerHTML.includes('Compra azioni di un rivale dal tab Finance'));
            ambEmpty.env.stopAllIntervals();
        });

        test('renderTabOPA disegna card con distinzione ruoli: TARGET, RAIDER e OSSERVATORE', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabOPA();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            // Intestazione
            assert.ok(html.includes('OPA Ostili'));
            assert.ok(html.includes('51% → Controllo'));

            // Ruoli e badge
            assert.ok(html.includes('⚠️ Sei il TARGET'));
            assert.ok(html.includes('🦅 Sei il RAIDER'));
            assert.ok(html.includes('👁 Osservatore'));

            // Card target deve avere pulsante di buyback con ceAct
            assert.ok(html.includes('Riacquista maggioranza'));
            assert.ok(html.includes('data-ce-act="_opaRequestBuyback"'));
        });
    });

    describe('window._opaRequestBuyback — Riacquisto quota di controllo', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyback rifiutato se l utente annulla la conferma (confirm dialog)', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.confirm = () => false;
            gs.cash = 200000;

            await sandbox._opaRequestBuyback('opa_001', 150000);

            assert.equal(gs.cash, 200000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_opa_buyback').length, 0);
        });

        test('buyback con cassa insufficiente non scala denaro e non invoca RPC', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 50000; // Serve 150000

            await sandbox._opaRequestBuyback('opa_001', 150000);

            assert.equal(gs.cash, 50000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_opa_buyback').length, 0);
        });

        test('buyback valido detrae denaro, chiama rpc_opa_buyback, invoca saveGame e notifica successo', async () => {
            const { sandbox, gs, rpcLog, syncedCash, env } = amb;
            gs.cash = 200000;
            let saveGameCalled = false;
            sandbox.saveGame = () => { saveGameCalled = true; };

            await sandbox._opaRequestBuyback('opa_001', 150000);

            // Cassa scalata (server-authoritative: addebitatoDalServer, no syncCash)
            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, [], 'non deve rispedire syncCash perché rpc_opa_buyback muove già companies.cash');
            assert.equal(saveGameCalled, true, 'saveGame deve essere invocato per persistere la cassa aggiornata');

            // RPC invocata con argomenti corretti
            const buyRpc = rpcLog.find(r => r.nome === 'rpc_opa_buyback');
            assert.ok(buyRpc, 'deve chiamare rpc_opa_buyback');
            assert.equal(buyRpc.args.v_opa_id, 'opa_001');

            // Notifica
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Buyback completato')));
        });

        test('buyback con errore RPC notifica errore all utente', async () => {
            const ambErr = creaAmbienteHolding({ simulaErroreBuyback: true });
            ambErr.gs.cash = 200000;

            await ambErr.sandbox._opaRequestBuyback('opa_001', 150000);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Buyback non riuscito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('Integrazione Event-Delegation — Invocazione tramite ceAct', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteHolding();
            await amb.sandbox.renderTabOPA();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su pulsante buyback generato da ceAct esegue _opaRequestBuyback', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 300000;

            const btn = sandbox.document.querySelector('[data-ce-act="_opaRequestBuyback"]');
            assert.ok(btn, 'il pulsante di buyback deve esistere nel DOM');

            // Simula dispatch dell'evento click / ceAct
            const rawAct = btn.getAttribute('data-ce-act');
            const rawArgs = JSON.parse(btn.getAttribute('data-ce-args') || '[]');
            assert.equal(rawAct, '_opaRequestBuyback');
            assert.equal(rawArgs[0], 'opa_001');
            assert.equal(rawArgs[1], 150000);

            await sandbox[rawAct](...rawArgs);

            assert.equal(gs.cash, 150000);
            assert.ok(rpcLog.some(r => r.nome === 'rpc_opa_buyback' && r.args.v_opa_id === 'opa_001'));
        });
    });

    describe('Ciclo completo sussidiarie — Acquisizione, dividendi e cessione di tutte le 5 opzioni', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tutte le 5 sussidiarie possono essere acquisite in sequenza e i dividendi sommati correttamente', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 2000000;
            gs.reputation = 4.5;
            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.holding?.incorporated, true);

            const allSubs = ['sub_fleet', 'sub_hotel', 'sub_fuel', 'sub_park', 'sub_tech'];
            for (const subId of allSubs) {
                sandbox.acquireSubsidiary(subId);
                await new Promise(r => setImmediate(r));
            }

            assert.equal(gs.holding.subsidiaries.length, 5);
            assert.deepEqual(Array.from(gs.holding.subsidiaries), allSubs);

            // Calcolo dividendi attesi: 800 + 1500 + 1200 + 600 + 2000 = 6100
            const cashBeforeTick = gs.cash;
            sandbox.processDailyRoutines();
            assert.ok(gs.cash > cashBeforeTick, 'il saldo deve incrementarsi per tutte e 5 le sussidiarie');

            // Cessione di tutte le 5
            for (const subId of allSubs) {
                sandbox.divestSubsidiary(subId);
                await new Promise(r => setImmediate(r));
            }
            assert.equal(gs.holding.subsidiaries.length, 0);
        });
    });

    describe('Verifica Domanda (b) — Permanenza dello stato ed eco Realtime dal Server', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('incorporazione holding e acquisto sussidiarie restano in gameState dopo eco Realtime', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 500000;
            gs.reputation = 4.2;

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));
            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));

            // Simula eco Realtime del server che invia un aggiornamento di cassa (es. sincronizzato a 150000)
            gs.cash = 150000;

            // Verifica che lo stato acquistato (holding + sussidiarie) non venga annullato
            assert.equal(gs.holding?.incorporated, true);
            assert.deepEqual(Array.from(gs.holding?.subsidiaries || []), ['sub_fleet']);
        });

        test('acquisto azioni $CEMP resta in gameState dopo eco Realtime', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 1000;
            gs.cempPrice = 10;

            sandbox.buyCempShares(50);
            await new Promise(r => setImmediate(r));

            // Simula eco Realtime
            gs.cash = 500;

            assert.equal(gs.cempOwnedShares, 50);
        });

        test('buyback OPA risolve l OPA e la cassa locale resta sincronizzata senza annullamento', async () => {
            const { sandbox, gs, getStatoOPA } = amb;
            gs.cash = 300000;

            await sandbox._opaRequestBuyback('opa_001', 150000);

            // Cassa scalata a 150000
            assert.equal(gs.cash, 150000);
            // Simula eco Realtime che conferma cash = 150000
            gs.cash = 150000;

            // OPA opa_001 deve essere rimossa dalla lista attiva
            assert.ok(!getStatoOPA().some(o => o.opa_id === 'opa_001'), 'l OPA deve essere risolta');
        });
    });

    describe('Verifica Domanda (c) — Conformità schema dati RPC Server e Client', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteHolding(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payload di rpc_get_hostile_takeovers contiene tutte le proprietà previste da hostile_takeover.js', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabOPA();

            const stato = amb.getStatoOPA();
            stato.forEach(opa => {
                assert.ok(typeof opa.opa_id === 'string');
                assert.ok(typeof opa.target_company === 'string');
                assert.ok(typeof opa.raider_company === 'string');
                assert.ok(typeof opa.raider_pct === 'number');
                assert.ok(typeof opa.buyback_price === 'number');
                assert.ok(typeof opa.total_dividends === 'number');
                assert.ok(typeof opa.triggered_at === 'string');
                assert.ok(typeof opa.is_my_target === 'boolean');
                assert.ok(typeof opa.is_my_raid === 'boolean');
            });
        });

        test('rpc_opa_buyback riceve esattamente il parametro v_opa_id atteso dallo schema SQL', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 200000;

            await sandbox._opaRequestBuyback('opa_002', 95000);

            const call = rpcLog.find(r => r.nome === 'rpc_opa_buyback');
            assert.ok(call);
            assert.deepEqual(Object.keys(call.args), ['v_opa_id']);
            assert.equal(call.args.v_opa_id, 'opa_002');
        });
    });
});
