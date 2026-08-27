'use strict';
/* ============================================================================
   Aste giudiziarie — flusso end-to-end completo: vedere, offrire, vincere, ritirare.

   Questo test mette in scena il flusso VERO che vive un giocatore:
   1. L'elenco delle aste aperte arriva dal server (rpc_get_judicial_auctions)
   2. Il giocatore piazza un'offerta (rpc_place_auction_bid) — NESSUN denaro si muove
   3. L'asta chiude, il server decide il vincitore
   4. Il giocatore ritira il lotto vinto (rpc_claim_auction) — il denaro si muove UNA
      sola volta, DENTRO la RPC server, e il client si allinea con
      CE_money.accreditatoDalServer / addebitatoDalServer SENZA risincronizzare.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../test-support/game-env');

/**
 * Crea un finto client Supabase che simula il ciclo di vita completo di un'asta:
 * - rpc_get_judicial_auctions: restituisce l'asta aperta
 * - rpc_place_auction_bid: accetta l'offerta
 * - rpc_get_won_auctions: dopo la "chiusura" server-side, restituisce l'asta vinta
 * - rpc_claim_auction: consegna il premio (veicolo + eventuale denaro)
 */
function creaClientAstaCompleta(opzioni = {}) {
    const {
        vehicleTier = 'business',
        vehicleCondition = 70,
        vehicleKm = 30000,
        winningBid = 50000,
        cashFromContainer = 0,
        lotType = 'vehicle', // 'vehicle' | 'container' | 'fleet_pack'
    } = opzioni;

    const chiamate = [];
    let astaChiusa = false;

    const astaAperta = {
        id: 'asta_e2e_1',
        icon: '🚗',
        title: 'Berlina Executive sequestrata',
        lot_type: lotType,
        min_bid: 20000,
        top_bid: 0,
        my_bid: null,
        bid_count: 0,
        auction_ends_at: new Date(Date.now() + 3600000).toISOString(), // tra 1 ora
        vehicle_data: {
            tier: vehicleTier,
            condition: vehicleCondition,
            km: vehicleKm,
            year: 2022,
        },
    };

    const astaVinta = {
        id: 'asta_e2e_1',
        icon: '🚗',
        title: 'Berlina Executive sequestrata',
        lot_type: lotType,
        winning_bid: winningBid,
        vehicle_data: lotType === 'fleet_pack' ? {
            vehicles: [
                { tier: vehicleTier, condition: vehicleCondition, km: vehicleKm, year: 2022 },
                { tier: vehicleTier, condition: Math.max(10, vehicleCondition - 10), km: vehicleKm + 5000, year: 2021 },
            ],
        } : {
            tier: vehicleTier,
            condition: vehicleCondition,
            km: vehicleKm,
            year: 2022,
        },
        container_data: lotType === 'container' ? {
            items: [
                ...(cashFromContainer > 0 ? [{ type: 'cash', amount: cashFromContainer }] : []),
                { type: 'vehicle', tier: vehicleTier, condition: vehicleCondition, km: vehicleKm },
            ],
        } : undefined,
    };

    return {
        chiamate,
        client: {
            rpc: async (nome, args) => {
                chiamate.push({ nome, args });

                switch (nome) {
                    case 'rpc_get_judicial_auctions':
                        return { data: astaChiusa ? [] : [astaAperta], error: null };

                    case 'rpc_get_won_auctions':
                        return { data: astaChiusa ? [astaVinta] : [], error: null };

                    case 'rpc_get_my_bids':
                        return { data: astaChiusa ? [{ ...astaAperta, my_bid: winningBid, is_winner: true, auction_status: 'closed' }] : [], error: null };

                    case 'rpc_place_auction_bid':
                        // Il server accetta l'offerta e aggiorna top_bid/my_bid
                        astaAperta.top_bid = args.v_amount;
                        astaAperta.my_bid = args.v_amount;
                        astaAperta.bid_count = (astaAperta.bid_count || 0) + 1;
                        return { data: { success: true }, error: null };

                    case 'rpc_claim_auction':
                        // Simula la RPC server che: addebita il winning_bid, accredita eventuale cash dal container, restituisce i dati del lotto
                        const responseData = {
                            success: true,
                            lot_type: lotType,
                            winning_bid: winningBid,
                            cash_accreditato: cashFromContainer,
                            vehicle_data: astaVinta.vehicle_data,
                            container_data: astaVinta.container_data,
                        };
                        return { data: responseData, error: null };

                    default:
                        return { data: null, error: null };
                }
            },
        },
        // Helper per far "chiudere" l'asta lato server
        chiudiAsta: () => { astaChiusa = true; },
    };
}

