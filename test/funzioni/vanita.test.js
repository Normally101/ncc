'use strict';
/* ============================================================================
   test/funzioni/vanita.test.js — Vetrina Prestigio (vanity.js)

   Verifica del funzionamento della feature "vanita" (attualmente disattivata in config.js).
   Collauda tutte le azioni esposte (renderTabPrestigio, _vanityEmblem,
   _vanityColor, _vanityTitle, _vanityApplyBrand, ceTargaPresidenziale)
   e la gestione delle risorse (Driver Coins tramite CE_money.spendDC).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione vanita — vetrina prestigio, stemmi, colori e titoli', () => {
    let env, sandbox, gs;
    let rpcDriverCoinsCalls;

    beforeEach(() => {
        rpcDriverCoinsCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcDriverCoinsCalls.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('inizializzazione e ripristino brand (_ensure e _vanityApplyBrand)', () => {
        test('lo stato iniziale di default viene completato se mancano le proprietà cosmetiche', () => {
            delete gs.ownedEmblems;
            delete gs.ownedColors;
            delete gs.ownedTitles;
            delete gs.companyLogo;
            delete gs.companyColor;
            delete gs.companyTitle;

            // Invocando _vanityApplyBrand o una qualunque azione vanity
            sandbox._vanityEmblem('👁️');

            assert.deepEqual([...gs.ownedEmblems], ['👁️']);
            assert.deepEqual([...gs.ownedColors], ['#c79a2a']);
            assert.deepEqual([...gs.ownedTitles], ['Imprenditore']);
            assert.equal(gs.companyLogo, '👁️');
            assert.equal(gs.companyColor, '#c79a2a');
            assert.equal(gs.companyTitle, 'Imprenditore');
        });

        test('_vanityApplyBrand aggiorna il logo sul DOM (.emc-bm) e applica il brand color', () => {
            gs.companyLogo = '🦅';
            gs.companyColor = '#c0392b';

            const bm = sandbox.document.createElement('div');
            bm.className = 'emc-bm';
            sandbox.document.body.appendChild(bm);

            sandbox._vanityApplyBrand();

            assert.equal(bm.textContent, '🦅');
            assert.equal(sandbox.document.documentElement.style.getPropertyValue('--gold'), '#c0392b');
        });
    });

    describe('rendering vetrina prestigio (renderTabPrestigio)', () => {
        test('renderTabPrestigio non crasha se il contenitore tab-container non esiste nel DOM', () => {
            assert.doesNotThrow(() => {
                sandbox.renderTabPrestigio();
            });
        });

        test('renderTabPrestigio costruisce la pagina con anteprima, stemmi, colori, titoli e targa', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.driverCoins = 42;
            gs.companyName = 'Imperium Lux';
            gs.companyLogo = '⚜️';
            gs.companyColor = '#8aa0b5';
            gs.companyTitle = 'Magnate';
            gs.ownedEmblems = ['👁️', '⚜️'];
            gs.ownedColors = ['#c79a2a', '#8aa0b5'];
            gs.ownedTitles = ['Imprenditore', 'Magnate'];

            sandbox.renderTabPrestigio();

            const html = container.innerHTML;
            assert.ok(html.includes('Vetrina Prestigio'), 'manca intestazione vetrina');
            assert.ok(html.includes('42 DC'), 'manca saldo DC');
            assert.ok(html.includes('Imperium Lux'), 'manca nome azienda');
            assert.ok(html.includes('⚜️'), 'manca logo azienda');
            assert.ok(html.includes('Magnate'), 'manca titolo azienda');
            assert.ok(html.includes('data-ce-act="_vanityEmblem"'), 'mancano azioni stemmi');
            assert.ok(html.includes('data-ce-act="_vanityColor"'), 'mancano azioni colori');
            assert.ok(html.includes('data-ce-act="_vanityTitle"'), 'mancano azioni titoli');
            assert.ok(html.includes('data-ce-act="ceTargaPresidenziale"'), 'manca azione targa presidenziale');
            assert.ok(html.includes('Targa Nera Presidenziale'), 'manca voce targa presidenziale');
        });

        test('se la Targa Nera Presidenziale è già posseduta, mostra il badge Posseduta invece del bottone d acquisto', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.hasPrestigiousPlate = true;
            sandbox.renderTabPrestigio();

            const html = container.innerHTML;
            assert.ok(html.includes('Posseduta'), 'dovrebbe mostrare il badge Posseduta');
            assert.ok(!html.includes('data-ce-act="ceTargaPresidenziale"'), 'non dovrebbe offrire il tasto compra');
        });
    });

    describe('stemmi aziendali (_vanityEmblem)', () => {
        test('equipaggiare lo stemma gratuito di partenza non consuma DC', () => {
            gs.driverCoins = 10;
            sandbox._vanityEmblem('👁️');

            assert.equal(gs.companyLogo, '👁️');
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('acquistare un nuovo stemma scala DC e lo imposta come logo aziendale', () => {
            gs.driverCoins = 15;
            // '🦅' costa 8 DC
            sandbox._vanityEmblem('🦅');

            assert.equal(gs.companyLogo, '🦅');
            assert.ok(gs.ownedEmblems.includes('🦅'));
            assert.equal(gs.driverCoins, 7);
            assert.equal(rpcDriverCoinsCalls.length, 1);
            assert.equal(rpcDriverCoinsCalls[0].n, 8);
            assert.equal(rpcDriverCoinsCalls[0].motivo, 'vanity_emblem');
        });

        test('equipaggiare uno stemma già acquistato non scala ulteriori DC', () => {
            gs.driverCoins = 15;
            gs.ownedEmblems = ['👁️', '🦅'];

            sandbox._vanityEmblem('🦅');

            assert.equal(gs.companyLogo, '🦅');
            assert.equal(gs.driverCoins, 15);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('con DC insufficienti lo stemma non viene acquistato né equipaggiato', () => {
            gs.driverCoins = 3;
            gs.companyLogo = '👁️';

            sandbox._vanityEmblem('🦅'); // costa 8 DC

            assert.equal(gs.companyLogo, '👁️');
            assert.ok(!gs.ownedEmblems.includes('🦅'));
            assert.equal(gs.driverCoins, 3);
            assert.equal(rpcDriverCoinsCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Servono 8 DC')));
        });

        test('uno stemma non presente a catalogo viene ignorato senza modifiche', () => {
            gs.driverCoins = 100;
            gs.companyLogo = '👁️';

            sandbox._vanityEmblem('🚀'); // non a catalogo

            assert.equal(gs.companyLogo, '👁️');
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });
    });

    describe('colori aziendali (_vanityColor)', () => {
        test('equipaggiare il colore gratuito iniziale non spende DC', () => {
            gs.driverCoins = 10;
            sandbox._vanityColor('#c79a2a'); // Oro gratuito

            assert.equal(gs.companyColor, '#c79a2a');
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('acquistare un nuovo colore scala DC e lo applica alle variabili CSS', () => {
            gs.driverCoins = 20;
            // Cremisi '#c0392b' costa 6 DC
            sandbox._vanityColor('#c0392b');

            assert.equal(gs.companyColor, '#c0392b');
            assert.ok(gs.ownedColors.includes('#c0392b'));
            assert.equal(gs.driverCoins, 14);
            assert.equal(rpcDriverCoinsCalls.length, 1);
            assert.equal(rpcDriverCoinsCalls[0].n, 6);
            assert.equal(sandbox.document.documentElement.style.getPropertyValue('--gold'), '#c0392b');
        });

        test('equipaggiare un colore già posseduto non costa DC', () => {
            gs.driverCoins = 20;
            gs.ownedColors = ['#c79a2a', '#c0392b'];

            sandbox._vanityColor('#c0392b');

            assert.equal(gs.companyColor, '#c0392b');
            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('con DC insufficienti il colore non viene acquistato', () => {
            gs.driverCoins = 2;
            gs.companyColor = '#c79a2a';

            sandbox._vanityColor('#c0392b');

            assert.equal(gs.companyColor, '#c79a2a');
            assert.ok(!gs.ownedColors.includes('#c0392b'));
            assert.equal(gs.driverCoins, 2);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('un colore non presente a catalogo viene ignorato', () => {
            gs.driverCoins = 100;
            gs.companyColor = '#c79a2a';

            sandbox._vanityColor('#123456');

            assert.equal(gs.companyColor, '#c79a2a');
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });
    });

    describe('titoli onorifici (_vanityTitle)', () => {
        test('equipaggiare il titolo gratuito iniziale non spende DC', () => {
            gs.driverCoins = 10;
            sandbox._vanityTitle('Imprenditore');

            assert.equal(gs.companyTitle, 'Imprenditore');
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('acquistare un nuovo titolo scala DC e lo imposta nello stato', () => {
            gs.driverCoins = 30;
            // 'Sua Eccellenza' costa 25 DC
            sandbox._vanityTitle('Sua Eccellenza');

            assert.equal(gs.companyTitle, 'Sua Eccellenza');
            assert.ok(gs.ownedTitles.includes('Sua Eccellenza'));
            assert.equal(gs.driverCoins, 5);
            assert.equal(rpcDriverCoinsCalls.length, 1);
            assert.equal(rpcDriverCoinsCalls[0].n, 25);
            assert.equal(rpcDriverCoinsCalls[0].motivo, 'vanity_title');
        });

        test('equipaggiare un titolo già posseduto non costa DC', () => {
            gs.driverCoins = 30;
            gs.ownedTitles = ['Imprenditore', 'Sua Eccellenza'];

            sandbox._vanityTitle('Sua Eccellenza');

            assert.equal(gs.companyTitle, 'Sua Eccellenza');
            assert.equal(gs.driverCoins, 30);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('con DC insufficienti il titolo non viene acquistato', () => {
            gs.driverCoins = 10;
            gs.companyTitle = 'Imprenditore';

            sandbox._vanityTitle('Sua Eccellenza'); // costa 25 DC

            assert.equal(gs.companyTitle, 'Imprenditore');
            assert.ok(!gs.ownedTitles.includes('Sua Eccellenza'));
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });

        test('un titolo non a catalogo viene ignorato', () => {
            gs.driverCoins = 100;
            gs.companyTitle = 'Imprenditore';

            sandbox._vanityTitle('Re Supremo');

            assert.equal(gs.companyTitle, 'Imprenditore');
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcDriverCoinsCalls.length, 0);
        });
    });

    describe('azione collegata ceTargaPresidenziale', () => {
        test('ceTargaPresidenziale acquista la targa se _ecTargaPresidenziale è caricata', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = false;

            sandbox.ceTargaPresidenziale();

            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcDriverCoinsCalls.length, 1);
            assert.equal(rpcDriverCoinsCalls[0].n, 500);
        });

        test('ceTargaPresidenziale reindirizza allo store se _ecTargaPresidenziale non è disponibile', () => {
            let tabCambiata = null;
            sandbox.switchTab = (tab) => { tabCambiata = tab; };
            delete sandbox.window._ecTargaPresidenziale;

            sandbox.ceTargaPresidenziale();

            assert.equal(tabCambiata, 'store');
        });
    });
});
