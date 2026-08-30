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
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

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

/* Legge un catalogo dichiarato `const` dentro il VM (data.js e simili): quei nomi
   NON finiscono su `window`, quindi `sandbox.window.STOCK_TICKERS` e' undefined e
   l'unico modo di vederli e' valutare il nome nel contesto. Serve per passare alle
   azioni degli id VERI invece di stringhe inventate: senza id veri quasi ogni
   azione esce alla prima riga (`if (!ticker) return;`) e il guardrail la classifica
   «non attivabile» — che e' esattamente come 30 azioni sane sono rimaste per mesi
   nella lista dei sospetti. */
function catalogo(sandbox, nome) {
    try {
        const v = vm.runInContext(`typeof ${nome} !== 'undefined' ? ${nome} : null`, sandbox);
        return v || null;
    } catch { return null; }
}

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

    /* ServerState non e' l'unica porta verso il server: 16 punti in 8 file chiamano
       `window.supabaseClient.rpc(...)` DIRETTAMENTE (hostile_takeover.js, nemesi,
       infrastrutture, holding, quest…). Strumentare solo ServerState faceva sembrare
       «non sincronizzate» azioni che parlano col server per un'altra strada — un falso
       allarme che avrebbe portato a "riparare" codice sano. Qui il client finto
       registra le chiamate e risponde come farebbe Supabase (`{ data, error }`). */
    /* Il client finto e l'utente collegato li mette il regista (test-support/regista.js),
       non piu' questo file. La differenza non e' di stile: decine di azioni
       cominciano con `if (!_uid()) return;` — mercato fra giocatori, consorzi,
       sindacato, VTK, turismo, holding — e `window.currentUser` qui non e' MAI
       stato impostato. Quelle azioni uscivano alla PRIMA RIGA e finivano fra le
       «non attivabili»: sembravano bloccate da uno stato di gioco che mancava,
       ed erano bloccate dal non aver fatto il login.
       Il client del regista sa anche rispondere a `.from()`, `.channel()` e
       `auth`, che il finto di prima non aveva: senza quelli le stesse azioni
       esplodevano poco dopo. */
    R.conGiocatoreCollegato({ sandbox }, { id: 'giocatore-del-banco' });
    const client = sandbox.window.supabaseClient;
    const rpcDelRegista = client.rpc;
    client.rpc = function (nome, args) {
        scritture.push('supabase.rpc:' + nome);
        return rpcDelRegista(nome, args);
    };

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

    /* ── Lo stato che serve a far ARRIVARE le azioni fino al denaro. ──────────
       Ogni riga corrisponde a un cancello letto nel sorgente dell'azione che sblocca.
       Senza questo blocco 113 azioni che toccano denaro non venivano mai eseguite e
       il guardrail passava in silenzio su tutte.

       E' una FUNZIONE, non un blocco eseguito una volta, e rilegge `gameState` da
       `window` a ogni chiamata: fra le azioni ce ne sono alcune che rifondano la
       partita (`_confirmNewGame`, `resetGame`, `sellCompanyNGP`) e SOSTITUISCONO
       l'oggetto `gameState`. Con lo stato preparato una volta sola su un riferimento
       catturato all'inizio, dalla prima di quelle in poi il banco preparava il mondo
       VECCHIO mentre le azioni leggevano quello NUOVO — e siccome l'ordine e'
       alfabetico e `_confirmNewGame` sta quasi in cima, il guardrail era cieco per
       quasi tutta la sua corsa. Le azioni si consumavano anche lo scenario a vicenda
       (chi gira prima risolve le email, aggiudica l'asta, svuota il mercato usato):
       riapplicare tutto prima di ogni prova toglie di mezzo anche quello. */
    const poiIds = Object.keys(catalogo(sandbox, 'POIS') || {});
    const ids = {
        stock:    (catalogo(sandbox, 'STOCK_TICKERS')        || [])[0],
        rischio:  (catalogo(sandbox, 'BROKER_RISK_PROFILES') || [])[0],
        lusso:    (catalogo(sandbox, 'LIFESTYLE_ASSETS')     || [])[0],
        legge:    (catalogo(sandbox, 'LOBBY_LAWS')           || [])[0],
        venture:  (catalogo(sandbox, 'VENTURE_AGENCIES')     || [])[0],
        proto:    (catalogo(sandbox, 'PROTOTYPE_CARS')       || [])[0],
        poi:      poiIds[0],
        /* Un SECONDO punto d'interesse: il primo il banco lo mette gia' fra gli hub
           posseduti, quindi `buyHub(poi)` rispondeva «Hub gia' controllato» e
           risultava non attivabile. Comprare qualcosa richiede qualcosa che non hai. */
        poiDaComprare: poiIds[1] || poiIds[0],
        upgrade:  (catalogo(sandbox, 'CAR_UPGRADES')         || [])[0],
        campagna: (catalogo(sandbox, 'MARKETING_CAMPAIGNS')  || [])[0],
        vtkItem:  (catalogo(sandbox, 'VTK_SHOP_ITEMS')       || [])[0],
        /* Un investimento che il banco NON possiede gia': `buyInvestment` esce
           subito su quelli che hai (`investments.includes(invId)`), e il banco ne
           possiede due piu' la Kasko dello scenario VIP. */
        investimento: ((catalogo(sandbox, 'INVESTMENTS') || [])
            .find(i => !['inv_fuel_depot', 'inv_tire_depot', 'inv_kasko'].includes(i.id)) || {}).id,
        regione:  Object.keys(catalogo(sandbox, 'REGIONS') || {})
            .find(r => r !== 'lazio') || null,
    };

    /* `sistemi` sceglie fra due mondi, e la scelta non e' un vezzo: preparare uno
       stato ne rompe un altro. Se il regista mette in mano al giocatore la polizza
       Kasko (serve all'Erede), allora `_ecPolizzaKasko` non ha piu' niente da
       comprare; se gli mette un prestito attivo (serve a `repayLoan`), `takeLoan`
       rifiuta. Non e' un difetto del gioco: sono due situazioni che nella partita
       vera non capitano insieme, e pretendere che il banco ne costruisca una sola
       significa scegliere quale meta' delle azioni non provare mai.
       Quindi il banco prova ENTRAMBI i mondi. */
    function preparaStato({ sistemi = false } = {}) {
        const gs = sandbox.window.gameState;
        if (!gs) return null;

        gs.fleet = [
            { id: 'c1', _serverId: 's1', name: 'Auto', tier: 'business', condition: 45,
              fuel: 25, tirePressure: 30, engineHealth: 60, isLease: false,
              status: 'idle', mileage: 1000, upgrades: [] },
            // Un'auto ferma per carburante: unico caso in cui emergencyRefuel spende.
            { id: 'c2', _serverId: 's2', name: 'Auto ferma', tier: 'standard',
              condition: 50, fuel: 0, outOfService: 'fuel', status: 'idle',
              tirePressure: 50, engineHealth: 50, mileage: 500, upgrades: [] },
        ];
        gs.drivers = [{ id: 'd1', _serverId: 'sd1', name: 'Autista', status: 'resting',
                        stress: 90, stress_level: 80, energy: 20, salary: 1500, skill: 50,
                        onStrike: true, health: 30, fatigue: 60, restHoursLeft: 5 }];
        // `ewm` = Elite Wealth Manager: _hasWealthManager() (engine-finance.js:13) e' il
        // cancello di TUTTE le azioni di borsa. `evt_mgr` sblocca autoNegotiateEmails.
        gs.staff = [{ id: 'ewm', name: 'Wealth Manager', salary: 5000 },
                    { id: 'evt_mgr', name: 'Event Manager', salary: 3000 }];
        gs.investments = ['inv_fuel_depot', 'inv_tire_depot'];
        gs.fuelTank = 0; gs.fuelTankCapacity = 10000; gs.fuelTankLevel = 1; gs.fuelPrice = 1.85;
        gs.constructions = [{ id: 'k1', invId: 'inv_fuel_depot', daysLeft: 5,
                              completesDay: (gs.day || 1) + 5 }];   // speedUpConstruction legge completesDay
        gs.driverAcademy = [{ driverId: 'd1', courseId: 'c_eco', daysLeft: 3 }];
        gs.hqs = { roma: { rooms: {}, grid: new Array(12).fill(null) } };
        gs.energy = 40;

        gs.reputation     = 5.0;      // cancello di buyHub (2.5★), buyPrototypeCar, acquireVentureStake
        gs.pricingStrategy = 'standard';
        gs.lobbyingPoints = 100000;   // cancello di passLobbyLaw (law.pointsCost)
        gs.questStats     = Object.assign({ totalRides: 500 }, gs.questStats || {});
        gs.vipCooldowns   = gs.vipCooldowns || {};

        gs.stockHoldings = {}; gs.shortPositions = {}; gs.brokerInvestments = [];
        gs.lifestyleAssets = []; gs.activeLobbyLaws = []; gs.ventureCapital = []; gs.ownedHubs = [];
        // Le azioni di VENDITA hanno bisogno che il giocatore POSSIEDA gia' qualcosa.
        if (ids.stock)   gs.stockHoldings[ids.stock.id]  = { shares: 100, avgPrice: ids.stock.basePrice };
        if (ids.stock)   gs.shortPositions[ids.stock.id] = { shares: 50, entryPrice: ids.stock.basePrice };
        if (ids.venture) gs.ventureCapital.push({ agencyId: ids.venture.id, stakePercent: 10 });
        if (ids.poi)     gs.ownedHubs.push(ids.poi);

        gs.activeAuction = { id: 'auc1', name: 'Berlina da asta', currentBid: 1000, playerBid: 0 };
        gs.npcMarket     = [{ id: 'npc1', name: 'Usata NPC', tier: 'standard',
                              vehicleClass: 'mercedes_e', price: 20000, condition: 70 }];
        gs.corporateTenders   = [{ id: 'tn1', status: 'open', playerBid: null,
                                   company: { name: 'ACME', tier: 'gold', vehType: 'business' } }];
        gs.corporateContracts = [{ id: 'ct1', status: 'active', company: { name: 'ACME' }, tier: 3 }];

        // acceptGreyMarket pretende il tipo giusto e due POI validi; negotiateEmail e
        // autoNegotiateEmails lavorano sulle b2b non lette.
        gs.emails = [
            { id: 'em_b2b', type: 'b2b', status: 'unread', offer: 5000, from: 'ACME',
              subject: 'Proposta', clientName: 'ACME' },
            { id: 'em_grey', type: 'grey_market', status: 'unread', price: 8000,
              greyRideData: { fromId: poiIds[0], toId: poiIds[1] || poiIds[0],
                              price: 8000, isLong: false } },
            { id: 'em_diamond', type: 'diamond', status: 'unread', offer: 50000,
              clientName: 'Sceicco', diamondData: { price: 50000 } },
        ];
        /* Gli eventi VIP a bivio: ~20 azioni che muovono denaro e che questo guardrail
           non ha mai eseguito. Sono le stesse dove il 27/08 e' stato trovato il doppio
           pagamento (doppio clic su accept* = due corse VIP), quindi proprio il gruppo
           che merita sorveglianza. Forma copiata da `_vipPushEmail` (vip-clients.js). */
        for (const [type, id, vipEventData] of [
            ['vip_grigori_event',   901, { cost: 500 }],
            ['vip_garante_event',   902, { fine: 2000 }],
            ['vip_onorevole_event', 903, { fine: 2000 }],
            ['vip_platinum_event',  904, { fine: 2000 }],
            ['vip_wedding_event',   905, { bonus: 3000 }],
        ]) {
            gs.emails.push({ id, sender: 'VIP', subject: 'evento bivio', type,
                             status: 'unread', vipEventData,
                             expiresAt: ((gs.day || 1) * 24 + (gs.hour || 0)) + 4 });
        }

        /* ── Da qui in giu' lo stato lo costruisce il REGISTA (test-support/regista.js).
           Quello che c'e' sopra e' scritto a mano e riguarda il nucleo del gioco;
           quello che segue riguarda i SISTEMI, dove le forme sono troppe e cambiano
           troppo spesso perche' abbia senso ricopiarle qui. Le dieci richieste dei
           clienti VIP, per dire, non sono inventate: le scrive il generatore vero
           del gioco (`_maybeVipGrigori` e fratelli) dopo che il regista ha messo in
           flotta le auto che ognuno pretende. Se un giorno cambia il modello
           richiesto da un cliente, cambia il regista, non questo file. */
        /* Prima di scegliere il mondo, si CANCELLA quello che i sistemi aggiungono.
           Senza questo, il mondo «nudo» resta sporco di quello che il regista ha
           messo durante il tentativo precedente — `gs.loans` non veniva ripulito da
           nessuno, quindi dopo la prima azione col prestito attivo `takeLoan`
           rifiutava per sempre. Un banco che si porta dietro lo stato di prima non
           prova due mondi: ne prova uno e mezzo, e il mezzo cambia a ogni giro. */
        gs.loans = [];
        gs.activeFines = [];
        gs.marketplace = [];
        gs.claimableQuests = [];
        gs.realEstate = [];
        gs.provinces = [];
        gs.vipNemeses = {};
        gs.cryptoWallet = {};
        gs.holding = null;
        gs.companyIPO = null;
        gs.driverAcademy = [{ driverId: 'd1', courseId: 'c_eco', daysLeft: 3,
                              completesDay: (gs.day || 1) + 5 }];
        sandbox.window._p2pMarket   = Object.assign(sandbox.window._p2pMarket   || {}, { myConsorzio: null });
        sandbox.window._allianceState = Object.assign(sandbox.window._allianceState || {}, { myAlliance: null, myRole: null });

        if (!sistemi) return gs;

        if (SCENA_VIP) R.rimettiInScena({ sandbox }, SCENA_VIP);
        R.conConsorzio({ sandbox }, { ruolo: 'leader' });
        R.conAstaAperta({ sandbox });
        R.conContrattoB2B({ sandbox });
        R.conDepositoCarburante({ sandbox });
        R.conAutistaInAccademia({ sandbox });
        R.conPrestito({ sandbox });
        R.conCriptoInPortafoglio({ sandbox });
        R.conImmobile({ sandbox });
        R.conProvincia({ sandbox });
        R.conNemesi({ sandbox });
        R.conHolding({ sandbox });
        R.conMultaDaPagare({ sandbox });
        R.conAutistaInSciopero({ sandbox });
        R.conVeicoloElettricoScarico({ sandbox });
        try { R.conDebitoVittorio({ sandbox }); } catch (e) { /* veterano: nessun debito, e va bene */ }
        R.conSaloneAperto({ sandbox });
        R.conAnnunciInVendita({ sandbox });
        R.conOffertaSuBando({ sandbox });
        R.conMissioneOmbra({ sandbox });
        try { R.conMissioneDaRiscuotere({ sandbox }); } catch (e) { /* catalogo missioni non raggiungibile */ }
        try { R.conObiettivoDelGiornoCompletato({ sandbox }); } catch (e) { /* daily-orders non caricato */ }

        /* I campi del modulo: un'intera famiglia di azioni non legge i propri
           argomenti dalla chiamata, li legge dallo schermo. `_alCreate` prende nome e
           TAG da `#al-name` e `#al-tag`, `_alDonate` l'importo da `#al-donate`. Senza
           questi campi uscivano su «Nome troppo corto» e «Importo non valido»:
           sembravano bloccate da uno stato di gioco, ed era un campo vuoto. */
        R.conModulo({ sandbox }, {
            'al-name': 'Consorzio del Banco', 'al-tag': 'BNC', 'al-desc': 'prova',
            'al-emblem': '🛡️', 'al-open': true, 'al-donate': '5000',
            'al-chat-input': 'ciao',
            'vanity-title': 'Barone', 'vanity-color': '#c8a24a', 'vanity-emblem': '👑',
            'vtk-amount': '10', 'vtk-price': '5',
            'tourism-bid': '10000', 'p2p-price': '50000',
        });
        return gs;
    }

    // `window.confirm` non esiste nel banco: le azioni che chiedono conferma uscivano
    // sulla riga della conferma (CE_terminateContract, i disinvestimenti, le vendite).
    sandbox.window.confirm = () => true;

    /* La scena dei clienti VIP si costruisce UNA volta e poi si rimette in scena a
       ogni tentativo. Rigenerarla ogni volta sarebbe piu' pulito e insostenibile:
       `preparaStato` gira prima di OGNI forma di argomento di OGNI azione, cioe'
       migliaia di volte, e dieci generatori VIP a giro trasformerebbero un test da
       secondi in minuti. Un test lento e' un test che si smette di lanciare. */
    let SCENA_VIP = null;
    preparaStato();
    R.conTuttiIClientiVIP({ sandbox });
    SCENA_VIP = R.istantanea({ sandbox });
    const idEmailVip = SCENA_VIP.emails.map(e => e.id).filter(id => id != null);

    /* Gli id VERI di quello che il regista mette nel mondo. Senza, il banco bussa
       a indirizzi inventati — `payFine('c1')`, `repayLoan(0)` — e archivia come
       «non attivabile» un'azione sana che semplicemente non ha trovato la multa o
       il prestito. E' il pezzo che trasforma il regista da costruttore di stati a
       costruttore di stati USABILI. */
    preparaStato({ sistemi: true });
    const kit = R.identikit({ sandbox });

    preparaStato();
    return { sandbox, scritture, stopAllIntervals, ids, preparaStato, idEmailVip, kit };
}

