const test = require('node:test');
const fs = require('node:fs');

test('find dead functions in nucleo', () => {
    const nucleoFiles = [
        'engine.js',
        'engine-fleet.js',
        'engine-finance.js',
        'engine-drivers.js',
        'engine-store.js',
        'engine-holding.js',
        'engine-daily.js',
        'engine-rides.js',
        'saveSystem.js',
        'dispatcher.js'
    ];

    const allFiles = fs.readdirSync('.').filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const deadFunctions = [];

    for (const tf of nucleoFiles) {
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
            // Check data-ce-act / ceAct
            let hasCeAct = false;
            for (const [f, c] of fileContents.entries()) {
                const re1 = new RegExp(`ceAct\\(\\s*['"]${d.name}['"]`, 'g');
                const re2 = new RegExp(`data-ce-act=['"]${d.name}['"]`, 'g');
                const re3 = new RegExp(`ceThen\\(\\s*['"]${d.name}['"]`, 'g');
                const re4 = new RegExp(`ceThen\\([^,]+,\\s*['"]${d.name}['"]`, 'g');
                const re5 = new RegExp(`ceSetRender\\([^,]+,[^,]+,[^,]+,\\s*['"]${d.name}['"]`, 'g');
                if (re1.test(c) || re2.test(c) || re3.test(c) || re4.test(c) || re5.test(c)) {
                    hasCeAct = true;
                    break;
                }
            }
            if (hasCeAct) continue;

            let totalCalls = 0;
            const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
            for (const [f, c] of fileContents.entries()) {
                const fLines = c.split('\n');
                fLines.forEach((fl, idx) => {
                    const lNum = idx + 1;
                    if (f === tf && lNum === d.line) return;
                    if (wordRe.test(fl)) {
                        totalCalls++;
                    }
                });
            }

            if (totalCalls === 0) {
                deadFunctions.push({ name: d.name, file: tf, line: d.line });
            }
        }
    }

    console.log('Dead functions found in nucleo:', JSON.stringify(deadFunctions, null, 2));
});
