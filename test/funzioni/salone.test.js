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

/* Aspetta che il prezzo animato arrivi al valore atteso.
 *
 * Prima qui c'era un tempo fisso di 600 ms, e il 21/08 ha fatto un danno che non
 * sembrava suo: con la macchina carica l'animazione non faceva in tempo, questi
 * due casi diventavano rossi, e main risultava rosso. Il cancello dell'agente si
 * rifiuta di giudicare qualunque ramo finche' main non e' verde — quindi due
 * test fragili bloccavano TUTTE le fusioni.
 *
 * L'animazione (`_srmAnimatePrice` in showroom.js) avvicina il valore del 14% a
 * ogni fotogramma e si ferma quando ci arriva: da 120.000 a 124.000 servono una
 * cinquantina di fotogrammi, cioe' quasi un secondo gia' a macchina scarica. Il
 * tempo fisso era sbagliato in partenza.
 *
 * Adesso si aspetta che l'animazione FINISCA, non che passi un tot. Il tetto di
 * 10 secondi resta solo perche' un test che non finisce mai e' peggio di uno che
 * fallisce. */
async function waitPriceAnim(sandbox, expectedText, timeoutMs = 10_000) {
    const start = Date.now();
    let ultimo = null, fermoDa = 0;
    while (Date.now() - start < timeoutMs) {
        const el = sandbox.document.getElementById('srm-cfg-price');
        const testo = el ? el.textContent : null;
        if (testo && testo.includes(expectedText)) return true;
        // Il valore non si muove piu' e non e' quello atteso: e' finita male,
        // e aspettare altri nove secondi non cambierebbe niente.
        fermoDa = (testo === ultimo) ? fermoDa + 1 : 0;
        ultimo = testo;
        if (fermoDa >= 20) return false;
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

        test('navigazione sezioni aggiorna le classi e i colori dei bottoni nella sidebar', () => {
            sandbox._srmOpenConfig('stellar_e_exec');

            sandbox._srmSetSection('esterni');
            const btns = sandbox.document.querySelectorAll('.srm-sec-btn');
            const btnEsterni = Array.from(btns).find(b => b.textContent.includes('Esterni'));
            const btnGenerali = Array.from(btns).find(b => b.textContent.includes('Generali'));

            assert.ok(btnEsterni.classList.contains('srm-active'), 'il bottone Esterni deve avere la classe srm-active');
            assert.ok(!btnGenerali.classList.contains('srm-active'), 'il bottone Generali non deve più avere la classe srm-active');
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

        test('selezione e deselezione aggiornano le card opzione e i badge sidebar nel DOM', () => {
            sandbox._srmSetSection('esterni');

            const card = sandbox.document.querySelector('.srm-opt-card[data-ce-args*="opt_vernice_pearl"]');
            assert.ok(card, 'la card per opt_vernice_pearl deve esistere');
            assert.ok(!card.classList.contains('srm-sel'), 'inizialmente non selezionata');

            // Attivazione
            sandbox._srmToggle('opt_vernice_pearl');
            assert.ok(card.classList.contains('srm-sel'), 'la card deve avere classe srm-sel');
            const chk = card.querySelector('.srm-opt-chk');
            assert.equal(chk.textContent, '✓', 'la spunta deve mostrare ✓');

            // Badge sidebar
            const btnEsterni = Array.from(sandbox.document.querySelectorAll('.srm-sec-btn'))
                .find(b => b.textContent.includes('Esterni'));
            const badge = btnEsterni.querySelector('.srm-sec-badge');
            assert.ok(badge, 'il badge deve essere presente sulla sidebar');
            assert.equal(badge.textContent, '1', 'il badge deve mostrare 1');

            // Disattivazione
            sandbox._srmToggle('opt_vernice_pearl');
            assert.ok(!card.classList.contains('srm-sel'), 'la card non deve più avere srm-sel');
            assert.equal(chk.textContent, '', 'la spunta deve essere vuota');
            assert.equal(btnEsterni.querySelector('.srm-sec-badge'), null, 'il badge deve essere rimosso');
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
            /* La fascia viene dal LISTINO, non dall'etichetta della vetrina.
               Questo test asseriva 'ultra' perche' la S-Imperial e' venduta
               come PRESIDENTIAL — ma in listino e' 'vip', e stava difendendo il
               difetto: l'auto entrava in flotta con una fascia e ne aveva
               un'altra. Dal 29/08/2026 il caricamento riallinea al listino,
               quindi quell'auto cambiava fascia ricaricando la pagina. */
            const vm = require('node:vm');
            const listino = vm.runInContext('NEW_CARS', sandbox);
            const def = listino.find(c => c.vehicleClass === 'stellar_s_imp');
            assert.equal(auto.tier, def.tier,
                'la fascia dell\'auto comprata deve essere quella del listino');
            assert.equal(auto.tier, 'vip');
        });

        test('OGNI auto in vendita entra in flotta con la fascia del listino', async () => {
            /* Non un campione di quattro modelli: tutti. Il difetto trovato il
               29/08/2026 riguardava 10 auto su 19, e un test su quattro campioni
               ne avrebbe viste due. La vetrina traduceva le proprie etichette
               commerciali (PRESIDENTIAL, COMMERCIAL, ARMORED…) in fasce con una
               mappa sua, e il risultato non coincideva col listino: si comprava
               una Volt 3-Urban etichettata BUSINESS e si riceveva un'auto che
               lavora come 'standard'. */
            const vm = require('node:vm');
            const listino = vm.runInContext('NEW_CARS', sandbox);
            const vetrina = vm.runInContext('STELLAR_VOLT_CATALOG', sandbox);
            const sbagliate = [];

            for (const v of vetrina) {
                gs.cash = 50000000;
                gs.questStats = { ...(gs.questStats || {}), totalRides: 99999 };
                gs.hasEVHub = true;
                sandbox._srmOpenConfig(v.id);
                await sandbox._srmPurchase();
                const comprata = gs.fleet[gs.fleet.length - 1];
                const def = listino.find(c => c.vehicleClass === (v.vehicleClass || v.id));
                if (!def) continue;
                if (comprata.tier !== def.tier) {
                    sbagliate.push(`${v.name}: comprata '${comprata.tier}', in listino '${def.tier}'`);
                }
            }
            assert.deepEqual(sbagliate, [],
                'un\'auto deve lavorare con la fascia che il listino le assegna: ' +
                'se diverge, il giocatore compra una cosa e ne riceve un\'altra, ' +
                'e al ricaricamento della pagina l\'auto cambia fascia da sola');
        });

        test('fallimento ServerState.buyVehicle non addebita cassa e non aggiunge auto alla flotta', async () => {
            env = freshEnv({
                render: true,
                serverState: {
                    buyVehicle: async () => null, // fallimento RPC
                },
            });
            sandbox = env.sandbox;
            gs = sandbox.gameState;
            gs.cash = 500000;
            const flottaPrima = gs.fleet.length;

            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            sandbox._srmSetSection('riepilogo');

            await sandbox._srmPurchase();

            assert.equal(gs.cash, 500000, 'il saldo non deve cambiare su errore server');
            assert.equal(gs.fleet.length, flottaPrima, 'nessuna auto aggiunta alla flotta');
        });

        test('aprire un veicolo inesistente reindirizza pacificamente alla galleria', () => {
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('veicolo_totalmente_inventato');

            const overlay = sandbox.document.getElementById('srm-overlay');
            assert.ok(overlay.innerHTML.includes('CHAUFFEUR <span>SHOWROOM</span>'));
        });

        test('l auto acquistata dal salone è idonea per le corse del suo tier in TIER_COMPATIBILITY', async () => {
            gs.cash = 500000;
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            await sandbox._srmPurchase();

            const acquistata = gs.fleet[gs.fleet.length - 1];
            // TIER_COMPATIBILITY per corsa business accetta veicoli business
            const TIER_COMPATIBILITY = vm.runInContext('TIER_COMPATIBILITY', sandbox);
            assert.ok(TIER_COMPATIBILITY.business.includes(acquistata.tier), 'l auto deve essere compatibile con corse business');
            assert.equal(acquistata.outOfService, false);
            assert.equal(acquistata.condition, 100);
        });
    });

    describe('esecuzione azioni via data-ce-act ed eventi DOM delegati', () => {
        function clickEl(el) {
            if (typeof el.click === 'function') {
                el.click();
            } else {
                el.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        }

        test('ciclo completo interazione UI: filtri, apertura configuratore, cambio sezione, toggle, riepilogo, acquisto', async () => {
            gs.cash = 500000;
            gs.hasEVHub = true;
            sandbox.renderTabShowroom();

            // 1. Click su filtro carburante electric
            const btnEV = sandbox.document.querySelector('[data-ce-act="_srmFilterFuel"][data-ce-args*="electric"]');
            assert.ok(btnEV, 'bottone filtro electric non trovato');
            clickEl(btnEV);
            assert.ok(sandbox.document.getElementById('srm-overlay').innerHTML.includes('Volt 3-Urban'));

            // 2. Click su filtro marchio volt
            const btnVolt = sandbox.document.querySelector('[data-ce-act="_srmFilterBrand"][data-ce-args*="volt"]');
            assert.ok(btnVolt, 'bottone filtro volt non trovato');
            clickEl(btnVolt);
            assert.ok(sandbox.document.getElementById('srm-overlay').innerHTML.includes('Volt 3-Urban'));

            // 3. Click su card veicolo per aprire configuratore
            const cardVolt = sandbox.document.querySelector('.srm-vcard[data-ce-act="_srmOpenConfig"]');
            assert.ok(cardVolt, 'card configurabile non trovata');
            clickEl(cardVolt);
            assert.ok(sandbox.document.getElementById('srm-config'), 'configuratore non aperto');

            // 4. Click su sezione esterni
            const btnEsterni = sandbox.document.querySelector('.srm-sec-btn[data-ce-args*="esterni"]');
            assert.ok(btnEsterni, 'tasto sezione esterni non trovato');
            clickEl(btnEsterni);

            // 5. Click su optional
            const optCard = sandbox.document.querySelector('.srm-opt-card[data-ce-args*="opt_vernice_pearl"]');
            assert.ok(optCard, 'card optional non trovata');
            clickEl(optCard);
            assert.ok(optCard.classList.contains('srm-sel'), 'card optional non selezionata');

            // 6. Click su sezione riepilogo
            const btnRiepilogo = sandbox.document.querySelector('.srm-sec-btn[data-ce-args*="riepilogo"]');
            assert.ok(btnRiepilogo, 'tasto riepilogo non trovato');
            clickEl(btnRiepilogo);

            // 7. Click su acquisto
            const btnBuy = sandbox.document.getElementById('srm-buy-btn');
            assert.ok(btnBuy, 'tasto acquisto non trovato');
            const flottaPrima = gs.fleet.length;
            clickEl(btnBuy);
            await new Promise(r => setImmediate(r));

            // Verifica mutazione di stato gameState
            assert.equal(gs.fleet.length, flottaPrima + 1);
            const acquistata = gs.fleet[gs.fleet.length - 1];
            assert.equal(acquistata.vehicleClass, 'volt_3_urban');
            assert.ok(acquistata.upgrades.includes('opt_vernice_pearl'));
        });

        test('click su _srmBackToGallery ritorna alla galleria e _srmClose chiude showroom', () => {
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');

            const btnBack = sandbox.document.getElementById('srm-cfg-back');
            assert.ok(btnBack, 'tasto torna alla galleria non trovato');
            clickEl(btnBack);
            assert.ok(sandbox.document.getElementById('srm-grid'), 'non tornato alla griglia');

            const btnClose = sandbox.document.querySelector('.srm-close-btn');
            assert.ok(btnClose, 'tasto chiudi non trovato');
            clickEl(btnClose);
            assert.equal(sandbox.document.getElementById('srm-overlay'), null, 'overlay non rimosso');
        });
    });
});
