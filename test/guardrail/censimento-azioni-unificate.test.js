'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'AZIONI.md');

function generateUnifiedDoc() {
    const allFiles = fs.readdirSync(ROOT).filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }

    const allJsFiles = allFiles.filter(f => f.endsWith('.js') && f !== 'sw.js' && f !== 'tailwind.config.js');

    // First pass: find all function declarations to identify valid alias targets
    const knownFunctions = new Set();
    for (const f of allJsFiles) {
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line) => {
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) { knownFunctions.add(m[1]); return; }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) { knownFunctions.add(m[1]); return; }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) { knownFunctions.add(m[1]); return; }
        });
    }

    // Second pass: map project definitions
    const projectDefs = new Map();

    for (const f of allJsFiles) {
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
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
            m = line.match(/^\s*window\.([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*;/);
            if (m) {
                const name = m[1];
                const target = m[2];
                if (knownFunctions.has(target)) {
                    if (!projectDefs.has(name)) projectDefs.set(name, []);
                    projectDefs.get(name).push({ file: f, line: lineNum, type: 'alias', target });
                }
                return;
            }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'var' });
                return;
            }
        });
    }

    const allEntries = [];
    const duplicates = [];
    const deadFunctions = [];

    for (const tf of allJsFiles) {
        const content = fileContents.get(tf);
        if (!content) continue;
        const lines = content.split('\n');

        const defs = [];
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) { defs.push({ name: m[1], line: lineNum, raw: line.trim() }); return; }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) { defs.push({ name: m[1], line: lineNum, raw: line.trim() }); return; }
            m = line.match(/^\s*window\.([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*;/);
            if (m && knownFunctions.has(m[2])) { defs.push({ name: m[1], line: lineNum, raw: line.trim() }); return; }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) { defs.push({ name: m[1], line: lineNum, raw: line.trim() }); return; }
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

            allEntries.push({
                name: d.name,
                file: tf,
                line: d.line,
                ceActStr,
                dupStr,
                moneyResult
            });
        }
    }

    // Sort entries alphabetically by function name
    allEntries.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        if (a.name !== b.name) return a.name < b.name ? -1 : 1;
        return a.file.localeCompare(b.file) || (a.line - b.line);
    });

    // Build the Markdown content
    let md = '# Registro delle azioni — un\'azione, una funzione\n\n';
    md += '> **Regola 4 del criterio uniforme.** Una stessa azione di gioco deve avere **una sola**\n';
    md += '> implementazione. Quando ne esistono due, prima o poi divergono in silenzio: prezzi diversi,\n';
    md += '> sconti diversi, e una che sincronizza col server mentre l\'altra no. È già successo.\n';
    md += '>\n';
    md += '> Prima di aggiungere una funzione che compra, vende, ripara, paga o premia: **cerca qui**.\n';
    md += '> Se l\'azione c\'è già, estendi quella. Se la aggiungi, scrivila qui.\n\n';
    md += 'Origine: analisi unificata completa dei 93 file del codebase (nucleo, moduli, interfacce).\n\n';
    md += '---\n\n';
    md += '## Azioni consolidate (fatto)\n\n';
    md += '| Azione | Funzione canonica | Ritirate | Note |\n';
    md += '|---|---|---|---|\n';
    md += '| Riparare la carrozzeria | `payToRepairCar` (engine.js) | ~~`repairVehicle`~~ (engine-fleet.js) | Prezzo da `repairCostFor()`, **fonte unica**. Le interfacce non devono ricopiare la formula |\n';
    md += '| Muovere denaro / DC / reputazione | `CE_money.*` (money.js) | `gameState.cash -=` diretto, `_addCash` | Sorvegliato da `test/guardrail/una-sola-porta.test.js` |\n';
    md += '| Effetti HQ | `hqAllEffects` (hq.js) | ~~`hqGetEffect`~~ | HQ dietro interruttore spento |\n';
    md += '| Schermate War Room / Province | `renderTabWarRoom` (war_room.js), `renderTabProvinces` (ui-ops.js) | ~~`window.renderTabProvinces = renderTabWarRoom`~~ | Nomi distinti, nessuna collisione di caricamento |\n';
    md += '| Tracciato rotte attive e traffico | `_updateActiveRouteLines` (map.js) | ~~`_updateActiveRouteLinesColored`~~ (ui-map-utils.js) | Supporto completo al traffico integrato in map.js |\n\n';
    md += '---\n\n';
    md += '## Azioni da consolidare (aperte)\n\n';
    md += 'Ordinate per gravità. Ognuna è un task.\n\n';
    md += '### Denaro non sincronizzato — 19 azioni confermate\n';
    md += '`engine-store.js` (12 funzioni DC), `engine-holding.js`, `engine-fleet.js`, `engine-drivers.js`,\n';
    md += '`engine-finance.js`, `contracts.js`, `daily-orders.js`. Vedi la lista `ECCEZIONI` in\n';
    md += '`test/guardrail/una-sola-porta.test.js`: è la lista di lavoro, e **può solo accorciarsi**.\n\n';
    md += '### Doppioni con prezzi divergenti\n\n';
    md += '| Azione | Implementazioni | Problema |\n';
    md += '|---|---|---|\n';
    md += '| Rifornire carburante | 6 (`buyStandardFuel`†, `buyBlackMarketFuel`†, `buyFuelForDepot`, `emergencyRefuel`, `fuelBoostDC`, item VTK) | 3 orfane; le vive non sincronizzano |\n';
    md += '| Azzerare stress autista | 6 | **5 prezzi diversi**: lo stesso effetto costa 2 DC o 25 DC |\n';
    md += '| Ripristinare energia CEO | 5 | La sola cablata (`energyBoostDC`) è l\'unica senza RPC → **energia gratis** |\n';
    md += '| Comprare un veicolo | 6 | `buyPrototypeCar` e `buyNpcCar` non chiamano il server |\n';
    md += '| Premiare `{cash, dc, rep, vtk}` | 5 | Solo `claimQuestReward` è completo; `claimDailyOrder` ha due bug |\n\n';
    md += '† orfana\n\n';
    md += '### Sistemi paralleli interi, entrambi vivi\n\n';
    md += '| Sistema | Locale (senza server) | Server | Dove si scontrano |\n';
    md += '|---|---|---|---|\n';
    md += '| Holding | `engine-holding.js` | `p2p-market.js` | Stessa tab `ui-investments.js` |\n';
    md += '| Consorzio | `alliances.js` | `p2p-render.js` | Tabelle DB diverse, stesso nome |\n';
    md += '| Azioni societarie / IPO | `engine-holding.js` | `p2p-market.js` | **Due scrittori per `gameState.companyIPO`** |\n\n';
    md += '---\n\n';
    md += '## Note sulle discrepanze tra registri precedenti\n\n';
    md += '- **`hqOpenBuildModal` vs `hqOpenBuildModalSlot`**: il registro iniziale segnalava collisione tra `hq-visual.js` e `hq.js`. La verifica sul codice reale dimostra che `hqOpenBuildModal` è stata sostituita da `hqOpenBuildModalSlot` (in `hq-visual.js:87`) e la vecchia variante da `_hqBuildFromList` (in `hq.js:373`), risolvendo la collisione.\n';
    md += '- **`listCarForSale`**: `p2p-market.js:60` sovrascrive `engine-fleet.js:414` (il registro iniziale riportava la vecchia riga 455; la verifica su file aggiornato conferma riga 414 come in `AZIONI-moduli.md`).\n';
    md += '- **`buyHRAutomation`**: presente sia come UI handler in `ui-ops.js:218` sia come RPC helper in `serverState.js:534`.\n';
    md += '- **`renderTabProvinces`**: separato da `renderTabWarRoom` in `war_room.js:240`; `ui-ops.js:88` e `:264` rimangono la sola schermata province.\n\n';
    md += '---\n\n';
    md += '## Tabella unificata delle funzioni\n\n';
    md += '| Funzione | Definizione | Chiamata da (data-ce-act) | Collisioni / Doppioni | Movimento denaro |\n';
    md += '|---|---|---|---|---|\n';

    for (const e of allEntries) {
        md += `| \`${e.name}\` | \`${e.file}:${e.line}\` | ${e.ceActStr} | ${e.dupStr} | ${e.moneyResult} |\n`;
    }

    md += '\n---\n\n';
    md += '## Funzioni che nessuno chiama\n\n';
    md += '| Funzione | Definizione | Note |\n';
    md += '|---|---|---|\n';
    for (const df of deadFunctions) {
        md += `| \`${df.name}\` | \`${df.file}:${df.line}\` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |\n`;
    }

    md += '\n---\n\n';
    md += '## Nomi definiti due volte\n\n';
    md += '| Nome | Definizione 1 | Definizione 2 / altre | Note |\n';
    md += '|---|---|---|---|\n';
    for (const dup of duplicates) {
        let note = '';
        if (dup.name === 'switchTab' || dup.name === 'updateUI' || dup.name === 'processDailyRoutines' || dup.name === 'resetGame' || dup.name === 'showNotification' || dup.name === 'saveGame' || dup.name === 'loadGame' || dup.name === 'renderTabHome' || dup.name === 'logToMap') {
            note = 'Decoratore / catena di rendering UI deliberata';
        } else if (dup.name === '_sb' || dup.name === '_uid' || dup.name === '_save' || dup.name === 'gs' || dup.name === '_kpi' || dup.name === '_gs' || dup.name === '_rides' || dup.name === 'rides' || dup.name === 'prestige' || dup.name === '_suppressCloudSave' || dup.name === 'currentSlotIndex') {
            note = 'Helper locale / variabile condivisa definita in più file';
        } else if (dup.name === 'listCarForSale') {
            note = 'P2P market (p2p-market.js) sovrascrive vendita flotta standard (engine-fleet.js)';
        } else if (dup.name === 'buyHRAutomation' || dup.name === 'hireDriver' || dup.name === 'fireDriver' || dup.name === 'takeLoan' || dup.name === 'repayLoan' || dup.name === 'buyInvestment' || dup.name === '_rpc') {
            note = 'Definizione locale vs serverState.js';
        }
        md += `| \`${dup.name}\` | \`${dup.f1}\` | \`${dup.f2}\` | ${note} |\n`;
    }
    md += '\n';

    return { md, allEntries, deadFunctions, duplicates };
}

