const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test('elenca funzioni morte nel codebase', () => {
    const allFiles = fs.readdirSync(ROOT).filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }

    const testFiles = [];
    function readDirR(dir) {
        for (const item of fs.readdirSync(dir)) {
            const full = path.join(dir, item);
            if (fs.statSync(full).isDirectory()) readDirR(full);
            else if (item.endsWith('.js')) testFiles.push(full);
        }
    }
    readDirR(path.join(ROOT, 'test'));

    const allTestContents = testFiles.map(tf => fs.readFileSync(tf, 'utf8')).join('\n');

    const defs = [];
    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js' || f === 'config.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                defs.push({ name: m[1], file: f, line: lineNum });
                return;
            }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                defs.push({ name: m[1], file: f, line: lineNum });
                return;
            }
        });
    }

    const dead = [];
    for (const d of defs) {
        /* DUE regex, non una sola con il flag `g` riusata per entrambi gli usi.
           Il flag `g` fa avanzare `lastIndex` fra una chiamata e l'altra, e con
           `.test()` dentro un ciclo su righe diverse questo faceva SALTARE dei
           riferimenti: il censimento dichiarava morte funzioni che avevano
           chiamanti veri (il 28/08 dava per morta `showSlotSelector`, che e'
           chiamata da syncManager.js:177 e saveSystem.js:272). Un censimento che
           produce falsi positivi e' peggio di nessun censimento: qualcuno
           cancella codice vivo fidandosi. */
        const wordRe   = new RegExp(`\\b${d.name}\\b`);        // per .test(), senza `g`
        const wordReG  = new RegExp(`\\b${d.name}\\b`, 'g');   // per .match(), con `g`
        let prodCalls = 0;
        let testCalls = 0;
        for (const [f, c] of fileContents.entries()) {
            const lines = c.split('\n');
            lines.forEach((l, idx) => {
                if (f === d.file && idx + 1 === d.line) return;
                if (wordRe.test(l)) prodCalls++;
            });
        }
        const tMatches = allTestContents.match(wordReG);
        testCalls = tMatches ? tMatches.length : 0;

        if (prodCalls === 0) {
            dead.push({ name: d.name, file: d.file, line: d.line, prodCalls, testCalls });
        }
    }

    /* ── TRIAGE DEL 28/08/2026 — leggere PRIMA di cancellare qualcosa ─────────
       Le 30 voci trovate sono state guardate una per una. Non sono la stessa
       cosa e non vanno trattate allo stesso modo.

       GRUPPO A — nove funzionalita' COMPLETE E TESTATE che nessun pulsante
       raggiunge. Non sono codice morto: sono contenuto scollegato. Cancellarle
       butterebbe via roba che funziona.
         skipAcademyTraining  (engine-drivers.js:116)  salta l'addestramento, 5 DC
         assignSpecialty      (engine-drivers.js:185)  assegna una specialita'
         returnToHub          (engine-fleet.js:201)    richiama un veicolo all'hub
         applyVehicleSkin     (engine-fleet.js:269)    livrea del veicolo
         terminateLease       (engine-fleet.js:283)    chiude un leasing
         skipConstruction     (engine-store.js:22)     salta un cantiere, DC
         wakeDriverDC         (engine-store.js:49)     sveglia un autista, DC
         instaHealDC          (engine-store.js:76)     cura un autista, DC
         _listCompanyIPO_NPC  (engine-holding.js:93)   IPO con contropartita NPC
       Quattro spendono Driver Coins: e' monetizzazione gia' costruita e mai
       collegata. Serve una decisione di prodotto (le vogliamo?), non una pulizia.

       GRUPPO B — quindici davvero senza riferimenti, verificate anche con una
       ricerca indipendente da questo censimento. NON sono state cancellate, e
       il motivo e' che il guadagno e' minimo e il rischio no:
         - `pushLeaderboardNow` e `forceCloudSave` (saveSystem.js) stanno sotto
           un commento «PUBLIC API»: sono esposte apposta, forse per l'uso da
           console. Toglierle e' una decisione, non una pulizia.
         - `getRealWeatherForProvince` e `_realWeatherGetTrafficMult` sono
           aiutanti interni di weather_real.js, che e' un sistema VIVO
           (realWeatherRefresh/Init/renderPanel hanno chiamanti).
         - `getRoutesByRegion`, `getRouteById`, `isVeniceIslandHotel` sono
           accessori in coda a routesDB.js, 527 KB di sole tabelle.
         - le altre sono singole funzioni da poche righe.
       In tutto sono ~80 righe su 2,6 MB di JavaScript. Cancellarle non rende
       il codice piu' leggibile in modo percepibile, e ogni cancellazione e'
       un'occasione di rompere qualcosa che il censimento non vede (e' gia'
       successo con `showSlotSelector`, vedi sopra).

       Se un giorno si decide di ripulire: rifare la verifica indipendente,
       non fidarsi di questa lista, che invecchia. ─────────────────────────── */

    console.log('--- FUNZIONI MORTE TROVATE ---');
    for (const d of dead) {
        console.log(`${d.file}:${d.line} -> ${d.name} (chiamate prod: ${d.prodCalls}, chiamate test: ${d.testCalls})`);
    }
});
