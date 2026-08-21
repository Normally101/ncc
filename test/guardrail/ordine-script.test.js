'use strict';
/* ============================================================================
   guardrail — ordine dei tag <script> in index.html

   Perche' questo test esiste:
   Il gioco non usa moduli ES: i ~94 script comunicano attraverso l'oggetto
   globale `window` e vengono caricati ed eseguiti in sequenza da index.html.
   L'ordine dei tag <script> e' un vincolo architetturale critico:
     - script che definiscono configurazioni globali (config.js) devono precedere
       chi le legge subito (feature-gate.js);
     - librerie esterne da CDN (supabase-js) devono precedere i file di config
       che invocano i loro costruttori a top-level (supabase-config.js);
     - middleware di valuta e sincronizzazione (serverState.js, money.js) devono
       precedere i moduli di gioco e UI che li utilizzano;
     - catene di decoratori (switchTab, updateUI) richiedono che il modulo base
       (dispatcher.js, engine.js) sia caricato prima dei wrapper successivi
       (ui-sidebar.js, em-chrome.js, zero-to-hero.js);
     - data-store e modelli (quests-data.js, hq-data.js, onboarding-core.js) devono
       precedere i motori che li consumano (quests.js, hq.js, vittorio.js,
       objective-tracker.js);
     - lo script di avvio finale (boot.js) deve essere l'ultimo script eseguito.

   Ogni asserzione qui sotto include la prova puntuale del perche' il vincolo
   esiste al momento del caricamento/valutazione del codice.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Estrae l'elenco ordinato di tutti gli attributi `src` dei tag <script> in index.html,
 * normalizzando i percorsi (senza query string versioning).
 */
