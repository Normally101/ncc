'use strict';
/* ================================================================
   config.js — Chauffeur Empire · Global Constants
   ================================================================ */

/* ── Interruttori di funzionalità ────────────────────────────────────────────
   HQ_ENABLED: l'HQ Base Builder è staccato dal gioco in attesa di essere
   sistemato (decisione di Vlad, 19/08/2026). Non è server-authoritative —
   `hqUpgradeRoom` scalava il denaro solo nel browser, quindi la spesa tornava
   indietro al ricaricamento e la stanza restava costruita. Finché resta false:
   tab nascosta, effetti neutri, nessuna spesa possibile.
   Per riaccenderlo basta rimettere true, ma prima va convertito a CE_money. */
window.HQ_ENABLED = false;

/* ── Cosa è acceso ──────────────────────────────────────────────────────────
   Dal 20/08/2026 la regola era l'inverso: una parte del gioco si mostra solo
   se qualcuno l'aveva verificata, e le voci false nascondevano le schede.

   DECISIONE DI VLAD DEL 22/08/2026 (HANDOFF.md): tutto il gioco resta
   disponibile dall'inizio, nessuna area sbloccabile. Le ultime due voci spente
   (mercatoP2P, politica) sono state accese quel giorno; da allora ogni voce di
   FEATURES vale true e tabSpenta() non spegne nulla — il guardrail
   test/guardrail/tutto-visibile-e-dati-veri.test.js fa fallire chi rimette un
   false qui o rispegne una scheda.

   Una voce nuova entra in questo elenco direttamente a true: prima di mostrare
   una funzione vanno eseguite le sue azioni nel banco di prova, e il denaro che
   muove passa da CE_money o da una RPC. */
window.FEATURES = {
    // Il nucleo: quello che i test coprono davvero oggi.
    corse:        true,   // engine-rides, dispatcher — il cuore del gioco
    flotta:       true,   // engine-fleet: acquisto, riparazione, carburante
    autisti:      true,   // engine-drivers: assunzione, accademia, stipendi
    finanza:      true,   // engine-finance: prestiti, borsa (in conversione)
    contratti:    true,   // contracts, b2b: le entrate ricorrenti

    aste:         true,   // auctions.js — verificata 20/08/2026 (ciclo di vita + riscossione)
    alleanze:     true,  // alliances.js — verificata 21/08/2026 (consorzi, perk, chat realtime, 41 prove)
    salone:       true,   // showroom.js — verificata 21/08/2026 (galleria, filtri, configuratore, optional, acquisto CE_money/ServerState)
    mercatoP2P:   true,  // p2p-market, p2p-render: accesa il 22/08 per decisione di Vlad
    cripto:       true,  // crypto.js — verificata 21/08/2026 (mercato AMM, conti offshore, 28 prove)
    vtk:          true,  // vtk-market.js — verificata 21/08/2026 (mercato ordini, negozio VTK, 27 prove)
    turismo:      true,  // tourism.js — verificata 21/08/2026 (bandi, punteggi offerta, ciclo di vita, 40 prove)
    lusso:        true,   // ui-lifestyle.js — verificata 21/08/2026 (acquisti lifestyle, rendite, status CEO, diamond contracts)
    politica:     true,  // ui-politics, war_room: accesa il 22/08 per decisione di Vlad
    infrastrutture: true, // infrastructure.js — verificata 21/08/2026 (depositi, pedaggio, 22 prove)
    holding:      true,  // hostile_takeover, engine-holding — verificate 21/08/2026 (OPA, azioni CEMP, 32 prove)
    nemesi:       true,  // nemesis.js, black_ops.js — verificate 21/08/2026 (nemici VIP, agenzia ombra, 38 prove)
    vanita:       true,   // vanity.js — verificata 20/08/2026 (4 azioni, tutte eseguite nel banco)
    negozioDC:    true,  // ui-store, engine-store — verificate 21/08/2026: tutte e 12 le spese passano dal server (43 prove)
    vip:          true,  // vip-clients, vip-buffs — verificate 21/08/2026 (10 clienti, buff, eventi, 41 prove)
    carriera:     true,   // ui-career, quests, quests-data — verificata 21/08/2026 (progressione, bivi morali, modali, ricompense via CE_money)
};

/* La mappa del gioco e' una sola: map-svg.js, 2D e locale. L'interruttore
   MAPPA_2D e' servito per le due release in cui Mapbox e questa hanno
   convissuto; ora non ha piu' due termini fra cui scegliere ed e' stato
   tolto. La giuntura window.MapBackend (map-api.js) invece resta: e' quella
   che ha permesso di sostituire una mappa senza toccare il motore. */

/** Una funzione è attiva? Sconosciuta = spenta: nel dubbio non si mostra. */
window.attiva = function attiva(nome) {
    return window.FEATURES?.[nome] === true;
};

/* A quale funzione appartiene ogni scheda del gioco. Una scheda che non compare
   qui non è governata dagli interruttori: resta sempre visibile (è il nucleo).
   Due schede possono dipendere dalla stessa funzione — politica governa sia la
   scheda "politics" sia la mappa delle province, e devono sparire insieme. */
window.TAB_DI = {
    auctions:       'aste',
    consorzi:       'alleanze',
    showroom:       'salone',
    market:         'mercatoP2P',
    crypto:         'cripto',
    tourism:        'turismo',
    lifestyle:      'lusso',
    realestate:     'lusso',
    prestigio:      'vanita',
    politics:       'politica',
    provinces:      'politica',
    infrastructure: 'infrastrutture',
    opa:            'holding',
    nemesis:        'nemesi',
    shadow:         'nemesi',
    store:          'negozioDC',
    career:         'carriera',
};

/** Questa scheda è nascosta perché la sua funzione è spenta? */
window.tabSpenta = function tabSpenta(tab) {
    const funzione = window.TAB_DI?.[tab];
    return !!funzione && !window.attiva(funzione);
};

window.GAME_CONFIG = {
    SUPPORT_EMAIL: 'support@chauffeurempire.com',
    SUPPORT_SUBJECT_ACCESS: 'Problema%20di%20Accesso',
    SUPPORT_SUBJECT_BUG:    'Segnalazione%20Bug%20-%20ID%20Compagnia%3A%20',
    GAME_NAME: 'Chauffeur Empire',
    GAME_URL:  'https://www.chauffeurempire.com',
    // Web Push VAPID — chiave PUBBLICA (pubblica per design, può stare nel repo).
    // La privata vive SOLO come segreto della Edge Function `send-push` su Supabase.
    VAPID_PUBLIC_KEY: 'BE9VSQn6J3eKQxtTKFzoBKzGp9Bkmy8aBHkRQdQkYGmSUgdjyv62SIKsnhjs0-ZN7feMw9ed98miJdIF38QZs5c',
};
