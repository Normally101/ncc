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

    test('la berlina di partenza ha la fascia della propria classe', () => {
        const { env, s, gs } = giocatoreNuovo();
        try {
            const berlina = gs.fleet.find(c => c.id === 'c_starter');
            assert.ok(berlina, 'la berlina riscattata deve esserci');
            assert.equal(berlina.vehicleClass, 'volt_3_urban');

            /* Non si controlla un valore fisso ma la COERENZA col listino, che e'
               la proprieta' che conta: fascia dell'auto e fascia della corsa sono
               la stessa scala, e il 28/08 il bug e' nato perche' due copie di
               quella scala dicevano cose diverse (qui 'standard', nel catalogo
               'business'). Se un giorno la volt_3_urban cambia fascia, questo
               test non va aggiornato: deve solo continuare a coincidere. */
            const listino = s.window.NEW_CARS
                || require('node:vm').runInContext('NEW_CARS', s);
            const def = listino.find(c => c.vehicleClass === 'volt_3_urban');
            assert.ok(def, 'la volt_3_urban deve stare in listino');
            assert.equal(berlina.tier, def.tier,
                'la fascia dell\'auto di partenza deve coincidere con il listino: ' +
                'quando divergono nascono corse che il giocatore non puo\' accettare');
        } finally { env.stopAllIntervals(); }
    });

    test('esistono davvero le tre fasce, e la standard e\' la piu\' povera', () => {
        const { env, s } = giocatoreNuovo();
        try {
            const f = s.window._fasciaDaPrezzo;
            assert.equal(f(150),  'standard', 'un transfer da 150€ e\' una corsa ordinaria');
            assert.equal(f(499),  'standard');
            assert.equal(f(500),  'business', 'da 500€ e\' premium');
            assert.equal(f(1499), 'business');
            assert.equal(f(1500), 'vip',      'oltre 1.500€ e\' una richiesta particolare');

            assert.equal(s.window._fasciaCorsa(3000, 'stellar_e_exec'), 'vip',
                'una tratta ricca da berlina e\' una richiesta di lusso');
            assert.equal(s.window._fasciaCorsa(3000, 'stellar_v_carr'), 'vip',
                'e anche una tratta ricca da van: per questo esiste il V-Imperial');
        } finally { env.stopAllIntervals(); }
    });

    test('chi comincia lavora, ma sulle corse che pagano meno', () => {
        const { env, s, gs } = giocatoreNuovo();
        try {
            const berlina = gs.fleet.find(c => c.id === 'c_starter');
            let n = 0, somma = 0;
            const fasce = new Set();
            for (let i = 0; i < 300; i++) {
                const r = s.window.generateContractRide();
                if (!r) continue;
                n++; somma += r.price || 0; fasce.add(r.tier);
                gs.pendingRides.length = 0;   // il generatore si ferma a 22 in coda
            }
            assert.ok(n > 50, `devono arrivare corse da lavorare, ne sono arrivate ${n}`);
            assert.deepEqual([...fasce], ['standard'],
                'con la sola auto d\'ingresso devono arrivare SOLO corse standard: ' +
                'vedere corse premium impossibili e\' cio\' che fa sembrare il gioco ' +
                'un muro a pagamento');
            assert.ok(somma / n < s.window.SOGLIA_FASCIA_PREMIUM,
                `la corsa standard paga meno della soglia premium (media ${Math.round(somma / n)}€)`);
            assert.equal(berlina.tier, 'standard');
        } finally { env.stopAllIntervals(); }
    });

    test('le famiglie di veicolo si rispettano: una berlina non fa il lavoro di un minivan', () => {
        const { env, s } = giocatoreNuovo();
        try {
            const c = s.window._classeCompatibile;
            // Dentro la famiglia: si'. La famiglia e' la FORMA del veicolo.
            assert.equal(c('volt_3_urban', 'stellar_e_exec'), true, 'berlina serve berlina');
            assert.equal(c('stellar_q_exec', 'stellar_e_exec'), true);
            /* Una S-Imperial e' una berlina, quindi sta con le berline: fino al
               29/08/2026 stava in una famiglia «presidenziale» a parte, e quella
               separazione per lusso — non per forma — era il motivo per cui la
               fascia luxury non era raggiungibile quasi da nessuna tratta.
               Attenzione: questo NON vuol dire che la Volt 3-Urban faccia il
               lavoro della S-Imperial. Le tiene separate la FASCIA, verificata
               nel test qui sotto; la famiglia risponde a un'altra domanda. */
            assert.equal(c('volt_3_urban', 'stellar_s_imp'), true,
                'stessa forma: il cancello fra le due e\' la fascia, non la famiglia');
            // Fra forme diverse: no, e nessuna fascia lo cambia.
            assert.equal(c('volt_3_urban', 'stellar_v_carr'), false, 'berlina NON fa il minivan');
            assert.equal(c('stellar_v_carr', 'water_taxi'), false, 'un minivan non e\' un taxi d\'acqua');
        } finally { env.stopAllIntervals(); }
    });

    test('la fascia tiene separata l\'auto d\'ingresso dalla corsa di lusso', () => {
        const { env, s, gs } = giocatoreNuovo();
        try {
            const autista = gs.drivers.find(d => d.assignedCarId);
            const corsaDiLusso = {
                id: 99001, isContract: true, tier: 'vip',
                vehicleRequired: 'stellar_s_imp', price: 3000,
                fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' },
            };
            assert.equal(s.window._driverCanTakeRide(autista, corsaDiLusso), false,
                'la berlina d\'ingresso non deve poter accettare una corsa luxury: ' +
                'e\' la fascia a fermarla, ed e\' li\' che vive la progressione');
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

    test('nessuna tratta del database puo\' produrre una corsa che nessuno potra\' mai fare', () => {
        /* IL GUARDRAIL CHE CONTA, e l'unico che avrebbe visto il bug del 28/08.
           Non guarda una partita: passa su tutte le 1889 tratte del database e
           chiede, per ognuna, se esiste in commercio almeno un'auto capace di
           servirla — famiglia giusta E fascia sufficiente. Se la risposta e' no
           anche per una sola, quella corsa un giorno comparira' in lista e
           nessun giocatore, con nessun patrimonio, potra' accettarla.
           E' il difetto che si legge come una scelta di design: Pietro l'ha
           chiamato «pay to play», ma nessuno l'aveva progettato. */
        const { env, s } = giocatoreNuovo();
        try {
            const vm = require('node:vm');
            const db = vm.runInContext('italianRoutesDB', s);
            /* Servono ENTRAMBI i cataloghi. Il Water Taxi non sta in `NEW_CARS`
               ma in `FLEET_VEHICLE_CLASSES`, e guardare solo il primo dichiarava
               impossibili le sue 31 tratte veneziane — che invece si fanno,
               comprando la barca da un altro percorso. Un guardrail che produce
               falsi allarmi viene ignorato, e allora non protegge piu' niente. */
            const listino = [
                ...vm.runInContext('NEW_CARS', s),
                ...vm.runInContext('FLEET_VEHICLE_CLASSES', s)
                     .filter(v => v.purchasePrice > 0)
                     .map(v => ({ vehicleClass: v.id, tier: v.tier })),
            ];
            const mappa   = s.window._VEHICLE_CLASS_MAP || vm.runInContext('_VEHICLE_CLASS_MAP', s);
            const TC      = vm.runInContext('TIER_COMPATIBILITY', s);

            const impossibili = [];
            for (const r of db) {
                const vc     = mappa[r.vehicle] || 'stellar_e_exec';
                const fascia = s.window._fasciaCorsa(r.sellingPrice, vc);
                const servibile = listino.some(auto =>
                    s.window._classeCompatibile(auto.vehicleClass, vc)
                    && (TC[fascia] || []).includes(auto.tier));
                if (!servibile) impossibili.push(`${r.vehicle} ${Math.round(r.sellingPrice)}€ → ${fascia}`);
            }
            assert.deepEqual(impossibili.slice(0, 8), [],
                `${impossibili.length} tratte non sono servibili da nessuna auto in ` +
                'catalogo. Ogni volta che una di queste viene estratta, il giocatore ' +
                'vede una corsa che non potra' + '\' accettare mai.');
        } finally { env.stopAllIntervals(); }
    });
});
