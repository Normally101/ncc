'use strict';
/* ============================================================================
   test/economy/finto-server-fedele.test.js

   Il finto ServerState di test-support/game-env.js deve rispondere come le RPC
   vere (i file .sql del repo), non "in modo piu' semplice": il 22/08 due bug
   sui soldi erano invisibili ai test proprio perché la semplificazione
   cancellava i campi o raddoppiava i movimenti che nel gioco vero esistono.
   Qui, metodo per metodo, si inchiodano i contratti delle RPC vere:

     rpc_buy_vehicle       (01_mmo_migration.sql)             → riga vehicles, scala price, rifiuta senza fondi
     rpc_sell_vehicle      (09_provinces_realestate_fuel.sql) → { success, sold_price }
     rpc_hire_driver       (02_mmo_rpcs_extension.sql)        → scala salary×2, tier in whitelist, rifiuta senza fondi
     rpc_fire_driver       (02_mmo_rpcs_extension.sql)        → { fired, driver_id }
     rpc_repay_loan        (02_mmo_rpcs_extension.sql)        → { repaid, remaining_after }
     rpc_rest_ceo          (02_mmo_rpcs_extension.sql)        → { stars, cost, energy_recovered }
     rpc_sync_cash         (10_sync_cash.sql)                 → { success, cash }, overwrite
     rpc_add_driver_coins  (17_executive_club.sql)            → { ok, driver_coins }, UN solo credito
     rpc_ec_spend          (17_executive_club.sql)            → { ok, item_id, spent, driver_coins }
     rpc_buy_real_estate   (09_provinces_realestate_fuel.sql) → { success, listing_id, name, daily_rent }

   Convenzione per le valute che il client muove già in locale (CE_money):
   la variabile condivisa riflette già l'addebito/accredito ottimistico del
   browser, quindi il finto NON deve muoverla una seconda volta — deve
   restituire il saldo risultante, con cui CE_money si riallinea.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** freshEnv + scorciatoia allo stato di gioco. */
function banco() {
    const env = freshEnv();
    return { sandbox: env.sandbox, gs: env.sandbox.gameState };
}

