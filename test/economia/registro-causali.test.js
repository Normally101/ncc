'use strict';
/* ============================================================================
   La causale di ogni movimento di denaro arriva fino al server.

   Perche' conta: il registro dell'economia (`cash_ledger`, migrazione 66_)
   annota ogni movimento con la sua CAUSALE. Senza causale il registro dice
   «sono usciti €4.000» e non «sono usciti €4.000 per un anticipo di
   assunzione»: inutile per calibrare i tetti, inutile per accorgersi di un
   imbroglio, inutile per rispondere a «dove sono finiti i miei soldi».

   Il catalogo delle causali ESISTE GIA' nel gioco: 99 chiamate su 100 a
   `CE_money.spend/earn` passano un motivo, per 96 causali distinte
   (`ride_earnings`, `corporate_contract`, `auction_bid`, `annual_tax`…).
   Fino al 28/08/2026 `money.js` lo riceveva e lo BUTTAVA VIA: `_sincronizzaCassa()`
   chiamava `syncCash(cash)` senza mai passarlo oltre. Questo test impedisce
   che torni a perdersi.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Registra (saldo, causale) di ogni sincronizzazione, senza cambiare il
// comportamento del banco: il mock continua ad applicare l'overwrite.
function bancoConCausali() {
    const sincronizzazioni = [];
    const env = freshEnv();
    const sandbox = env.sandbox;
    const orig = sandbox.ServerState.syncCash.bind(sandbox.ServerState);
    sandbox.ServerState.syncCash = (cash, motivo) => {
        sincronizzazioni.push({ cash, motivo });
        return orig(cash, motivo);
    };
    return { env, sandbox, gs: sandbox.gameState, sincronizzazioni };
}

describe('registro economia — la causale viaggia fino al server', () => {

    test('spend() porta la sua causale', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 100000;
            assert.equal(sandbox.CE_money.spend(2500, 'buy_fuel_for_depot'), true);

            assert.equal(sincronizzazioni.length, 1, 'una sola sincronizzazione');
            assert.equal(sincronizzazioni[0].cash, 97500);
            assert.equal(sincronizzazioni[0].motivo, 'buy_fuel_for_depot',
                'la causale ricevuta da spend() deve arrivare al server');
        } finally { env.stopAllIntervals(); }
    });

    test('earn() porta la sua causale', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 100000;
            assert.equal(sandbox.CE_money.earn(360, 'ride_earnings'), true);

            assert.equal(sincronizzazioni.length, 1);
            assert.equal(sincronizzazioni[0].cash, 100360);
            assert.equal(sincronizzazioni[0].motivo, 'ride_earnings');
        } finally { env.stopAllIntervals(); }
    });

    test('senza causale si sincronizza lo stesso: il registro non deve mai bloccare un movimento', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 100000;
            assert.equal(sandbox.CE_money.earn(50), true);

            assert.equal(sincronizzazioni.length, 1, 'il movimento avviene comunque');
            assert.equal(sincronizzazioni[0].cash, 100050);
            // Il server registrera' 'unknown': meglio una riga con causale ignota
            // che nessuna riga, e meglio ancora che un guadagno rifiutato.
            assert.ok(sincronizzazioni[0].motivo === undefined || sincronizzazioni[0].motivo === null,
                'nessuna causale inventata dal client');
        } finally { env.stopAllIntervals(); }
    });

    test('un rifiuto per fondi insufficienti non manda nulla al server', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 100;
            assert.equal(sandbox.CE_money.spend(5000, 'buy_npc_car'), false);

            assert.equal(gs.cash, 100, 'il saldo non si tocca');
            assert.deepEqual(sincronizzazioni, [],
                'niente movimento, niente riga di registro');
        } finally { env.stopAllIntervals(); }
    });

    test('le porte «il server ha gia fatto» restano mute, come devono', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 100000;
            // Queste due allineano solo la previsione locale a un movimento che il
            // server ha gia' scritto (aste giudiziarie, buyback OPA): risincronizzare
            // rispedirebbe indietro una cifra decisa dal browser.
            sandbox.CE_money.accreditatoDalServer(5000, 'auction_refund');
            sandbox.CE_money.addebitatoDalServer(2000, 'opa_buyback');

            assert.equal(gs.cash, 103000, 'la previsione locale si allinea');
            assert.deepEqual(sincronizzazioni, [],
                'nessuna sincronizzazione: la riga di registro la scrive la RPC che ha mosso i soldi');
        } finally { env.stopAllIntervals(); }
    });

    test('un movimento vero del gioco arriva al server con la causale giusta', () => {
        const { env, sandbox, gs, sincronizzazioni } = bancoConCausali();
        try {
            gs.cash = 500000;
            // Percorso reale, non una chiamata di laboratorio: il deposito
            // carburante passa da buyFuelForDepot -> CE_money.spend.
            gs.investments = gs.investments || [];
            if (!gs.investments.includes('inv_fuel_depot')) gs.investments.push('inv_fuel_depot');
            gs.fuelTank = 0; gs.fuelTankCapacity = 10000; gs.fuelPrice = 1.85;
            gs.fuelTankLevel = 1;

            sandbox.buyFuelForDepot(5000);

            assert.equal(sincronizzazioni.length, 1, 'un acquisto, una sincronizzazione');
            assert.equal(sincronizzazioni[0].motivo, 'buy_fuel_for_depot',
                'la causale e\' quella che il gioco ha gia\' scritto nel proprio codice');
        } finally { env.stopAllIntervals(); }
    });
});
