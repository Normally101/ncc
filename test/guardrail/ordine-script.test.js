'use strict';
/* ============================================================================
   Guardrail — Ordine di caricamento dei tag <script> in index.html.

   Perché questo test esiste:
   Il gioco non usa moduli ES né un bundler; tutti i file vengono caricati in
   sequenza nel browser e condividono l'oggetto globale `window` (o lo scope
   dello script). L'ordine con cui i tag <script> compaiono in index.html è
   un vincolo architetturale critico:
     - chi legge configurazioni o interruttori al caricamento (top-level o IIFE)
       fallisce se la configurazione non è ancora caricata;
     - chi decora o avvolge funzioni globali (`window.switchTab = ...`) cattura
       `undefined` se la funzione originale non è ancora stata definita;
     - chi definisce funzioni helper in scope globale condiviso deve precedere
       chi le invoca;
     - i layer infrastrutturali (eventi, stato autoritativo server, porta della
       moneta) devono precedere i moduli di logica e UI che dipendono da essi.

   Oggi questo vincolo è sorvegliato qui con prove esplicite tratte dal codice.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Restituisce l'elenco dei file JavaScript locali caricati da index.html
 * nell'ordine esatto in cui compaiono nel markup.
 */
function scriptInOrdine() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+\.js)(?:\?[^"]*)?"/gi)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(f => !f.startsWith('http') && fs.existsSync(path.join(ROOT, f)));
    return [...new Set(scripts)];
}

/* ── Tabella dei vincoli d'ordine dimostrati dal codice ────────────────────── */

const VINCOLI_ORDINE = [
    {
        prima: 'events.js',
        dopo: 'ce-actions.js',
        motivo: 'events.js definisce il layer di event delegation su document e i costruttori window.ceAct / ceRemove / ceClick usati dalle azioni e dal markup',
        prova: 'events.js:46 document.addEventListener; events.js:63 window.ceAct; ce-actions.js:1 definisce le azioni delegate',
    },
    {
        prima: 'config.js',
        dopo: 'feature-gate.js',
        motivo: 'feature-gate.js esegue una IIFE al caricamento che legge window.TAB_DI e chiama window.tabSpenta() definiti in config.js',
        prova: 'feature-gate.js:23 schedeSpente() legge window.TAB_DI e chiama window.tabSpenta(tab); config.js:47 window.TAB_DI; config.js:70 window.tabSpenta',
    },
    {
        prima: 'serverState.js',
        dopo: 'money.js',
        motivo: 'money.js sincronizza cash e driverCoins chiamando window.ServerState.syncCash / spendDriverCoins / addDriverCoins',
        prova: 'money.js:28 ServerState.syncCash; money.js:93 ServerState.spendDriverCoins; money.js:115 ServerState.addDriverCoins; serverState.js:338 window.ServerState',
    },
    {
        prima: 'money.js',
        dopo: 'engine.js',
        motivo: 'engine.js usa window.CE_money per la gestione sicura e sincronizzata del saldo (es. _addCash e transazioni)',
        prova: 'engine.js:865 window._addCash invoca window.CE_money.earn; money.js:129 window.CE_money = CE_money',
    },
    {
        prima: 'quests-data.js',
        dopo: 'quests.js',
        motivo: 'quests.js usa le costanti VG, QUEST_DB e la funzione helper _questUnlocked definite in scope globale da quests-data.js',
        prova: 'quests.js:24 _questUnlocked(q, gs); quests.js:13 QUEST_DB; quests-data.js:9 const VG; quests-data.js:43 function _questUnlocked; quests-data.js:49 const QUEST_DB',
    },
    {
        prima: 'vip-buffs.js',
        dopo: 'vip-clients.js',
        motivo: 'vip-clients.js invoca funzioni helper globali (_vipCooldownOk, _vipPushEmail, _vipFleetCar, _vipCreateRide, ecc.) definite in vip-buffs.js',
        prova: 'vip-buffs.js:44 function _vipCooldownOk; vip-buffs.js:72 function _vipPushEmail; vip-clients.js invoca _vipCooldownOk / _vipPushEmail',
    },
    {
        prima: 'hq-data.js',
        dopo: 'hq.js',
        motivo: 'hq.js legge le definizioni di window.HQ_CITIES e window.HQ_ROOMS inizializzate da hq-data.js',
        prova: 'hq-data.js:3 window.HQ_CITIES; hq-data.js:52 window.HQ_ROOMS; hq.js:51 itera window.HQ_CITIES; hq.js:83 cerca in window.HQ_ROOMS',
    },
    {
        prima: 'hq.js',
        dopo: 'hq-visual.js',
        motivo: 'hq-visual.js invoca le funzioni di stato hqGetCityRooms e hqGetRoomLevel definite in hq.js',
        prova: 'hq.js:63 window.hqGetCityRooms; hq.js:73 window.hqGetRoomLevel; hq-visual.js renderHQCampus invoca hqGetCityRooms e hqGetRoomLevel',
    },
    {
        prima: 'onboarding-core.js',
        dopo: 'zero-to-hero.js',
        motivo: 'zero-to-hero.js legge window.ceOnb per verificare la fase corrente, i veterani e il numero di corse completate',
        prova: 'onboarding-core.js:10 window.ceOnb; zero-to-hero.js:14 window.ceOnb.rides(); zero-to-hero.js:15 window.ceOnb.veteran()',
    },
    {
        prima: 'onboarding-core.js',
        dopo: 'onboarding.js',
        motivo: 'onboarding.js usa window.ceOnb come sorgente di verità per guidare il tutorial iniziale',
        prova: 'onboarding-core.js:10 window.ceOnb; onboarding.js usa window.ceOnb',
    },
    {
        prima: 'dispatcher.js',
        dopo: 'ui-sidebar.js',
        motivo: 'ui-sidebar.js cattura window.switchTab al momento del caricamento (top-level) per decorarla con la gestione della sidebar',
        prova: 'ui-sidebar.js:62 const _orig = window.switchTab; dispatcher.js:54 definisce window.switchTab',
    },
    {
        prima: 'ui-sidebar.js',
        dopo: 'zero-to-hero.js',
        motivo: 'zero-to-hero.js cattura window.switchTab al momento del caricamento per applicare la patch di survival a valle di ui-sidebar.js',
        prova: 'zero-to-hero.js:180 const _origSwitch = window.switchTab; commento riga 11: Caricato DOPO dispatcher.js + ui-sidebar.js',
    },
    {
        prima: 'ui-sidebar.js',
        dopo: 'em-chrome.js',
        motivo: 'em-chrome.js cattura window.switchTab al momento del caricamento per evidenziare la categoria nella navigazione #em-nav',
        prova: 'em-chrome.js:30 const _orig = window.switchTab; commento riga 5: Caricato DOPO ui-sidebar.js',
    },
    {
        prima: 'dispatcher.js',
        dopo: 'motion.js',
        motivo: 'motion.js cattura window.switchTab al caricamento per agganciare le animazioni di transizione dei tab (se switchTab manca, esce senza agganciarsi)',
        prova: 'motion.js:162 const orig = window.switchTab; if (!orig) return;',
    },
    {
        prima: 'p2p-market.js',
        dopo: 'p2p-render.js',
        motivo: 'p2p-render.js accede a window._p2pMarket e window._sindacatoState e invoca le azioni P2P definite in p2p-market.js',
        prova: 'p2p-market.js:20 window._p2pMarket; p2p-market.js:31 window._sindacatoState; p2p-render.js:13 legge window._p2pMarket; p2p-render.js:181 legge window._sindacatoState',
    },
    {
        prima: 'dispatcher.js',
        dopo: 'boot.js',
        motivo: 'boot.js al DOMContentLoaded invoca window.switchTab("corse") per aprire la schermata iniziale di gioco',
        prova: 'boot.js:23 window.switchTab("corse"); dispatcher.js:54 window.switchTab',
    },
];

