'use strict';
/* ============================================================================
   Il contratto di CE_money — la porta unica del denaro.

   Ogni file di gioco verra' convertito per passare di qui, quindi se questo
   contratto si rompe si rompe l'economia intera. I test coprono le tre cose
   che i 19 bug del 19/08/2026 sbagliavano:
     1. muovere il saldo senza dirlo al server,
     2. scalare i Driver Coins in locale invece che con la RPC dedicata
        (il saldo tornava su al primo evento Realtime -> booster gratis),
     3. il tetto della reputazione a 5 invece di 5 + prestigio.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Ambiente con ServerState strumentato: registra le SCRITTURE, non le letture. */
function ambiente(rispostaDC) {
    const scritture = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => { scritture.push(['syncCash', v]); return { success: true, cash: v }; },
            spendDriverCoins: async (motivo, n) => {
                scritture.push(['spendDriverCoins', motivo, n]);
                if (rispostaDC instanceof Error) throw rispostaDC;
                return rispostaDC !== undefined ? rispostaDC : { ok: true };
            },
            addDriverCoins: async (n, motivo) => {
                scritture.push(['addDriverCoins', n, motivo]);
                if (rispostaDC instanceof Error) throw rispostaDC;
                return rispostaDC !== undefined ? rispostaDC : { ok: true };
            },
        },
    });
    return { sandbox: env.sandbox, gs: env.sandbox.gameState, scritture, notifications: env.notifications };
}

describe('money — la porta unica del denaro', () => {

    describe('cassa', () => {
        test('spend scala il saldo E lo comunica al server', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.cash = 10000;
            const esito = sandbox.CE_money.spend(2500, 'prova');
            await new Promise(r => setImmediate(r));
            assert.equal(esito, true, 'con fondi capienti spend deve riuscire');
            assert.equal(gs.cash, 7500, 'il saldo locale deve essere scalato');
            assert.deepEqual(scritture, [['syncCash', 7500]], 'il server deve ricevere il saldo aggiornato');
        });

        test('spend con fondi insufficienti non tocca nulla e non scrive sul server', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.cash = 100;
            const esito = sandbox.CE_money.spend(500, 'prova');
            await new Promise(r => setImmediate(r));
            assert.equal(esito, false, 'senza fondi spend deve fallire');
            assert.equal(gs.cash, 100, 'il saldo non deve cambiare');
            assert.deepEqual(scritture, [], 'nessuna scrittura sul server per una spesa rifiutata');
        });

        test('earn accredita E lo comunica al server', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.cash = 1000;
            sandbox.CE_money.earn(750, 'premio');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1750);
            assert.deepEqual(scritture, [['syncCash', 1750]]);
        });

        test('un importo non valido (NaN) viene rifiutato invece di corrompere il saldo', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.cash = 1000;
            assert.equal(sandbox.CE_money.spend(NaN, 'x'), false);
            assert.equal(sandbox.CE_money.earn(NaN, 'x'), false);
            assert.equal(gs.cash, 1000, 'il saldo deve restare finito e invariato');
            assert.deepEqual(scritture, []);
        });
    });

    describe('driver coins', () => {
        test('spendDC passa dalla RPC dedicata, non dal solo saldo locale', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.driverCoins = 50;
            const esito = sandbox.CE_money.spendDC(4, 'energia');
            await new Promise(r => setImmediate(r));
            assert.equal(esito, true);
            assert.deepEqual(scritture, [['spendDriverCoins', 'energia', 4]],
                'senza questa RPC il saldo tornerebbe su al primo evento Realtime: booster gratis');
        });

        test('il saldo si riallinea sul valore autoritativo che torna dal server', async () => {
            // Il server e' l'autorita': se dice 40, il locale deve diventare 40 anche se
            // la previsione locale diceva 46.
            const { sandbox, gs } = ambiente({ driver_coins: 40 });
            gs.driverCoins = 50;
            sandbox.CE_money.spendDC(4, 'energia');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 40, 'il valore del server deve vincere sulla previsione locale');
        });

        test('spendDC senza coin sufficienti non tocca nulla e non chiama la RPC', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.driverCoins = 2;
            const esito = sandbox.CE_money.spendDC(10, 'energia');
            await new Promise(r => setImmediate(r));
            assert.equal(esito, false);
            assert.equal(gs.driverCoins, 2);
            assert.deepEqual(scritture, []);
        });

        test('se il server rifiuta la spesa con un errore, il giocatore viene avvisato e il saldo non resta scalato', async () => {
            const errServer = new Error('Driver Coins insufficienti sul server');
            const { sandbox, gs, notifications } = ambiente(errServer);
            gs.driverCoins = 50;
            const esito = sandbox.CE_money.spendDC(10, 'acquisto_fallito');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50, 'il saldo non deve restare scalato per una spesa rifiutata dal server');
            assert.ok(notifications.some(n => n.type === 'error' || n.msg.includes('rifiutat') || n.msg.includes('insufficienti') || n.msg.includes('Server')),
                'il giocatore deve ricevere un avviso per la spesa rifiutata');
        });

        test('se il server restituisce risposta non valida (null o senza saldo), il giocatore viene avvisato e il saldo ripristinato', async () => {
            const { sandbox, gs, notifications } = ambiente(null);
            gs.driverCoins = 50;
            const esito = sandbox.CE_money.spendDC(10, 'acquisto_nullo');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50, 'il saldo deve tornare al valore iniziale se la RPC ritorna null');
            assert.ok(notifications.length > 0, 'il giocatore deve ricevere una notifica');
        });

        test('earnDC accredita tramite la RPC dedicata', async () => {
            const { sandbox, gs, scritture } = ambiente();
            gs.driverCoins = 10;
            sandbox.CE_money.earnDC(5, 'premio');
            await new Promise(r => setImmediate(r));
            assert.deepEqual(scritture, [['addDriverCoins', 5, 'premio']]);
        });
    });

    describe('reputazione', () => {
        test('il tetto e\' 5 + prestigio, non 5', () => {
            // daily-orders.js:157 usava Math.min(5, ...): chi aveva fatto prestigio
            // non guadagnava piu' reputazione dagli ordini giornalieri.
            const { sandbox, gs } = ambiente();
            gs.prestige = 2;
            gs.reputation = 5.0;
            sandbox.CE_money.addReputation(1.0);
            assert.equal(gs.reputation, 6.0, 'con prestigio 2 il tetto e\' 7, quindi 5 + 1 deve passare');
        });

        test('non si supera il tetto ne\' si scende sotto zero', () => {
            const { sandbox, gs } = ambiente();
            gs.prestige = 0;
            gs.reputation = 4.8;
            sandbox.CE_money.addReputation(1.0);
            assert.equal(gs.reputation, 5.0, 'senza prestigio il tetto resta 5');
            sandbox.CE_money.addReputation(-99);
            assert.equal(gs.reputation, 0, 'la reputazione non puo\' diventare negativa');
        });
    });
});
