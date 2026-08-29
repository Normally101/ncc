'use strict';
/* ============================================================================
   OGNI VEICOLO DEVE FUNZIONARE. Vlad, 29/08/2026: «per quanto riguarda i
   veicoli, erano già creati, quindi non c'è bisogno di creare nessun altro
   veicolo. Devi accertarti che funzionino tutti».

   «Funzionare», per un veicolo, vuol dire cinque cose insieme:
     1. si può comprare  — sta nel catalogo che il negozio mostra davvero
     2. si vede          — l'immagine esiste sul disco
     3. si capisce       — ha una scheda tecnica nello showroom
     4. sa lavorare      — ha una famiglia, e può servire almeno una tratta
     5. non mente        — la fascia con cui entra in flotta è quella del listino

   Il punto 5 è quello che il 29/08 era rotto per 10 auto su 19, e nessun test
   lo vedeva: il negozio traduceva le proprie etichette commerciali
   (PRESIDENTIAL, COMMERCIAL, ARMORED…) in fasce con una mappa sua, che non
   coincideva col listino. Si comprava una S-Imperial venduta come PRESIDENTIAL
   e si riceveva un'auto marcata 'ultra' mentre il listino la dà 'vip'. Da
   quando il caricamento riallinea le auto al listino, quell'auto CAMBIAVA
   FASCIA ricaricando la pagina.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

function mondo() {
    const env = createGameEnv(CORE_FILES, { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    const s = env.sandbox;
    const g = (n) => vm.runInContext(`typeof ${n}!=="undefined"?${n}:null`, s);
    return { env, s, g };
}

describe('guardrail — ogni veicolo del gioco funziona', () => {

    test('ogni veicolo in vendita ha immagine, scheda e famiglia', () => {
        const { env, s, g } = mondo();
        try {
            const vetrina = g('STELLAR_VOLT_CATALOG');
            const specs   = g('_SRM_META');
            const guasti  = [];

            for (const v of vetrina) {
                const vc = v.vehicleClass || v.id;
                if (!v.img || !fs.existsSync(path.join(ROOT, v.img)))
                    guasti.push(`${v.name}: immagine mancante (${v.img})`);
                if (!specs[v.id] && !specs[vc])
                    guasti.push(`${v.name}: nessuna scheda tecnica nello showroom`);
                if (!s.window._famigliaDi(vc))
                    guasti.push(`${v.name}: nessuna famiglia — non potrà servire tratte da contratto`);
            }
            assert.deepEqual(guasti, [], 'veicoli in vendita con qualcosa che non va');
        } finally { env.stopAllIntervals(); }
    });

    test('ogni veicolo in vendita può servire almeno una tratta del database', () => {
        const { env, s, g } = mondo();
        try {
            const vetrina  = g('STELLAR_VOLT_CATALOG');
            const listino  = g('NEW_CARS');
            const db       = g('italianRoutesDB');
            const mappa    = g('_VEHICLE_CLASS_MAP');
            const TC       = g('TIER_COMPATIBILITY');
            const inutili  = [];

            for (const v of vetrina) {
                const vc  = v.vehicleClass || v.id;
                const def = listino.find(c => c.vehicleClass === vc);
                if (!def) continue;
                const quante = db.filter(r => {
                    const rvc = mappa[r.vehicle] || 'stellar_e_exec';
                    const fascia = s.window._fasciaCorsa(r.sellingPrice, rvc);
                    return s.window._classeCompatibile(vc, rvc) && (TC[fascia] || []).includes(def.tier);
                }).length;
                if (quante === 0) inutili.push(`${v.name}: non può servire nessuna delle ${db.length} tratte`);
            }
            assert.deepEqual(inutili, [],
                'un\'auto che non serve nessuna tratta è denaro speso per niente');
        } finally { env.stopAllIntervals(); }
    });

    test('la fascia con cui un\'auto entra in flotta è quella del listino', () => {
        const { env, s, g } = mondo();
        try {
            const vetrina = g('STELLAR_VOLT_CATALOG');
            const listino = g('NEW_CARS');
            const gs = s.gameState;
            const bugie = [];

            for (const v of vetrina) {
                const vc  = v.vehicleClass || v.id;
                const def = listino.find(c => c.vehicleClass === vc);
                if (!def) continue;
                gs.cash = 50000000;
                gs.questStats = { ...(gs.questStats || {}), totalRides: 99999 };
                gs.hasEVHub = true;
                const prima = gs.fleet.length;
                s.window._srmOpenConfig(v.id);
                s.window._srmPurchase();
                if (gs.fleet.length === prima) continue;   // acquisto non riuscito: altro test
                const comprata = gs.fleet[gs.fleet.length - 1];
                if (comprata.tier !== def.tier)
                    bugie.push(`${v.name}: venduta come '${v.tier}', entra come '${comprata.tier}', in listino '${def.tier}'`);
            }
            assert.deepEqual(bugie, [],
                'il giocatore compra una cosa e ne riceve un\'altra — e al ' +
                'ricaricamento della pagina l\'auto cambia fascia da sola');
        } finally { env.stopAllIntervals(); }
    });

    test('nessuna auto della flotta iniziale ha una fascia inventata', () => {
        const { env, s, g } = mondo();
        try {
            const listino = [...g('NEW_CARS'), ...g('USED_CARS')];
            for (const c of s.gameState.fleet) {
                const def = listino.find(d => d.vehicleClass === c.vehicleClass);
                if (!def) continue;
                assert.equal(c.tier, def.tier,
                    `${c.name} parte con fascia '${c.tier}' ma il listino dice '${def.tier}'`);
            }
        } finally { env.stopAllIntervals(); }
    });
});

describe('guardrail — veicoli definiti ma non raggiungibili', () => {

    test('il censimento di cosa NON si può comprare resta aggiornato', () => {
        /* ── TRIAGE DEL 29/08/2026 — leggere prima di modificare questa lista ──
           Non tutto quello che è definito nei dati è raggiungibile dal gioco.
           Queste voci NON sono difetti da correggere di corsa: sono decisioni di
           prodotto in sospeso, e vanno viste per quello che sono.

           `helicopter` e `private_jet` — definiti in NEW_CARS con prezzo
           (4,5 e 18 milioni), soglia di corse, tetto di flotta, tariffe di
           noleggio, perfino un potenziamento HQ che ne abbassa la soglia
           («helipad»). Ma il negozio vende da STELLAR_VOLT_CATALOG, dove non ci
           sono: nessun pulsante li vende. È contenuto costruito e mai collegato,
           come i nove casi già censiti in trova-morte.test.js.

           Il LEASING — LEASING_TEMPLATES ha 21 voci e `openLeasingModal()` è
           scritta e funzionante, ma NESSUNO la chiama: il leasing non ha un
           punto d'ingresso nell'interfaccia. Il gioco ha però il noleggio breve
           dello showroom, che copre lo stesso bisogno.

           USED_CARS — non è un concessionario dell'usato: quelle cinque auto
           sono il serbatoio dei lotti delle aste giudiziarie (auctions.js). Il
           «Mercato Auto» è il mercato fra giocatori, non un rivenditore.

           Se una di queste viene collegata, va tolta da qui. Se questo test
           diventa rosso perché è comparso qualcosa di nuovo, la domanda giusta
           è «lo colleghiamo o lo togliamo?», non «come faccio a far passare il
           test?». ──────────────────────────────────────────────────────────── */
        const NON_IN_VENDITA = new Set(['helicopter', 'private_jet']);

        const { env, g } = mondo();
        try {
            const vetrina = new Set(g('STELLAR_VOLT_CATALOG').map(v => v.vehicleClass || v.id));
            /* `Array.from` non e' decorativo: gli array che tornano dal sandbox
               hanno il prototipo di QUEL contesto, e `deepStrictEqual` confronta
               anche i prototipi. Senza questa copia, il confronto fallisce
               mostrando due elenchi identici — un errore che fa perdere mezz'ora
               a chiunque lo incontri. */
            const nonVendibili = Array.from(
                g('NEW_CARS').map(c => c.vehicleClass).filter(vc => !vetrina.has(vc))
            ).sort();

            assert.deepEqual(nonVendibili, [...NON_IN_VENDITA].sort(),
                'l\'elenco dei veicoli definiti ma non acquistabili è cambiato: ' +
                'leggi il commento qui sopra prima di aggiornarlo');

            // E il leasing: se un giorno qualcuno lo collega, questo va aggiornato.
            const sorgenti = fs.readdirSync(ROOT)
                .filter(f => f.endsWith('.js') || f.endsWith('.html'))
                .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
                .join('\n');
            const chiamate = (sorgenti.match(/openLeasingModal/g) || []).length;
            assert.equal(chiamate, 1,
                'openLeasingModal compare ' + chiamate + ' volte: se ora qualcuno la ' +
                'chiama, il leasing è stato collegato e va tolto dal censimento ' +
                '(e spiegato nel Knowledge Book, che oggi non lo promette)');
        } finally { env.stopAllIntervals(); }
    });
});
