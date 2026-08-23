'use strict';
/* Guardrail "il tetto della reputazione" — sostituisce il vecchio test di
   reputation-cap.js (funzione parallela mai usata, eliminata): la porta
   unica e' gia' CE_money.addReputation in money.js, quindi qui si sorveglia
   che NESSUN altro file ricalcoli a mano il tetto `5.0 + prestige`.
   ROSSO se il pattern letterale riappare fuori da money.js. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Pattern del tetto copiato a mano, nelle varianti viste nel repo
// (`gameState.prestige` nei file di gioco, `gs.prestige` dentro money.js).
const PATTERN = /5\.0\s*\+\s*\(\s*(?:gameState|gs|g)\.prestige/;

// Solo i .js della radice: niente node_modules, niente questa cartella.
function fileJsRadice() {
    return fs.readdirSync(ROOT)
        .filter(function (f) { return f.endsWith('.js'); })
        .map(function (f) { return path.join(ROOT, f); });
}

test('nessun file calcola il tetto reputazione fuori da money.js', function () {
    const colpevoli = [];
    for (const file of fileJsRadice()) {
        if (path.basename(file) === 'money.js') continue;
        const testo = fs.readFileSync(file, 'utf8');
        if (PATTERN.test(testo)) colpevoli.push(path.relative(ROOT, file));
    }
    assert.deepStrictEqual(
        colpevoli,
        [],
        'Tetto reputazione copiato a mano (usa CE_money.addReputation): ' +
        colpevoli.join(', ')
    );
});

test("la porta CE_money.addReputation esiste ed e' esportata da money.js", function () {
    // Serve per il guardrail sopra: se qualcuno rimuove la porta,
    // i siti chiamanti resterebbero senza destinazione legale.
    const money = fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8');
    assert.match(money, /addReputation\s*[:=]/);
});

test("addReputation applica davvero tetto 5.0+prestige e pavimento 0", function () {
    // Prova comportamentale sulla porta VERA (money.js nel banco): se qualcuno
    // sostituisce la porta con un calcolo a mano sbagliato, questo diventa rosso.
    const { createGameEnv } = require(path.join(ROOT, 'test-support', 'game-env.js'));
    const { sandbox } = createGameEnv(['money.js']);
    sandbox.window.gameState = { prestige: 2, reputation: 6.9 };   // tetto = 7
    assert.strictEqual(sandbox.CE_money.addReputation(0.3), true);
    assert.strictEqual(sandbox.gameState.reputation, 7, 'il tetto con prestigio deve valere 7');
    sandbox.window.gameState.reputation = 0.1;
    sandbox.CE_money.addReputation(-1);
    assert.strictEqual(sandbox.gameState.reputation, 0, 'pavimento a 0');
});

test("reputazioneDopo e' pura: calcola senza toccare lo stato ricevuto", function () {
    const { createGameEnv } = require(path.join(ROOT, 'test-support', 'game-env.js'));
    const { sandbox } = createGameEnv(['money.js']);
    sandbox.window.gameState = { prestige: 0, reputation: 0 };
    const copia = { prestige: 1, reputation: 5.9 };                // tetto = 6
    assert.strictEqual(sandbox.CE_money.reputazioneDopo(copia, 0.2), 6);
    assert.strictEqual(copia.reputation, 5.9, 'la funzione pura non deve mutare lo stato');
});

test("nessuna porta parallela (CE_reputationCap) da nessuna parte", function () {
    // reputation-cap.js e' stato svuotato (husk): qui si verifica che nessun
    // file definisca o richiami piu' l'implementazione parallela del tetto.
    for (const file of fileJsRadice()) {
        const testo = fs.readFileSync(file, 'utf8');
        assert.ok(
            !/CE_reputationCap/.test(testo),
            path.relative(ROOT, file) + ' contiene ancora la porta parallela'
        );
    }
});
