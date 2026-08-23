'use strict';
const { freshEnv } = require('/home/runner/work/ncc/ncc/test-support/game-env.js');
(async () => {
    const env = freshEnv({
        serverState: {
            purchaseDCItem: async (_itemId, _units) => ({ ok: true, item_id: _itemId, units: _units, spent: 3, driver_coins: 7 }),
        },
    });
    const sandbox = env.sandbox;
    const gs = sandbox.gameState;
    console.log('acquistoDC type:', typeof sandbox.CE_money.acquistoDC);
    const p = sandbox.CE_money.acquistoDC('fuel_boost');
    console.log('promise?', p && typeof p.then);
    const esito = await p;
    console.log('esito:', esito);
    console.log('driverCoins:', gs.driverCoins);
})();
