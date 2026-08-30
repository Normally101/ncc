'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   funzioni/forbice-prezzo-p2p-server — il client non deve proporre prezzi che
   il server rifiuta.

   Il 30/08, prima di applicare la migrazione `69` che avrebbe messo dei paletti
   assoluti su `rpc_list_car_for_sale`, ho letto la funzione VERA in produzione.
   Non era come la migrazione la descriveva: i paletti c'erano gia', ed erano
   piu' severi di quelli che stavo per scrivere —

       minimo €1.000 · massimo €50.000.000 · segnalazione anti-cheat sopra i
       €10.000.000 · massimo 5 annunci attivi per giocatore

   — mentre la migrazione avrebbe rimpiazzato la funzione perdendo il tetto dei
   5 annunci e le segnalazioni. Applicarla sarebbe stato un passo indietro
   travestito da rafforzamento, e il file e' stato tolto.

   Restava pero' un disallineamento vero, introdotto dalla forbice del client:
   il minimo lato client era €100, quello del server €1.000. Su un'auto molto
   malmessa il campo diceva «da €400», il giocatore scriveva €400 e si prendeva
   un errore del server che sembra un guasto del gioco.

   Questi test difendono l'allineamento nella direzione giusta: il client si
   adegua al server, non viceversa.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function ambiente() {
    const env = createGameEnv([...CORE_FILES, 'ui-market.js'], { render: true });
    const s = env.sandbox;
    s.initGame(true);
    env.stopAllIntervals();
    s.window.currentUser = { id: 'io' };
    const c = s.document.createElement('div');
    c.id = 'tab-container';
    s.document.body.appendChild(c);
    return { env, s, gs: s.gameState, c };
}

const auto = (over = {}) => ({
    id: 'c1', name: 'Berlina', tier: 'standard', vehicleClass: 'nexus_h',
    condition: 80, isLease: false, fuel: 100, mileage: 1000,
    tirePressure: 100, engineHealth: 100, outOfService: null, upgrades: [], ...over,
});

describe('funzioni/forbice-prezzo-p2p-server', () => {
    let env, s, gs, c;
    beforeEach(() => { ({ env, s, gs, c } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('i paletti del client sono quelli veri del server', () => {
        assert.equal(s.window.P2P_PREZZO_MIN_SERVER, 1000,
            'rpc_list_car_for_sale rifiuta sotto €1.000: proporre meno significa mandare il giocatore contro un errore');
        assert.equal(s.window.P2P_PREZZO_MAX_SERVER, 50000000,
            'e sopra €50.000.000');
    });

    test('la forbice non scende mai sotto il minimo del server', () => {
        // condizione 8 su un\'auto standard: stima €1.600, meta' = €800 < €1.000
        const f = s.window._forbicePrezzoP2P(auto({ condition: 8 }));
        assert.ok(f.min >= 1000, `il minimo mostrato era €${f.min}, il server ne pretende 1000`);
        assert.ok(f.vendibile, 'a questa condizione l\'auto e\' ancora vendibile');
    });

    test('la forbice non sale mai sopra il massimo del server', () => {
        const f = s.window._forbicePrezzoP2P(auto({ tier: 'ultra', condition: 100 }));
        assert.ok(f.max <= 50000000);
    });

    test('un rottame senza forbice possibile non e\' vendibile ai giocatori', () => {
        const f = s.window._forbicePrezzoP2P(auto({ condition: 1 }));   // stima €200, max €400
        assert.equal(f.vendibile, false,
            'se nemmeno il doppio del valore arriva al minimo del server, non esiste un prezzo valido');
    });

    test('la scheda Mercato non mostra un campo prezzo impossibile', () => {
        gs.fleet.push(auto({ id: 'rottame', name: 'Rottame', condition: 1 }));
        s.renderTabMarket();

        assert.ok(!c.querySelector('#p2p-price-rottame'),
            'un campo con minimo sopra il massimo non si puo\' compilare: meglio non mostrarlo');
        assert.ok(c.innerHTML.includes('Troppo malmessa'), 'e va spiegato perche\'');
        assert.ok(c.innerHTML.includes('data-ce-act="listCarForSale"'),
            'la strada del concessionario deve restare aperta');
    });

    test('il valore proposto nel campo sta sempre dentro la forbice', () => {
        // stima €2.000, meta' €1.000: il suggerimento (la stima) e' dentro.
        // Su un\'auto quasi a zero la stima sarebbe SOTTO il minimo del server.
        gs.fleet.push(auto({ id: 'c9', condition: 12 }));
        const f = s.window._forbicePrezzoP2P(gs.fleet.find(x => x.id === 'c9'));
        s.renderTabMarket();
        const input = c.querySelector('#p2p-price-c9');
        if (!input) { assert.ok(!f.vendibile, 'senza campo, l\'auto dev\'essere invendibile'); return; }
        const v = Number(input.value);
        assert.ok(v >= f.min && v <= f.max,
            `il campo parte da €${v}, fuori dalla forbice ${f.min}–${f.max}: un clic e il server rifiuta`);
    });

    test('pubblicare un rottame viene fermato prima di toccare il server', async () => {
        const car = auto({ id: 'rottame', name: 'Rottame', condition: 1 });
        gs.fleet.push(car);
        let chiamate = 0;
        const catena = new Proxy({}, { get(_, p) {
            if (p === 'then') return (ok) => ok({ data: [], error: null });
            return () => catena;
        }});
        s.window.supabaseClient = {
            rpc: async () => { chiamate++; return { data: {}, error: null }; },
            from: () => catena, channel: () => catena, removeChannel: () => {},
        };

        await s.window.p2pListCarForSale('rottame', 5000);

        assert.equal(chiamate, 0, 'niente deve raggiungere il server');
        assert.ok(gs.fleet.some(x => x.id === 'rottame'), 'e l\'auto resta in garage');
    });

    test('la migrazione 69 non esiste piu\'', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const ROOT = path.resolve(__dirname, '..', '..');
        const c69 = fs.readdirSync(ROOT).filter(f => f.startsWith('69_'));
        assert.deepEqual(c69, [],
            'descriveva un server che non esiste e, applicata, avrebbe tolto il tetto dei 5 ' +
            'annunci attivi e le segnalazioni anti-cheat: un file cosi\', fermo nel repo con ' +
            'scritto «da applicare», e\' una trappola per la prossima sessione');
    });
});
