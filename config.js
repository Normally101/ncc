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

/* ── Cosa è acceso, e perché è spento tutto il resto ─────────────────────────
   Regola invertita, dal 20/08/2026: una parte del gioco è accesa solo se
   qualcuno l'ha verificata. Prima era il contrario — tutto acceso, e nessuno
   sapeva cosa funzionasse davvero.

   Il motivo del cambio: il gioco non è ancora uscito, quindi possiamo
   permetterci di mostrarne meno. E "meno funzioni, tutte funzionanti" è un
   gioco migliore di "tutte le funzioni, metà rotte" — soprattutto al lancio,
   dove un giocatore che perde soldi per un bug non torna.

   Una voce passa a true quando: le sue azioni sono state eseguite tutte nel
   banco di prova, quelle che muovono denaro passano da CE_money, e un test le
   sorveglia da lì in avanti. Da quel momento non si torna indietro.

   ATTENZIONE: spegnere una funzione non significa cancellarne il codice. Il
   codice resta, intatto e caricato: si nascondono i punti d'ingresso (schede,
   pulsanti) e si neutralizzano gli effetti sul resto del gioco. Così
   riaccenderla costa una riga, e nel frattempo nessuno può romperci niente. */
window.FEATURES = {
    // Il nucleo: quello che i test coprono davvero oggi.
    corse:        true,   // engine-rides, dispatcher — il cuore del gioco
    flotta:       true,   // engine-fleet: acquisto, riparazione, carburante
    autisti:      true,   // engine-drivers: assunzione, accademia, stipendi
    finanza:      true,   // engine-finance: prestiti, borsa (in conversione)
    contratti:    true,   // contracts, b2b: le entrate ricorrenti

    // Spente finché non le verifichiamo una per una.
    aste:         true,   // auctions.js — verificata 20/08/2026 (ciclo di vita + riscossione)
    alleanze:     false,  // alliances.js
    salone:       true,   // showroom.js — verificata 21/08/2026 (galleria, filtri, configuratore, optional, acquisto CE_money/ServerState)
    mercatoP2P:   false,  // p2p-market, p2p-render: scambi fra giocatori
    cripto:       false,  // crypto.js
    vtk:          false,  // vtk-market.js
    turismo:      false,  // tourism.js
    lusso:        true,   // ui-lifestyle.js — verificata 21/08/2026 (acquisti lifestyle, rendite, status CEO, diamond contracts)
    politica:     false,  // ui-politics, war_room: province e influenza
    infrastrutture: false, // infrastructure.js
    holding:      false,  // hostile_takeover, engine-holding
    nemesi:       false,  // nemesis.js, black_ops.js
    vanita:       true,   // vanity.js — verificata 20/08/2026 (4 azioni, tutte eseguite nel banco)
    negozioDC:    false,  // ui-store, engine-store: valuta premium
    vip:          false,  // vip-clients, vip-buffs
    carriera:     false,  // ui-career
};

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
