'use strict';
/* ============================================================================
   Regola 3 — le azioni del giocatore si verificano da sole.

   Il gioco ha 93 file e oltre 350 funzioni: cercare i bug leggendoli uno per
   uno non scala, e infatti ha gia' lasciato passare 19 azioni che scalavano
   soldi senza dirlo al server. Ma ogni azione del giocatore passa da UN SOLO
   punto: il dispatcher di events.js, che legge `data-ce-act` e chiama
   `window[nome]`. Quindi non serve testare 93 file — serve testare la lista
   FINITA delle azioni, che si puo' estrarre dal sorgente.

   Questo test:
     1. estrae dal codice tutti i nomi `data-ce-act` / `ceAct('...')`;
     2. esegue ognuno con un ServerState strumentato;
     3. FALLISCE se un'azione muove denaro senza che parta una SCRITTURA
        verso il server.

   Le letture (`getCompany`, `isReady`) non contano come sincronizzazione:
   contarle e' l'errore che il 19/08/2026 ha quasi fatto dichiarare "tutto a
   posto" mentre 19 azioni erano rotte.

   Le azioni che non si riescono ad attivare (servono condizioni di gioco che
   il banco non ricrea) finiscono in un elenco stampato a fine test: e' la
   lista di lavoro successiva, non un silenzio.

   Chi aggiunge un pulsante nuovo entra qui automaticamente.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/* ── 1. La lista finita delle azioni ──────────────────────────────────────── */