describe('finto server fedele alle RPC vere (test-support/game-env.js)', () => {

    // ── DRIVER COINS ────────────────────────────────────────────────────────
    test('earnDC accredita UNA volta sola: rpc_add_driver_coins non deve sommare di nuovo dopo il bump locale', async () => {
        const { sandbox, gs } = banco();
        gs.driverCoins = 50;

        sandbox.CE_money.earnDC(5, 'tier_reward');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 55,
            'il finto server ha accreditato una seconda volta dopo CE_money.earnDC: ' +
            'ogni premio Driver Coins valeva il doppio nei test mentre nel gioco vero ne arriva uno solo');
    });

    test('la risposta di rpc_ec_spend porta tutto il contratto della RPC vera: { ok, item_id, spent, driver_coins }', async () => {
        const { sandbox } = banco();
        sandbox.gameState.driverCoins = 50;

        const res = await sandbox.ServerState.spendDriverCoins('caffe_sospeso', 10);

        assert.deepEqual(Object.keys(res).sort(), ['driver_coins', 'item_id', 'ok', 'spent'],
            'la RPC vera (17_executive_club.sql) restituisce quattro campi');
        assert.equal(res.ok, true);
        assert.equal(res.item_id, 'caffe_sospeso');
        assert.equal(res.spent, 10);
        assert.equal(typeof res.driver_coins, 'number');
    });

    test('spendDC scala una volta sola e si riallinea sul saldo dichiarato dal server', async () => {
        const { sandbox, gs } = banco();
        gs.driverCoins = 50;

        sandbox.CE_money.spendDC(10, 'caffe_sospeso');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 40,
            'un secondo scalamento lato finto server conterebbe la spesa due volte');
    });

    // ── ASSUNZIONI (rpc_hire_driver) ────────────────────────────────────────
    test('hireDriver (via server) scala salary×2 come rpc_hire_driver: il costo di assunzione non è gratis', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 10000;

        const row = await sandbox.ServerState.hireDriver('Mario Rossi', 1500, 'STANDARD');

        assert.equal(gs.cash, 7000, 'la RPC vera deduce stipendio × 2 dalla cassa');
        assert.equal(row.status, 'AVAILABLE', 'la riga drivers INSERT ... RETURNING nasce AVAILABLE');
        assert.equal(row.salary, 1500);
        assert.ok(row.id, 'la riga restituita ha un id');
    });

    test('hireDriver (via server) rifiuta se la cassa non copre salary×2', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 1000;

        const row = await sandbox.ServerState.hireDriver('Sara Conti', 2000, 'VIP');

        assert.equal(row, null, 'la RPC vera fa RAISE: fondi insufficienti');
        assert.equal(gs.cash, 1000, 'nessun addebito su rifiuto');
    });

    test('hireDriver rifiuta un tier fuori whitelist: STAFF non esiste lato DB', async () => {
        // 02_mmo_rpcs_extension.sql: RAISE EXCEPTION per qualsiasi tier fuori da
        // STANDARD/BUSINESS/VIP/ULTRA. Il finto accettava qualunque stringa, e così
        // il client che mandava 'STAFF' passava i test mentre in produzione OGNI
        // assunzione di staff d'ufficio falliva lato server.
        const { sandbox, gs } = banco();
        gs.cash = 100000;

        const row = await sandbox.ServerState.hireDriver('HR Specialist', 2800, 'STAFF');

        assert.equal(row, null, 'tier STAFF: la RPC vera fa RAISE EXCEPTION');
        assert.equal(gs.cash, 100000, 'nessun addebito su rifiuto');
    });

    test("hireOfficeStaff passa un tier che la rpc_hire_driver vera accetta e l'assunzione riesce", async () => {
        const { sandbox, gs } = banco();
        gs.cash = 100000;
        gs.hqLevel = 2;
        gs.staff = [];
        gs.drivers = [{ id: 'ceo', name: 'CEO' }];

        await sandbox.hireOfficeStaff('hr');

        assert.equal(gs.staff.length, 1,
            "col finto fedele (che valida il tier come il DB) l'assunzione di staff deve riuscire");
    });

    // ── CASSA E PRESTITI ────────────────────────────────────────────────────
    test('buyVehicle scala il prezzo e restituisce la riga vehicles; senza fondi rifiuta come la RPC vera', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 300000;

        const row = await sandbox.ServerState.buyVehicle('stellar_e_exec', 120000, 'milano');

        assert.equal(gs.cash, 180000);
        assert.equal(row.model_id, 'stellar_e_exec');
        assert.equal(row.current_city, 'milano');
        assert.equal(row.status, 'IDLE');
        assert.ok(row.id);

        gs.cash = 100;
        const rifiuto = await sandbox.ServerState.buyVehicle('stellar_e_exec', 120000, 'roma');
        assert.equal(rifiuto, null, 'rpc_buy_vehicle fa RAISE se cash < price');
        assert.equal(gs.cash, 100, 'nessun addebito su rifiuto: la cassa non diventa negativa');
    });

    test('sellVehicle accredita e risponde col contratto di rpc_sell_vehicle', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 1000;

        const res = await sandbox.ServerState.sellVehicle('srv_veh_1', 5000);

        assert.deepEqual(res, { success: true, sold_price: 5000 });
        assert.equal(gs.cash, 6000);
    });

    test('repayLoan scala e risponde col contratto di rpc_repay_loan: { repaid, remaining_after }', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 10000;

        const res = await sandbox.ServerState.repayLoan('loan_1', 4000);

        assert.deepEqual(Object.keys(res).sort(), ['remaining_after', 'repaid'],
            'la RPC vera (02_mmo_rpcs_extension.sql) restituisce questi due campi, non success');
        assert.equal(res.repaid, 4000);
        assert.equal(gs.cash, 6000);
    });

    test('restCeo risponde col contratto di rpc_rest_ceo: { stars, cost, energy_recovered }', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 1000;

        const res = await sandbox.ServerState.restCeo(3, 80);

        assert.deepEqual(res, { stars: 3, cost: 80, energy_recovered: 60 },
            'la RPC vera calcola energy_recovered = stelle × 20');
        assert.equal(gs.cash, 920);
    });

    test('fireDriver risponde col contratto di rpc_fire_driver: { fired, driver_id }', async () => {
        const { sandbox } = banco();

        const res = await sandbox.ServerState.fireDriver('srv_drv_1');

        assert.deepEqual(res, { fired: true, driver_id: 'srv_drv_1' });
    });

    test('syncCash sovrascrive la cassa e risponde col contratto di rpc_sync_cash', async () => {
        const { sandbox, gs } = banco();
        gs.cash = 7;

        const res = await sandbox.ServerState.syncCash(1234);

        assert.deepEqual(res, { success: true, cash: 1234 });
        assert.equal(gs.cash, 1234);
    });

    test('buyRealEstate risponde col contratto di rpc_buy_real_estate', async () => {
        const { sandbox } = banco();

        const res = await sandbox.ServerState.buyRealEstate('re_milano_attico');

        // Nota: la RPC vera scala anche listing.cost letto dal DB; il finto non può
        // conoscerlo perché la firma passa solo il listing_id (vedi game-env.js).
        assert.deepEqual(
            Object.keys(res).sort(),
            ['daily_rent', 'listing_id', 'name', 'success'],
        );
        assert.equal(res.success, true);
        assert.equal(res.listing_id, 're_milano_attico');
    });
});
