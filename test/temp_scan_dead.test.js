const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('scan dead functions', () => {
    const allFiles = fs.readdirSync('.').filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const defs = [];
    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                defs.push({ name: m[1], file: f, line: lineNum, type: 'function' });
                return;
            }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                defs.push({ name: m[1], file: f, line: lineNum, type: 'window' });
                return;
            }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) {
                defs.push({ name: m[1], file: f, line: lineNum, type: 'var' });
                return;
            }
        });
    }

    const dead = [];
    for (const d of defs) {
        let totalCalls = 0;
        const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
        for (const [f, c] of fileContents.entries()) {
            const fLines = c.split('\n');
            fLines.forEach((fl, idx) => {
                const lNum = idx + 1;
                if (f === d.file && lNum === d.line) return;
                if (wordRe.test(fl)) {
                    totalCalls++;
                }
            });
        }
        if (totalCalls === 0) {
            dead.push(d);
        }
    }

    console.log(`TOTAL DEAD FUNCTIONS: ${dead.length}`);
    for (const d of dead) {
        console.log(`- ${d.name} (${d.file}:${d.line})`);
    }
});
