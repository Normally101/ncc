'use strict';
/* ============================================================================
   test/funzioni/levy-corse-giocatore.test.js — BUCO di copertura sistema Infrastrutture

   I test preesistenti (infrastrutture.test.js) verificano SOLO che
   `rpc_pay_fuel_levy` venga invocata con gli argomenti giusti quando il
   giocatore completa una corsa in una provincia monopolizzata da un rivale.
   NESSUNO verificava l'EFFETTO SULLA CASSA: il levy restituito dalla RPC
   deve essere scalato dal saldo locale tramite la porta unica
   `CE_money.addebitatoDalServer(levy, 'fuel_levy')` (engine-rides.js,
   sezione "Espansione 12", sia in completeRide sia in checkActiveTrips).

   Gli importi degli incorsi hanno componenti casuali (mance, tratti, skill):
   per rendere l'assert deterministico catturiamo gli incassi REALI incapsulando
   `CE_money.earn` e confrontiamo la cassa finale con
   `saldo iniziale + incassi catturati − levy del mock server`.

   ROSSO sul codice non corretto: se il gestore della RPC legge il levy dal
   posto sbagliato (o non lo addebita affatto), la cassa resta troppo alta
   e questi test falliscono.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Attende che tutte le catene di promise interne (RPC finte + .then) si svuotino. */
function flushAsync() {
    return new Promise(r => setTimeout(r, 25));
}

/**
 * Ambiente minimale per il flusso levy: Supabase finto dove SOLO prov_milano
 * ha un deposito rivale. levyImporto = quanto la "RPC server" dichiara.
 * Incapsula CE_money.earn per registrare ogni accredito con il suo motivo.
 */
function creaAmbienteLevy(opzioni = {}) {
    const rpcLog = [];
    const guadagni = []; // [{ amount, motivo }]
    const env = freshEnv({ render: true });

    const sbClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args);
            }

            if (nome === 'rpc_pay_fuel_levy') {
                if (args.v_province_id === 'prov_milano') {
                    return { data: { levy: opzioni.levyImporto ?? 15, depot_owner: 'user_rival_1' }, error: null };
                }
                // Provincia senza deposito: il server non preleva nulla.
                return { data: { skipped: 'no_depot' }, error: null };
            }
            // Qualunque altra RPC (dividendi OPA ecc.): nessun effetto sulla cassa.
            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'user_player' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Wrapper sugli incassi: registra senza alterare il comportamento di money.js
    const origEarn = env.sandbox.CE_money.earn.bind(env.sandbox.CE_money);
    env.sandbox.CE_money.earn = (amount, motivo) => {
        guadagni.push({ amount, motivo });
        return origEarn(amount, motivo);
    };

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcLog, guadagni };
}

/** Somma degli incassi catturati per un dato motivo (o tutti se omitted). */
function sommaGuadagni(guadagni, motivo) {
    return guadagni
        .filter(g => !motivo || g.motivo === motivo)
        .reduce((s, g) => s + g.amount, 0);
}

