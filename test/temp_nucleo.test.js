const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('scan dead functions in whole codebase', () => {
    const allFiles = fs.readdirSync('.').filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const allDefs = [];
    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                allDefs.push({ name: m[1], file: f, line: lineNum });
                return;
            }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                allDefs.push({ name: m[1], file: f, line: lineNum });
                return;
            }
        });
    }

    const dead = [];
    for (const d of allDefs) {
        if (d.name.startsWith('test') || d.name === 'init' || d.name === 'getState') continue;
        const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
        let calls = 0;
        const callers = [];
        for (const [f, c] of fileContents.entries()) {
            const lines = c.split('\n');
            lines.forEach((fl, idx) => {
                const lNum = idx + 1;
                if (f === d.file && lNum === d.line) return;
                if (wordRe.test(fl)) {
                    calls++;
                    if (!callers.includes(f)) callers.push(f);
                }
            });
        }
        if (calls === 0) {
            dead.push({ name: d.name, file: d.file, line: d.line });
        }
    }
    console.log('DEAD FUNCTIONS FOUND:', JSON.stringify(dead, null, 2));
});