/* ── 3. Esegue un'azione e guarda se il denaro si e' mosso di nascosto ───── */

/**
 * Le forme di argomento con cui si prova ogni azione.
 *
 * Perche' dipendono dal mondo: le azioni che muovono denaro vogliono quasi sempre
 * un ID VERO preso dal catalogo (`buyStocks('CEMP', 10)`) oppure un IMPORTO
 * plausibile (`buyFuelForDepot(5000)`). Con le sole forme fisse di prima — `['c1']`,
 * `[0]`, `['roma']` — l'azione usciva alla prima riga e finiva fra le «non
 * attivabili»: `buyFuelForDepot(0)` compra zero litri, `buyStocks('c1')` non trova
 * il titolo. Il banco non le bocciava: semplicemente non le provava.
 */
function formeArgomento(mondo) {
    const { ids } = mondo;
    const forme = [
        [],
        ['c1'],                    // un veicolo in flotta
        ['c2'],                    // il veicolo fermo per carburante
        ['d1'],                    // un autista
        ['tn1'],                   // una gara d'appalto aperta
        ['ct1'],                   // un contratto aziendale attivo
        ['k1'],                    // un cantiere in corso
        ['inv_fuel_depot'],        // un investimento posseduto
        [0],                       // molte azioni indicizzano una lista
        ['roma'],                  // una citta'
        ['c1', 0],
        ['d1', 0],
        // ── Importi: senza un numero sensato le azioni "compra N" non comprano nulla.
        [5000],
        [1],
        ['tn1', 5000],             // CE_placeBid(tenderId, pledgedCash)
        ['npc1'],                  // un annuncio del mercato usato
        // ── Le email, per tipo.
        ['em_b2b'], ['em_grey'], ['em_diamond'], ['em_b2b', 5000],
        // ── Gli eventi VIP a bivio: id numerico, uno per tipo.
        [901], [902], [903], [904], [905],
    ];
    /* Le richieste dei dieci clienti VIP, con gli id VERI scritti dal generatore
       del gioco. Senza questi, `acceptVipGrigori(901)` non trovava nessuna email e
       usciva alla prima riga: dieci azioni che muovono denaro non sono mai state
       eseguite, non perche' fossero difficili ma perche' il banco bussava a un
       indirizzo inventato. */
    for (const id of (mondo.idEmailVip || [])) forme.push([id]);

    /* Gli id veri del mondo costruito dal regista. Solo uno per famiglia: bastano
       a superare il `find(...)` iniziale, e moltiplicarli farebbe esplodere il
       numero di tentativi senza provare niente di nuovo. */
    const kit = mondo.kit || {};
    const primo = (elenco) => (elenco && elenco.length ? elenco[elenco.length - 1] : null);
    for (const [famiglia, extra] of [
        ['autisti', [5000]],      // payDriverBonus(autista, importo)
        ['auto', null], ['prestiti', null], ['multe', null],
        ['bandi', [5000]], ['contratti', null], ['province', null], ['immobili', null],
        ['missioni', null], ['obiettivi', null], ['annunci', null],
    ]) {
        const id = primo(kit[famiglia]);
        if (!id) continue;
        forme.push([id]);
        if (extra) forme.push([id, ...extra]);
    }
    // Le tre strategie di prezzo sono un elenco chiuso dentro l'azione: senza una
    // delle tre parole giuste `setPricingStrategy` esce sulla prima riga.
    forme.push(['premium'], ['discount'], ['standard']);
    // ── Id veri dai cataloghi del gioco.
    if (ids.stock)   forme.push([ids.stock.id, 10], [ids.stock.id]);
    if (ids.rischio) forme.push([ids.rischio.id, 10000, 7], [ids.rischio.id, 10000]);
    if (ids.lusso)   forme.push([ids.lusso.id]);
    if (ids.legge)   forme.push([ids.legge.id]);
    if (ids.venture) forme.push([ids.venture.id, 10], [ids.venture.id]);
    if (ids.proto)   forme.push([ids.proto.id]);
    if (ids.poi)     forme.push([ids.poi]);
    if (ids.poiDaComprare) forme.push([ids.poiDaComprare]);
    if (ids.upgrade)  forme.push(['c1', ids.upgrade.id], [ids.upgrade.id]);
    if (ids.campagna) forme.push([ids.campagna.id]);
    if (ids.vtkItem)  forme.push([ids.vtkItem.id]);
    if (ids.investimento) forme.push([ids.investimento]);
    if (ids.regione)  forme.push([ids.regione]);
    // Le vendite locali vogliono il prezzo insieme all'auto.
    forme.push(['c1', 50000]);
    /* Titolo, emblema e colore delle vanity: sono elenchi `const` DENTRO l'IIFE di
       vanity.js, quindi invisibili da fuori (a differenza dei cataloghi `var` di
       data.js). Qui restano tre valori letterali, e se un giorno spariscono dal
       catalogo le tre azioni tornano «non attivabili»: e' il modo in cui il banco
       se ne accorge. */
    forme.push(['Magnate'], ['⚜️'], ['#8aa0b5']);
    return forme;
}