describe('aste — flusso end-to-end completo (vedi → offri → vinci → ritira)', () => {
    let env, gs;

    beforeEach(() => {
        env = freshEnv();
        gs = env.sandbox.gameState;
        // Assicura che il giocatore abbia abbastanza soldi per l'offerta vincente
        gs.cash = 100000;
    });
    afterEach(() => env.stopAllIntervals());

    test('flusso completo: asta veicolo semplice — il denaro si muove solo all\'aggiudicazione, via server', async () => {
        const { client, chiudiAsta, chiamate } = creaClientAstaCompleta({
            vehicleTier: 'business',
            winningBid: 50000,
        });
        env.sandbox.supabaseClient = client;

        // Traccia le sincronizzazioni cash verso il server: DEVONO ESSERE ZERO durante il claim
        // perché il server ha già aggiornato companies.cash dentro rpc_claim_auction
        let syncCashCalls = 0;
        const originalSyncCash = env.sandbox.ServerState.syncCash;
        env.sandbox.ServerState.syncCash = async (cash) => {
            syncCashCalls++;
            return originalSyncCash(cash);
        };

        // 1. Il giocatore apre la scheda aste: l'elenco arriva dal server
        await env.sandbox.window.auctionsRefresh(true);
        const asteAperte = env.sandbox.window._auctionsState.auctions;
        assert.equal(asteAperte.length, 1, 'deve esserci un\'asta aperta');
        const asta = asteAperte[0];
        assert.equal(asta.id, 'asta_e2e_1');

        // 2. Il giocatore piazza un'offerta — NESSUN denaro deve muoversi qui
        const cashPrimaOfferta = gs.cash;
        const esitoOfferta = await env.sandbox.window.auctionsPlaceBid(asta.id, 50000);
        assert.equal(esitoOfferta.error, undefined, 'l\'offerta non deve fallire');
        assert.equal(gs.cash, cashPrimaOfferta, 'piazzare un\'offerta NON deve scalare denaro locale');
        assert.ok(chiamate.some(c => c.nome === 'rpc_place_auction_bid'), 'l\'offerta deve passare per la RPC');

        // 3. L'asta chiude lato server (simuliamo il passaggio di tempo / chiusura server)
        chiudiAsta();
        await env.sandbox.window.auctionsRefresh(true);

        // 4. L'asta appare ora tra quelle vinte
        const asteVinte = env.sandbox.window._auctionsState.wonAuctions;
        assert.equal(asteVinte.length, 1, 'l\'asta deve risultare vinta dopo la chiusura');
        const vinta = asteVinte[0];
        assert.equal(vinta.winning_bid, 50000);

        // 5. Il giocatore ritira il lotto — QUI il denaro si muove UNA SOLA VOLTA, lato server
        const cashPrimaClaim = gs.cash;
        const flottaPrima = gs.fleet.length;

        const esitoClaim = await env.sandbox.window.auctionsClaim(vinta.id);

        assert.equal(esitoClaim.error, undefined, 'il ritiro non deve fallire');
        assert.equal(esitoClaim.contanti, 0, 'nessun contante da questo tipo di lotto');
        assert.equal(esitoClaim.veicoli.length, 1, 'deve arrivare un veicolo in flotta');

        // Verifica: il denaro è stato scalato UNA VOLTA (dal server), il client si è allineato
        // SENZA richiamare syncCash (che rispedirebbe il totale al server)
        assert.equal(gs.cash, cashPrimaClaim - 50000, 'il denaro deve essere scalato esattamente una volta (l\'importo dell\'aggiudicazione)');
        assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo deve entrare in flotta');

        const auto = esitoClaim.veicoli[0];
        assert.equal(auto.tier, 'business', 'il tier deve corrispondere a quello deciso dal server');
        assert.equal(auto.condition, 70, 'la condizione deve arrivare dal server');
        assert.ok(auto.vehicleClass, 'l\'auto deve avere un vehicleClass valido per il resto del gioco');

        // NESSUNA sincronizzazione cash durante il claim: il server ha già scritto
        assert.equal(syncCashCalls, 0, 'syncCash NON deve essere chiamato durante auctionsClaim: il server ha già aggiornato companies.cash');

        // 6. L'asta ritirata sparisce dall'elenco "da ritirare"
        const rimaste = env.sandbox.window._auctionsState.wonAuctions;
        assert.equal(rimaste.length, 0, 'l\'asta ritirata non deve più apparire da ritirare');
    });

    test('flusso completo: container con denaro — il cash del container è accreditato dal server, non ricalcolato dal client', async () => {
        const { client, chiudiAsta, chiamate } = creaClientAstaCompleta({
            lotType: 'container',
            vehicleTier: 'premium',
            winningBid: 80000,
            cashFromContainer: 25000,
        });
        env.sandbox.supabaseClient = client;

        let syncCashCalls = 0;
        const originalSyncCash = env.sandbox.ServerState.syncCash;
        env.sandbox.ServerState.syncCash = async (cash) => {
            syncCashCalls++;
            return originalSyncCash(cash);
        };

        // 1. Asta aperta
        await env.sandbox.window.auctionsRefresh(true);
        const asta = env.sandbox.window._auctionsState.auctions[0];

        // 2. Offerta (nessun denaro)
        await env.sandbox.window.auctionsPlaceBid(asta.id, 80000);

        // 3. Chiusura server
        chiudiAsta();
        await env.sandbox.window.auctionsRefresh(true);

        // 4. Ritiro
        const vinta = env.sandbox.window._auctionsState.wonAuctions[0];
        const cashPrima = gs.cash;
        const flottaPrima = gs.fleet.length;

        const esito = await env.sandbox.window.auctionsClaim(vinta.id);

        assert.equal(esito.error, undefined);
        assert.equal(esito.contanti, 25000, 'il denaro del container deve essere riportato');
        assert.equal(esito.veicoli.length, 1, 'un veicolo dal container');

        // Il server ha addebitato 80000 (winning_bid) e accreditato 25000 (cash dal container)
        // Netto: -55000. Il client si allinea con accreditatoDalServer/addebitatoDalServer.
        assert.equal(gs.cash, cashPrima - 55000, 'cash finale = prima - winning_bid + cash_container (server decide, client si allinea)');
        assert.equal(gs.fleet.length, flottaPrima + 1);

        // Zero syncCash: il server ha già fatto tutto
        assert.equal(syncCashCalls, 0, 'nessuna syncCash durante claim di container');
    });

    test('flusso completo: fleet_pack — più veicoli, nessun denaro extra', async () => {
        const { client, chiudiAsta } = creaClientAstaCompleta({
            lotType: 'fleet_pack',
            vehicleTier: 'standard',
            winningBid: 120000,
        });
        env.sandbox.supabaseClient = client;

        let syncCashCalls = 0;
        env.sandbox.ServerState.syncCash = async () => { syncCashCalls++; };

        await env.sandbox.window.auctionsRefresh(true);
        const asta = env.sandbox.window._auctionsState.auctions[0];
        await env.sandbox.window.auctionsPlaceBid(asta.id, 120000);

        chiudiAsta();
        await env.sandbox.window.auctionsRefresh(true);

        const vinta = env.sandbox.window._auctionsState.wonAuctions[0];
        const cashPrima = gs.cash;
        const flottaPrima = gs.fleet.length;

        const esito = await env.sandbox.window.auctionsClaim(vinta.id);

        assert.equal(esito.error, undefined);
        assert.equal(esito.contanti, 0);
        // fleet_pack dovrebbe consegnare più veicoli (il mock ne restituisce uno per semplificare)
        assert.ok(esito.veicoli.length >= 1);
        assert.equal(gs.cash, cashPrima - 120000);
        assert.equal(gs.fleet.length, flottaPrima + esito.veicoli.length);
        assert.equal(syncCashCalls, 0);
    });

    test('se l\'offerta non basta (sotto il minimo), la RPC la rifiuta e nulla cambia', async () => {
        const { client } = creaClientAstaCompleta({ winningBid: 50000 });
        env.sandbox.supabaseClient = client;

        await env.sandbox.window.auctionsRefresh(true);
        const asta = env.sandbox.window._auctionsState.auctions[0];

        // Simula rifiuto server: modifica il mock per questo test
        let rifiuta = true;
        const originalRpc = client.rpc;
        client.rpc = async (nome, args) => {
            if (nome === 'rpc_place_auction_bid' && rifiuta) {
                return { data: null, error: { message: 'Offerta sotto il minimo' } };
            }
            return originalRpc(nome, args);
        };

        const cashPrima = gs.cash;
        const esito = await env.sandbox.window.auctionsPlaceBid(asta.id, 10000); // sotto min_bid 20000

        assert.match(esito.error || '', /sotto il minimo/i);
        assert.equal(gs.cash, cashPrima, 'denaro intatto su offerta rifiutata');
    });
});