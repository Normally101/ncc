'use strict';
/* ============================================================================
   test/funzioni/salone.test.js — Salone Auto Premium (showroom.js)

   Verifica del funzionamento della feature "salone" (attualmente disattivata in config.js).
   Collauda tutte le azioni esposte (renderTabShowroom, _srmClose, _srmFilterFuel,
   _srmFilterBrand, _srmOpenConfig, _srmBackToGallery, _srmSetSection,
   _srmToggle, _srmPurchase), i filtri, il configuratore, il calcolo prezzi,
   l'integrazione con ServerState/CE_money e la corretta immissione del veicolo
   in gameState.fleet con tier normalizzati compatibili con TIER_COMPATIBILITY.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

async function waitPriceAnim(sandbox, expectedText, timeoutMs = 600) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const el = sandbox.document.getElementById('srm-cfg-price');
        if (el && el.textContent.includes(expectedText)) return true;
        await new Promise(resolve => setTimeout(resolve, 15));
    }
    return false;
}

describe('funzione salone — vetrina auto e configuratore (showroom.js)', () => {
    let env, sandbox, gs;
    let rpcBuyVehicleCalls;

    beforeEach(() => {
        rpcBuyVehicleCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                buyVehicle: async (modelId, price, hqCity) => {
                    rpcBuyVehicleCalls.push({ modelId, price, hqCity });
                    sandbox.gameState.cash = (sandbox.gameState.cash || 0) - price;
                    return { id: 'srv_veh_' + modelId + '_test123' };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('rendering galleria e apertura/chiusura overlay (renderTabShowroom, _srmClose)', () => {
        test('renderTabShowroom crea overlay, inietta stili e nasconde main-panel', () => {
            const mainPanel = sandbox.document.createElement('div');
            mainPanel.id = 'main-panel';
            sandbox.document.body.appendChild(mainPanel);

            const tabContainer = sandbox.document.createElement('div');
            tabContainer.id = 'tab-container';
            tabContainer.innerHTML = '<p>Contenuto precedente</p>';
            sandbox.document.body.appendChild(tabContainer);

            sandbox.renderTabShowroom();

            const styleEl = sandbox.document.getElementById('srm-styles');
            assert.ok(styleEl, 'manca elemento <style id="srm-styles">');

            const overlay = sandbox.document.getElementById('srm-overlay');
            assert.ok(overlay, 'manca elemento #srm-overlay nel DOM');
            assert.equal(mainPanel.style.display, 'none', 'main-panel dovrebbe essere nascosto');
            assert.equal(tabContainer.innerHTML, '', 'tab-container dovrebbe essere svuotato');

            // Verifica presenza elementi galleria
            const html = overlay.innerHTML;
            assert.ok(html.includes('CHAUFFEUR <span>SHOWROOM</span>'), 'manca logo showroom');
            assert.ok(html.includes('data-ce-act="_srmClose"'), 'manca bottone di chiusura');
            assert.ok(html.includes('data-ce-act="_srmFilterFuel"'), 'mancano filtri carburante');
            assert.ok(html.includes('data-ce-act="_srmFilterBrand"'), 'mancano filtri marchio');
            assert.ok(html.includes('Stellar E-Executive'), 'catalogo veicoli non renderizzato');
        });

        test('renderTabShowroom richiamato quando l overlay è già aperto non duplica l elemento', () => {
            sandbox.renderTabShowroom();
            const prima = sandbox.document.querySelectorAll('#srm-overlay').length;
            assert.equal(prima, 1);

            sandbox.renderTabShowroom();
            const dopo = sandbox.document.querySelectorAll('#srm-overlay').length;
            assert.equal(dopo, 1);
        });

        test('_srmClose rimuove overlay e ripristina visibilità di main-panel', () => {
            const mainPanel = sandbox.document.createElement('div');
            mainPanel.id = 'main-panel';
            sandbox.document.body.appendChild(mainPanel);

            sandbox.renderTabShowroom();
            assert.ok(sandbox.document.getElementById('srm-overlay'));
            assert.equal(mainPanel.style.display, 'none');

            sandbox._srmClose();
            assert.equal(sandbox.document.getElementById('srm-overlay'), null);
            assert.equal(mainPanel.style.display, '');
        });
    });

    describe('filtri carburante e brand (_srmFilterFuel, _srmFilterBrand)', () => {
        beforeEach(() => {
            sandbox.renderTabShowroom();
        });

        test('_srmFilterFuel filtra correttamente i veicoli elettrici', () => {
            sandbox._srmFilterFuel('electric');

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Volt 3-Urban'), 'dovrebbe mostrare Volt 3-Urban');
            assert.ok(html.includes('Stellar Q-Executive'), 'dovrebbe mostrare Stellar Q-Executive');
            assert.ok(!html.includes('Stellar E-Executive'), 'non dovrebbe mostrare modelli benzina/termici');
        });

        test('_srmFilterFuel con alimentazione aviazione mostra elicottero e jet se presenti a catalogo', () => {
            sandbox._srmFilterFuel('aviation');

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            // Se a catalogo non ci sono modelli aviation, mostra il messaggio di catalogo vuoto
            const catalog = vm.runInContext('typeof STELLAR_VOLT_CATALOG !== "undefined" ? STELLAR_VOLT_CATALOG : []', sandbox);
            const hasAviation = catalog.some(c => c.fuel === 'avgas' || c.fuel === 'jet');
            if (hasAviation) {
                assert.ok(html.includes('Airbus') || html.includes('Phenom') || html.includes('helicopter'));
            } else {
                assert.ok(html.includes('Nessun modello disponibile'));
            }
        });

        test('_srmFilterBrand filtra per marchio specifico (es. Volt)', () => {
            sandbox._srmFilterBrand('volt');

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Volt 3-Urban'), 'dovrebbe includere Volt 3-Urban');
            assert.ok(!html.includes('Stellar E-Executive'), 'non dovrebbe mostrare Stellar');
            assert.ok(!html.includes('Majestic Spirit'), 'non dovrebbe mostrare Majestic');
        });

        test('reimpostare i filtri su all mostra l intero catalogo', () => {
            sandbox._srmFilterFuel('electric');
            sandbox._srmFilterBrand('volt');
            sandbox._srmFilterFuel('all');
            sandbox._srmFilterBrand('all');

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Stellar E-Executive'));
            assert.ok(html.includes('Volt 3-Urban'));
            assert.ok(html.includes('Majestic Spirit'));
        });
    });

    describe('requisiti di blocco veicoli nella galleria (rideGate e hasEVHub)', () => {
        test('un veicolo con rideGate non raggiunto mostra messaggio di blocco', () => {
            gs.questStats.totalRides = 50; // Majestic Spirit richiede 1000 corse
            sandbox.renderTabShowroom();

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Richiede 1.000 corse') || html.includes('Richiede 1000 corse'), 'manca blocco rideGate');
        });

        test('un veicolo elettrico senza Hub di Ricarica mostra blocco', () => {
            gs.hasEVHub = false;
            sandbox.renderTabShowroom();

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Richiede Hub di Ricarica'), 'manca blocco Hub EV');
        });

        test('con Hub di Ricarica e corse sufficienti il veicolo è configurabile', () => {
            gs.hasEVHub = true;
            gs.questStats.totalRides = 2000;
            sandbox.renderTabShowroom();

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            // Volt 3-Urban (EV, rideGate:0) non deve avere lucchetti
            assert.ok(html.includes('Configura →'));
        });
    });

    describe('configuratore e navigazione sezioni (_srmOpenConfig, _srmSetSection, _srmBackToGallery)', () => {
        beforeEach(() => {
            sandbox.renderTabShowroom();
        });

        test('_srmOpenConfig apre il configuratore per il modello scelto', () => {
            sandbox._srmOpenConfig('stellar_e_exec');

            const overlay = sandbox.document.getElementById('srm-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('Stellar E-Executive'), 'titolo veicolo non presente');
            assert.ok(html.includes('Prezzo base'), 'sezione generali non renderizzata');
            assert.ok(html.includes('data-ce-act="_srmBackToGallery"'), 'manca tasto torna alla galleria');
            assert.ok(html.includes('data-ce-act="_srmSetSection"'), 'mancano sezioni di configurazione');
        });

        test('_srmBackToGallery ritorna alla schermata galleria', () => {
            sandbox._srmOpenConfig('stellar_e_exec');
            sandbox._srmBackToGallery();

            const overlay = sandbox.document.getElementById('srm-overlay');
            assert.ok(overlay.innerHTML.includes('CHAUFFEUR <span>SHOWROOM</span>'));
            assert.ok(overlay.innerHTML.includes('data-ce-act="_srmFilterFuel"'));
        });

        test('_srmSetSection permette di navigare tra esterni, interni, speciali e riepilogo', () => {
            sandbox._srmOpenConfig('stellar_e_exec');

            // Sezione esterni
            sandbox._srmSetSection('esterni');
            let content = sandbox.document.getElementById('srm-cfg-content');
            assert.ok(content.innerHTML.includes('Vernice Madreperla') || content.innerHTML.includes('Cerchi 21'));

            // Sezione interni
            sandbox._srmSetSection('interni');
            content = sandbox.document.getElementById('srm-cfg-content');
            assert.ok(content.innerHTML.includes('Pelle Nappa Piena') || content.innerHTML.includes('Sedili Massaggianti'));

            // Sezione speciali
            sandbox._srmSetSection('speciali');
            content = sandbox.document.getElementById('srm-cfg-content');
            assert.ok(content.innerHTML.includes('Blindatura B4') || content.innerHTML.includes('Chauffeur AI'));

            // Sezione riepilogo
            sandbox._srmSetSection('riepilogo');
            content = sandbox.document.getElementById('srm-cfg-content');
            assert.ok(content.innerHTML.includes('Riepilogo Configurazione'));
            assert.ok(content.innerHTML.includes('data-ce-act="_srmPurchase"'));
        });
    });

    describe('selezione optional e calcolo prezzi (_srmToggle)', () => {
        beforeEach(() => {
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec'); // Prezzo base: 120.000 €
        });

        test('selezionare e deselezionare un optional aggiorna il prezzo e i badge', async () => {
            sandbox._srmSetSection('esterni');

            // opt_vernice_pearl costa 4000 €
            sandbox._srmToggle('opt_vernice_pearl');
            const raggiunto124 = await waitPriceAnim(sandbox, '124.000');
            assert.ok(raggiunto124, 'prezzo animato dovrebbe convergere a 124.000 € (+4.000€ per vernice)');

            // Deselezione
            sandbox._srmToggle('opt_vernice_pearl');
            const raggiunto120 = await waitPriceAnim(sandbox, '120.000');
            assert.ok(raggiunto120, 'prezzo animato dovrebbe tornare al base di 120.000 €');
        });

        test('cumulo di più optional aumenta il totale correttamente', async () => {
            // opt_vernice_pearl (+4.000€) + opt_pelle_nappa (+8.000€) = +12.000€
            sandbox._srmToggle('opt_vernice_pearl');
            sandbox._srmToggle('opt_pelle_nappa');
            const raggiunto132 = await waitPriceAnim(sandbox, '132.000');
            assert.ok(raggiunto132, 'prezzo totale dovrebbe raggiungere 132.000 €');
        });

        test('nel riepilogo compaiono tutti gli optional selezionati', () => {
            sandbox._srmToggle('opt_vernice_pearl');
            sandbox._srmToggle('opt_blindatura'); // +45.000€

            sandbox._srmSetSection('riepilogo');
            const content = sandbox.document.getElementById('srm-cfg-content');
            const html = content.innerHTML;

            assert.ok(html.includes('Vernice Madreperla'));
            assert.ok(html.includes('Blindatura B4'));
            assert.ok(html.includes('169.000')); // 120k + 4k + 45k
        });
    });

    describe('acquisto veicolo (_srmPurchase)', () => {
        beforeEach(() => {
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec'); // Prezzo base: 120.000 €
        });

        test('acquisto con fondi sufficienti chiama ServerState.buyVehicle e aggiunge auto in flotta', async () => {
            gs.cash = 200000;
            const flottaIniziale = gs.fleet.length;

            sandbox._srmToggle('opt_vernice_pearl'); // 124.000 € totale
            await sandbox._srmPurchase();

            // Verifica chiamata RPC
            assert.equal(rpcBuyVehicleCalls.length, 1);
            assert.equal(rpcBuyVehicleCalls[0].modelId, 'stellar_e_exec');
            assert.equal(rpcBuyVehicleCalls[0].price, 124000);
            assert.equal(gs.cash, 76000);

            // Verifica inserimento in flotta
            assert.equal(gs.fleet.length, flottaIniziale + 1);
            const nuovaAuto = gs.fleet[gs.fleet.length - 1];
            assert.equal(nuovaAuto.name, 'Stellar E-Executive');
            assert.equal(nuovaAuto.tier, 'business');
            assert.equal(nuovaAuto.condition, 100);
            assert.equal(nuovaAuto.isLease, false);
            assert.equal(nuovaAuto.fuel, 100);
            assert.equal(nuovaAuto.mileage, 0);
            assert.equal(nuovaAuto.tirePressure, 100);
            assert.equal(nuovaAuto.engineHealth, 100);
            assert.equal(nuovaAuto.outOfService, false);
            assert.equal(nuovaAuto.vehicleClass, 'stellar_e_exec');
            assert.deepEqual(Array.from(nuovaAuto.upgrades), ['opt_vernice_pearl']);
            assert.ok(nuovaAuto._serverId.startsWith('srv_veh_stellar_e_exec_'));
        });

        test('acquisto con fondi sufficienti in modalità offline (CE_money fallback)', async () => {
            // Disabilitiamo ServerState.isReady()
            sandbox.ServerState._setReady(false);
            gs.cash = 150000;
            const flottaIniziale = gs.fleet.length;

            await sandbox._srmPurchase(); // 120.000 € base

            assert.equal(rpcBuyVehicleCalls.length, 0, 'non dovrebbe invocare ServerState se offline');
            assert.equal(gs.cash, 30000);
            assert.equal(gs.fleet.length, flottaIniziale + 1);

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto.name, 'Stellar E-Executive');
            assert.equal(auto._serverId, null);
            assert.equal(auto.tier, 'business');
        });

        test('acquisto con fondi insufficienti viene bloccato e non muta lo stato', async () => {
            gs.cash = 50000; // servono 120.000 €
            const flottaIniziale = gs.fleet.length;

            await sandbox._srmPurchase();

            assert.equal(rpcBuyVehicleCalls.length, 0);
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.length, flottaIniziale);
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti') && n.type === 'error'));
        });

        test('acquisto veicolo ultra lusso notifica news di settore se _broadcastNews esiste', async () => {
            let newsInviata = null;
            sandbox._broadcastNews = (msg, tipo) => { newsInviata = { msg, tipo }; };

            sandbox._srmOpenConfig('stellar_s_imp'); // Prezzo: 480.000 €, Tier: PRESIDENTIAL
            gs.cash = 600000;

            await sandbox._srmPurchase();

            assert.ok(newsInviata, 'dovrebbe inviare broadcast news');
            assert.equal(newsInviata.tipo, 'milestone');
            assert.ok(newsInviata.msg.includes('Stellar S-Imperial'));

            const auto = gs.fleet[gs.fleet.length - 1];
            // Tier presidenziale mappato a ultra per compatibilità con il gioco
            assert.equal(auto.tier, 'ultra');
        });

        test('i tier dei diversi modelli sono tutti normalizzati minuscoli e validi', async () => {
            gs.cash = 10000000;

            // Test Nexus (STANDARD -> standard)
            sandbox._srmOpenConfig('nexus_h_line');
            await sandbox._srmPurchase();
            assert.equal(gs.fleet[gs.fleet.length - 1].tier, 'standard');

            // Test Stellar Carrier (PREMIUM -> business)
            sandbox._srmOpenConfig('stellar_v_carr');
            await sandbox._srmPurchase();
            assert.equal(gs.fleet[gs.fleet.length - 1].tier, 'business');

            // Test Stellar Overlord (ARMORED -> ultra)
            sandbox._srmOpenConfig('stellar_g_over');
            await sandbox._srmPurchase();
            assert.equal(gs.fleet[gs.fleet.length - 1].tier, 'ultra');

            // Test Majestic Spirit (PRESIDENTIAL -> ultra)
            sandbox._srmOpenConfig('majestic_spirit');
            await sandbox._srmPurchase();
            assert.equal(gs.fleet[gs.fleet.length - 1].tier, 'ultra');
        });
    });
});
