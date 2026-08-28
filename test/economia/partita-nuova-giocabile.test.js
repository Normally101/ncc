'use strict';
/* ============================================================================
   Una partita nuova deve essere GIOCABILE. Sembra ovvio: non lo era.

   Playtest di Pietro, 28/08/2026: «Sono bloccato. Ho SOLO corse che richiedono
   una Stellar, mentre io ho letteralmente iniziato il gioco.» Misurato sul
   codice: su 1889 tratte del database, l'auto di partenza ne poteva servire
   ZERO. Il 100% delle corse da contratto veniva generato e subito rifiutato.

   Due controlli che non erano d'accordo fra loro:
     - il GENERATORE scartava le tratte per FAMIGLIA di veicolo, ma non aveva
       nessuna famiglia per le berline, quindi le lasciava passare tutte;
     - `_driverCanTakeRide` le rifiutava confrontando la CLASSE ESATTA e il
       LIVELLO di servizio.
   In piu' la berlina di partenza era marcata `tier:'standard'` pur essendo una
   `volt_3_urban`, che nel listino e' BUSINESS — e nessuna corsa da contratto
   e' mai 'standard'.

   Questi test difendono la proprieta' che conta: chi comincia deve poter
   lavorare, e non deve vedere corse che non potra' mai accettare.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/** Il percorso vero di un giocatore nuovo: sei guidate a mano, poi il Ragazzo
 *  di Quartiere eredita le chiavi della berlina. */
function giocatoreNuovo() {
    const env = createGameEnv(CORE_FILES, { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    const s = env.sandbox, gs = s.gameState;
    s.window.showNotification = () => {};
    s.window.updateUI = () => {};
    s.window.saveGame = () => {};
    for (let i = 0; i < 6; i++) {
        gs.energy = 100;
        if (typeof s.window.executeManualDrive === 'function') s.window.executeManualDrive();
    }
    if (typeof s.window.hireNeighborhoodKid === 'function') s.window.hireNeighborhoodKid();
    return { env, s, gs };
}

describe('partita nuova — chi comincia deve poter lavorare', () => {

    test('l\'auto di partenza puo\' servire le corse da contratto', () => {
        const { env, s, gs } = giocatoreNuovo();
        try {
            const autista = gs.drivers.find(d => d.assignedCarId);
            assert.ok(autista, 'dopo il tutorial un autista deve avere le chiavi');

            let generate = 0, accettabili = 0;
            for (let i = 0; i < 200; i++) {
                const corsa = s.window.generateContractRide();
                if (!corsa) continue;
                generate++;
                if (s.window._driverCanTakeRide(autista, corsa)) accettabili++;
            }

            assert.ok(generate > 0, 'devono generarsi corse da contratto');
            assert.equal(accettabili, generate,
                `ogni corsa generata deve essere accettabile: ${accettabili}/${generate}. ` +
                'Se una corsa nasce e non si puo\' fare, il generatore e il controllo ' +
                'di accettazione sono tornati a non essere d\'accordo.');
        } finally { env.stopAllIntervals(); }
    });

    test('la berlina di partenza ha il livello della propria classe', () => {
        const { env, gs } = giocatoreNuovo();
        try {
            const berlina = gs.fleet.find(c => c.id === 'c_starter');
            assert.ok(berlina, 'la berlina riscattata deve esserci');
            assert.equal(berlina.vehicleClass, 'volt_3_urban');
            assert.equal(berlina.tier, 'business',
                'volt_3_urban e\' BUSINESS nel listino: marcarla \'standard\' la ' +
                'rendeva incapace di servire qualsiasi corsa da contratto');
        } finally { env.stopAllIntervals(); }
    });

    test('le famiglie di veicolo si rispettano: una berlina non fa il lavoro di un minivan', () => {
        const { env, s } = giocatoreNuovo();
        try {
            const c = s.window._classeCompatibile;
            // Dentro la famiglia: si'.
            assert.equal(c('volt_3_urban', 'stellar_e_exec'), true, 'berlina serve berlina');
            assert.equal(c('stellar_q_exec', 'stellar_e_exec'), true);
            // Fra famiglie diverse: no. E' qui che vive la progressione.
            assert.equal(c('volt_3_urban', 'stellar_v_carr'), false, 'berlina NON fa il minivan');
            assert.equal(c('volt_3_urban', 'stellar_s_imp'), false, 'berlina NON fa il presidenziale');
            assert.equal(c('stellar_v_carr', 'water_taxi'), false, 'un minivan non e\' un taxi d\'acqua');
        } finally { env.stopAllIntervals(); }
    });

    test('comprare un minivan sblocca davvero tratte nuove e piu\' ricche', () => {
        function incassoMedio(autoExtra) {
            const { env, s, gs } = giocatoreNuovo();
            try {
                if (autoExtra) gs.fleet.push(autoExtra);
                let n = 0, somma = 0;
                const tipi = new Set();
                for (let i = 0; i < 300; i++) {
                    const r = s.window.generateContractRide();
                    if (!r) continue;
                    n++; somma += r.price || 0; tipi.add(r.vehicleRequired);
                }
                return { medio: n ? somma / n : 0, tipi };
            } finally { env.stopAllIntervals(); }
        }
        const soloBerlina = incassoMedio(null);
        const conMinivan  = incassoMedio({
            id: 'c_van', name: 'V-Carrier', tier: 'vip', vehicleClass: 'stellar_v_carr',
            condition: 100, fuel: 100, tirePressure: 100, engineHealth: 100,
            outOfService: null, upgrades: [], mileage: 0,
        });

        assert.ok(!soloBerlina.tipi.has('stellar_v_carr'),
            'senza minivan non devono comparire tratte da minivan');
        assert.ok(conMinivan.tipi.has('stellar_v_carr'),
            'col minivan le tratte da minivan devono comparire');
        assert.ok(conMinivan.medio > soloBerlina.medio,
            `il minivan deve far guadagnare di piu': ${Math.round(conMinivan.medio)} ` +
            `contro ${Math.round(soloBerlina.medio)}`);
    });

    test('senza il minivan, il generatore non propone nemmeno tratte da minivan', () => {
        const { env, s } = giocatoreNuovo();
        try {
            // La proprieta' vera: non e' che vengono rifiutate, e' che non nascono.
            // Vedere corse impossibili e' cio' che ha fatto dire a Pietro «sono bloccato».
            const richieste = new Set();
            for (let i = 0; i < 300; i++) {
                const r = s.window.generateContractRide();
                if (r) richieste.add(r.vehicleRequired);
            }
            for (const fuoriPortata of ['stellar_v_carr', 'stellar_s_imp', 'water_taxi']) {
                assert.ok(!richieste.has(fuoriPortata),
                    `non deve nascere una corsa che chiede ${fuoriPortata}: il giocatore ` +
                    'nuovo non ha quel veicolo e la vedrebbe solo per non poterla fare');
            }
        } finally { env.stopAllIntervals(); }
    });
});
