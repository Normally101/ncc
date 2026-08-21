const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('find all collisions', () => {
    const ROOT = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const files = [...html.matchAll(/src="([^"?]+\.js)/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(f => !f.startsWith('http') && fs.existsSync(path.join(ROOT, f)));
    const uniqueFiles = [...new Set(files)];

    const defs = new Map();
    for (const file of uniqueFiles) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const noComments = code
            .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
        const lines = noComments.split('\n');
        lines.forEach((line, i) => {
            let m = line.match(/^function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) {
                const name = m[1];
                if (!defs.has(name)) defs.set(name, []);
                defs.get(name).push({ file, line: i+1, type: 'function' });
            }
            m = line.match(/(?:^|[^.\w$])window(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\])\s*=(?!=|>)/);
            if (m) {
                const name = m[1] || m[2];
                if (!defs.has(name)) defs.set(name, []);
                defs.get(name).push({ file, line: i+1, type: 'window' });
            }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_$]+\s*=>)/);
            if (m) {
                const name = m[1];
                if (!defs.has(name)) defs.set(name, []);
                defs.get(name).push({ file, line: i+1, type: 'var' });
            }
        });
    }

    console.log('--- DUPLICATES FOUND ---');
    for (const [name, entries] of defs.entries()) {
        const fileSet = new Set(entries.map(e => e.file));
        if (fileSet.size > 1) {
            console.log(name, JSON.stringify(entries));
        }
    }
});