// NOTA: il test non scrive su disco (un test guarda, non tocca).

describe('guardrail — registro unificato delle azioni (docs/AZIONI.md)', () => {
    test('il documento unificato esiste e mantiene il preambolo originale', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/AZIONI.md non esiste');
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('Regola 4 del criterio uniforme'), 'Manca il preambolo della Regola 4 in docs/AZIONI.md');
        assert.ok(testo.includes('Azioni consolidate (fatto)'), 'Manca la sezione Azioni consolidate');
        assert.ok(testo.includes('Azioni da consolidare (aperte)'), 'Manca la sezione Azioni da consolidare');
    });

    test('contiene la tabella unificata ordinata per nome di funzione', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('| Funzione | Definizione | Chiamata da (data-ce-act) | Collisioni / Doppioni | Movimento denaro |'), 'Manca la testata della tabella unificata');
    });

    test('contiene le due sezioni finali obbligatorie', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('Funzioni che nessuno chiama'), 'Manca la sezione Funzioni che nessuno chiama');
        assert.ok(testo.includes('Nomi definiti due volte'), 'Manca la sezione Nomi definiti due volte');
    });

    test('il documento unificato censisce tutte le funzioni del codebase (nucleo + moduli + interfaccia)', () => {
        const senzaRighe = (t) => t.replace(/:\d+/g, ':N');
        const scritto = senzaRighe(fs.readFileSync(DOC_PATH, 'utf8'));
        const nomiScritto = new Set([...scritto.matchAll(/\| `([A-Za-z_$][\w$]*)` \| `[^`]+` \|/g)].map(m => m[1]));
        assert.ok(nomiScritto.size > 500, `Attese oltre 500 funzioni unificate, trovate ${nomiScritto.size}`);
    });

    test('il documento elenca le stesse funzioni che il codice contiene oggi', () => {
        /* Aggiunto alla verifica per mutazione: fino ad allora questo guardrail
           leggeva docs/AZIONI.md senza mai confrontarlo col codice — una funzione
           nuova restava fuori dal registro e il test restava verde. Il confronto
           ignora i numeri di riga di proposito: cambiano a ogni modifica dei file
           e non c'entrano con quello che il guardrail sorveglia. */
        const generati = new Set(generateUnifiedDoc().allEntries.map(e => `${e.name} @ ${e.file}`));
        const senzaRighe = (t) => t.replace(/:\d+/g, ':N');
        const scritto = senzaRighe(fs.readFileSync(DOC_PATH, 'utf8'));
        const nelDocumento = new Set(
            [...scritto.matchAll(/\\| `([A-Za-z_$][\\w$]*)` \\| `([^`]+)` \\|/g)]
                .map(m => `${m[1]} @ ${m[2].replace(/:N$/, '')}`)
        );
        const mancanti = [...generati].filter(x => !nelDocumento.has(x));
        assert.deepEqual(mancanti.sort(), [],
            'Queste funzioni esistono nel codice ma non nel registro docs/AZIONI.md: va rigenerato a mano.');
    });

    test('i tre file di partenza esistono ancora', () => {
        assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'AZIONI-interfaccia.md')), 'docs/AZIONI-interfaccia.md deve esistere');
        assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'AZIONI-moduli.md')), 'docs/AZIONI-moduli.md deve esistere');
        assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'AZIONI.md')), 'docs/AZIONI.md deve esistere');
    });
});
