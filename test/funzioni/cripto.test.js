'use strict';
/* ============================================================================
   test/funzioni/cripto.test.js — Verifica approfondita del modulo Cripto & Offshore

   Scopo: verificare che tutte le azioni esposte da `crypto.js` e dai relativi
   gestori `ce-actions.js` funzionino realmente in presenza del contesto e dei
   dati attesi (Supabase RPC, tabelle di mercato AMM, conti offshore, DOM UI).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase completo per criptovalute e offshore.
 */
function creaAmbienteCripto(opzioni = {}) {
    const rpcLog = [];
    const queryLog = [];
    const realtimeHandlers = [];

    const mercatoDefault = [
        { id: 'EMPIRE', name: 'EmpireCoin', icon: '👑', price_eur: 10.0, supply: 500000, reserve_eur: 5000000, volatility: 0.12 },
        { id: 'BTC', name: 'Bitcoin', icon: '₿', price_eur: 60000.0, supply: 1000, reserve_eur: 60000000, volatility: 0.06 },
        { id: 'ETH', name: 'Ethereum', icon: '⟠', price_eur: 3000.0, supply: 10000, reserve_eur: 30000000, volatility: 0.08 },
        { id: 'USDT', name: 'Tether USD', icon: '💵', price_eur: 1.0, supply: 1000000, reserve_eur: 1000000, volatility: 0.002 },
    ];

    const portfolioDefault = [
        { coin_id: 'EMPIRE', name: 'EmpireCoin', icon: '👑', amount: 500, avg_buy: 9.0, current_price: 10.0, value_eur: 5000, pnl_pct: 11.11 },
    ];

    const offshoreDefault = [
        { id: 'off_1', user_id: 'user_test', jurisdiction: 'cayman', balance: 48500, total_deposited: 50000, fee_rate: 0.03 },
        { id: 'off_2', user_id: 'user_test', jurisdiction: 'switzerland', balance: 0, total_deposited: 0, fee_rate: 0.03 },
    ];

    let statoMercato = (opzioni.mercato || mercatoDefault).map(c => ({ ...c }));
    let statoPortfolio = (opzioni.portfolio || portfolioDefault).map(p => ({ ...p }));
    let statoOffshore = (opzioni.offshore || offshoreDefault).map(o => ({ ...o }));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: (tabella) => ({
            select: (colonne) => ({
                order: (campo) => {
                    queryLog.push({ tabella, operazione: 'select_order', campo });
                    if (tabella === 'crypto_market') {
                        return Promise.resolve({ data: statoMercato, error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
                eq: (campo, valore) => {
                    queryLog.push({ tabella, operazione: 'select_eq', campo, valore });
                    if (tabella === 'offshore_accounts') {
                        return Promise.resolve({ data: statoOffshore, error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
            }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoMercato, statoPortfolio, statoOffshore });
            }

            if (nome === 'rpc_get_crypto_portfolio') {
                return { data: statoPortfolio, error: null };
            }

            if (nome === 'rpc_buy_crypto') {
                const coin = statoMercato.find(c => c.id === args.v_coin_id);
                if (!coin) return { data: null, error: { message: 'Crypto non trovata' } };
                const coinsGot = args.v_eur_in / coin.price_eur;
                return {
                    data: {
                        coin_id: args.v_coin_id,
                        eur_spent: args.v_eur_in,
                        coins_got: coinsGot,
                        new_price: coin.price_eur,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_sell_crypto') {
                const coin = statoMercato.find(c => c.id === args.v_coin_id);
                if (!coin) return { data: null, error: { message: 'Crypto non trovata' } };
                const eurReceived = args.v_coins_in * coin.price_eur;
                return {
                    data: {
                        eur_received: eurReceived,
                        coins_sold: args.v_coins_in,
                        new_price: coin.price_eur,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_deposit_offshore') {
                const fee = Math.floor(args.v_eur_amount * 0.03);
                const net = args.v_eur_amount - fee;
                let acc = statoOffshore.find(o => o.jurisdiction === args.v_jurisdiction);
                if (acc) {
                    acc.balance += net;
                    acc.total_deposited += args.v_eur_amount;
                } else {
                    acc = { id: 'off_new', jurisdiction: args.v_jurisdiction, balance: net, total_deposited: args.v_eur_amount };
                    statoOffshore.push(acc);
                }
                return {
                    data: {
                        net_deposited: net,
                        fee: fee,
                        jurisdiction: args.v_jurisdiction,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_withdraw_offshore') {
                let acc = statoOffshore.find(o => o.jurisdiction === args.v_jurisdiction);
                const amt = args.v_eur_amount;
                const seized = Boolean(opzioni.simulaSequestroGdF);
                const penalty = seized ? Math.floor(amt * 0.40) : 0;
                const received = amt - penalty;
                if (acc) {
                    acc.balance = Math.max(0, acc.balance - amt);
                }
                return {
                    data: {
                        received,
                        seized,
                        penalty,
                    },
                    error: null,
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
    env.sandbox.currentUser = { id: 'user_test' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Crea contenitore scheda per test di rendering
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        queryLog,
        realtimeHandlers,
        statoMercato,
        statoPortfolio,
        statoOffshore,
    };
}

describe('Funzione Cripto — Esecuzione e ciclo di vita', () => {

    describe('window.cryptoRefresh e recupero dati', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('cryptoRefresh popola mercato, portfolio e offshore da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.cryptoRefresh(true);

            assert.equal(sandbox._cryptoState.market.length, 4, 'il mercato deve contenere 4 coin');
            assert.equal(sandbox._cryptoState.portfolio.length, 1, 'il portfolio deve contenere 1 holding');
            assert.equal(sandbox._cryptoState.offshore.length, 2, 'i conti offshore devono essere 2');
            assert.ok(sandbox._cryptoState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('cryptoRefresh rispetta il throttling di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.cryptoRefresh(true);
            const chiamatePrima = rpcLog.length;

            // Seconda chiamata immediata senza force=true -> non deve effettuare nuove query
            await sandbox.cryptoRefresh(false);
            assert.equal(rpcLog.length, chiamatePrima, 'la chiamata throttled non deve invocare RPC');

            // Chiamata con force=true -> bypassa il throttle
            await sandbox.cryptoRefresh(true);
            assert.equal(rpcLog.length, chiamatePrima + 1, 'la chiamata forzata deve rieseguire le query');
        });

        test('cryptoRefresh gestisce assenza di supabaseClient senza errori', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.cryptoRefresh(true);
            });
        });
    });

    describe('window.cryptoBuy — Acquisto monete', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto valido scala cassa UNA sola volta e NON risincronizza verso il server', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 20000;
            let sincronizzazioni = 0;
            sandbox.ServerState.syncCash = async () => { sincronizzazioni++; };

            await sandbox.cryptoBuy('EMPIRE', 5000);

            // Verifica chiamata RPC
            const buyRpc = rpcLog.find(r => r.nome === 'rpc_buy_crypto');
            assert.ok(buyRpc, 'deve chiamare rpc_buy_crypto');
            assert.equal(buyRpc.args.v_coin_id, 'EMPIRE');
            assert.equal(buyRpc.args.v_eur_in, 5000);

            // Verifica che il denaro sia stato scalato solo localmente
            assert.equal(gs.cash, 15000, 'il saldo cassa deve essere scalato di 5000');
            assert.equal(sincronizzazioni, 0, 'il client non deve rispedire syncCash: la RPC ha già scalato il cash');

            // Verifica notifica di successo
            const notifica = env.notifications.find(n => n.type === 'success' && n.msg.includes('Acquistati'));
            assert.ok(notifica, 'deve mostrare notifica di successo');
        });

        test('acquisto gestisce errore "Fondi insufficienti" restituito dalla RPC', async () => {
            const ambFondi = creaAmbienteCripto({
                rpcHandlers: {
                    rpc_buy_crypto: async () => ({ data: null, error: { code: 'P0001', message: 'Fondi insufficienti' } }),
                },
            });
            ambFondi.gs.cash = 200;

            await ambFondi.sandbox.cryptoBuy('EMPIRE', 500);

            assert.equal(ambFondi.gs.cash, 200, 'il saldo non deve essere toccato');
            assert.ok(ambFondi.env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
            ambFondi.env.stopAllIntervals();
        });

        test('acquisto con importo inferiore al minimo (€100) viene bloccato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 10000;

            await sandbox.cryptoBuy('EMPIRE', 50);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_buy_crypto').length, 0, 'non deve chiamare RPC');
            assert.equal(gs.cash, 10000, 'il saldo non deve cambiare');
            assert.ok(env.notifications.some(n => n.msg.includes('Minimo €100')), 'deve avvisare del minimo');
        });

        test('acquisto con errore RPC segnala errore e non scala cassa', async () => {
            const ambErr = creaAmbienteCripto({
                rpcHandlers: {
                    rpc_buy_crypto: async () => ({ data: null, error: { message: 'Liquidità insufficiente nel pool' } }),
                },
            });
            ambErr.gs.cash = 10000;

            await ambErr.sandbox.cryptoBuy('EMPIRE', 2000);

            assert.equal(ambErr.gs.cash, 10000, 'il saldo non deve essere toccato su errore');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquisto fallito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.cryptoSell — Vendita monete', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('vendita valida accredita il ricavo UNA sola volta e NON risincronizza verso il server', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 1000;
            let sincronizzazioni = 0;
            sandbox.ServerState.syncCash = async () => { sincronizzazioni++; };

            await sandbox.cryptoSell('EMPIRE', 100);

            const sellRpc = rpcLog.find(r => r.nome === 'rpc_sell_crypto');
            assert.ok(sellRpc, 'deve chiamare rpc_sell_crypto');
            assert.equal(sellRpc.args.v_coin_id, 'EMPIRE');
            assert.equal(sellRpc.args.v_coins_in, 100);

            // In mock il prezzo è 10 -> 100 * 10 = 1000 EUR
            assert.equal(gs.cash, 2000, 'il ricavo della vendita deve essere accreditato in cassa');
            assert.equal(sincronizzazioni, 0, 'il client non deve rispedire syncCash: la RPC ha già accreditato il cash');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Venduti')));
        });

        test('vendita con quantità non valida (<= 0) viene respinta', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 1000;

            await sandbox.cryptoSell('EMPIRE', 0);
            await sandbox.cryptoSell('EMPIRE', -5);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_sell_crypto').length, 0, 'non deve chiamare RPC');
            assert.equal(gs.cash, 1000, 'la cassa non deve cambiare');
            assert.ok(env.notifications.some(n => n.msg.includes('Quantità non valida')));
        });

        test('vendita con errore RPC segnala errore e non accredita denaro', async () => {
            const ambErr = creaAmbienteCripto({
                rpcHandlers: {
                    rpc_sell_crypto: async () => ({ data: null, error: { message: 'Saldo coin insufficiente' } }),
                },
            });
            ambErr.gs.cash = 1000;

            await ambErr.sandbox.cryptoSell('EMPIRE', 100);

            assert.equal(ambErr.gs.cash, 1000);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Vendita fallita')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.cryptoDepositOffshore — Deposito offshore', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('deposito offshore valido detrae fondi, applica fee 3% e NON risincronizza verso il server', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 100000;
            let sincronizzazioni = 0;
            sandbox.ServerState.syncCash = async () => { sincronizzazioni++; };

            await sandbox.cryptoDepositOffshore('cayman', 50000);

            const depRpc = rpcLog.find(r => r.nome === 'rpc_deposit_offshore');
            assert.ok(depRpc, 'deve chiamare rpc_deposit_offshore');
            assert.equal(depRpc.args.v_jurisdiction, 'cayman');
            assert.equal(depRpc.args.v_eur_amount, 50000);

            // Cassa scalata di 50000
            assert.equal(gs.cash, 50000, 'la cassa deve diminuire dell\'intero importo depositato');
            assert.equal(sincronizzazioni, 0, 'il client non deve rispedire syncCash dopo il deposito offshore');

            // Notifica con netto depositato
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Depositato') && n.msg.includes('cayman')));
        });

        test('deposito inferiore a €10.000 viene rifiutato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 50000;

            await sandbox.cryptoDepositOffshore('cayman', 5000);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_deposit_offshore').length, 0);
            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.msg.includes('Minimo offshore: €10.000')));
        });
    });

    describe('window.cryptoWithdrawOffshore — Prelievo offshore e rischio GdF', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('prelievo pulito (senza sequestro) accredita l\'intero importo e NON risincronizza verso il server', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 5000;
            let sincronizzazioni = 0;
            sandbox.ServerState.syncCash = async () => { sincronizzazioni++; };

            await sandbox.cryptoWithdrawOffshore('cayman', 20000);

            const wdRpc = rpcLog.find(r => r.nome === 'rpc_withdraw_offshore');
            assert.ok(wdRpc, 'deve chiamare rpc_withdraw_offshore');
            assert.equal(gs.cash, 25000, 'accredita tutti i 20.000 EUR');
            assert.equal(sincronizzazioni, 0, 'il client non deve rispedire syncCash dopo il prelievo offshore');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Prelevati') && n.msg.includes('cayman')));
        });

        test('prelievo intercettato dalla GdF applica penale e registra log mappa', async () => {
            const ambGdF = creaAmbienteCripto({ simulaSequestroGdF: true });
            ambGdF.gs.cash = 5000;

            await ambGdF.sandbox.cryptoWithdrawOffshore('cayman', 20000);

            // Ricevuti 12000, penale 8000
            assert.equal(ambGdF.gs.cash, 17000, 'accredita solo il netto (12000)');
            assert.ok(ambGdF.env.notifications.some(n => n.type === 'error' && n.msg.includes('GdF! Sequestrati') && n.msg.includes('Ricevuti')));
            assert.ok(ambGdF.env.logs.some(l => l.includes('GdF: Sequestro offshore') && l.includes('cayman')));
            ambGdF.env.stopAllIntervals();
        });

        test('prelievo con importo <= 0 viene rifiutato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 5000;

            await sandbox.cryptoWithdrawOffshore('cayman', 0);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_withdraw_offshore').length, 0);
            assert.equal(gs.cash, 5000);
            assert.ok(env.notifications.some(n => n.msg.includes('Importo non valido')));
        });
    });

    describe('UI: Modale di trading e anteprima AMM', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteCripto();
            await amb.sandbox.cryptoRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('cryptoOpenTradeModal crea il modale nel DOM con dati corretti (acquisto)', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('EMPIRE', 'buy');

            const modal = sandbox.document.getElementById('crypto-trade-modal');
            assert.ok(modal, 'il modale deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('EmpireCoin — ACQUISTO'));

            const preview = sandbox.document.getElementById('crypto-preview');
            assert.ok(preview, 'il preview deve esistere');
            assert.ok(preview.textContent.includes('Ricevi ~'), 'deve mostrare la stima di acquisto');
        });

        test('cryptoOpenTradeModal crea il modale di vendita con dati di portafoglio e PnL', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('EMPIRE', 'sell');

            const modal = sandbox.document.getElementById('crypto-trade-modal');
            assert.ok(modal, 'il modale di vendita deve esistere');
            assert.ok(modal.innerHTML.includes('EmpireCoin — VENDITA'));
            assert.ok(modal.innerHTML.includes('PnL'));
        });

        test('cryptoOpenTradeModal per coin inesistente non fa nulla', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('COIN_NON_ESISTENTE', 'buy');

            const modal = sandbox.document.getElementById('crypto-trade-modal');
            assert.equal(modal, null, 'non deve creare modale per coin inesistente');
        });

        test('_cryptoUpdatePreview calcola correttamente la formula AMM per acquisto e vendita', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('EMPIRE', 'buy');
            const prev = sandbox.document.getElementById('crypto-preview');

            sandbox._cryptoUpdatePreview('EMPIRE', 'buy', 20000);
            assert.ok(prev.textContent.includes('Ricevi ~'));
            assert.ok(prev.textContent.includes('impatto:'));

            sandbox._cryptoUpdatePreview('EMPIRE', 'sell', 500);
            assert.ok(prev.textContent.includes('Ricevi ~€'));
        });
    });

    describe('UI: Render della scheda crypto (renderTabCrypto)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteCripto();
            await amb.sandbox.cryptoRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabCrypto disegna mercato, KPI, portfolio e giurisdizioni offshore', () => {
            const { sandbox } = amb;
            sandbox.renderTabCrypto();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Crypto &amp; Offshore'), 'deve contenere intestazione scheda');
            assert.ok(container.innerHTML.includes('EmpireCoin'), 'deve mostrare le card del mercato');
            assert.ok(container.innerHTML.includes('Bitcoin'), 'deve mostrare BTC');
            assert.ok(container.innerHTML.includes('Cayman Islands'), 'deve mostrare sezione Cayman');
            assert.ok(container.innerHTML.includes('Svizzera'), 'deve mostrare sezione Svizzera');
            assert.ok(container.innerHTML.includes('Dubai'), 'deve mostrare sezione Dubai');
        });
    });

    describe('Event-delegation: ce-actions associate a crypto', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteCripto();
            await amb.sandbox.cryptoRefresh(true);
            amb.sandbox.renderTabCrypto();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceCryptoTrade esegue acquisto leggendo valore dal DOM', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 50000;

            sandbox.cryptoOpenTradeModal('EMPIRE', 'buy');
            const input = sandbox.document.getElementById('crypto-trade-input');
            input.value = '15000';

            sandbox.ceCryptoTrade('buy', 'EMPIRE', 'crypto-trade-input');

            const buyRpc = rpcLog.find(r => r.nome === 'rpc_buy_crypto');
            assert.ok(buyRpc);
            assert.equal(buyRpc.args.v_eur_in, 15000);
        });

        test('ceCryptoTrade esegue vendita leggendo quantità dal DOM', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 5000;

            sandbox.cryptoOpenTradeModal('EMPIRE', 'sell');
            const input = sandbox.document.getElementById('crypto-trade-input');
            input.value = '50';

            sandbox.ceCryptoTrade('sell', 'EMPIRE', 'crypto-trade-input');

            const sellRpc = rpcLog.find(r => r.nome === 'rpc_sell_crypto');
            assert.ok(sellRpc);
            assert.equal(sellRpc.args.v_coins_in, 50);
        });

        test('ceCryptoDeposit esegue deposito offshore leggendo input da card', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 60000;

            const input = sandbox.document.getElementById('off-dep-cayman');
            input.value = '30000';

            sandbox.ceCryptoDeposit('cayman', 'off-dep-cayman');

            const depRpc = rpcLog.find(r => r.nome === 'rpc_deposit_offshore');
            assert.ok(depRpc);
            assert.equal(depRpc.args.v_eur_amount, 30000);
        });

        test('ceCryptoWithdraw esegue prelievo offshore leggendo input da card', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 1000;

            const input = sandbox.document.getElementById('off-wd-cayman');
            input.value = '25000';

            sandbox.ceCryptoWithdraw('cayman', 'off-wd-cayman');

            const wdRpc = rpcLog.find(r => r.nome === 'rpc_withdraw_offshore');
            assert.ok(wdRpc);
            assert.equal(wdRpc.args.v_eur_amount, 25000);
        });

        test('ceCryptoPreview aggiorna il testo di stima', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('EMPIRE', 'buy');

            const input = sandbox.document.getElementById('crypto-trade-input');
            input.value = '8000';
            sandbox.ceCryptoPreview.call(input, 'EMPIRE', 'buy');

            const prev = sandbox.document.getElementById('crypto-preview');
            assert.ok(prev.textContent.includes('Ricevi ~'));
        });

        test('ceRemove rimuove il modale aperto', () => {
            const { sandbox } = amb;
            sandbox.cryptoOpenTradeModal('EMPIRE', 'buy');
            assert.ok(sandbox.document.getElementById('crypto-trade-modal'));

            sandbox.ceRemove('crypto-trade-modal');
            assert.equal(sandbox.document.getElementById('crypto-trade-modal'), null);
        });

        test('ceThen esegue catena refresh e render', async () => {
            const { sandbox } = amb;
            let refreshChiamato = false;
            let switchTabChiamato = null;

            sandbox.cryptoRefresh = async () => { refreshChiamato = true; };
            sandbox.switchTab = (tab) => { switchTabChiamato = tab; };

            sandbox.ceThen('cryptoRefresh', 'switchTab', 'crypto');
            await new Promise(r => setImmediate(r));

            assert.equal(refreshChiamato, true);
            assert.equal(switchTabChiamato, 'crypto');
        });
    });

    describe('CE_money e allineamento saldo server (nessun doppio addebito/accredito)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('money.js espone addebitatoDalServer che scala cash senza chiamare syncCash', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            let syncChiamato = false;
            sandbox.ServerState.syncCash = async () => { syncChiamato = true; };

            assert.equal(typeof sandbox.CE_money.addebitatoDalServer, 'function', 'addebitatoDalServer deve essere esportato');
            const esito = sandbox.CE_money.addebitatoDalServer(3000, 'test_addebito');
            assert.equal(esito, true);
            assert.equal(gs.cash, 7000);
            assert.equal(syncChiamato, false, 'addebitatoDalServer non deve invocare syncCash');
        });

        test('money.js espone accreditatoDalServer che incrementa cash senza chiamare syncCash', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            let syncChiamato = false;
            sandbox.ServerState.syncCash = async () => { syncChiamato = true; };

            assert.equal(typeof sandbox.CE_money.accreditatoDalServer, 'function', 'accreditatoDalServer deve essere esportato');
            const esito = sandbox.CE_money.accreditatoDalServer(3000, 'test_accredito');
            assert.equal(esito, true);
            assert.equal(gs.cash, 13000);
            assert.equal(syncChiamato, false, 'accreditatoDalServer non deve invocare syncCash');
        });

        test('dopo un acquisto il client non rispedisce syncCash al server', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            let syncChiamate = 0;
            sandbox.ServerState.syncCash = async () => { syncChiamate++; };

            await sandbox.cryptoBuy('EMPIRE', 5000);

            assert.equal(gs.cash, 15000, 'il saldo locale deve essere scalato');
            assert.equal(syncChiamate, 0, 'non deve risincronizzare il cash verso il server');
        });

        test('dopo una vendita il client non rispedisce syncCash al server', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            let syncChiamate = 0;
            sandbox.ServerState.syncCash = async () => { syncChiamate++; };

            await sandbox.cryptoSell('EMPIRE', 500);

            assert.equal(gs.cash, 25000, 'il saldo locale deve essere accreditato');
            assert.equal(syncChiamate, 0, 'non deve risincronizzare il cash verso il server');
        });
    });

    describe('Realtime & Inizializzazione (cryptoInit)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCripto(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('cryptoInit carica dati e registra canale Realtime', async () => {
            const { sandbox, realtimeHandlers } = amb;
            await sandbox.cryptoInit();

            assert.equal(sandbox._cryptoState.market.length, 4);
            const sub = realtimeHandlers.find(h => h.canale === 'crypto_market_changes');
            assert.ok(sub, 'deve registrarsi al canale crypto_market_changes');
            assert.equal(sub.filtro.table, 'crypto_market');
        });

        test('evento Realtime ricarica il mercato e aggiorna la UI se la tab crypto è attiva', async () => {
            const { sandbox, realtimeHandlers } = amb;
            await sandbox.cryptoInit();

            let renderChiamato = false;
            sandbox._activeTab = 'crypto';
            sandbox.renderTabCrypto = () => { renderChiamato = true; };

            const sub = realtimeHandlers.find(h => h.canale === 'crypto_market_changes');
            assert.ok(sub);

            // Simula arrivo evento UPDATE da postgres
            sub.cb({ eventType: 'UPDATE', new: { id: 'EMPIRE', price_eur: 15.0 } });
            await new Promise(r => setTimeout(r, 20));

            assert.equal(renderChiamato, true, 'il render deve essere invocato all\'aggiornamento realtime');
        });
    });
});
