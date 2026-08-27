'use strict';
// COLLAUDO PROFONDO — il mercato P2P fra giocatori (auto e quote societarie).
//
// ONESTÀ SULL'AMBIENTE: lo scambio vero è server-authoritative. Il denaro si
// muove dentro le RPC Postgres (rpc_buy_market_car, rpc_buy_company_shares…),
// non nel client, che si limita a chiamarle e poi RIALLINEA il saldo con
// CE_money.addebitatoDalServer / accreditatoDalServer. Quel flusso non è
// esercitabile qui (niente Supabase nel banco), e un finto client lo
// falsificherebbe soltanto.
//
// Ciò che vive DAVVERO nel client — e che un bug colpirebbe — sono le guardie
// PRIMA della chiamata al server: login, esistenza dell'inserzione, fondi,
// "non comprare da te stesso". Questo collaudo le blinda: senza server nessuna
// azione P2P deve muovere la cassa in locale né esplodere.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/p2p — le guardie del client tengono senza server', () => {
    test('senza login nessuna azione P2P muove la cassa né lancia', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 100000;
        sandbox.currentUser = null; // non loggato
        const cassaPrima = gs.cash;

        // Nessuna di queste deve raggiungere il server (che nel banco non c'è):
        // la guardia login le ferma prima. Se una esplodesse, il test è rosso.
        await sandbox.buyP2PCar('qualsiasi');
        await sandbox.buyCompanyShares('qualsiasi', 1);
        await sandbox.sellCompanyShares('qualsiasi', 1);
        await sandbox.p2pListCarForSale('c1', 10000);
        await sandbox.listCompanyIPO?.('holding', 100, 50);

        assert.equal(gs.cash, cassaPrima,
            'senza login il client non deve toccare la cassa: il denaro è del server');
    });

    test('comprare un\'auto P2P senza fondi è rifiutato prima del server, cassa intatta', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 1000;
        sandbox.currentUser = { id: 'u_io' };
        // Un'inserzione altrui, cara: i fondi non bastano.
        sandbox._p2pMarket.listings = [{ id: 'L1', seller_user_id: 'u_altro', ask_price: 999999 }];
        const cassaPrima = gs.cash;

        await sandbox.buyP2PCar('L1');

        assert.equal(gs.cash, cassaPrima,
            'fondi insufficienti: rifiuto prima di chiamare il server, cassa invariata');
    });

    test('comprare quote societarie senza fondi è rifiutato prima del server, cassa intatta', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 1000;
        sandbox.currentUser = { id: 'u_io' };
        sandbox._p2pMarket.shares = [{ id: 'S1', current_price: 999999, company: 'ACME' }];
        const cassaPrima = gs.cash;

        await sandbox.buyCompanyShares('S1', 1);

        assert.equal(gs.cash, cassaPrima,
            'fondi insufficienti sulle azioni: rifiuto prima del server, cassa invariata');
    });

    test('non si può comprare la propria auto in vendita', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 10000000;
        sandbox.currentUser = { id: 'u_io' };
        // L'inserzione è MIA (seller == io) e me la potrei permettere.
        sandbox._p2pMarket.listings = [{ id: 'L1', seller_user_id: 'u_io', ask_price: 5000 }];
        const cassaPrima = gs.cash;

        await sandbox.buyP2PCar('L1');

        assert.equal(gs.cash, cassaPrima,
            'comprare la propria auto è bloccato: nessun movimento di cassa');
    });
});
