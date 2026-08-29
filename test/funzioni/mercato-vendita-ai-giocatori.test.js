'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   funzioni/mercato-vendita-ai-giocatori — il mercato P2P poteva solo restare vuoto.

   Vlad, 30/08: «non penso che, se io metto in vendita una macchina, la venda al
   gioco e basta. Non ha un altro giocatore che dovrebbe comprarla poi.»
   Aveva ragione, e il motivo era piu' preciso del sospetto.

   Il mercato fra giocatori era COMPLETO: `p2pListCarForSale` nel client,
   `rpc_list_car_for_sale` sul server, acquisto con verifica fondi lato
   Postgres, fee del 5%, lock anti-doppio-acquisto, Realtime, feature flag
   acceso dal 22/08. Mancava una cosa sola: **nessun bottone chiamava la
   pubblicazione**. In `ui-market.js` l'unico «Vendi» puntava a
   `listCarForSale` (engine-fleet.js), che e' il mercato NPC: l'auto la compra
   il GIOCO. Quindi la sezione «Mercato P2P Reale» diceva «Nessun annuncio al
   momento. Sii il primo!» — e nessuno poteva esserlo, mai.

   Questi test difendono le due meta' della riparazione: che la strada verso i
   giocatori esista davvero nell'interfaccia, e che il prezzo scelto dal
   venditore resti dentro una forbice (richiesta esplicita di Vlad).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function ambiente() {
    // ui-market.js e p2p-render.js non stanno in CORE_FILES: qui servono
    // entrambi, perche' il difetto sta proprio nella giuntura fra i due.
    const env = createGameEnv([...CORE_FILES, 'ui-market.js'], { render: true });
    const s = env.sandbox;
    s.initGame(true);
    env.stopAllIntervals();
    const gs = s.gameState;
    gs.questStats = gs.questStats || {};
    gs.questStats.totalRides = 40;          // fuori dall'onboarding
    // un utente loggato: senza, il P2P rifiuta tutto per principio
    s.window.currentUser = { id: 'utente-test' };
    const container = s.document.createElement('div');
    container.id = 'tab-container';
    s.document.body.appendChild(container);
    return { env, s, gs, container };
}

function _sbFinto(onRpc) {
    // Catena permissiva: p2pFetchMarket/saveGame concatenano select/order/gt/limit/upsert
    // in ordini diversi. Qui qualunque metodo torna la catena stessa, che e' anche
    // awaitable e risolve a { data: [], error: null }.
    const catena = new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') return (res) => res({ data: [], error: null });
            return () => catena;
        },
    });
    return { rpc: onRpc, from: () => catena, channel: () => catena, removeChannel: () => {} };
}

function autoVendibile(gs, extra = {}) {
    const car = {
        id: 'c_vendibile', name: 'Nexus H-Line', tier: 'business',
        vehicleClass: 'nexus_h', condition: 80, isLease: false,
        fuel: 100, mileage: 12000, tirePressure: 100, engineHealth: 100,
        outOfService: null, upgrades: [], ...extra,
    };
    gs.fleet.push(car);
    return car;
}

