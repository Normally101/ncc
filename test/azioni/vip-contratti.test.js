'use strict';
// Banco di prova per le azioni "contratto VIP" di vip-clients.js:
// acceptVipEmiro, acceptVipErede, acceptVipGarante, acceptVipGrigori,
// acceptVipOnorevole, acceptVipPlatinum.
//
// Cosa si osserva (il test GUARDA, non tocca):
//  - l'importo giusto, una volta sola: l'accettazione NON muove cassa, il prezzo
//    finisce nella corsa pendente; il denaro entra solo al completamento corsa
//    tramite window.CE_money (mai gameState.cash -= diretto);
//  - l'email viene risolta una volta sola: richiamare l'azione sulla stessa
//    email non deve creare corse duplicate;
//  - il rifiuto (veicoli insufficienti / email inesistente) lascia lo stato intatto.
const vm = require('node:vm');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Due POI realmente esistenti in data.js — mai ID inventati nei test.
// (POIS è `const` top-level nel contesto VM: non è proprietà di window,
//  va letto con runInContext come fanno gli altri test.)
function duePoi(sandbox) {
    const ids = Object.keys(vm.runInContext('POIS', sandbox));
    assert.ok(ids.length >= 2, 'POIS deve contenere almeno due destinazioni');
    return [ids[0], ids[ids.length - 1]];
}

function pushEmailVip(sandbox, tipo, prezzo) {
    const [fromId, toId] = duePoi(sandbox);
    const email = {
        id: sandbox.gameState.nextId++,
        sender: 'Ufficio VIP — test',
        subject: 'Contratto VIP di prova',
        type: tipo,
        status: 'unread',
        vipData: { fromId, toId, price: prezzo },
        expiresAt: (sandbox.gameState.day || 1) * 24 + 8,
    };
    sandbox.gameState.emails.push(email);
    return email;
}

// Registra ogni passaggio da window.CE_money senza alterarne il comportamento:
// serve a dimostrare che l'ACCETTAZIONE non accredita né addebita nulla.
function spiaceCEMoney(sandbox) {
    const chiamate = [];
    for (const nome of ['earn', 'spend']) {
        const originale = sandbox.CE_money[nome].bind(sandbox.CE_money);
        sandbox.CE_money[nome] = (...args) => {
            chiamate.push({ op: nome, args });
            return originale(...args);
        };
    }
    return chiamate;
}

describe('vip-contratti — acceptVipEmiro (Entourage Reale, 4 veicoli ≥80%)', () => {

    test('accettazione: crea UNA sola corsa col prezzo dell\'email, senza toccare la cassa', () => {
        const { sandbox } = freshEnv();
        const email = pushEmailVip(sandbox, 'vip_emiro', 20000);
        for (let i = 0; i < 4; i++) {
            sandbox.gameState.fleet.push({
                id: 'emiro_car_' + i, name: 'Berlina Reale ' + i,
                vehicleClass: 'majestic_spirit', condition: 95,
            });
        }
        const cashPrima = sandbox.gameState.cash;
        const corsePrima = sandbox.gameState.pendingRides.length;
        const mossoDaCEMoney = spiaceCEMoney(sandbox);

        sandbox.acceptVipEmiro(email.id);

        assert.equal(sandbox.gameState.pendingRides.length, corsePrima + 1,
            'l\'accettazione crea una e una sola corsa');
        const corsa = sandbox.gameState.pendingRides[corsePrima];
        assert.equal(corsa.price, 20000, 'la corsa deve costare il prezzo promesso dall\'email');
        assert.equal(corsa.vipClientId, 'emiro', 'la corsa deve essere marcata come contratto emiro');
        assert.equal(corsa.tier, 'ultra', 'servizio ultra per l\'Entourage Reale');
        assert.equal(sandbox.gameState.cash, cashPrima,
            'l\'accettazione NON deve muovere gameState.cash');
        assert.deepEqual(mossoDaCEMoney, [],
            'nessun movimento da CE_money all\'accettazione: il pagamento arriva a fine corsa');
        assert.equal(sandbox.gameState.emails.find(e => e.id === email.id).status, 'resolved',
            'l\'email deve risultare risolta dopo l\'accettazione');
    });

    test('doppia accettazione sulla stessa email: nessuna corsa duplicata', () => {
        const { sandbox } = freshEnv();
        const email = pushEmailVip(sandbox, 'vip_emiro', 20000);
        for (let i = 0; i < 4; i++) {
            sandbox.gameState.fleet.push({
                id: 'emiro_car_' + i, vehicleClass: 'stellar_g_over', condition: 90,
            });
        }
        sandbox.acceptVipEmiro(email.id);
        const corseDopoLaPrima = sandbox.gameState.pendingRides.length;

        sandbox.acceptVipEmiro(email.id); // stessa email, seconda chiamata

        assert.equal(sandbox.gameState.pendingRides.length, corseDopoLaPrima,
            'ripetere l\'azione non deve creare una seconda corsa');
    });

    test('rifiuto: con meno di 4 veicoli idonei nessuna corsa e offerta ancora viva', () => {
        const { sandbox } = freshEnv();
        const email = pushEmailVip(sandbox, 'vip_emiro', 20000);
        for (let i = 0; i < 3; i++) {
            sandbox.gameState.fleet.push({
                id: 'emiro_short_' + i, vehicleClass: 'majestic_spirit', condition: 95,
            });
        }
        // Un quarto veicolo che NON passa i filtri (classe sbagliata): non vale come quarto.
        sandbox.gameState.fleet.push({
            id: 'emiro_scatola', vehicleClass: 'city_mini', condition: 100,
        });
        const cashPrima = sandbox.gameState.cash;
        const corsePrima = sandbox.gameState.pendingRides.length;

        sandbox.acceptVipEmiro(email.id);

        assert.equal(sandbox.gameState.pendingRides.length, corsePrima,
            'senza 4 veicoli idonei nessuna corsa parte');
        assert.equal(sandbox.gameState.cash, cashPrima, 'il rifiuto non tocca la cassa');
        assert.equal(sandbox.gameState.emails.find(e => e.id === email.id).status, 'unread',
            'il rifiuto per mezzi insufficienti lascia l\'offerta leggibile (non risolta)');
    });

    test('bersaglio inesistente: email sconosciuta è un no-op silenzioso', () => {
        const { sandbox } = freshEnv();
        for (let i = 0; i < 4; i++) {
            sandbox.gameState.fleet.push({
                id: 'emiro_car_' + i, vehicleClass: 'volt_s_hyper', condition: 99,
            });
        }
        const cashPrima = sandbox.gameState.cash;
        const corsePrima = sandbox.gameState.pendingRides.length;

        assert.doesNotThrow(() => sandbox.acceptVipEmiro(999999));
        assert.equal(sandbox.gameState.pendingRides.length, corsePrima);
        assert.equal(sandbox.gameState.cash, cashPrima);
    });
});