describe('guardrail — ordine dei tag <script> in index.html', () => {
    let scripts, mappaPosizioni;

    before(() => {
        scripts = scriptInOrdine();
        mappaPosizioni = new Map(scripts.map((nome, idx) => [nome, idx]));
    });

    test('index.html carica i file sorvegliati', () => {
        assert.ok(scripts.length >= 70, `attesi oltre 70 script, trovati ${scripts.length}`);

        const mancanti = [];
        for (const { prima, dopo } of VINCOLI_ORDINE) {
            if (!mappaPosizioni.has(prima)) mancanti.push(prima);
            if (!mappaPosizioni.has(dopo)) mancanti.push(dopo);
        }
        assert.deepEqual([...new Set(mancanti)], [],
            'Questi file sorvegliati non compaiono in index.html:\n' + mancanti.join('\n'));
    });

    for (const vincolo of VINCOLI_ORDINE) {
        test(`${vincolo.prima} viene caricato prima di ${vincolo.dopo}`, () => {
            const posPrima = mappaPosizioni.get(vincolo.prima);
            const posDopo  = mappaPosizioni.get(vincolo.dopo);

            assert.ok(
                posPrima !== undefined && posDopo !== undefined,
                `Entrambi i file devono esistere in index.html: ${vincolo.prima} (${posPrima}), ${vincolo.dopo} (${posDopo})`
            );

            assert.ok(
                posPrima < posDopo,
                `Violazione vincolo d'ordine in index.html!\n` +
                `"${vincolo.prima}" (posizione ${posPrima + 1}) deve precedere "${vincolo.dopo}" (posizione ${posDopo + 1}).\n` +
                `Motivo: ${vincolo.motivo}\n` +
                `Prova: ${vincolo.prova}`
            );
        });
    }

    test('ogni vincolo registrato ha prova e motivo non vuoti', () => {
        for (const v of VINCOLI_ORDINE) {
            assert.ok(v.prima && v.dopo, 'prima e dopo devono essere definiti');
            assert.ok(v.motivo && v.motivo.length >= 10, `motivo insufficiente per ${v.prima} -> ${v.dopo}`);
            assert.ok(v.prova && v.prova.length >= 10, `prova insufficiente per ${v.prima} -> ${v.dopo}`);
        }
    });
});
