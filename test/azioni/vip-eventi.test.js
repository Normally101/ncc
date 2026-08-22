'use strict';
/* ============================================================================
   Banco di prova degli EVENTI VIP a bivio (definiti in vip-clients.js).

   Ogni evento VIP offre due scelte opposte (es. pagare vs intimidire). Un
   bivio e' un bivio solo se le due strade portano a conseguenze DIVERTE:
   qui si verifica che denaro, token politici e reputazione si muovano in
   direzioni diverse a seconda della scelta — e che quando il denaro si
   muove passi da window.CE_money con UNA SOLA sincronizzazione col server,
   e che i rifiuti (fondi insufficienti, evento inesistente/gia' chiuso)
   non tocchino niente.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function preparaMondo() {
    const { sandbox, notifications, stopAllIntervals } = freshEnv();
    const gs = sandbox.gameState;
    gs.cash = 1_000_000;
    // Il rendering non c'entra con le conseguenze economiche dei bivi.
    sandbox.updateUI = function () {};
    sandbox.saveGame = function () {};

    // Conta le sincronizzazioni della cassa verso il server senza cambiarne
    // il comportamento: il mock continua ad applicare l'overwrite del saldo.
    const mondo = { sandbox, gs, notifications, stopAllIntervals };
    mondo.syncCashCalls = [];
    const origSyncCash = sandbox.ServerState.syncCash.bind(sandbox.ServerState);
    sandbox.ServerState.syncCash = (cash) => {
        mondo.syncCashCalls.push(cash);
        return origSyncCash(cash);
    };
    return mondo;
}

// Evento secondario VIP non letto, come lo crea _vipPushEmail in vip-clients.js.
function pushEventoVip(gs, tipo, id, vipEventData) {
    const email = {
        id,
        sender: 'Test VIP',
        subject: 'evento bivio',
        type: tipo,
        status: 'unread',
        vipEventData,
        expiresAt: (gs.day * 24 + gs.hour) + 4,
    };
    gs.emails.push(email);
    return email;
}

describe('eventi VIP a bivio — le due scelte portano a conseguenze diverse', () => {

    test('le sei azioni dei bivi esistono su window nel banco', () => {
        const { sandbox, stopAllIntervals } = preparaMondo();
        try {
            for (const nome of [
                'vipGaranteEventIntimidisci', 'vipGaranteEventPaga',
                'vipGrigoriEventAccept', 'vipGrigoriEventDecline',
                'vipOnorevoleEventCopera', 'vipOnorevoleEventResisti',
            ]) {
                assert.equal(typeof sandbox.window[nome], 'function', `${nome} deve essere una funzione`);
            }
        } finally {
            stopAllIntervals();
        }
    });

    /* ── GRIGORI: rerouting pagato (500) vs ignorato ────────────────────────
       Accept: CE_money.spend(cost) → cassa −cost + UNA syncCash, cooldown
       grigori anticipato di 24h (fidelizzazione). Decline: cassa intatta,
       reputazione −0.1. Se le due strade facessero lo stesso effetto sul
       denaro il bivio non sarebbe una scelta. */

    test('vipGrigoriEventAccept scala il costo UNA volta e sincronizza una volta', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.reputation = 3;
            pushEventoVip(gs, 'vip_grigori_event', 101, { cost: 500 });
            sandbox.vipGrigoriEventAccept(101);
            assert.equal(gs.cash, 1_000_000 - 500, 'cassa scalata del costo esatto, una volta sola');
            assert.equal(syncCashCalls.length, 1, 'una sola syncCash: il server non va risincronizzato due volte');
            assert.equal(syncCashCalls[0], gs.cash, 'il server riceve il saldo risultante');
            const email = gs.emails.find(e => e.id === 101);
            assert.equal(email.status, 'resolved', 'evento chiuso dopo la scelta');
            assert.ok(gs.vipCooldowns && typeof gs.vipCooldowns.grigori === 'number',
                'cooldown grigori impostato');
        } finally {
            stopAllIntervals();
        }
    });

    test('vipGrigoriEventDecline NON muove denaro e costa reputazione', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.reputation = 3;
            pushEventoVip(gs, 'vip_grigori_event', 102, { cost: 500 });
            sandbox.vipGrigoriEventDecline(102);
            assert.equal(gs.cash, 1_000_000, 'la strada del rifiuto tocca la cassa: zero');
            assert.equal(syncCashCalls.length, 0, 'nessuna syncCash se nessun denaro si e\' mosso');
            assert.equal(gs.reputation, 2.9, 'reputazione −0.1★');
            assert.equal(gs.emails.find(e => e.id === 102).status, 'resolved');
        } finally {
            stopAllIntervals();
        }
    });

    test('bivio Grigori: le due scelte portano a conseguenze diverse', () => {
        const a = preparaMondo();
        const b = preparaMondo();
        try {
            a.gs.reputation = 3; b.gs.reputation = 3;
            pushEventoVip(a.gs, 'vip_grigori_event', 103, { cost: 500 });
            pushEventoVip(b.gs, 'vip_grigori_event', 103, { cost: 500 });
            a.sandbox.vipGrigoriEventAccept(103);
            b.sandbox.vipGrigoriEventDecline(103);
            assert.notEqual(a.gs.cash, b.gs.cash, 'solo una delle due strade scala denaro');
            assert.equal(b.gs.reputation, a.gs.reputation - 0.1,
                'solo la strada del rifiuto costa reputazione');
        } finally {
            a.stopAllIntervals(); b.stopAllIntervals();
        }
    });

    test('vipGrigoriEventAccept con fondi insufficienti rifiuta senza toccare nulla', () => {
        const { sandbox, gs, syncCashCalls, notifications, stopAllIntervals } = preparaMondo();
        try {
            pushEventoVip(gs, 'vip_grigori_event', 104, { cost: 500 });
            gs.cash = 100;
            sandbox.vipGrigoriEventAccept(104);
            assert.equal(gs.cash, 100, 'cassa intatta');
            assert.equal(syncCashCalls.length, 0, 'nessuna scrittura verso il server');
            assert.equal(gs.emails.find(e => e.id === 104).status, 'unread', 'evento resta aperto');
            assert.ok(notifications.some(n => n.type === 'error'), 'il giocatore viene avvisato');
        } finally {
            stopAllIntervals();
        }
    });

    test('evento inesistente: accept e\' no-op sicuro, decline penalizza comunque (BUG noto)', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.reputation = 3;
            assert.doesNotThrow(() => sandbox.vipGrigoriEventAccept(9999));
            assert.equal(gs.cash, 1_000_000, 'accept su bersaglio inesistente: cassa intatta');

            // BUG DOCUMENTATO: vipGrigoriEventDecline non controlla l'esistenza
            // dell'email (accept fa `if (!e) return`, decline no) quindi scala
            // −0.1★ anche per un id che non esiste. Finche' non viene corretto
            // questo e' il comportamento osservabile; se la fix arriva, questo
            // assert deve diventare `reputazione intatta`.
            assert.doesNotThrow(() => sandbox.vipGrigoriEventDecline(9999));
            assert.equal(gs.cash, 1_000_000, 'decline comunque non muove denaro');
            assert.equal(gs.reputation, 2.9, 'BUG noto: −0.1★ senza nessun bersaglio valido');
            assert.equal(syncCashCalls.length, 0, 'nessuna scrittura server in entrambi i casi');
        } finally {
            stopAllIntervals();
        }
    });

    /* ── GARANTE: posto di blocco — pagare la multa vs intimidire ────────────
       Paga: CE_money.spend(fine − sconto buff), sempre denaro. Intimidisci:
       se c'e' un Gettone Politico lo consuma (zero denaro), altrimenti 50%
       passa liscia / 50% multa ×2 — qui Math.random viene pilotato perche'
       nel banco e' il Math condiviso del processo di test. */

    // Piloti Math.random SOLO dentro fn e lo ripristina sempre: il sandbox del
    // gioco condivide lo stesso oggetto Math del processo Node di test.
    function conRandom(forzato, fn) {
        const orig = Math.random;
        Math.random = () => forzato;
        try { return fn(); } finally { Math.random = orig; }
    }

    test('vipGaranteEventPaga scala la multa esatta (con sconto se presente) e sincronizza una volta', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            pushEventoVip(gs, 'vip_garante_event', 201, { fine: 2000 });
            sandbox.vipGaranteEventPaga(201);
            assert.equal(gs.cash, 1_000_000 - 2000, 'multa piena senza buff attivi');
            assert.equal(syncCashCalls.length, 1);
            assert.equal(gs.emails.find(e => e.id === 201).status, 'resolved');

            pushEventoVip(gs, 'vip_garante_event', 202, { fine: 2000 });
            sandbox._applyBuff('test_sconto', 'fine_discount', 50, 8);
            sandbox.vipGaranteEventPaga(202);
            assert.equal(gs.cash, 998_000 - 1000, 'sconto fine_discount 50% applicato una volta');
        } finally {
            stopAllIntervals();
        }
    });

    test('vipGaranteEventPaga con fondi insufficienti paga TUTTO quello che c\'e\' (comportamento attuale)', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            pushEventoVip(gs, 'vip_garante_event', 203, { fine: 2000 });
            gs.cash = 700;
            sandbox.vipGaranteEventPaga(203);
            // A differenza di Grigori, qui la multa non viene rifiutata: toPay =
            // min(cash, fine) svuota la cassa invece di bloccare. Documentato.
            assert.equal(gs.cash, 0, 'paga parziale: tutta la cassa disponibile');
            assert.deepEqual(syncCashCalls, [0], 'una sola sync, col saldo azzerato');
        } finally {
            stopAllIntervals();
        }
    });

    test('vipGaranteEventIntimidisci con gettone consuma il gettone e zero denaro', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.politicalTokens = 2;
            pushEventoVip(gs, 'vip_garante_event', 204, { fine: 2000 });
            conRandom(0.9, () => sandbox.vipGaranteEventIntimidisci(204));
            assert.equal(gs.politicalTokens, 1, 'un solo gettone consumato');
            assert.equal(gs.cash, 1_000_000, 'la strada del gettone non tocca la cassa');
            assert.equal(syncCashCalls.length, 0, 'nessun denaro mosso → nessuna scrittura');
            assert.equal(gs.emails.find(e => e.id === 204).status, 'resolved');
        } finally {
            stopAllIntervals();
        }
    });

    test('vipGaranteEventIntimidisci senza gettone: fallisce → multa ×2, oppure passa liscia', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            // random 0.9 ≥ 0.5 → il poliziotto non si lascia intimidire: multa doppia.
            pushEventoVip(gs, 'vip_garante_event', 205, { fine: 2000 });
            conRandom(0.9, () => sandbox.vipGaranteEventIntimidisci(205));
            assert.equal(gs.cash, 1_000_000 - 4000, 'multa raddoppiata: esattamente ×2, una volta');
            assert.equal(syncCashCalls.length, 1);

            // random 0.1 < 0.5 → passa liscia: zero denaro, zero scritture.
            pushEventoVip(gs, 'vip_garante_event', 206, { fine: 2000 });
            conRandom(0.1, () => sandbox.vipGaranteEventIntimidisci(206));
            assert.equal(gs.cash, 996_000, 'il ramo fortunato non scala nulla');
            assert.equal(syncCashCalls.length, 1, 'ancora una sola scrittura in totale');
            assert.equal(gs.emails.find(e => e.id === 206).status, 'resolved');
        } finally {
            stopAllIntervals();
        }
    });

    test('bivio Garante: pagare muove denaro, intimidire col gettone muove i gettoni', () => {
        const a = preparaMondo();
        const b = preparaMondo();
        try {
            b.gs.politicalTokens = 1;
            pushEventoVip(a.gs, 'vip_garante_event', 207, { fine: 2000 });
            pushEventoVip(b.gs, 'vip_garante_event', 207, { fine: 2000 });
            a.sandbox.vipGaranteEventPaga(207);
            b.sandbox.vipGaranteEventIntimidisci(207);
            assert.notEqual(a.gs.cash, b.gs.cash, 'solo Paga tocca la cassa');
            assert.equal(a.gs.politicalTokens || 0, 0);
            assert.equal(b.gs.politicalTokens, 0, 'solo Intimidisci consuma il gettone');
        } finally {
            a.stopAllIntervals(); b.stopAllIntervals();
        }
    });

    test('Garante su evento inesistente: entrambe le strade sono no-op sicure', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.politicalTokens = 1;
            assert.doesNotThrow(() => sandbox.vipGaranteEventPaga(9999));
            assert.doesNotThrow(() => sandbox.vipGaranteEventIntimidisci(9999));
            assert.equal(gs.cash, 1_000_000);
            assert.equal(gs.politicalTokens, 1, 'gettone intatto');
            assert.equal(syncCashCalls.length, 0);
        } finally {
            stopAllIntervals();
        }
    });

    /* ── ONOREVOLE: verifica GdF — cooperare (token o multa) vs resistere ────
       Copera: consuma 1 gettone oppure multa fissa €1.000. Resisti:
       GUADAGNA 1 gettone e paga −0.05★ di reputazione. Le due strade muovono
       i gettoni in direzioni opposte: se coincidessero il bivio sarebbe finto. */

    test('vipOnorevoleEventCopera usa il gettone quando c\'e\', altrimenti la multa di €1.000', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.politicalTokens = 1;
            pushEventoVip(gs, 'vip_onorevole_event', 301, {});
            sandbox.vipOnorevoleEventCopera(301);
            assert.equal(gs.politicalTokens, 0, 'esattamente un gettone speso');
            assert.equal(gs.cash, 1_000_000, 'col gettone la multa non scatta');
            assert.equal(syncCashCalls.length, 0);

            pushEventoVip(gs, 'vip_onorevole_event', 302, {});
            sandbox.vipOnorevoleEventCopera(302); // gettoni finiti
            assert.equal(gs.cash, 999_000, 'senza gettoni: multa fissa di €1.000, una volta');
            assert.deepEqual(syncCashCalls, [999_000]);
        } finally {
            stopAllIntervals();
        }
    });

    test('vipOnorevoleEventCopera senza ne\' gettoni ne\' fondi paga tutto quello che c\'e\' (comportamento attuale)', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            pushEventoVip(gs, 'vip_onorevole_event', 303, {});
            gs.cash = 250;
            sandbox.vipOnorevoleEventCopera(303);
            assert.equal(gs.cash, 0, 'toPay = min(cash, multa): svuota la cassa');
            assert.deepEqual(syncCashCalls, [0]);
        } finally {
            stopAllIntervals();
        }
    });

    test('vipOnorevoleEventResisti GUADAGNA un gettone e costa reputazione, zero denaro', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.reputation = 3;
            gs.politicalTokens = 0;
            pushEventoVip(gs, 'vip_onorevole_event', 304, {});
            sandbox.vipOnorevoleEventResisti(304);
            assert.equal(gs.cash, 1_000_000, 'resistere non tocca la cassa');
            assert.equal(gs.politicalTokens, 1, '+1 Gettone Politico');
            assert.equal(gs.reputation, 2.95, '−0.05★ esatti');
            assert.equal(syncCashCalls.length, 0);
            assert.equal(gs.emails.find(e => e.id === 304).status, 'resolved');
        } finally {
            stopAllIntervals();
        }
    });

    test('bivio Onorevole: le due scelte muovono i gettoni in direzioni OPPOSTE', () => {
        const a = preparaMondo();
        const b = preparaMondo();
        try {
            for (const m of [a, b]) { m.gs.reputation = 3; m.gs.politicalTokens = 2; }
            pushEventoVip(a.gs, 'vip_onorevole_event', 305, {});
            pushEventoVip(b.gs, 'vip_onorevole_event', 305, {});
            a.sandbox.vipOnorevoleEventCopera(305);   // 2 → 1 gettoni
            b.sandbox.vipOnorevoleEventResisti(305);  // 2 → 3 gettoni
            assert.notEqual(a.gs.politicalTokens, b.gs.politicalTokens,
                'copera consuma, resisti guadagna: il bivio cambia lo stato in direzioni diverse');
            assert.ok(b.gs.reputation < a.gs.reputation,
                'resisti costa reputazione, cooperare no');
        } finally {
            a.stopAllIntervals(); b.stopAllIntervals();
        }
    });

    /* ── AZIONE RIPETUTA DUE VOLTE ────────────────────────────────────────────
       Nessuna delle sei azioni controlla `status === 'resolved'`: rilanciarle
       sullo stesso id ri-esegue l'effetto (doppio addebito/doppio gettone).
       La UI non lo permette (l'email risolta sparisce dalla lista), ma l'API
       non e' idempotente: qui si DOCUMENTA il comportamento osservabile di
       ogni coppia, cosi' una futura guardia rendera' questi assert rossi
       e verra' aggiornata insieme ai test. */

    test('ripetuta due volte: le sei azioni ri-eseguono l\'effetto sullo stesso id (BUG noto)', () => {
        const g = preparaMondo();
        const o = preparaMondo();
        try {
            // Grigori accept ×2: due spend da 500 = −1000, due syncCash.
            pushEventoVip(g.gs, 'vip_grigori_event', 401, { cost: 500 });
            g.sandbox.vipGrigoriEventAccept(401);
            g.sandbox.vipGrigoriEventAccept(401);
            assert.equal(g.gs.cash, 999_000, 'Grigori accept ×2: BUG noto, addebito duplicato');
            assert.equal(g.syncCashCalls.length, 2);

            // Grigori decline ×2: reputazione scalata due volte.
            pushEventoVip(g.gs, 'vip_grigori_event', 402, { cost: 500 });
            g.gs.reputation = 3;
            g.sandbox.vipGrigoriEventDecline(402);
            g.sandbox.vipGrigoriEventDecline(402);
            assert.equal(g.gs.reputation, 2.8, 'Grigori decline ×2: −0.2★');

            // Garante paga ×2: multa riscossa due volte.
            pushEventoVip(g.gs, 'vip_garante_event', 403, { fine: 2000 });
            g.sandbox.vipGaranteEventPaga(403);
            g.sandbox.vipGaranteEventPaga(403);
            assert.equal(g.gs.cash, 995_000, 'Garante paga ×2: multa duplicata (1.000.000 −500×2 −2.000×2)');

            // Garante intimidisci ×2 coi gettoni: due gettoni consumati.
            g.gs.politicalTokens = 2;
            pushEventoVip(g.gs, 'vip_garante_event', 404, { fine: 2000 });
            conRandom(0.9, () => g.sandbox.vipGaranteEventIntimidisci(404));
            conRandom(0.9, () => g.sandbox.vipGaranteEventIntimidisci(404));
            assert.equal(g.gs.politicalTokens, 0, 'Garante intimidisci ×2: due gettoni');

            // Onorevole copera ×2 senza gettoni: due multe.
            o.gs.cash = 10_000;
            pushEventoVip(o.gs, 'vip_onorevole_event', 405, {});
            o.sandbox.vipOnorevoleEventCopera(405);
            o.sandbox.vipOnorevoleEventCopera(405);
            assert.equal(o.gs.cash, 8_000, 'Copera ×2: due multe da €1.000');
            assert.equal(o.syncCashCalls.length, 2);

            // Onorevole resisti ×2: gettone guadagnato due volte, rep calata due volte.
            o.gs.reputation = 3;
            o.gs.politicalTokens = 0;
            pushEventoVip(o.gs, 'vip_onorevole_event', 406, {});
            o.sandbox.vipOnorevoleEventResisti(406);
            o.sandbox.vipOnorevoleEventResisti(406);
            assert.equal(o.gs.politicalTokens, 2, 'Resisti ×2: +2 gettoni');
            assert.ok(Math.abs(o.gs.reputation - 2.9) < 1e-9, 'Resisti ×2: −0.1★ (due volte −0.05)');
        } finally {
            g.stopAllIntervals(); o.stopAllIntervals();
        }
    });

    test('Onorevole su evento inesistente: entrambe le strade sono no-op sicure', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            gs.reputation = 3;
            gs.politicalTokens = 1;
            assert.doesNotThrow(() => sandbox.vipOnorevoleEventCopera(9999));
            assert.doesNotThrow(() => sandbox.vipOnorevoleEventResisti(9999));
            assert.equal(gs.cash, 1_000_000);
            assert.equal(gs.politicalTokens, 1);
            assert.equal(gs.reputation, 3);
            assert.equal(syncCashCalls.length, 0);
        } finally {
            stopAllIntervals();
        }
    });
});