function nomiAzioni() {
    const nomi = new Set();
    const sorgenti = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js');
    sorgenti.push('index.html');
    for (const f of sorgenti) {
        let testo;
        try { testo = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
        for (const m of testo.matchAll(/ceAct\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) nomi.add(m[1]);
        for (const m of testo.matchAll(/data-ce-act=\\?["']([A-Za-z_$][\w$]*)/g)) nomi.add(m[1]);
    }
    return [...nomi].sort();
}

/* ── 2. Un mondo di gioco abbastanza ricco da far scattare le azioni ─────── */

// Metodi di sola lettura: chiamarli NON e' sincronizzare.
const LETTURE = new Set([
    'isReady', 'getCompany', 'getState', 'getVehicles', 'getDrivers', 'getTrips',
    'findServerVehicle', 'findServerDriver', 'getFuelPrice', 'getMyInfluence',
    'getTerritorySnapshot', 'bridgeToGameState',
]);

function preparaMondo() {
    const scritture = [];
    const { sandbox, stopAllIntervals } = freshEnv();
    const SS = sandbox.window.ServerState;
    for (const k of Object.keys(SS)) {
        if (typeof SS[k] !== 'function') continue;
        const orig = SS[k];
        SS[k] = function (...a) {
            if (!LETTURE.has(k)) scritture.push(k);
            return orig.apply(this, a);
        };
    }

    // Il rendering non c'entra con il denaro e costa quasi tutto il tempo di
    // esecuzione (ogni azione ricostruisce l'HTML di una tab intera). Neutralizzato:
    // senza questo il test impiega minuti invece di secondi.
    const inerti = ['updateUI', 'saveGame', 'logToMap', 'showNotification', 'showBigEvent',
                    'closeModals', 'switchTab', 'spawnMoneyParticles', 'openAcademyModal'];
    for (const nome of inerti) sandbox.window[nome] = function () {};
    for (const chiave of Object.keys(sandbox.window)) {
        if (/^render(Tab|P2P)/.test(chiave) && typeof sandbox.window[chiave] === 'function') {
            sandbox.window[chiave] = function () {};
        }
    }

    const gs = sandbox.gameState;
    gs.fleet = gs.fleet || [];
    gs.fleet.push({ id: 'c1', _serverId: 's1', name: 'Auto', tier: 'business', condition: 45,
                    fuel: 25, tirePressure: 30, engineHealth: 60, isLease: false,
                    status: 'idle', mileage: 1000, upgrades: [] });
    gs.drivers = gs.drivers || [];
    gs.drivers.push({ id: 'd1', _serverId: 'sd1', name: 'Autista', status: 'resting',
                      stress: 90, stress_level: 80, energy: 20, salary: 1500, skill: 50,
                      onStrike: true, health: 30, fatigue: 60, restHoursLeft: 5 });
    gs.staff = gs.staff || [];
    gs.investments = gs.investments || [];
    gs.investments.push('inv_fuel_depot', 'inv_tire_depot');
    gs.fuelTank = 0; gs.fuelTankCapacity = 10000; gs.fuelTankLevel = 1; gs.fuelPrice = 1.85;
    gs.constructions = [{ id: 'k1', invId: 'inv_fuel_depot', daysLeft: 5 }];
    gs.driverAcademy = [{ driverId: 'd1', courseId: 'c_eco', daysLeft: 3 }];
    gs.corporateTenders = [{ id: 'tn1', status: 'open', company: { name: 'ACME', tier: 'gold', vehType: 'business' }, playerBid: null }];
    gs.hqs = { roma: { rooms: {}, grid: new Array(12).fill(null) } };
    gs.energy = 40;
    return { sandbox, gs, scritture, stopAllIntervals };
}

/* ── 3. Esegue un'azione e guarda se il denaro si e' mosso di nascosto ───── */

/**
 * Le forme di argomento con cui si prova ogni azione.
 *
 * Conta piu' di quanto sembri: un'azione risulta "non verificata" non perche'
 * il suo file non sia caricato — quello e' un malinteso che e' costato un
 * pomeriggio — ma perche' ESEGUITA con questi argomenti non muove denaro. Se
 * `_srmPurchase` vuole l'id di un'auto del catalogo e gli passiamo 'c1', non
 * compra niente e noi concludiamo che non tocca il portafoglio. Sbagliando.
 *
 * Quindi ogni forma aggiunta qui puo' portare alla luce azioni rotte che prima
 * passavano inosservate. Gli id corrispondono a quelli che preparaMondo()
 * mette davvero nel gameState.
 */
const ARGOMENTI = [
    [],
    ['c1'],                    // un veicolo in flotta
    ['d1'],                    // un autista
    ['tn1'],                   // una gara d'appalto aperta
    ['k1'],                    // un cantiere in corso
    ['inv_fuel_depot'],        // un investimento posseduto
    [0],                       // molte azioni indicizzano una lista
    ['roma'],                  // una citta'
    ['c1', 0],
    ['d1', 0],
];

function provaAzione(mondo, nome) {
    const { sandbox, gs, scritture } = mondo;
    const fn = sandbox.window[nome];
    if (typeof fn !== 'function') return { stato: 'assente' };

    for (const args of ARGOMENTI) {
        gs.cash = 1_000_000;
        gs.driverCoins = 100_000;
        gs.vtkBalance = 10_000;
        scritture.length = 0;

        try {
            const r = fn.apply(sandbox.window, args);
            if (r && typeof r.then === 'function') r.catch(() => {});
        } catch (e) { /* argomenti sbagliati: si prova la forma successiva */ }

        const mossoCash = gs.cash !== 1_000_000;
        const mossoDC   = gs.driverCoins !== 100_000;
        const mossoVTK  = gs.vtkBalance !== 10_000;
        if (mossoCash || mossoDC || mossoVTK) {
            return {
                stato: scritture.length > 0 ? 'ok' : 'ROTTA',
                dettaglio: `cash ${gs.cash - 1_000_000}, DC ${gs.driverCoins - 100_000}, VTK ${gs.vtkBalance - 10_000}`,
            };
        }
    }
    return { stato: 'non verificata' };
}

/* ── 3-bis. Quali azioni riguardano davvero il denaro ─────────────────────
   Senza questa distinzione il rapporto di copertura mente. Delle 246 azioni,
   115 sono navigazione, filtri, aperture di finestre: non toccano il
   portafoglio e non c'e' niente da verificare. Contarle nel denominatore
   faceva leggere "15 su 246" — un 6% che spaventa — quando il lavoro vero
   riguarda 129 azioni. Il 20/08/2026 questo numero mal costruito ha mandato
   un pomeriggio di lavoro nella direzione sbagliata. */
const TOCCA_DENARO = /CE_money|gameState\.(cash|driverCoins|vtkBalance)|spendDriverCoins|syncCash|buyEnergyRefill|acquireProvince|buyRealEstate/;

function azioniCheToccanoDenaro(nomi) {
    const sorgenti = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js');
    const testi = sorgenti.map(f => {
        try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; }
    });
    const dentro = new Set();
    for (const nome of nomi) {
        const fuga = nome.replace(/[$]/g, '\\$');
        const re = new RegExp(`(window\\.)?${fuga}\\s*=\\s*(async\\s*)?function|function\\s+${fuga}\\s*\\(`);
        for (const testo of testi) {
            const m = re.exec(testo);
            if (!m) continue;
            // Il corpo non si delimita con precisione senza un parser: 2500
            // caratteri coprono abbondantemente una funzione di gioco e un
            // falso positivo qui e' innocuo (si verifica un'azione in piu').
            if (TOCCA_DENARO.test(testo.slice(m.index, m.index + 2500))) dentro.add(nome);
            break;
        }
    }
    return dentro;
}

/* ── 4. Il test ───────────────────────────────────────────────────────────── */

// Azioni gia' note come rotte, in attesa del loro task di conversione. Stessa
// disciplina della lista ECCEZIONI di una-sola-porta.test.js: PUO' SOLO
// ACCORCIARSI. Vuota significa che l'economia e' interamente sincronizzata.
// Azioni che azzerano o rifondano lo stato: muovono il saldo per definizione e non
// sono acquisti. Non sono bug, e non vanno confuse con essi.
const NON_SONO_ACQUISTI = new Set(['_confirmNewGame', 'confirmNewGame', 'resetGame', 'startNewGameSlot']);

const ROTTE_NOTE = new Set([
    // engine-fleet.js, in attesa del suo task di conversione
    'instantRepairDC',
    // ui-store.js: `_dcSpend(itemId, costo)` chiamata senza costo porta i Driver
    // Coins a NaN (`driverCoins -= undefined`), stessa famiglia del NaN di
    // hireDriver. Trovata il 19/08 allargando il banco di prova, che prima non
    // caricava ui-store.js. Si chiude con la conversione a CE_money.spendDC, che
    // rifiuta i valori non finiti.
    '_dcSpend',
    // hireDriver e' stata convertita il 19/08: oltre a non sincronizzare, chiamata
    // senza argomenti portava il saldo a NaN. CE_money.spend rifiuta i valori non
    // finiti, quindi ora esce senza toccare nulla e non figura piu' qui.
    'buyFuelForDepot', 'upgradeFuelDepot', 'buyTiresForDepot', 'emergencyRefuel',
    'buyHub', 'sellHub', 'buyPrototypeCar', 'buyNpcCar',
    'bidOnAuction', 'donateToLobby', 'buyStocks', 'sellStocks', 'shortSell',
    'coverShort', 'placeBrokerInvestment', 'buyLifestyleAsset', 'passLobbyLaw',
    'acquireVentureStake', 'divestVentureStake', 'CE_placeBid', 'CE_cancelBid',
    'CE_terminateContract', 'claimDailyOrder', 'speedUpConstruction',
    'acceptDiamondContract', 'acceptGreyMarket', 'negotiateEmail', 'autoNegotiateEmails',
]);

describe('guardrail — ogni azione del giocatore sincronizza col server', () => {
    let esiti;
    let azioni;

    before(() => {
        azioni = nomiAzioni();
        const mondo = preparaMondo();
        esiti = azioni.map(nome => Object.assign({ nome }, provaAzione(mondo, nome)));
        // Alcune azioni avviano timer (dispatcher, poll delle corse, aste). Senza
        // fermarli il processo dei test non termina mai: il banco li traccia apposta.
        mondo.stopAllIntervals();
    });

    test('la lista delle azioni si estrae dal sorgente e non e\' vuota', () => {
        assert.ok(azioni.length > 200,
            `attese oltre 200 azioni, trovate ${azioni.length}: l'estrazione dal sorgente si e' rotta`);
    });

    test('nessuna azione muove denaro senza dirlo al server', () => {
        const rotte = esiti.filter(e => e.stato === 'ROTTA'
            && !ROTTE_NOTE.has(e.nome) && !NON_SONO_ACQUISTI.has(e.nome));
        assert.deepEqual(rotte.map(e => `${e.nome}() — ${e.dettaglio}`), [],
            'Queste azioni scalano o accreditano valuta senza alcuna scrittura verso il server.\n' +
            'Il saldo torna indietro al ricaricamento e cio\' che e\' stato comprato resta: usa CE_money.');
    });

    test('la lista ROTTE_NOTE puo\' solo accorciarsi', () => {
        // Se un'azione e' stata sistemata ma lasciata qui, la lista mente e il
        // guardrail smette di sorvegliarla.
        const perNome = new Map(esiti.map(e => [e.nome, e]));
        const daTogliere = [];
        for (const nome of ROTTE_NOTE) {
            const e = perNome.get(nome);
            if (e && e.stato === 'ok') daTogliere.push(`${nome} (ora sincronizza)`);
            if (e && e.stato === 'assente') daTogliere.push(`${nome} (non esiste piu')`);
        }
        assert.deepEqual(daTogliere, [],
            'Queste azioni non sono piu\' rotte — rimuovile da ROTTE_NOTE:\n' + daTogliere.join('\n'));
    });

    test('rapporto di copertura', () => {
        const conta = s => esiti.filter(e => e.stato === s).length;
        const conSoldi = azioniCheToccanoDenaro(azioni);
        // Fra le non verificate contano solo quelle che il denaro lo toccano:
        // le altre non sono lavoro arretrato, sono azioni senza niente da
        // verificare.
        const nonVerificate = esiti
            .filter(e => e.stato === 'non verificata' && conSoldi.has(e.nome))
            .map(e => e.nome);
        // Elenco completo solo su richiesta: stamparlo sempre sommerge l'output di
        // `npm test`. `AZIONI_VERBOSE=1 npm test` per vedere la lista di lavoro.
        const dettaglio = process.env.AZIONI_VERBOSE
            ? `\n\n   Non attivabili (lista di lavoro):\n   ${nonVerificate.join(', ')}\n`
            : `\n   (AZIONI_VERBOSE=1 per l'elenco delle non attivabili)`;
        console.log(
            `\n   azioni totali: ${esiti.length}` +
            `\n   verificate e corrette: ${conta('ok')}` +
            `\n   rotte note (in attesa di conversione): ${conta('ROTTA')}` +
            `\n   azioni che toccano denaro: ${conSoldi.size} (le altre ${azioni.length - conSoldi.size} non hanno niente da verificare)` +
            `\n   non attivabili dal banco: ${nonVerificate.length}` +
            `\n   nome non risolto a una funzione: ${conta('assente')}` +
            dettaglio
        );
        assert.ok(true, 'rapporto informativo, non un fallimento');
    });
});