function estraiScriptInOrdine() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const matches = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
    return matches.map(m => m[1].replace(/\?.*$/, '').replace(/^\.\//, ''));
}

describe('guardrail — ordine degli script in index.html', () => {
    let scripts;

    before(() => {
        scripts = estraiScriptInOrdine();
    });

    function trovaIndice(identificatore) {
        return scripts.findIndex(s => {
            if (s === identificatore || s.endsWith('/' + identificatore)) return true;
            if (s.startsWith('http') && s.includes(identificatore)) return true;
            return false;
        });
    }

    function affermaPrima(scriptA, scriptB, motivo) {
        const idxA = trovaIndice(scriptA);
        const idxB = trovaIndice(scriptB);

        assert.ok(idxA !== -1, `Script non trovato in index.html: ${scriptA}`);
        assert.ok(idxB !== -1, `Script non trovato in index.html: ${scriptB}`);
        assert.ok(
            idxA < idxB,
            `Vincolo violato: "${scriptA}" (pos ${idxA}) deve venire PRIMA di "${scriptB}" (pos ${idxB}).\nMotivo: ${motivo}`
        );
    }

    test('index.html carica gli script attesi (> 80 script)', () => {
        assert.ok(scripts.length > 80, `Attesi oltre 80 script in index.html, trovati ${scripts.length}`);
    });

    test('supabase-js (CDN) precede supabase-config.js (inizializzazione client al caricamento)', () => {
        affermaPrima(
            'supabase-js',
            'supabase-config.js',
            'supabase-config.js esegue a top-level window.supabase.createClient(...); se supabase-js non e\' caricato prima, window.supabase e\' undefined.'
        );
    });

    test('events.js precede ce-actions.js (event delegation per azioni nominative)', () => {
        affermaPrima(
            'events.js',
            'ce-actions.js',
            'events.js definisce window.ceAct e i listener delegati su document; ce-actions.js definisce le funzioni azione usate dal layer di delegazione.'
        );
    });

    test('config.js precede feature-gate.js (interruttori e mappa TAB_DI)', () => {
        affermaPrima(
            'config.js',
            'feature-gate.js',
            'feature-gate.js esegue subito nella sua IIFE applicaInterruttori(), che chiama window.tabSpenta() iterando su window.TAB_DI, entrambi definiti in config.js.'
        );
    });

    test('config.js precede dispatcher.js (interruttori schede su switchTab)', () => {
        affermaPrima(
            'config.js',
            'dispatcher.js',
            'dispatcher.js implementa window.switchTab che consulta window.tabSpenta() per bloccare schede disattivate da config.js.'
        );
    });

    test('serverState.js precede money.js (sincronizzazione cassa e Driver Coins)', () => {
        affermaPrima(
            'serverState.js',
            'money.js',
            'money.js definisce CE_money che invoca window.ServerState.syncCash e ServerState.spendDriverCoins.'
        );
    });

    test('money.js precede engine.js (transazioni cassa e reputazione)', () => {
        affermaPrima(
            'money.js',
            'engine.js',
            'engine.js e i sottomoduli engine-* utilizzano window.CE_money per tutte le transazioni monetarie.'
        );
    });

    test('quests-data.js precede quests.js (definizioni quest e predicati VG)', () => {
        affermaPrima(
            'quests-data.js',
            'quests.js',
            'quests-data.js esporta VG, QUEST_DB e _questUnlocked; quests.js usa _questUnlocked e QUEST_DB nel motore di progressione.'
        );
    });

    test('hq-data.js precede hq.js e hq-visual.js (costanti stanze e citta)', () => {
        affermaPrima(
            'hq-data.js',
            'hq.js',
            'hq-data.js definisce window.HQ_CITIES e window.HQ_ROOMS necessari per l\'inizializzazione e il calcolo effetti in hq.js.'
        );
        affermaPrima(
            'hq.js',
            'hq-visual.js',
            'hq.js definisce la logica e stato HQ consumati dal renderer visuale hq-visual.js.'
        );
    });

    test('dispatcher.js precede ui-sidebar.js (decoratore window.switchTab)', () => {
        affermaPrima(
            'dispatcher.js',
            'ui-sidebar.js',
            'ui-sidebar.js wrappa window.switchTab al caricamento (const _orig = window.switchTab; if (!_orig) return;); se dispatcher.js non e\' prima, l\'aggancio fallisce.'
        );
    });

    test('dispatcher.js precede zero-to-hero.js (decoratore window.switchTab)', () => {
        affermaPrima(
            'dispatcher.js',
            'zero-to-hero.js',
            'zero-to-hero.js wrappa window.switchTab per forzare il redirect a corse in fase survival.'
        );
    });

    test('ui-sidebar.js precede em-chrome.js (catena decoratori switchTab)', () => {
        affermaPrima(
            'ui-sidebar.js',
            'em-chrome.js',
            'em-chrome.js wrappa window.switchTab a valle di ui-sidebar.js per aggiornare l\'evidenziazione delle categorie nella nuova top navbar.'
        );
    });

    test('engine.js precede ui-sidebar.js (decoratore window.updateUI)', () => {
        affermaPrima(
            'engine.js',
            'ui-sidebar.js',
            'engine.js definisce la funzione updateUI(); ui-sidebar.js la wrappa per aggiornare i dati avatar e stats della sidebar.'
        );
    });

    test('onboarding-core.js precede onboarding.js, zero-to-hero.js, objective-tracker.js, vittorio.js (sorgente ceOnb)', () => {
        affermaPrima(
            'onboarding-core.js',
            'onboarding.js',
            'onboarding-core.js definisce window.ceOnb usato da onboarding.js per verificare i gate di sblocco.'
        );
        affermaPrima(
            'onboarding-core.js',
            'zero-to-hero.js',
            'zero-to-hero.js interroga window.ceOnb.rides() e window.ceOnb.phase().'
        );
        affermaPrima(
            'onboarding-core.js',
            'objective-tracker.js',
            'objective-tracker.js accede a window.ceOnb.GATES per determinare i prossimi obiettivi.'
        );
        affermaPrima(
            'onboarding-core.js',
            'vittorio.js',
            'vittorio.js controlla window.ceOnb.veteran() per disattivare il debito iniziale ai veterani.'
        );
    });

    test('boot.js e\' l\'ultimo script caricato in index.html', () => {
        const lastScript = scripts[scripts.length - 1];
        assert.ok(
            lastScript === 'boot.js' || lastScript.endsWith('/boot.js'),
            `boot.js deve essere l'ultimo script in index.html (trovato: ${lastScript}).\n` +
            'Motivo: boot.js imposta il listener di bootstrap DOMContentLoaded (switchTab(\'corse\')) che deve partire solo dopo l\'esecuzione di tutti gli altri script.'
        );
    });
});
