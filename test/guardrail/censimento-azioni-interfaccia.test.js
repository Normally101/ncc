const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'AZIONI-interfaccia.md');

const UI_FILES = [
    'ui-career.js',
    'ui-dispatch.js',
    'ui-emails.js',
    'ui-finance.js',
    'ui-fleet.js',
    'ui-help.js',
    'ui-home.js',
    'ui-hub.js',
    'ui-investments.js',
    'ui-landing.js',
    'ui-legal.js',
    'ui-lifestyle.js',
    'ui-map-utils.js',
    'ui-market.js',
    'ui-marketing.js',
    'ui-ops.js',
    'ui-politics.js',
    'ui-ranking.js',
    'ui-realestate.js',
    'ui-sidebar.js',
    'ui-staff.js',
    'ui-store.js'
];

function generateDoc() {
    const allFiles = fs.readdirSync(ROOT).filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }

    // Map all function definitions across all .js files
    const projectDefs = new Map();

    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            // function foo(
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'function' });
                return;
            }
            // window.foo = function / () =>
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'window' });
                return;
            }
            // window.foo = bar;
            m = line.match(/^\s*window\.([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*;/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'alias', target: m[2] });
                return;
            }
            // top level var/let/const foo = function / () =>
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'var' });
                return;
            }
        });
    }

    let md = '# Registro delle azioni — Interfaccia (file `ui-*.js`)\n\n';
    md += '> Mappatura delle funzioni globali per i 22 file di interfaccia (`ui-*.js`).\n';
    md += '> Per ogni funzione sono indicati: nome, file e riga di definizione, le azioni `data-ce-act` che la invocano (o "nessuna"),\n';
    md += '> se esistono altre definizioni con lo stesso nome in altri file del repository, e la porta usata per il movimento di denaro (`CE_money` / `RPC` / `diretto` / "no").\n\n';

    const duplicates = [];
    const deadFunctions = [];

    for (const tf of UI_FILES) {
        md += `## \`${tf}\`\n\n`;
        const content = fileContents.get(tf);
        if (!content) continue;
        const lines = content.split('\n');

        const defs = [];
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                defs.push({ name: m[1], line: lineNum, raw: line.trim() });
                return;
            }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                defs.push({ name: m[1], line: lineNum, raw: line.trim() });
                return;
            }
            m = line.match(/^\s*window\.([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*;/);
            if (m) {
                defs.push({ name: m[1], line: lineNum, raw: line.trim() });
                return;
            }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) {
                defs.push({ name: m[1], line: lineNum, raw: line.trim() });
                return;
            }
        });

        for (const d of defs) {
            // Find data-ce-act callers
            const ceActCallers = [];
            for (const [f, c] of fileContents.entries()) {
                const re1 = new RegExp(`ceAct\\(\\s*['"]${d.name}['"]`, 'g');
                const re2 = new RegExp(`data-ce-act=['"]${d.name}['"]`, 'g');
                const re3 = new RegExp(`ceThen\\(\\s*['"]${d.name}['"]`, 'g');
                const re4 = new RegExp(`ceThen\\([^,]+,\\s*['"]${d.name}['"]`, 'g');
                const re5 = new RegExp(`ceSetRender\\([^,]+,[^,]+,[^,]+,\\s*['"]${d.name}['"]`, 'g');
                if (re1.test(c) || re2.test(c) || re3.test(c) || re4.test(c) || re5.test(c)) {
                    ceActCallers.push(f);
                }
            }

            // Duplicates
            const allOfName = projectDefs.get(d.name) || [];
            const otherDefs = allOfName.filter(x => !(x.file === tf && x.line === d.line));
            const externalDefs = otherDefs.filter(x => x.file !== tf);

            if (externalDefs.length > 0) {
                const exists = duplicates.some(x => x.name === d.name && (x.f1 === tf || x.f2 === tf));
                if (!exists) {
                    duplicates.push({
                        name: d.name,
                        f1: `${tf}:${d.line}`,
                        f2: externalDefs.map(x => `${x.file}:${x.line}`).join(', ')
                    });
                }
            }

            // Function body analysis
            let body = [];
            let braceCount = 0;
            let started = false;
            for (let i = d.line - 1; i < lines.length; i++) {
                const l = lines[i];
                body.push(l);
                for (let c of l) {
                    if (c === '{') { braceCount++; started = true; }
                    else if (c === '}') { braceCount--; }
                }
                if (started && braceCount <= 0) break;
            }
            const bodyStr = body.join('\n');

            // Money check
            const ceMoney = [...new Set((bodyStr.match(/CE_money\.([a-zA-Z0-9_$]+)/g) || []).map(x => x.replace('CE_money.', '')))];
            const rpcCalls = [...new Set((bodyStr.match(/\.rpc\(\s*['"]([a-zA-Z0-9_$]+)['"]/g) || []).map(x => x.match(/['"]([a-zA-Z0-9_$]+)['"]/)[1]))];
            
            // Check direct cash/coins/rep/vtk mutations
            const direct = [...new Set(bodyStr.match(/(?:(?:gameState|state|company|window\.gameState)\s*\.\s*(?:cash|driverCoins|vtkBalance|dc)|(?:_addCash|_spendCash|_addDC|_spendDC))\s*(?:[-+*\/]?=|\()/g) || [])];

            const moneyParts = [];
            if (ceMoney.length > 0) moneyParts.push(`CE_money (\`${ceMoney.join(', ')}\`)`);
            if (rpcCalls.length > 0) moneyParts.push(`RPC (\`${rpcCalls.join(', ')}\`)`);
            if (direct.length > 0) moneyParts.push(`diretto (\`${direct.join(', ')}\`)`);
            const moneyResult = moneyParts.length > 0 ? moneyParts.join(' / ') : 'no';

            // Check if called anywhere
            let totalCalls = 0;
            const callerFiles = [];
            const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
            for (const [f, c] of fileContents.entries()) {
                const fLines = c.split('\n');
                fLines.forEach((fl, idx) => {
                    const lNum = idx + 1;
                    if (f === tf && lNum === d.line) return;
                    if (wordRe.test(fl)) {
                        totalCalls++;
                        if (!callerFiles.includes(f)) callerFiles.push(f);
                    }
                });
            }

            if (totalCalls === 0) {
                deadFunctions.push({ name: d.name, file: tf, line: d.line });
            }

            const ceActStr = ceActCallers.length > 0 ? `\`${d.name}\` (${ceActCallers.map(f => `\`${f}\``).join(', ')})` : 'nessuna';
            const dupStr = externalDefs.length > 0 ? externalDefs.map(x => `\`${x.file}:${x.line}\``).join(', ') : 'nessuno';

            md += `- \`${d.name}\` · \`${tf}:${d.line}\` · data-ce-act: ${ceActStr} · doppioni: ${dupStr} · denaro: ${moneyResult}\n`;
        }
        md += '\n';
    }

    md += '---\n\n';
    md += '## Note speciali\n\n';
    md += '### Configuratore auto in `ui-staff.js`\n';
    md += 'Il vecchio configuratore auto (circa 185 righe con `openCarConfigurator`, `__cfgSel`, `__cfgToggle`, `__cfgConfirm`, `buyCar`, `leaseCar`) è stato completamente rimosso dal codebase ed è sostituito dal modulo `showroom.js`. Il guardrail `test/guardrail/ui-staff-configuratore-rimosso.test.js` ne certifica l\'assenza.\n\n';

    md += '---\n\n';
    md += '## Nomi definiti due volte (collisioni / doppioni)\n\n';
    md += '| Nome | Definizione 1 | Definizione 2 / altre | Note |\n';
    md += '|---|---|---|---|\n';
    for (const dup of duplicates) {
        let note = '';
        if (dup.name === 'renderTabProvinces') note = 'ui-ops.js e war_room.js definivano lo stesso nome; risolto/separato da renderTabWarRoom';
        else if (dup.name === 'switchTab' || dup.name === 'updateUI' || dup.name === 'renderTabHome') note = 'Decoratore / catena di rendering UI deliberata';
        else if (dup.name === 'claimQuestReward') note = 'Invocazione/alias';
        md += `| \`${dup.name}\` | \`${dup.f1}\` | \`${dup.f2}\` | ${note} |\n`;
    }

    md += '\n---\n\n';
    md += '## Funzioni che nessuno chiama (codice morto)\n\n';
    md += '| Funzione | Definizione | Note |\n';
    md += '|---|---|---|\n';
    for (const df of deadFunctions) {
        let note = 'Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act)';
        md += `| \`${df.name}\` | \`${df.file}:${df.line}\` | ${note} |\n`;
    }
    md += '\n';

    /* NON si scrive il file.
     *
     * Fino al 22/08 questa riga era `fs.writeFileSync(DOC_PATH, md)`, e ha fatto
     * un danno grosso e invisibile: ogni lavoro dell'agente esegue `npm test`,
     * il test riscriveva il documento con i numeri di riga aggiornati, il ramo
     * se lo portava dietro, e il cancello lo respingeva con «non si unisce a
     * main senza conflitti». Centocinquantadue lavori respinti per questo, e
     * circa 115 euro di modello spesi per niente.
     *
     * C'era anche un difetto piu' banale: il test scriveva il file e poi
     * verificava il file appena scritto, quindi non poteva fallire mai.
     *
     * Un test guarda, non tocca. Il documento si rigenera a mano quando serve. */
    return { md, duplicates, deadFunctions };
}

describe('guardrail — censimento azioni interfaccia (ui-*.js)', () => {

    test('il documento esiste e non lo riscrive il test', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/AZIONI-interfaccia.md non esiste');
        const prima = fs.readFileSync(DOC_PATH, 'utf8');
        generateDoc();
        assert.equal(fs.readFileSync(DOC_PATH, 'utf8'), prima,
            'Il test ha modificato docs/AZIONI-interfaccia.md. Un test guarda, non tocca:\n' +
            'ogni ramo si porterebbe dietro la modifica e verrebbe respinto per conflitto.');
    });

    test('il documento elenca le stesse funzioni che il codice contiene oggi', () => {
        /* Il confronto ignora i numeri di riga di proposito: cambiano a ogni
           modifica di un file, e farebbero diventare rosso il test per motivi
           che non c'entrano niente con quello che sorveglia. */
        const senzaRighe = (t) => t.replace(/:\d+/g, ':N');
        const generato = senzaRighe(generateDoc().md);
        const scritto  = senzaRighe(fs.readFileSync(DOC_PATH, 'utf8'));
        const nomi = (t) => new Set([...t.matchAll(/`([A-Za-z_$][\w$]*)` ·/g)].map(m => m[1]));
        const nelCodice = nomi(generato), nelDocumento = nomi(scritto);
        const mancanti = [...nelCodice].filter(x => !nelDocumento.has(x));
        assert.deepEqual(mancanti, [],
            'Queste funzioni esistono nel codice ma non nel registro: va rigenerato a mano.');
    });

    test('il documento censisce tutti i 22 file ui-*.js', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        for (const f of UI_FILES) {
            assert.ok(content.includes(`## \`${f}\``), `Manca la sezione per ${f} in docs/AZIONI-interfaccia.md`);
        }
    });

    test('contiene le sezioni obbligatorie (doppioni, codice morto, configuratore staff)', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('Nomi definiti due volte'), 'Manca la sezione collisioni/doppioni');
        assert.ok(content.includes('Funzioni che nessuno chiama'), 'Manca la sezione codice morto');
        assert.ok(content.includes('Configuratore auto in `ui-staff.js`'), 'Manca la nota sul configuratore ui-staff.js');
    });

    test('la porta del denaro registrata coincide con quella del codice di oggi', () => {
        /* Verificato per mutazione il 22/08: bastava aggiungere una
           CE_money.spend() dentro una funzione ui gia' censita perché il
           registro diventasse falso (`denaro: no` al posto di CE_money) senza
           che nessun test lo vedesse: il confronto sopra guarda solo i NOMI,
           non cosa dice il registro di ognuna. Qui si confronta anche la
           colonna `denaro:`, ignorando i numeri di riga come sopra. */
        const senzaRighe = (t) => t.replace(/:\d+/g, ':N');
        const generato = senzaRighe(generateDoc().md);
        const scritto  = senzaRighe(fs.readFileSync(DOC_PATH, 'utf8'));
        const porte = (t) => new Map([...t.matchAll(/^- `([A-Za-z0-9_$]+)` · .*· denaro: (.*)$/gm)]
            .map(m => [m[1], m[2].trim()]));
        const nelCodice = porte(generato), nelDocumento = porte(scritto);
        const diverse = [...nelCodice]
            .filter(([nome, porta]) => nelDocumento.get(nome) !== porta)
            .map(([nome, porta]) => `${nome}: registro dice "${nelDocumento.get(nome)}", il codice fa "${porta}"`);
        assert.deepEqual(diverse, [],
            'La colonna denaro del registro non corrisponde al codice: va rigenerato a mano.');
    });
});