describe('funzioni/mercato-vendita-ai-giocatori', () => {
    let env, s, gs, container;
    beforeEach(() => { ({ env, s, gs, container } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('la scheda Mercato offre DUE strade: il concessionario e gli altri giocatori', () => {
        autoVendibile(gs);

        s.renderTabMarket();
        const html = container.innerHTML;

        assert.ok(html.includes('data-ce-act="listCarForSale"'),
            'la vendita al concessionario (il gioco compra) deve restare');
        assert.ok(html.includes('data-ce-act="ceListCarP2P"'),
            'era questo che mancava: nessun bottone pubblicava sul mercato fra giocatori, ' +
            'quindi la sezione «Mercato P2P Reale» non poteva mai avere un annuncio');
    });

    test('il campo del prezzo parte dalla stima e dichiara la forbice', () => {
        const car = autoVendibile(gs);
        const f = s.window._forbicePrezzoP2P(car);

        s.renderTabMarket();
        const input = container.querySelector('#p2p-price-c_vendibile');

        assert.ok(input, 'ci deve essere un campo dove scrivere il prezzo');
        assert.equal(Number(input.value), f.stima, 'il campo parte dal valore stimato');
        assert.equal(Number(input.getAttribute('min')), f.min, 'il minimo deve essere dichiarato');
        assert.equal(Number(input.getAttribute('max')), f.max, 'il massimo deve essere dichiarato');
    });

    test('pubblicare a un prezzo dentro la forbice invia l\'annuncio al server', async () => {
        const car = autoVendibile(gs);
        const f = s.window._forbicePrezzoP2P(car);
        const chiamate = [];
        s.window.supabaseClient = _sbFinto(async (nome, args) => {
            chiamate.push({ nome, args });
            return { data: { id: 'l1' }, error: null };
        });

        await s.window.p2pListCarForSale('c_vendibile', f.stima);

        assert.equal(chiamate.length, 1, 'deve partire una chiamata al server');
        assert.equal(chiamate[0].nome, 'rpc_list_car_for_sale', 'e deve essere quella del mercato fra giocatori');
        assert.equal(chiamate[0].args.v_ask_price, f.stima, 'il prezzo inviato e\' quello chiesto');
        assert.ok(!gs.fleet.some(c => c.id === 'c_vendibile'),
            'l\'auto esce dalla flotta finche\' l\'annuncio e\' aperto');
    });

    test('un prezzo troppo basso viene rifiutato e l\'auto resta in garage', async () => {
        const car = autoVendibile(gs);
        const f = s.window._forbicePrezzoP2P(car);
        let chiamate = 0;
        s.window.supabaseClient = _sbFinto(async () => { chiamate++; return { data: {}, error: null }; });

        await s.window.p2pListCarForSale('c_vendibile', f.min - 1);

        assert.equal(chiamate, 0, 'niente deve raggiungere il server');
        assert.ok(gs.fleet.some(c => c.id === 'c_vendibile'),
            'l\'auto non deve sparire dalla flotta per un annuncio mai pubblicato');
    });

    test('un prezzo assurdo verso l\'alto viene rifiutato', async () => {
        const car = autoVendibile(gs);
        const f = s.window._forbicePrezzoP2P(car);
        let chiamate = 0;
        s.window.supabaseClient = _sbFinto(async () => { chiamate++; return { data: {}, error: null }; });

        await s.window.p2pListCarForSale('c_vendibile', f.max + 1);
        await s.window.p2pListCarForSale('c_vendibile', 999999999999);

        assert.equal(chiamate, 0, 'un annuncio che nessuno comprera\' mai sporca solo la lista');
        assert.ok(gs.fleet.some(c => c.id === 'c_vendibile'), 'l\'auto resta in flotta');
    });

    test('un prezzo non numerico non manda la trattativa a NaN', async () => {
        autoVendibile(gs);
        let chiamate = 0;
        s.window.supabaseClient = _sbFinto(async () => { chiamate++; return { data: {}, error: null }; });

        await s.window.p2pListCarForSale('c_vendibile', 'tanti soldi');
        await s.window.p2pListCarForSale('c_vendibile', null);

        assert.equal(chiamate, 0, 'un prezzo non finito non deve mai arrivare al server');
        assert.ok(gs.fleet.some(c => c.id === 'c_vendibile'), 'l\'auto resta in flotta');
    });

    test('la validazione vive nella funzione, non nel markup: vale anche da console', async () => {
        const car = autoVendibile(gs);
        const f = s.window._forbicePrezzoP2P(car);
        let chiamate = 0;
        s.window.supabaseClient = _sbFinto(async () => { chiamate++; return { data: {}, error: null }; });

        // nessun render: si chiama la funzione direttamente, come farebbe la console
        await s.window.p2pListCarForSale('c_vendibile', f.max * 10);

        assert.equal(chiamate, 0,
            'se il limite stesse solo nell\'attributo max dell\'input, bastarebbe la console per aggirarlo');
    });

    test('il valore stimato di un\'auto ha una sola definizione in tutto il repo', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const ROOT = path.resolve(__dirname, '..', '..');
        const copie = [];
        for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
            const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            if (/20000\s*\*/.test(src) && f !== 'engine-fleet.js') copie.push(f);
        }
        assert.deepEqual(copie, [],
            'la formula del valore stava scritta a mano in tre punti (ui-market due volte, ui-staff una):\n' +
            'la stima mostrata e il prezzo suggerito potevano divergere al primo ritocco.\n' +
            'Usa window._valoreStimatoAuto(car).');
    });

    test('la stima e la forbice sono coerenti fra loro', () => {
        const car = autoVendibile(gs, { condition: 100, tier: 'ultra' });
        const f = s.window._forbicePrezzoP2P(car);
        assert.ok(f.min < f.stima && f.stima < f.max, `forbice incoerente: ${JSON.stringify(f)}`);
        assert.ok(f.min >= 100, 'il minimo non deve mai scendere sotto una cifra simbolica');

        const rottame = { id: 'c_x', name: 'Rottame', tier: 'standard', condition: 0 };
        const fr = s.window._forbicePrezzoP2P(rottame);
        assert.ok(fr.min >= 100, `anche a condizione 0 il minimo resta sensato, letto ${fr.min}`);
    });
});
