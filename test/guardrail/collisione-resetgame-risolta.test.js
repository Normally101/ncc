'use strict';
/* ============================================================================
   guardrail — la collisione su window.resetGame resta risolta

   Perche' questo test esiste:
   resetGame era definita da DUE file con comportamenti divergenti:
     - saveSystem.js: versione cloud-aware — blocca i salvataggi
       (_suppressCloudSave), mette in pausa il gioco, pulisce TUTTI e tre gli
       slot locali, le chiavi tutorial, il timestamp di sync cloud, e (se
       connesso) cancella la riga cloud e azzera il cash autoritativo;
     - engine.js: stub legacy che cancellava SOLO chauffeurEmpireSlot_1 e
       ricaricava — senza bloccare beforeunload/autosave, che rimettono sul
       cloud lo stato che si voleva cancellare. E' esattamente la trappola
       descritta dal commento "BUG 3 fix" in saveSystem.js ("the catch-22
       that made resets never stick").
   Nessuna delle due avvolge l'altra: NON e' una catena di decorator, e' una
   riscrittura divergente — vince l'ultima caricata, in silenzio.

   Con <script defer> index.html esegue saveSystem.js prima di engine.js, quindi
   lo stub non veniva mai installato: codice morto, ma una mina — basta cambiare
   l'ordine dei tag perche' il reset torni a non funzionare senza alcun errore.

   Decisione: una sola definizione, quella cloud-aware di saveSystem.js.

   Il test carica i DUE file insieme (stesso ordine di index.html) in un solo
   contesto VM e pretende che:
     1. staticamente, UN SOLO file del gioco assegni window.resetGame;
     2. index.html esegua saveSystem.js prima di engine.js (il vincolo che
        rende sicura la definizione unica);
     3. window.resetGame sia raggiungibile col suo nome, con la firma giusta
        (nessun argomento) e il contratto giusto: confirm negato non tocca
        niente; confermato, blocca i salvataggi, mette in pausa, pulisce tutti
        i posti giusti e ricarica una volta sola.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/** I file di gioco, nell'ordine in cui index.html li carica. */
function fileInOrdine() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return [...html.matchAll(/src="([^"?]+\.js)/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(f => !f.startsWith('http') && fs.existsSync(path.join(ROOT, f)));
}

/** Toglie commenti: evita di scambiare un esempio in un commento per codice. */
function soloCodice(testo) {
    return testo
        .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** I file di gioco che assegnano window.<nome> (=, non ==/=>). */
function fileCheAssegnano(nome) {
    const regex = new RegExp(`(?:^|[^.\\w$])window\\.${nome}\\s*=(?!=|>)`);
    return fileInOrdine().filter(f =>
        regex.test(soloCodice(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
}

describe('guardrail — la collisione su window.resetGame resta risolta', () => {

    test('un solo file assegna window.resetGame (lo stub legacy di engine.js non c\u2019e\u0300 piu\u0300)', () => {
        const file = fileCheAssegnano('resetGame');
        assert.deepEqual(file, ['saveSystem.js'],
            'window.resetGame deve essere assegnato da UN solo file; trovati: ' +
            file.join(', ') + '\n' +
            'Lo stub legacy di engine.js cancellava solo chauffeurEmpireSlot_1, senza\n' +
            'bloccare i salvataggi ne\u0301 pulire il cloud: e\u0300 la variante rotta che il\n' +
            'commento "BUG 3 fix" in saveSystem.js descrive come la trappola storica.\n' +
            'Se serve un fallback per chiamate anticipate, deve delegare alla versione\n' +
            'vera, non riscriverla diversa.');
    });

    test('index.html esegue saveSystem.js prima di engine.js (vincolo che rende sicura la definizione unica)', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const idxSave = html.indexOf('src="saveSystem.js');
        const idxEngine = html.indexOf('src="engine.js');
        assert.ok(idxSave !== -1, 'saveSystem.js non trovato in index.html');
        assert.ok(idxEngine !== -1, 'engine.js non trovato in index.html');
        assert.ok(idxSave < idxEngine,
            'Con defer l\'esecuzione segue l\'ordine del documento: saveSystem.js (pos ' +
            idxSave + ') deve precedere engine.js (pos ' + idxEngine +
            ') perche\u0300 window.resetGame nasce in saveSystem.js.');
    });

    test('caricando saveSystem.js + engine.js insieme: resetGame e\u0300 raggiungibile, zero argomenti, e scrive nei posti giusti', async () => {
        const env = createGameEnv(['saveSystem.js', 'engine.js']);
        const s = env.sandbox;

        // raggiungibile col suo nome; la firma giusta e\u0300: nessun argomento dichiarato
        assert.equal(typeof s.resetGame, 'function', 'window.resetGame deve esistere dopo il caricamento dei due file');
        assert.equal(s.resetGame.length, 0, 'resetGame non prende argomenti');

        // stato pre-reset: un salvataggio per slot, chiave tutorial, timestamp di sync
        const SLOTS = ['chauffeurEmpireSlot_1', 'chauffeurEmpireSlot_2', 'chauffeurEmpireSlot_3'];
        SLOTS.forEach(k => s.localStorage.setItem(k, '{}'));
        s.localStorage.setItem('chauffeurEmpireTutorialDone_v3', '1');
        s.localStorage.setItem('_cloudSyncTs_0', '123');
        s.gameState.paused = false;

        let reloads = 0;
        s.location.reload = () => { reloads++; };

        // confirm negato: il reset non tocca niente e non ricarica
        s.confirm = () => false;
        await s.resetGame();
        assert.equal(reloads, 0, 'con confirm negato non deve ricaricare');
        assert.equal(s.localStorage.getItem('chauffeurEmpireSlot_1'), '{}', 'con confirm negato non deve cancellare');
        assert.notEqual(s._suppressCloudSave, true, 'con confirm negato non deve bloccare i salvataggi');
        assert.equal(s.gameState.paused, false, 'con confirm negato non deve mettere in pausa');

        // confermato: blocca i salvataggi, pausa, pulisce TUTTI i posti giusti, una sola ricarica
        s.confirm = () => true;
        await s.resetGame();
        assert.equal(s._suppressCloudSave, true, 'deve bloccare beforeunload/autosave durante il reset (BUG 3)');
        assert.equal(s.gameState.paused, true, 'deve mettere in pausa il gioco');
        for (const k of SLOTS) {
            assert.equal(s.localStorage.getItem(k), null, k + ' deve essere cancellato');
        }
        assert.equal(s.localStorage.getItem('chauffeurEmpireTutorialDone_v3'), null, 'la chiave tutorial deve essere cancellata');
        assert.equal(s.localStorage.getItem('_cloudSyncTs_0'), null, 'il timestamp di sync cloud deve essere cancellato');
        assert.equal(reloads, 1, 'deve ricaricare una volta sola');

        env.stopAllIntervals();
    });
});