/* Lascia girare le microtask in sospeso.
   Serve perche' molte azioni sono `async`: il denaro si muove DOPO il primo
   `await` (tipicamente dopo la risposta della RPC), quindi un controllo fatto
   subito dopo la chiamata vede il saldo ancora intatto e archivia l'azione come
   «non attivabile». E' cosi' che le azioni asincrone che toccano denaro non sono
   mai state controllate da questo guardrail: non venivano bocciate, venivano
   guardate troppo presto. */
/* Ogni forma di argomento va provata in entrambi i mondi: quello nudo e quello
   con i sistemi accesi dal regista. L'ordine conta poco, il numero si': sono
   forme x 2 tentativi per azione, e per questo le forme restano poche e mirate. */
function tentativi(mondo) {
    const forme = formeArgomento(mondo);
    const lista = [];
    for (const sistemi of [false, true]) for (const args of forme) lista.push({ args, sistemi });
    return lista;
}

function scaricaMicrotask() {
    return new Promise(resolve => setImmediate(resolve));
}

async function provaAzione(mondo, nome) {
    const { sandbox, scritture } = mondo;
    const fn = sandbox.window[nome];
    if (typeof fn !== 'function') return { stato: 'assente' };
    let eseguitaSenzaDenaro = null;

    for (const { args, sistemi } of tentativi(mondo)) {
        // Rifa' il mondo da capo e RILEGGE gameState: se l'azione precedente ha
        // rifondato la partita, `gs` qui e' il nuovo oggetto, non quello morto.
        const gs = mondo.preparaStato({ sistemi });
        if (!gs) return { stato: 'non verificata' };
        /* Il banco era povero, e la poverta' si travestiva da difetto: un hub o un
           asset di lusso costano milioni (fino a 8.000.000 in data.js), quindi
           `buyHub` e `buyLifestyleAsset` uscivano su «fondi insufficienti» e
           finivano fra le «non attivabili». Cinquanta milioni sono il patrimonio
           di un giocatore a fine partita: il banco deve poter comprare tutto il
           catalogo, o non lo prova mai. */
        gs.cash = 50_000_000;
        gs.driverCoins = 100_000;
        gs.vtkBalance = 10_000;
        scritture.length = 0;
        const impronta = improntaDelMondo(gs, scritture);

        try {
            const r = fn.apply(sandbox.window, args);
            if (r && typeof r.then === 'function') {
                r.catch(() => {});
                await scaricaMicrotask();
            }
        } catch (e) { /* argomenti sbagliati: si prova la forma successiva */ }

        // Riletto di nuovo: l'azione stessa puo' aver sostituito l'oggetto.
        const dopo = sandbox.window.gameState || gs;
        const mossoCash = dopo.cash !== 50_000_000;
        const mossoDC   = dopo.driverCoins !== 100_000;
        const mossoVTK  = dopo.vtkBalance !== 10_000;
        if (mossoCash || mossoDC || mossoVTK) {
            return {
                stato: scritture.length > 0 ? 'ok' : 'ROTTA',
                dettaglio: `cash ${dopo.cash - 50_000_000}, DC ${dopo.driverCoins - 100_000}, VTK ${dopo.vtkBalance - 10_000}`,
                scritture: [...scritture],
            };
        }
        /* Il denaro non si e' mosso, ma qualcosa e' successo lo stesso: l'azione
           NON e' «non attivabile», e chiamarla cosi' e' stato per settimane il
           difetto di questo banco. `acceptVipGrigori` mette una corsa in coda e il
           denaro arriva quando la corsa finisce; `joinConsorzio` parla col server e
           basta. Erano nell'elenco delle bloccate insieme a quelle che uscivano
           davvero alla prima riga, e le due cose hanno rimedi opposti: le prime
           vanno provate altrove, le seconde hanno bisogno di uno stato che manca.
           Confonderle vuol dire cercare per settimane uno stato che non serviva. */
        if (!impronta || impronta !== improntaDelMondo(dopo, scritture)) {
            eseguitaSenzaDenaro = { args, sistemi, scritture: [...scritture] };
        }
    }
    if (eseguitaSenzaDenaro) {
        return { stato: 'eseguita senza denaro', scritture: eseguitaSenzaDenaro.scritture };
    }
    return { stato: 'non verificata' };
}

