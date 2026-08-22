'use strict';
/* ============================================================================
   rides/ride-duration — quanto dura una corsa (_getRideDurationMs)

   La formula e' cambiata il 22/08/2026 per decisione di Vlad: da lineare con
   tetto (`prezzo × 0.2`, massimo 360 minuti) a radice quadrata senza tetto
   (`10 + 3.8 × √prezzo`).

   Il motivo, misurato sul gioco vero: il 12% delle corse era incollato al
   tetto, quindi tutte le corse sopra i 1.800€ duravano uguali e pagare di piu'
   non costava piu' niente in tempo. La scelta fra una corsa ricca e una
   ricchissima aveva smesso di essere una scelta.

   Questi test non ricalcolano la formula: se lo facessero, direbbero soltanto
   che il codice fa quello che fa. Verificano invece le tre PROPRIETA' per cui
   quella formula e' stata scelta — non satura, cresce sempre, ha un pavimento.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

const minuti = (ms) => Math.round(ms / 60000);

describe('rides/ride-duration — calcolo durata corsa (_getRideDurationMs)', () => {
    test('la durata cresce col prezzo e non si appiattisce mai', () => {
        const { sandbox } = freshEnv();
        /* La proprieta' che il tetto vecchio violava: due corse costose diverse
           devono durare diversamente. Con `Math.min(360, ...)` da 1.800€ in su
           erano tutte identiche. */
        const prezzi = [50, 100, 250, 500, 1000, 1800, 3000, 6000, 12000];
        const durate = prezzi.map((p) => minuti(sandbox._getRideDurationMs({ price: p })));

        for (let i = 1; i < durate.length; i++) {
            assert.ok(
                durate[i] > durate[i - 1],
                `${prezzi[i]}€ (${durate[i]} min) deve durare piu' di ${prezzi[i - 1]}€ (${durate[i - 1]} min)`
            );
        }
    });

    test('raddoppiare il prezzo non raddoppia il tempo: la scala e\' compressa', () => {
        const { sandbox } = freshEnv();
        /* E' il senso della radice quadrata. Con la formula lineare una corsa da
           2.000€ sarebbe durata dieci volte una da 200€ — cioe' oltre sei ore,
           ed e' per questo che era stato messo un tetto. Qui la crescita
           rallenta da sola e il tetto non serve piu'. */
        const d200 = minuti(sandbox._getRideDurationMs({ price: 200 }));
        const d2000 = minuti(sandbox._getRideDurationMs({ price: 2000 }));

        assert.ok(d2000 > d200, 'la corsa da 2.000€ deve comunque durare di piu\'');
        assert.ok(
            d2000 < d200 * 4,
            `dieci volte il prezzo non deve fare quattro volte il tempo (${d200} → ${d2000} min)`
        );
    });

    test('una corsa importante resta un impegno di ore, non di minuti', () => {
        const { sandbox } = freshEnv();
        /* Il contrario del test precedente, e serve entrambi: comprimere la
           scala non deve rendere tutte le corse brevi, altrimenti accodarne
           dieci tornerebbe gratis. */
        const d1000 = minuti(sandbox._getRideDurationMs({ price: 1000 }));
        assert.ok(d1000 >= 90, `una corsa da 1.000€ deve valere almeno un'ora e mezza, non ${d1000} min`);
        assert.ok(d1000 <= 240, `ma non deve bloccare un autista per piu' di quattro ore (${d1000} min)`);
    });

    test('pavimento di 10 minuti: nessuna corsa e\' istantanea', () => {
        const { sandbox } = freshEnv();
        for (const prezzo of [0, 1, 10, 30]) {
            assert.ok(
                minuti(sandbox._getRideDurationMs({ price: prezzo })) >= 10,
                `${prezzo}€ non deve scendere sotto i 10 minuti`
            );
        }
    });

    test('la priorita\' fra i campi del prezzo: sellingPrice, poi basePrice, poi price', () => {
        const { sandbox } = freshEnv();
        /* Conta perche' il prezzo di vendita e quello di listino divergono: se
           si leggesse il campo sbagliato, la durata non corrisponderebbe a
           quello che il giocatore ha davvero incassato. */
        const soloPrice = sandbox._getRideDurationMs({ price: 1000 });
        assert.equal(
            sandbox._getRideDurationMs({ sellingPrice: 1000, price: 100 }), soloPrice,
            'sellingPrice deve avere la precedenza su price'
        );
        assert.equal(
            sandbox._getRideDurationMs({ basePrice: 1000, price: 100 }), soloPrice,
            'basePrice deve avere la precedenza su price'
        );
        assert.equal(
            sandbox._getRideDurationMs({}), sandbox._getRideDurationMs({ price: 150 }),
            'senza prezzo deve valere il default di 150€'
        );
    });

    test('moltiplicatori per routeType (Airport, Rail, Transfer, Boat, Port)', () => {
        const { sandbox } = freshEnv();
        const base = minuti(sandbox._getRideDurationMs({ price: 400 }));

        for (const tipo of ['Airport', 'Rail', 'Transfer']) {
            assert.equal(
                minuti(sandbox._getRideDurationMs({ price: 400, routeType: tipo })),
                Math.round(base * 0.7),
                `routeType ${tipo} deve applicare il moltiplicatore 0.7`
            );
        }
        for (const tipo of ['Boat', 'Port']) {
            assert.equal(
                minuti(sandbox._getRideDurationMs({ price: 400, routeType: tipo })),
                Math.round(base * 1.3),
                `routeType ${tipo} deve applicare il moltiplicatore 1.3`
            );
        }
        assert.equal(
            minuti(sandbox._getRideDurationMs({ price: 400, routeType: 'City-to-City' })),
            base,
            'City-to-City deve mantenere la durata base'
        );
    });

    test('moltiplicatore interregionale (1.5x) tra regioni diverse', () => {
        const { sandbox } = freshEnv();
        const base = minuti(sandbox._getRideDurationMs({ price: 400 }));

        assert.equal(
            minuti(sandbox._getRideDurationMs({
                price: 400,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'toscana' },
            })),
            Math.round(base * 1.5),
            'viaggi fra regioni diverse devono applicare il moltiplicatore 1.5x'
        );

        assert.equal(
            minuti(sandbox._getRideDurationMs({
                price: 400,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' },
            })),
            base,
            'viaggi nella stessa regione non devono subire modifiche'
        );
    });
});
