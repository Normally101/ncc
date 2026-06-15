'use strict';
/* ================================================================
   config.js — Chauffeur Empire · Global Constants
   ================================================================ */

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
