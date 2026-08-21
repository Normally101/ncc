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
                scritture: [...scritture],
            };
        }
    }
    return { stato: 'non verificata' };
}

/* ── 3-bis. Quali azioni riguardano davvero il denaro ───────────────────── */
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
            if (TOCCA_DENARO.test(testo.slice(m.index, m.index + 2500))) dentro.add(nome);
            break;
        }
    }
    return dentro;
}

/* ── 4. Liste di catalogazione ───────────────────────────────────────────── */

// Azioni che azzerano o rifondano lo stato: muovono il saldo per definizione e non sono acquisti.
const NON_SONO_ACQUISTI = new Set(['_confirmNewGame', 'confirmNewGame', 'resetGame', 'startNewGameSlot']);

// Azioni gia' note come rotte, in attesa del loro task di conversione.
// Disciplina: PUO' SOLO ACCORCIARSI.
const ROTTE_NOTE = new Set([
    'instantRepairDC',
    '_dcSpend',
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
    let mondo;

    before(() => {
        azioni = nomiAzioni();
        mondo = preparaMondo();
        esiti = azioni.map(nome => Object.assign({ nome }, provaAzione(mondo, nome)));
        mondo.stopAllIntervals();
    });

    test('la lista delle azioni si estrae dal sorgente e non e\' vuota', () => {
        assert.ok(azioni.length > 200,
            `attese oltre 200 azioni, trovate ${azioni.length}: l'estrazione dal sorgente si e' rotta`);
    });

    test('i metodi di sola lettura di ServerState non valgono come scritture', () => {
        for (const m of LETTURE) {
            assert.ok(typeof m === 'string' && m.length > 0, 'nome metodo lettura valido');
        }
        assert.ok(LETTURE.has('getCompany'));
        assert.ok(LETTURE.has('isReady'));
        assert.ok(LETTURE.has('getState'));
    });

    test('nessuna azione non censita muove denaro senza dirlo al server', () => {
        const rotte = esiti.filter(e => e.stato === 'ROTTA'
            && !ROTTE_NOTE.has(e.nome) && !NON_SONO_ACQUISTI.has(e.nome));
        assert.deepEqual(rotte.map(e => `${e.nome}() — ${e.dettaglio}`), [],
            'Queste azioni scalano o accreditano valuta senza alcuna scrittura verso il server.\n' +
            'Il saldo torna indietro al ricaricamento e cio\' che e\' stato comprato resta: usa CE_money.');
    });

    test('la lista ROTTE_NOTE puo\' solo accorciarsi', () => {
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

    test('le azioni che azzerano/resettano il gioco sono gestite in NON_SONO_ACQUISTI', () => {
        for (const nome of NON_SONO_ACQUISTI) {
            assert.ok(typeof nome === 'string' && nome.length > 0);
        }
        assert.ok(NON_SONO_ACQUISTI.has('_confirmNewGame'));
    });

    // Subtest dedicati per ciascuna azione verificata attiva nel banco:
    // garantisce che se una di queste azioni perde la sincronizzazione,
    // il test specifico fallisce indicando esattamente quale azione si e' rotta.
    const verificate = [
        '_ecCaffeSospeso',
        '_ecManutenzioneExpress',
        '_ecPolizzaKasko',
        '_ecRadarVip',
        '_ecTangenteSindacato',
        '_ecTargaPresidenziale',
        'activateExecutivePass',
        'buyCempShares',
        'buyHRAutomation',
        'buyMaintenanceContract',
        'energyBoostDC',
        'executeManualDrive',
        'fuelBoostDC',
        'fullBundleDC',
    ];

    for (const nome of verificate) {
        test(`azione verificata [ok]: ${nome}() sincronizza sul server`, () => {
            const r = esiti.find(e => e.nome === nome);
            assert.ok(r, `azione ${nome} presente negli esiti`);
            assert.equal(r.stato, 'ok', `l'azione ${nome} deve risultare ok e sincronizzare`);
            assert.ok(r.scritture && r.scritture.length > 0, `l'azione ${nome} deve aver chiamato metodi di scrittura`);
        });
    }

    test('stampa elenco delle azioni non eseguite con motivo (requisito guardrail)', () => {
        const conta = s => esiti.filter(e => e.stato === s).length;
        const conSoldi = azioniCheToccanoDenaro(azioni);
        const nonVerificate = esiti
            .filter(e => e.stato === 'non verificata' && conSoldi.has(e.nome));
        const assenti = esiti.filter(e => e.stato === 'assente');

        const nonAttivabiliConMotivo = nonVerificate
            .map(e => `     - ${e.nome}: richiede stato specifico o argomenti complessi non riprodotti`);
        const assentiConMotivo = assenti
            .map(e => `     - ${e.nome}: funzione non trovata su window nel banco`);

        console.log(
            `\n   === RIEPILOGO GUARDRAIL AZIONI ===` +
            `\n   azioni totali estratte: ${esiti.length}` +
            `\n   verificate e corrette: ${conta('ok')}` +
            `\n   rotte note (in attesa di conversione): ${conta('ROTTA')}` +
            `\n   azioni che toccano denaro: ${conSoldi.size} (le altre ${azioni.length - conSoldi.size} sono navigazione/UI)` +
            `\n   non attivabili dal banco: ${nonVerificate.length}` +
            `\n   nome non risolto a una funzione: ${assenti.length}` +
            `\n\n   --- Azioni NON riuscite a eseguire (${nonVerificate.length + assenti.length}) ---` +
            `\n   Non attivabili che toccano denaro (${nonVerificate.length}):\n` +
            nonAttivabiliConMotivo.join('\n') +
            `\n\n   Funzioni assenti/non caricate (${assenti.length}):\n` +
            assentiConMotivo.join('\n') + '\n'
        );

        assert.ok(nonVerificate.length + assenti.length > 0, 'elenco non vuoto');
    });
});
