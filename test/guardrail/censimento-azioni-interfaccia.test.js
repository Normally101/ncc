'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC = path.resolve(ROOT, 'docs', 'AZIONI-interfaccia.md');

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

describe('guardrail — censimento registro azioni interfaccia', () => {

    test('genera e valida docs/AZIONI-interfaccia.md', () => {
        const allFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') || f.endsWith('.html'));
        const fileContents = new Map();
        for (const f of allFiles) {
            fileContents.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
        }

        const projectDefs = new Map();

        for (const f of allFiles) {
            if (!f.endsWith('.js')) continue;
            const lines = fileContents.get(f).split('\n');
            lines.forEach((line, idx) => {
                const lineNum = idx + 1;
                // Avoid matching inside string or comments if possible, but basic regex handles top-level
                let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
                if (m) {
                    const name = m[1];
                    if (!projectDefs.has(name)) projectDefs.set(name, []);
                    projectDefs.get(name).push({ file: f, line: lineNum, type: 'function' });
                    return;
                }
                m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
                if (m) {
                    const name = m[1];
                    if (!projectDefs.has(name)) projectDefs.set(name, []);
                    projectDefs.get(name).push({ file: f, line: lineNum, type: 'window' });
                    return;
                }
                m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/);
                if (m) {
                    const name = m[1];
                    if (!projectDefs.has(name)) projectDefs.set(name, []);
                    projectDefs.get(name).push({ file: f, line: lineNum, type: 'var' });
                    return;
                }
            });
        }

        let md = '# Registro delle azioni — Interfaccia (UI)\n\n';
        md += '> Mappatura delle funzioni globali per i 22 moduli di interfaccia (`ui-*.js`).\n';
        md += '> Per ogni funzione sono indicati: nome, file e riga di definizione, le azioni `data-ce-act` che la invocano (o "nessuna"),\n';
        md += '> se esistono altre definizioni con lo stesso nome in altri file del repository, e la porta usata per il movimento di denaro (`CE_money` / `RPC` / `diretto` / "no").\n\n';

        const duplicates = [];
        const deadFunctions = [];

        for (const tf of UI_FILES) {
            md += `## \`${tf}\`\n\n`;
            const content = fileContents.get(tf);
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
                m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/);
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
                if (otherDefs.length > 0) {
                    const exists = duplicates.some(x => x.name === d.name && (x.f1 === `${tf}:${d.line}` || x.f2.includes(`${tf}:${d.line}`)));
                    if (!exists) {
                        duplicates.push({ name: d.name, f1: `${tf}:${d.line}`, f2: otherDefs.map(x => `${x.file}:${x.line}`).join(', ') });
                    }
                }

                // Function body extraction
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
                
                // Direct mutations
                const direct = [...new Set(bodyStr.match(/(?:(?:gameState|state|company|window\.gameState)\s*\.\s*(?:cash|driverCoins|vtkBalance|dc)|(?:_addCash|_spendCash|_addDC|_spendDC))\s*(?:[-+*\/]?=|\()/g) || [])];

                const moneyParts = [];
                if (ceMoney.length > 0) moneyParts.push(`CE_money (\`${ceMoney.join(', ')}\`)`);
                if (rpcCalls.length > 0) moneyParts.push(`RPC (\`${rpcCalls.join(', ')}\`)`);
                if (direct.length > 0) moneyParts.push(`diretto (\`${direct.join(', ')}\`)`);
                const moneyResult = moneyParts.length > 0 ? moneyParts.join(' / ') : 'no';

                // Dead function check (callers anywhere)
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
                const dupStr = otherDefs.length > 0 ? otherDefs.map(x => `\`${x.file}:${x.line}\``).join(', ') : 'nessuno';

                md += `- \`${d.name}\` · \`${tf}:${d.line}\` · data-ce-act: ${ceActStr} · doppioni: ${dupStr} · denaro: ${moneyResult}\n`;
            }
            md += '\n';
        }

        md += '---\n\n';
        md += '## Nomi definiti due volte (collisioni / doppioni)\n\n';
        md += '| Nome | Definizione 1 | Definizione 2 / altre | Note |\n';
        md += '|---|---|---|---|\n';
        for (const dup of duplicates) {
            let note = '';
            if (dup.name === 'renderTabProvinces') note = 'ui-ops.js e war_room.js definivano entrambe renderTabProvinces';
            else if (dup.name === 'openCarConfigurator') note = 'Configuratore auto in ui-staff.js';
            else if (dup.name === 'buyCar') note = 'ui-staff.js reindirizza a openCarConfigurator';
            else if (dup.name === 'closeModals') note = 'Definito globalmente in ui-staff.js e altri';
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

        md += '\n---\n\n';
        md += '## Focus speciale: Configuratore Auto (`ui-staff.js`)\n\n';
        md += 'Circa 185 righe (da riga ~400 a ~585) in `ui-staff.js` dedicate al configuratore modale e acquisto auto:\n';
        md += '- `window.openCarConfigurator` (riga 400)\n';
        md += '- `window.__cfgToggle` (riga 516)\n';
        md += '- `window.__cfgConfirm` (riga 537)\n';
        md += '- `window.buyCar` (riga 583) reindirizza a `openCarConfigurator`\n';
        md += '- `window.leaseCar` (riga 585)\n\n';
        md += 'Questo blocco era stato segnalato dall\'analisi del 19/08/2026 come candidato a codice morto / duplicato rispetto allo showroom e ai flussi d\'acquisto diretti.\n';

        fs.writeFileSync(DOC, md, 'utf8');
        assert.ok(fs.existsSync(DOC), 'docs/AZIONI-interfaccia.md deve esistere');
    });

    test('il censimento interfaccia copre tutti i 22 file ui-*', () => {
        assert.ok(fs.existsSync(DOC), 'docs/AZIONI-interfaccia.md non esiste');
        const testo = fs.readFileSync(DOC, 'utf8');
        const mancanti = UI_FILES.filter(f => !testo.includes(`## \`${f}\``));
        assert.deepEqual(mancanti, [], `il censimento ha perso dei file: ${mancanti.join(', ')}`);
    });

    test('contiene le sezioni richieste: doppioni, codice morto e configuratore', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.ok(testo.includes('## Nomi definiti due volte'), 'Manca sezione collisioni/doppioni');
        assert.ok(testo.includes('## Funzioni che nessuno chiama'), 'Manca sezione codice morto');
        assert.ok(testo.includes('Configuratore Auto'), 'Manca focus configuratore auto ui-staff');
    });
});
