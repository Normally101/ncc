const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('find dead functions', () => {
    const allFiles = fs.readdirSync('.').filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const projectDefs = [];

    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js' || f === 'config.js' || f === 'money.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                projectDefs.push({ name: m[1], file: f, line: lineNum, type: 'function' });
                return;
            }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) {
                projectDefs.push({ name: m[1], file: f, line: lineNum, type: 'window' });
                return;
            }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/);
            if (m) {
                projectDefs.push({ name: m[1], file: f, line: lineNum, type: 'var' });
                return;
            }
        });
    }

    const dead = [];
    for (const d of projectDefs) {
        const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
        let callers = 0;
        for (const [f, c] of fileContents.entries()) {
            const lines = c.split('\n');
            lines.forEach((line, idx) => {
                if (f === d.file && idx + 1 === d.line) return;
                if (wordRe.test(line)) {
                    callers++;
                }
            });
        }
        if (callers === 0) {
            dead.push(d);
        }
    }

    console.log('FOUND DEAD FUNCTIONS:', dead.length);
    for (const df of dead) {
        console.log(`- ${df.name} (${df.file}:${df.line})`);
    }
});
