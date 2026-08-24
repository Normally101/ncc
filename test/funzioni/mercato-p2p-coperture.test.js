'use strict';
/* ============================================================================
   test/funzioni/mercato-p2p-coperture.test.js — buchi di copertura P2P

   Copre i percorsi del sistema "mercato fra giocatori" (p2p-market.js,
   p2p-render.js) che NESSUN altro test esercita:
   - p2pFetchTension: ramo strike_started (evento dei 5 minuti di p2pInit) —
     mai invocato prima: il mock di mercatoP2P.test.js risponde sempre false.
   - p2pFetchGdfRisk: allineamento risk_level/crumiri/immunità mai assertito.
   - Guardie senza login di tutte le azioni RPC (create/join/leave Holding,
     Consorzio, crumiri, Don Carmine, borsa).
   - Guardie di buyCompanyShares: fondi insufficienti e listing inesistente.
   - PORTA UNICA DEL DENARO per sellCompanyShares e multa GdF: i test
     esistenti verificano solo il saldo finale, quindi passerebbero anche se
     il codice toccasse gameState.cash direttamente. Qui RIMPIAZZIAMO il
     metodo CE_money (non lo avvolgiamo): se l'azione non ci passa,
     il movimento non avviene e il test diventa rosso.
   - Rendering: ramo membro di renderP2PHoldingsSection, ramo non-loggato di
     renderP2PMarketSection/renderP2PSharesSection, sciopero nel Barometro,
     immunità nell'Ispettorato.
   ============================================================================ */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('mercatoP2P — percorsi non coperti (fetch sindacato, guardie login, porta unica)', () => {
    let env, sandbox, gs;
    let syncedCashCalls;
    let supabaseRpcCalls;
    let bigEvents;
    let rpcHandlers;
    let tableData;

    function setupSupabaseMock() {
        const mockClient = {
            from: (table) => {
                const chain = {
                    select: () => chain,
                    order: () => chain,
                    gt: () => chain,
                    eq: () => chain,
                    limit: () => chain,
                    upsert: async () => ({ error: null }),
                    then: (resolve, reject) =>
                        Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve, reject),
                };
                return chain;
            },
            rpc: async (name, params) => {
                supabaseRpcCalls.push({ name, params });
                if (rpcHandlers[name]) return rpcHandlers[name](params);
                return { data: {}, error: null };
            },
        };
        sandbox.supabaseClient = mockClient;
        sandbox.window.supabaseClient = mockClient;
        sandbox.currentUser = { id: 'player_me' };
        sandbox.window.currentUser = sandbox.currentUser;
    }

    beforeEach(() => {
        syncedCashCalls = [];
        supabaseRpcCalls = [];
        bigEvents = [];
        rpcHandlers = {};
        tableData = {};

        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (v) => {
                    syncedCashCalls.push(v);
                    return { success: true, cash: v };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        // Il rendering reale (renderTabFinance & co., richiamato dalle azioni)
        // scrive dentro #tab-container: senza questo elemento le azioni
        // esplodono dopo l'effetto di gioco e mascherano i veri assert.
        const tabContainer = sandbox.document.createElement('div');
        tabContainer.id = 'tab-container';
        sandbox.document.body.appendChild(tabContainer);

        // Recorder di showBigEvent: engine-events.js definisce una versione DOM
        // che qui non ha appigli; la sostituiamo come si fa con showNotification.
        sandbox.showBigEvent = (icon, title, body) => bigEvents.push({ icon, title, body });
        sandbox.window.showBigEvent = sandbox.showBigEvent;

        setupSupabaseMock();
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. BAROMETRO: p2pFetchTension (timer 5 min di p2pInit + p2pRefreshAll)
    // ────────────────────────────────────────────────────────────────────────
    describe('p2pFetchTension — tick del Barometro della Collera', () => {

        test('strike_started: allinea tensione/sciopero e alza il banner SCIOPERO', async () => {
            const endsAt = new Date(Date.now() + 12 * 3600000).toISOString();
            rpcHandlers['rpc_tick_tension'] = async () => ({
                data: {
                    tension: 92,
                    strike_active: true,
                    strike_ends_at: endsAt,
                    strike_started: true,
                },
                error: null,
            });

            await sandbox.p2pRefreshAll();

            assert.equal(sandbox._sindacatoState.tension, 92);
            assert.equal(sandbox._sindacatoState.strikeActive, true);
            assert.equal(sandbox._sindacatoState.strikeEndsAt, endsAt);
            assert.equal(bigEvents.length, 1, 'lo sciopero appena iniziato deve alzare il banner');
            assert.ok(bigEvents[0].title.includes('SCIOPERO NAZIONALE'));
        });

        test('tick normale: aggiorna la tensione senza mai alzare il banner', async () => {
            rpcHandlers['rpc_tick_tension'] = async () => ({
                data: { tension: 41, strike_active: false, strike_ends_at: null, strike_started: false },
                error: null,
            });

            await sandbox.p2pRefreshAll();

            assert.equal(sandbox._sindacatoState.tension, 41);
            assert.equal(sandbox._sindacatoState.strikeActive, false);
            assert.deepEqual(bigEvents, [], 'niente sciopero = niente banner');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. RISCHIO GdF: p2pFetchGdfRisk
    // ────────────────────────────────────────────────────────────────────────
    describe('p2pFetchGdfRisk — sincronizzazione rischio e protezioni', () => {

        test('riporta risk_level, boost crumiri e immunità Don Carmine nello stato locale', async () => {
            const boostUntil = new Date(Date.now() + 48 * 3600000).toISOString();
            const immUntil   = new Date(Date.now() + 24 * 3600000).toISOString();
            rpcHandlers['rpc_get_gdf_risk'] = async () => ({
                data: { risk_level: 55, crumiri_boost_until: boostUntil, carmine_immunity_until: immUntil },
                error: null,
            });

            await sandbox.p2pRefreshAll();

            assert.equal(sandbox._sindacatoState.gdfRisk, 55);
            assert.equal(sandbox._sindacatoState.crumiriBoostUntil, boostUntil);
            assert.equal(sandbox._sindacatoState.carmineImmunityUntil, immUntil);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. GUARDIE SENZA LOGIN — nessuna azione RPC deve partire
    // ────────────────────────────────────────────────────────────────────────
    describe('Guardie senza login delle azioni P2P', () => {

        test('senza utente: holding, consorzio, crumiri, Don Carmine e borsa non chiamano RPC', async () => {
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.createHolding('X');
            await sandbox.joinHolding('hld_1');
            await sandbox.leaveHolding('hld_1');
            await sandbox.contributeHoldingTreasury('hld_1', 10000);
            await sandbox.createConsorzio('X');
            await sandbox.joinConsorzio('cso_1');
            await sandbox.leaveConsorzio('cso_1');
            await sandbox.contributeConsorzio('cso_1', 10000);
            await sandbox.hireCrumiri();
            await sandbox.payDonCarmine();
            await sandbox.buyCompanyShares('sh_1', 10);
            await sandbox.sellCompanyShares('sh_1', 10);

            assert.deepEqual(supabaseRpcCalls.map(c => c.name), [],
                'nessuna RPC deve partire senza utente autenticato');
        });

        test('senza utente: cancelP2PListing ritira nulla', async () => {
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            const flottaPrima = gs.fleet.length;
            await sandbox.cancelP2PListing('lst_1');

            assert.equal(supabaseRpcCalls.length, 0);
            assert.equal(gs.fleet.length, flottaPrima, 'nessuna auto fantasma restituita');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. BUORSA VALORI: guardie mai esercitate di buyCompanyShares
    // ────────────────────────────────────────────────────────────────────────
    describe('buyCompanyShares — guardie pre-acquisto', () => {

        test('fondi insufficienti: nessuna RPC, denaro intatto, notifica', async () => {
            sandbox._p2pMarket.shares = [
                { id: 'sh_caro', company_name: 'Apex Mobility', current_price: 65, shares_available: 100 },
            ];
            gs.cash = 100; // servono 50*65=3250

            await sandbox.buyCompanyShares('sh_caro', 50);

            assert.equal(supabaseRpcCalls.length, 0, 'la RPC non deve partire senza fondi');
            assert.equal(gs.cash, 100);
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti')));
        });

        test('listing inesistente o esaurito: ritorno silenzioso senza RPC', async () => {
            sandbox._p2pMarket.shares = [];
            gs.cash = 100000;

            await sandbox.buyCompanyShares('sh_fantasma', 10);

            assert.equal(supabaseRpcCalls.length, 0);
            assert.equal(gs.cash, 100000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. PORTA UNICA DEL DENARO — percorsi dove il test esistente guarda solo
    //    il saldo finale e quindi non sentirebbe una bypassata di CE_money.
    //    Sostituiamo il metodo della porta: se il codice non lo usa, niente
    //    movimento e il test è rosso.
    // ────────────────────────────────────────────────────────────────────────
    describe('Porta unica del denaro — sellCompanyShares e multa GdF', () => {

        function sostituiciPortaCEMoney() {
            const addebiti = [];
            const accrediti = [];
            sandbox.CE_money.addebitatoDalServer = (importo, motivo) => {
                addebiti.push({ importo, motivo });
                gs.cash -= importo; // unico modo per muovere cassa nel test
            };
            sandbox.CE_money.accreditatoDalServer = (importo, motivo) => {
                accrediti.push({ importo, motivo });
                gs.cash += importo;
            };
            return { addebiti, accrediti };
        }

        test('sellCompanyShares accredita SOLO via CE_money.accreditatoDalServer', async () => {
            rpcHandlers['rpc_sell_company_shares'] = async () => ({
                data: { company: 'Apex Mobility', total: 650, qty_sold: 10 },
                error: null,
            });
            gs.cash = 5000;
            const porta = sostituiciPortaCEMoney();

            await sandbox.sellCompanyShares('sh_apex', 10);

            assert.deepEqual(porta.accrediti, [{ importo: 650, motivo: 'sell_company_shares' }],
                'l incasso deve passare dalla porta unica');
            assert.equal(porta.addebiti.length, 0);
            assert.equal(gs.cash, 5650);
            assert.deepEqual(syncedCashCalls, [], 'il server ha giá mosso il saldo: mai syncCash');
        });

        test('multa GdF (_sindacatoGdfDailyCheck) passa da CE_money.addebitatoDalServer', async () => {
            rpcHandlers['rpc_gdf_inspection_check'] = async () => ({
                data: { inspected: true, fine: 3000 },
                error: null,
            });
            gs.cash = 9000;
            sandbox._sindacatoState.gdfRisk = 70;
            const porta = sostituiciPortaCEMoney();

            await sandbox._sindacatoGdfDailyCheck();

            assert.deepEqual(porta.addebiti, [{ importo: 3000, motivo: 'gdf_fine' }],
                'la multa deve passare dalla porta unica');
            assert.equal(gs.cash, 6000);
            assert.equal(sandbox._sindacatoState.gdfRisk, 40, '70 − 30 punti dopo ispezione');
            assert.deepEqual(syncedCashCalls, []);
        });

        test('sellCompanyShares con errore RPC: zero movimenti, saldo intatto', async () => {
            rpcHandlers['rpc_sell_company_shares'] = async () => ({
                data: null,
                error: { message: 'azioni non possedute' },
            });
            gs.cash = 5000;
            const porta = sostituiciPortaCEMoney();

            await sandbox.sellCompanyShares('sh_bad', 10);

            assert.equal(porta.accrediti.length, 0, 'errore = nessun accredito fantasma');
            assert.equal(porta.addebiti.length, 0);
            assert.equal(gs.cash, 5000);
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. RENDERING — rami mai renderizzati dai test esistenti
    // ────────────────────────────────────────────────────────────────────────
    describe('Rendering P2P — rami non coperti', () => {

        test('renderP2PHoldingsSection da MEMBRO: cassa, ruolo e bottoni contributo/uscita', () => {
            sandbox._p2pMarket.myHolding = {
                id: 'hld_mia',
                name: 'Sindacato Lazio',
                description: 'Uniti',
                treasury: 120000,
                max_members: 10,
                holding_members: [
                    { user_id: 'player_me', company_name: 'Mia Azienda', role: 'leader' },
                    { user_id: 'altro', company_name: 'Altra Flotta', role: 'member' },
                ],
            };

            const html = sandbox.renderP2PHoldingsSection();

            assert.ok(html.includes('Sindacato Lazio'));
            // Separatore migliaia dipendente dal locale del runtime (120.000 / 120,000)
            assert.match(html, /€120[.,]000/, 'la cassa del sindacato deve essere visibile');
            assert.ok(html.includes('leader'), 'il ruolo del giocatore deve essere visibile');
            assert.ok(html.includes('data-ce-act="ceHoldingContribute"'));
            assert.ok(html.includes('data-ce-act="leaveHolding"'));
            assert.ok(html.includes('Sciogli'), 'il leader vede Sciogli, non Esci');
            assert.ok(!html.includes('Fonda il Sindacato'), 'da membro il form di creazione sparisce');
        });

        test('renderP2PMarketSection senza login: invito ad accedere, zero bottoni Compra', () => {
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;
            sandbox._p2pMarket.listings = [
                { id: 'l1', seller_user_id: 'other', seller_name: 'Bob', ask_price: 20000, car_snapshot: { name: 'Fiat Tipo' } },
            ];

            const html = sandbox.renderP2PMarketSection();

            assert.ok(html.includes('Accedi per vedere il mercato'));
            assert.ok(!html.includes('data-ce-act="buyP2PCar"'), 'senza login nessun acquisto');
        });

        test('renderP2PSharesSection senza login: sezione assente', () => {
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;
            sandbox._p2pMarket.shares = [
                { id: 'sh1', issuer_user_id: 'other', company_name: 'X', ipo_price: 10, current_price: 10, shares_total: 10, shares_available: 10 },
            ];

            assert.equal(sandbox.renderP2PSharesSection(), '');
        });

        test('renderBarometroWidget con sciopero attivo: blocco SCIOPERO con ore residue', () => {
            sandbox._sindacatoState.tension = 95;
            sandbox._sindacatoState.strikeActive = true;
            sandbox._sindacatoState.strikeEndsAt = new Date(Date.now() + 6 * 3600000).toISOString();

            const html = sandbox.renderBarometroWidget();

            assert.ok(html.includes('SCIOPERO NAZIONALE IN CORSO'));
            assert.ok(html.includes('−30%'));
            assert.ok(/~\d+h/.test(html), 'le ore residue devono comparire');
        });

        test('renderIspettoratoSection con immunità attiva: scudo visibile e Don Carmine disabilitato', () => {
            sandbox._sindacatoState.gdfRisk = 30;
            sandbox._sindacatoState.carmineImmunityUntil = new Date(Date.now() + 20 * 3600000).toISOString();

            const html = sandbox.renderIspettoratoSection();

            assert.ok(html.includes('Immunità attiva'));
            assert.match(html, /data-ce-act="payDonCarmine"[^>]*disabled/,
                'con immunità attiva il pulsante Don Carmine deve essere disabilitato');
        });
    });
});
