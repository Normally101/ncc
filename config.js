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
