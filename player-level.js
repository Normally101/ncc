'use strict';

/* ── Livello giocatore ────────────────────────────────────────────────
   Numero che sale spesso nei primi passi (richiesta vocale Vlad 22/08),
   distinto dai gradi da prestigio (ui-home._homeLevel: Autista → … →
   Leggenda) che restano al loro posto e cambiano di rado. Qui SOLO XP e
   livello: nessuno sblocco collegato — cosa sbloccare e quando resta una
   decisione di design.
   L'XP ricava da azioni che il gioco già registra: corse completate
   (engine-rides.completeRide), auto comprate (showroom._srmPurchase),
   autisti assunti (engine-drivers.hireDriver), appalti B2B chiusi.
   PLAYER_LEVELS_XP sono soglie CUMULATIVE per raggiungere il livello
   indice+1: i primi gradini passano in pochi minuti (una corsa standard
   vale 8 XP), poi ogni soglia cresce di circa ×1.4–1.5 e la curva rallenta
   senza azzerare mai l'avanzamento. */

window.PLAYER_LEVELS_XP = [
    0,      // Lv 1  — partenza
    30,     // Lv 2  — ≈ 4 corse: i primissimi minuti
    80,     // Lv 3  — ≈ prime azioni di crescita (auto o autista)
    160,    // Lv 4  — ≈ mezz'ora di gioco
    280,    // Lv 5
    450,    // Lv 6
    700,    // Lv 7
    1050,   // Lv 8
    1500,   // Lv 9
    2100,   // Lv 10
    3000,   // Lv 11
    4200,   // Lv 12
    5800,   // Lv 13
    7800,   // Lv 14
    10300,  // Lv 15
];

window.playerLevelFromXp = function (xp) {
    const soglie = window.PLAYER_LEVELS_XP;
    let lvl = 1;
    for (let i = 1; i < soglie.length; i++) {
        if ((xp || 0) >= soglie[i]) lvl = i + 1;
    }
    return lvl;
};

/* XP per una corsa completata: il tier paga di più, come le tariffe. */
window._playerXpForRide = function (tier) {
    return ({ ultra: 16, vip: 12, business: 10, standard: 8 })[tier] || 8;
};

/* Unico punto di accredito XP. Somma solo quantità positive: il livello e
   l'XP NON scendono mai, nemmeno se una soglia cambiasse in un aggiornamento
   futuro (il Math.max sul livello protegge i salvataggi esistenti). */
window._addPlayerXp = function (amount) {
    const gs = window.gameState;
    if (!gs || !amount || amount <= 0) return null;
    const prev = gs.playerLevel || 1;
    gs.playerXp = (gs.playerXp || 0) + Math.floor(amount);
    gs.playerLevel = Math.max(prev, window.playerLevelFromXp(gs.playerXp));
    if (gs.playerLevel > prev && typeof showNotification === 'function') {
        showNotification(`⬆️ Livello ${gs.playerLevel} raggiunto!`, 'success');
    }
    return { level: gs.playerLevel, leveledUp: gs.playerLevel > prev };
};