/* Un'impronta leggera del mondo: serve solo a rispondere «e' successo qualcosa?».
   Una copia intera di gameState direbbe la stessa cosa in modo piu' preciso e
   costerebbe migliaia di serializzazioni di un oggetto grosso — il banco gira
   forme x 2 mondi x 254 azioni. Questi cinque numeri cambiano per qualunque
   effetto che conti: una corsa creata, una email risolta, un veicolo o un
   autista in piu' o in meno, una chiamata al server. */
function improntaDelMondo(gs, scritture) {
    /* Tutti i campi semplici in cima a gameState (numeri, stringhe, booleani) piu'
       la lunghezza di ogni elenco, piu' lo stato di autisti e veicoli. Il primo
       tentativo guardava cinque numeri e diceva «non e' successo niente» a
       `setPricingStrategy` (che scrive una stringa) e a `sendDriverToRest` (che
       cambia lo stato di un autista): il banco le archiviava come bloccate mentre
       funzionavano benissimo. Un'impronta troppo grossa e' cieca esattamente come
       nessuna impronta. */
    let f = 'w:' + scritture.length + ';';
    for (const k of Object.keys(gs)) {
        const v = gs[k];
        if (v === null || v === undefined) { f += k + '=_;'; continue; }
        if (Array.isArray(v)) { f += k + '#' + v.length + ';'; continue; }
        if (typeof v !== 'object') f += k + '=' + v + ';';
    }
    f += 'd:' + (gs.drivers || []).map(d => `${d.status}/${d.isOnStrike ? 1 : 0}`).join(',');
    f += 'v:' + (gs.fleet || []).map(c => `${c.status}/${c.condition}/${c.chargeLevel}`).join(',');
    return f;
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

/* Azioni gia' note come rotte, in attesa del loro task di conversione.
   Disciplina: PUO' SOLO ACCORCIARSI.

   ────────────────────────────────────────────────────────────────────────────
   SVUOTATA il 28/08/2026, dopo verifica una per una delle 30 voci che conteneva.
   Non erano rotte: 29 su 30 passavano gia' da `window.CE_money` con la loro
   causale (`buyFuelForDepot` -> 'buy_fuel_for_depot', `bidOnAuction` ->
   'auction_bid', …) e la trentesima, `CE_terminateContract`, non tocca denaro
   affatto («Nessun indennizzo», contracts.js:375). Erano state riparate quando
   e' nato money.js, e la lista non e' mai stata ripulita.

   PERCHE' nessuno se n'era accorto, ed e' la parte che conta: il banco non
   riusciva ad ATTIVARLE (mancavano gli id veri dei cataloghi, gli importi
   numerici, `window.confirm`, e il client Supabase per le 16 azioni che parlano
   al server senza passare da ServerState). Finivano nel secchio «non attivabili»,
   e il controllo qui sotto toglieva una voce solo quando risultava `ok` — mai
   quando risultava NON PROVATA. Una lista di sospetti che nessuno riesce piu' a
   interrogare non e' una lista di sospetti: e' rumore che sembra lavoro.
   Da oggi il limbo e' un fallimento (vedi il test piu' sotto).

   Cosa garantisce che le 22 non riprovate qui siano davvero sane: le DUE reti
   insieme. `test/guardrail/una-sola-porta.test.js` ha ECCEZIONI vuoto, quindi
   NESSUN file fuori da money.js muta cash/driverCoins/vtkBalance — e money.js
   sincronizza sempre. Questa rete dinamica copre l'unico caso che quella statica
   non vede: chi usa `accreditatoDalServer`/`addebitatoDalServer` (le porte «il
   server l'ha gia' fatto») senza poi parlare davvero col server.
   ──────────────────────────────────────────────────────────────────────────── */
const ROTTE_NOTE = new Set([]);

describe('guardrail — ogni azione del giocatore sincronizza col server', () => {
    let esiti;
    let azioni;
    let mondo;

    before(async () => {
        azioni = nomiAzioni();
        mondo = preparaMondo();
        esiti = [];
        // In sequenza, non in parallelo: le azioni condividono un solo `gameState`
        // e il controllo confronta il saldo con la sua baseline: eseguirle insieme
        // le farebbe leggere gli spostamenti l'una dell'altra.
        for (const nome of azioni) {
            esiti.push(Object.assign({ nome }, await provaAzione(mondo, nome)));
        }
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

    /* Il difetto che ha tenuto in vita per mesi una lista di 30 sospetti innocenti:
       un'azione che il banco non riesce piu' ad attivare non risultava ne' promossa
       ne' bocciata, e restava nella lista senza che nessuno la verificasse. Un
       sospetto che non si puo' interrogare va tolto o va reso interrogabile — non
       lasciato nel limbo, dove sembra lavoro arretrato e invece e' rumore. */
    test('nessuna voce di ROTTE_NOTE puo\' restare non provata', () => {
        const perNome = new Map(esiti.map(e => [e.nome, e]));
        const nelLimbo = [];
        for (const nome of ROTTE_NOTE) {
            const e = perNome.get(nome);
            if (e && e.stato === 'non verificata') nelLimbo.push(nome);
        }
        assert.deepEqual(nelLimbo, [],
            'Il banco non riesce piu\' ad attivare queste azioni, quindi non le sta\n' +
            'verificando: restano in ROTTE_NOTE senza che nessuno le controlli.\n' +
            'O si arricchisce preparaMondo()/formeArgomento() finche\' si attivano,\n' +
            'o si tolgono dalla lista — ma non si lasciano a meta\':\n' + nelLimbo.join('\n'));
    });

    test('le azioni che azzerano/resettano il gioco sono gestite in NON_SONO_ACQUISTI', () => {
        for (const nome of NON_SONO_ACQUISTI) {
            assert.ok(typeof nome === 'string' && nome.length > 0);
        }
        assert.ok(NON_SONO_ACQUISTI.has('_confirmNewGame'));
    });

    /* Ogni nome qui sotto ha il suo sottotest: se una di queste azioni perde la
       sincronizzazione col server, il test fallisce dicendo ESATTAMENTE quale.
       Da 14 a 53 il 28/08/2026, quando il banco ha smesso di essere cieco (id veri
       dai cataloghi, importi numerici, `confirm`, client Supabase, microtask delle
       azioni async, e soprattutto lo stato riapplicato prima di ogni prova).
       L'elenco si aggiorna dalla riga «Azioni verificate [ok]» che il test stampa. */
    const verificate = [
        '_ecCaffeSospeso',
        '_ecManutenzioneExpress',
        '_ecPolizzaKasko',
        '_ecRadarVip',
        '_ecTangenteSindacato',
        '_ecTargaPresidenziale',
        '_infraBuyDepot',
        '_opaRequestBuyback',
        'acquireVentureStake',
        'activateExecutivePass',
        'bidOnAuction',
        'buyCempShares',
        'buyFuelForDepot',
        'buyHRAutomation',
        'buyMaintenanceContract',
        'buyNpcCar',
        'buyTiresForDepot',
        'divestVentureStake',
        'emergencyRefuel',
        'energyBoostDC',
        'executeManualDrive',
        'fuelBoostDC',
        'fullBundleDC',
        'healAllDriversDC',
        'hireDriver',
        'incorporateHolding',
        'instantRepairDC',
        'negotiateEmail',
        'newGamePlus',
        'opsBundleDC',
        'passLobbyLaw',
        'payStressClear',
        'payToRepairCar',
        'repairEngine',
        'rest',
        'sellCar',
        'sellCompanyNGP',
        'sellHub',
        'sellInvestment',
        'shadowUpgradeDefense',
        'skipAllAcademyDC',
        'skipAllConstructionsDC',
        'speedUpConstruction',
        'takeLoan',
        'upgradeFuelDepot',
        'vipGaranteEventIntimidisci',
        'vipGaranteEventPaga',
        'vipGrigoriEventAccept',
        'vipOnorevoleEventCopera',
        'vipPlatinumEventBlock',
        'vipWeddingEventGestisci',
        'vipWeddingPaymentCollect',
        'wakeAllDriversDC',
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
        /* Le azioni che il banco ESEGUE davvero ma che, in quel momento, non
           spostano denaro: `acceptVipGrigori` mette una corsa in coda e il denaro
           arriva quando la corsa finisce. Non sono bloccate e non sono un difetto:
           sono azioni il cui effetto sul denaro va cercato altrove. Tenerle
           nell'elenco delle bloccate mandava a cercare uno stato che non mancava. */
        const eseguite = esiti.filter(e => e.stato === 'eseguita senza denaro' && conSoldi.has(e.nome));

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
            `\n   eseguite ma senza muovere denaro: ${eseguite.length}` +
            `\n   non attivabili dal banco: ${nonVerificate.length}` +
            `\n   nome non risolto a una funzione: ${assenti.length}` +
            // I nomi delle verificate, non solo il conteggio: e' da qui che si
            // aggiorna l'elenco `verificate` sopra quando il banco ne sblocca altre.
            `\n\n   --- Azioni verificate [ok] (${conta('ok')}) ---\n   ` +
            esiti.filter(e => e.stato === 'ok').map(e => e.nome).join(' ') +
            `\n\n   --- Azioni NON riuscite a eseguire (${nonVerificate.length + assenti.length}) ---` +
            `\n   Non attivabili che toccano denaro (${nonVerificate.length}):\n` +
            nonAttivabiliConMotivo.join('\n') +
            `\n\n   Eseguite senza muovere denaro (${eseguite.length}) — il loro effetto sul denaro va cercato altrove:\n     ` +
            eseguite.map(e => e.nome).join(' ') +
            `\n\n   Funzioni assenti/non caricate (${assenti.length}):\n` +
            assentiConMotivo.join('\n') + '\n'
        );

        assert.ok(nonVerificate.length + assenti.length > 0, 'elenco non vuoto');
    });
});