describe('Infrastrutture — levy carburante pagato dal GIOCATORE (buco di copertura)', () => {

    describe('completeRide in provincia monopolizzata da un rivale', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteLevy({ levyImporto: 15 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il levy scalato dalla cassa è esattamente quello dichiarato dalla RPC', async () => {
            const { sandbox, gs, guadagni } = amb;
            const driver = gs.drivers[0];
            driver.assignedCarId = gs.fleet[0].id;

            gs.cash = 100000;
            await sandbox.completeRide({
                id: 2,
                fromPoi: { id: 'milano', name: 'Milano Centrale', region: 'lombardia', baseFlat: 200 },
                toPoi: { id: 'mil_mxp', name: 'Malpensa Airport', region: 'lombardia', baseFlat: 200 },
                tier: 'business',
                price: 300,
                duration: 20000,
                driverId: driver.id
            }, false);
            await flushAsync();

            const incassi = sommaGuadagni(guadagni); // tutto ciò che la corsa ha accreditato
            assert.ok(incassi > 0, 'la corsa deve accreditare qualcosa');

            // GUARDIA ROSSA: se il levy non viene addebitato localmente (lettura
            // sbagliata della busta RPC o chiamata rimossa), la cassa resta qui
            // di 15€ troppo alta e l'assert esplode.
            assert.equal(
                gs.cash,
                100000 + incassi - 15,
                'il levy (15€) dichiarato da rpc_pay_fuel_levy deve essere scalato una volta sola dalla cassa'
            );
        });
    });

    describe('checkActiveTrips: viaggio in differita concluso in provincia rivale', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteLevy({ levyImporto: 20 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il levy del viaggio differito scala dalla cassa una volta sola', async () => {
            const { sandbox, gs, guadagni } = amb;
            const driver = gs.drivers[0];
            driver.assignedCarId = gs.fleet[0].id;
            driver.status = 'busy';

            gs.cash = 50000;
            gs.activeTrips = [{
                id: 201,
                driverId: driver.id,
                carId: gs.fleet[0].id,
                driverName: driver.name,
                fromName: 'Milano',
                toName: 'Malpensa',
                fromPoiId: 'milano',
                tier: 'business',
                startTime: Date.now() - 50000,
                endTime: Date.now() - 1000, // già concluso
                earnings: 250
            }];

            sandbox.checkActiveTrips();
            await flushAsync();

            const incassi = sommaGuadagni(guadagni, 'completed_trips');
            assert.equal(incassi, 250, 'l\'incasso del viaggio deve essere accreditato');

            // GUARDIA ROSSA anche per il ramo viaggi differiti
            assert.equal(
                gs.cash,
                50000 + incassi - 20,
                'il levy (20€) del viaggio differito deve scalare dalla cassa'
            );
        });
    });

    describe('Nessun addebito fantasma / resilienza', () => {
        test('levy 0: le due corse gemelle (con e senza deposito) lasciano la stessa cassa', async () => {
            const amb = creaAmbienteLevy({ levyImporto: 0 });
            const { sandbox, gs } = amb;

            async function corsaGemella(id, fromPoiId) {
                const driver = gs.drivers[0];
                driver.assignedCarId = gs.fleet[0].id;
                gs.cash = 100000;
                await sandbox.completeRide({
                    id,
                    fromPoi: { id: fromPoiId, name: fromPoiId, region: 'x', baseFlat: 200 },
                    toPoi: { id: 'dest', name: 'Destinazione', region: 'x', baseFlat: 200 },
                    tier: 'standard',
                    price: 300,
                    duration: 20000,
                    driverId: driver.id
                }, false);
                await flushAsync();
                return gs.cash;
            }

            // Gli incorsi sono casuali tra una corsa e l'altra: confrontiamo ogni
            // corsa con i PROPRI incassi catturati, non con l'altra corsa.
            const nPrima = amb.guadagni.length;
            const cassaMilano = await corsaGemella(3, 'milano');
            const incassiMilano = sommaGuadagni(amb.guadagni.slice(nPrima));

            const nSeconda = amb.guadagni.length;
            const cassaFirenze = await corsaGemella(4, 'firenze');
            const incassiFirenze = sommaGuadagni(amb.guadagni.slice(nSeconda));

            assert.ok(incassiMilano > 0 && incassiFirenze > 0);
            assert.equal(cassaMilano, 100000 + incassiMilano,
                'con levy 0 nessun costo aggiuntivo nella provincia del rivale');
            assert.equal(cassaFirenze, 100000 + incassiFirenze,
                'la corsa gemella fuori monopolio si comporta uguale');
            amb.env.stopAllIntervals();
        });

        test('errore RPC sul levy: nessun crash e la corsa viene comunque pagata', async () => {
            const amb = creaAmbienteLevy({
                rpcHandlers: {
                    rpc_pay_fuel_levy: async () => ({ data: null, error: { message: 'db down' } }),
                },
            });
            const { sandbox, gs } = amb;
            const driver = gs.drivers[0];
            driver.assignedCarId = gs.fleet[0].id;
            gs.cash = 80000;

            await assert.doesNotReject(async () => {
                await sandbox.completeRide({
                    id: 5,
                    fromPoi: { id: 'milano', name: 'Milano Centrale', region: 'lombardia', baseFlat: 200 },
                    toPoi: { id: 'dest', name: 'Destinazione', region: 'lombardia', baseFlat: 200 },
                    tier: 'business',
                    price: 300,
                    duration: 20000,
                    driverId: driver.id
                }, false);
                await flushAsync();
            });

            assert.ok(gs.cash > 80000, 'la corsa viene comunque pagata al giocatore');
            assert.ok(gs.cash <= 80000 + sommaGuadagni(amb.guadagni), 'nessun addebito oltre agli incassi');
            amb.env.stopAllIntervals();
        });
    });
});
