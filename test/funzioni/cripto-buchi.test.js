'use strict';
/* ============================================================================
   test/funzioni/cripto-buchi.test.js — Copre i rami delle azioni crypto che
   nessun altro test esercita:

   - annullamento del confirm() su cryptoDepositOffshore / cryptoWithdrawOffshore
     (l'utente chiude il dialogo: NESSUNA RPC, NESSUN movimento di cassa);
   - guardia anti-doppia sottoscrizione Realtime dentro cryptoInit;
   - resilienza di cryptoRefresh quando una delle tre letture server fallisce;
   - rifiuto di input non numerico in cryptoBuy prima di toccare il server.

   Per il denaro vale la regola del resto del sistema: il client muove cassa
   SOLO tramite le porte CE_money.addebitatoDalServer / accreditatoDalServer
   (le RPC del server hanno già mosso il saldo): i test di successo qui sotto
   spiano le porte per restare rossi se qualcuno le aggira.
   ============================================================================ */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Ambiente minimale ma realistico: Supabase finto con log delle RPC,
 * mercato/portfolio/offshore di stato e confirm() controllabile.
 */
function ambienteCriptoBuco(opzioni = {}) {
    const rpcLog = [];
    const stato = {
        mercato: [
            { id: 'EMPIRE', name: 'EmpireCoin', icon: '👑', price_eur: 10.0, supply: 500000, reserve_eur: 5000000 },
            { id: 'BTC', name: 'Bitcoin', icon: '₿', price_eur: 60000.0, supply: 1000, reserve_eur: 60000000 },
        ],
        portfolio: [],
        offshore: [
            { id: 'off_1', user_id: 'user_test', jurisdiction: 'cayman', balance: 40000, total_deposited: 40000 },
        ],
        // se vero, la lettura di crypto_market fallisce (ramo di errore di cryptoRefresh)
        erroreMercato: opzioni.erroreMercato || false,
    };

    const env = freshEnv({ render: true });

    const sbClient = {
        from: (tabella) => ({
            select: () => ({
                order: () => {
                    if (tabella === 'crypto_market') {
                        return Promise.resolve(stato.erroreMercato
                            ? { data: null, error: { message: 'market down' } }
                            : { data: stato.mercato, error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
                eq: () => {
                    if (tabella === 'offshore_accounts') {
                        return Promise.resolve({ data: stato.offshore.map(o => ({ ...o })), error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
            }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (nome === 'rpc_get_crypto_portfolio') return { data: stato.portfolio, error: null };
            if (nome === 'rpc_buy_crypto') {
                return { data: { coin_id: args.v_coin_id, eur_spent: args.v_eur_in, coins_got: args.v_eur_in / 10, new_price: 10 }, error: null };
            }
            if (nome === 'rpc_sell_crypto') {
                return { data: { eur_received: args.v_coins_in * 10, coins_sold: args.v_coins_in, new_price: 10 }, error: null };
            }
            if (nome === 'rpc_deposit_offshore') {
                const fee = Math.floor(args.v_eur_amount * 0.03);
                return { data: { net_deposited: args.v_eur_amount - fee, fee, jurisdiction: args.v_jurisdiction }, error: null };
            }
            if (nome === 'rpc_withdraw_offshore') {
                return { data: { received: args.v_eur_amount, seized: false, penalty: 0 }, error: null };
            }
            return { data: null, error: null };
        },
        channel: (canale) => ({
            on: () => ({ subscribe: () => ({ id: 'sub_' + Math.random().toString(36).slice(2) }) }),
        }),
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'user_test' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // confirm() controllabile dal singolo test (default: l'utente conferma)
    const risposta = opzioni.utenteConferma !== false;
    env.sandbox.confirm = () => risposta;
    env.sandbox.window.confirm = env.sandbox.confirm;

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        stato,
        porteDenaro: { addebiti: [], accrediti: [] },
    };
}

describe('cripto — buchi di copertura sulle azioni (conferme, init, refresh)', () => {

    describe('annullamento del confirm() (percorso mai testato)', () => {
        let amb;
        beforeEach(() => {
            amb = ambienteCriptoBuco({ utenteConferma: false });
            amb.gs.cash = 100000;
            // spia le porte uniche del denaro: qui NON devono essere toccate
            const origDeb = amb.sandbox.CE_money.addebitatoDalServer.bind(amb.sandbox.CE_money);
            const origAcc = amb.sandbox.CE_money.accreditatoDalServer.bind(amb.sandbox.CE_money);
            amb.sandbox.CE_money.addebitatoDalServer = (...a) => { amb.porteDenaro.addebiti.push(a); return origDeb(...a); };
            amb.sandbox.CE_money.accreditatoDalServer = (...a) => { amb.porteDenaro.accrediti.push(a); return origAcc(...a); };
        });

        test('cryptoDepositOffshore annullato: nessuna RPC, nessun movimento di cassa', async () => {
            await amb.sandbox.cryptoDepositOffshore('cayman', 20000);

            assert.equal(amb.rpcLog.filter(r => r.nome === 'rpc_deposit_offshore').length, 0,
                'il deposito annullato non deve chiamare la RPC');
            assert.equal(amb.gs.cash, 100000, 'la cassa non deve muoversi');
            assert.equal(amb.porteDenaro.addebiti.length, 0, 'nessun addebito tramite CE_money');
            assert.ok(amb.env.notifications.length === 0, 'nessuna notifica di successo');
        });

        test('cryptoWithdrawOffshore annullato: nessuna RPC, nessun accredito', async () => {
            await amb.sandbox.cryptoWithdrawOffshore('cayman', 15000);

            assert.equal(amb.rpcLog.filter(r => r.nome === 'rpc_withdraw_offshore').length, 0,
                'il prelievo annullato non deve chiamare la RPC');
            assert.equal(amb.gs.cash, 100000, 'la cassa non deve muoversi');
            assert.equal(amb.porteDenaro.accrediti.length, 0, 'nessun accredito tramite CE_money');
        });
    });

    describe('percorso di successo attraverso la porta unica del denaro', () => {
        let amb;
        beforeEach(() => {
            amb = ambienteCriptoBuco();
            amb.gs.cash = 100000;
            const origDeb = amb.sandbox.CE_money.addebitatoDalServer.bind(amb.sandbox.CE_money);
            const origAcc = amb.sandbox.CE_money.accreditatoDalServer.bind(amb.sandbox.CE_money);
            amb.sandbox.CE_money.addebitatoDalServer = (...a) => { amb.porteDenaro.addebiti.push(a); return origDeb(...a); };
            amb.sandbox.CE_money.accreditatoDalServer = (...a) => { amb.porteDenaro.accrediti.push(a); return origAcc(...a); };
        });

        test('deposito confermato passa da CE_money.addebitatoDalServer con causale corretta', async () => {
            await amb.sandbox.cryptoDepositOffshore('cayman', 20000);

            assert.deepEqual(amb.porteDenaro.addebiti, [[20000, 'crypto_deposit_offshore']],
                'l\u2019addebito deve avvenire solo tramite la porta CE_money con la causale giusta');
            assert.equal(amb.gs.cash, 80000);
        });

        test('prelievo confermato passa da CE_money.accreditatoDalServer con causale corretta', async () => {
            await amb.sandbox.cryptoWithdrawOffshore('cayman', 15000);

            assert.deepEqual(amb.porteDenaro.accrediti, [[15000, 'crypto_withdraw_offshore']],
                'l\u2019accredito deve avvenire solo tramite la porta CE_money');
            assert.equal(amb.gs.cash, 115000);
        });
    });

    describe('cryptoInit — sottoscrizione Realtime', () => {
        test('chiamare cryptoInit due volte non duplica il canale realtime', async () => {
            const amb = ambienteCriptoBuco();
            const canali = [];
            const origChannel = amb.sandbox.supabaseClient.channel.bind(amb.sandbox.supabaseClient);
            amb.sandbox.supabaseClient.channel = (nome) => { canali.push(nome); return origChannel(nome); };

            await amb.sandbox.cryptoInit();
            await amb.sandbox.cryptoInit();

            assert.deepEqual(canali, ['crypto_market_changes'],
                'la guardia su _cryptoState._sub deve impedire la doppia sottoscrizione');
            amb.env.stopAllIntervals();
        });
    });

    describe('cryptoRefresh — resilienza agli errori server', () => {
        test('se la lettura del mercato fallisce, i dati precedenti restano intatti', async () => {
            const amb = ambienteCriptoBuco();

            // prima lettura ok: popola il mercato
            await amb.sandbox.cryptoRefresh(true);
            assert.equal(amb.sandbox._cryptoState.market.length, 2);

            // seconda lettura con mercato giu': lo stato locale non deve essere svuotato
            amb.stato.erroreMercato = true;
            await amb.sandbox.cryptoRefresh(true);

            assert.equal(amb.sandbox._cryptoState.market.length, 2,
                'un errore di rete non deve cancellare il mercato già caricato');
        });

        test('il refresh senza client fissa comunque il throttle: la chiamata successiva non forzata salta le query', async () => {
            const amb = ambienteCriptoBuco();
            const sbOriginale = amb.sandbox.supabaseClient;

            // client assente: il refresh forzato ritorna subito ma fissa _lastFetch
            amb.sandbox.supabaseClient = null;
            amb.sandbox.window.supabaseClient = null;
            await amb.sandbox.cryptoRefresh(true);
            assert.equal(amb.rpcLog.length, 0, 'senza client nessuna query');

            // client tornato disponibile: entro i 30s la chiamata non forzata NON interroga il server
            amb.sandbox.supabaseClient = sbOriginale;
            amb.sandbox.window.supabaseClient = sbOriginale;
            await amb.sandbox.cryptoRefresh(false);
            assert.equal(amb.rpcLog.length, 0, 'entro il throttle non devono partire query');

            // mentre quella forzata sì
            await amb.sandbox.cryptoRefresh(true);
            assert.ok(amb.rpcLog.length > 0, 'la chiamata forzata deve interrogare il server');
        });
    });

    describe('cryptoBuy — validazione input', () => {
        test('importo non numerico viene rifiutato prima di chiamare il server', async () => {
            const amb = ambienteCriptoBuco();
            amb.gs.cash = 50000;

            await amb.sandbox.cryptoBuy('EMPIRE', 'abc');

            assert.equal(amb.rpcLog.filter(r => r.nome === 'rpc_buy_crypto').length, 0,
                'input non numerico: nessuna chiamata RPC');
            assert.equal(amb.gs.cash, 50000, 'cassa intatta');
            assert.ok(amb.env.notifications.some(n => n.msg.includes('Minimo €100')));
            amb.env.stopAllIntervals();
        });
    });
});
