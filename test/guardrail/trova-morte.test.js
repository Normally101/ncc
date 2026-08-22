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
        const wordRe = new RegExp(`\\b${d.name}\\b`, 'g');
        let prodCalls = 0;
        let testCalls = 0;
        for (const [f, c] of fileContents.entries()) {
            const lines = c.split('\n');
            lines.forEach((l, idx) => {
                if (f === d.file && idx + 1 === d.line) return;
                if (wordRe.test(l)) prodCalls++;
            });
        }
        const tMatches = allTestContents.match(wordRe);
        testCalls = tMatches ? tMatches.length : 0;

        if (prodCalls === 0) {
            dead.push({ name: d.name, file: d.file, line: d.line, prodCalls, testCalls });
        }
    }

    console.log('--- FUNZIONI MORTE TROVATE ---');
    for (const d of dead) {
        console.log(`${d.file}:${d.line} -> ${d.name} (chiamate prod: ${d.prodCalls}, chiamate test: ${d.testCalls})`);
    }
});
