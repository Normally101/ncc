const test = require('node:test');
const fs = require('node:fs');

test('generate AZIONI-moduli.md', () => {
    const targetFiles = [
        'p2p-market.js',
        'p2p-render.js',
        'vtk-market.js',
        'crypto.js',
        'auctions.js',
        'alliances.js',
        'hostile_takeover.js',
        'infrastructure.js',
        'tourism.js',
        'b2b.js',
        'contracts.js',
        'nemesis.js',
        'black_ops.js',
        'vip-clients.js',
        'vip-buffs.js',
        'showroom.js',
        'vanity.js',
        'war_room.js',
        'hq.js',
        'hq-visual.js',
        'quests.js',
        'daily-orders.js',
        'vittorio.js',
        'driver_skills.js'
    ];

    const allFiles = fs.readdirSync('.').filter(f => f.endsWith('.js') || f.endsWith('.html'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const projectDefs = new Map();

    for (const f of allFiles) {
        if (!f.endsWith('.js')) continue;
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
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/);
            if (m) {
                const name = m[1];
                if (!projectDefs.has(name)) projectDefs.set(name, []);
                projectDefs.get(name).push({ file: f, line: lineNum, type: 'var' });
                return;
            }
        });
    }

    let md = '# Registro delle azioni — Moduli di gioco\n\n';
    md += '> Mappatura delle funzioni globali per i 24 moduli di gioco.\n';
    md += '> Per ogni funzione sono indicati: nome, file e riga di definizione, le azioni `data-ce-act` che la invocano (o "nessuna"),\n';
    md += '> se esistono altre definizioni con lo stesso nome in altri file del repository, e la porta usata per il movimento di denaro (`CE_money` / `RPC` / `diretto` / "no").\n\n';

    const duplicates = [];
    const deadFunctions = [];

    for (const tf of targetFiles) {
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
                // record duplicate once per unique pair
                const exists = duplicates.some(x => x.name === d.name && (x.f1 === tf || x.f2 === tf));
                if (!exists) {
                    duplicates.push({ name: d.name, f1: `${tf}:${d.line}`, f2: otherDefs.map(x => `${x.file}:${x.line}`).join(', ') });
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
        if (dup.name === 'listCarForSale') note = 'P2P market (`p2p-market.js`) sovrascrive la vendita flotta standard (`engine-fleet.js`)';
        else if (dup.name === 'hqOpenBuildModal') note = 'Firme incompatibili tra `hq-visual.js` (passa `cityId`) e `hq.js` (passa `roomId`)';
        else if (dup.name === '_sb' || dup.name === '_uid') note = 'Helper locali identici definiti in scope globale';
        else if (dup.name === 'processDailyRoutines') note = 'Hook routine giornaliere sovrascritto / decorato';
        md += `| \`${dup.name}\` | \`${dup.f1}\` | \`${dup.f2}\` | ${note} |\n`;
    }

    md += '\n---\n\n';
    md += '## Funzioni che nessuno chiama (codice morto)\n\n';
    md += '| Funzione | Definizione | Note |\n';
    md += '|---|---|---|\n';
    for (const df of deadFunctions) {
        let note = 'Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act)';
        if (df.name === '_vipSyncCash') note = 'Helper non referenziato';
        else if (df.name === 'getMissionRequires') note = 'Helper requisiti missione non referenziato';
        else if (df.name === 'driverSkillEffect') note = 'Calcolo effetto skill non referenziato';
        else if (df.name === 'b2bLockedDriverIds') note = 'Getter ID autisti bloccati B2B mai invocato';
        md += `| \`${df.name}\` | \`${df.file}:${df.line}\` | ${note} |\n`;
    }
    md += '\n';

    fs.writeFileSync('docs/AZIONI-moduli.md', md, 'utf8');
    console.log('Successfully written docs/AZIONI-moduli.md');
});
