const test = require('node:test');
const fs = require('fs');
const path = require('path');

test('find dead functions', () => {
    const allFiles = fs.readdirSync('.').filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.'));
    const fileContents = new Map();
    for (const f of allFiles) {
        fileContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    // Find all test files
    function getFiles(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) results = results.concat(getFiles(file));
            else if (file.endsWith('.js')) results.push(file);
        });
        return results;
    }
    const testFiles = getFiles('test');
    const testContents = new Map();
    for (const f of testFiles) {
        testContents.set(f, fs.readFileSync(f, 'utf8'));
    }

    const defs = [];
    for (const f of allFiles) {
        if (!f.endsWith('.js') || f === 'sw.js') continue;
        const lines = fileContents.get(f).split('\n');
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
            if (m) { defs.push({ name: m[1], file: f, line: lineNum }); return; }
            m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
            if (m) { defs.push({ name: m[1], file: f, line: lineNum }); return; }
            m = line.match(/^(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/);
            if (m) { defs.push({ name: m[1], file: f, line: lineNum }); return; }
        });
    }

    const deadDefs = [];
    for (const d of defs) {
        let srcCalls = 0;
        const re = new RegExp('\\b' + d.name + '\\b', 'g');
        for (const [f, c] of fileContents.entries()) {
            const lines = c.split('\n');
            lines.forEach((fl, idx) => {
                if (f === d.file && (idx + 1) === d.line) return;
                if (re.test(fl)) srcCalls++;
            });
        }

        let testCalls = 0;
        for (const [f, c] of testContents.entries()) {
            if (re.test(c)) testCalls++;
        }

        if (srcCalls === 0) {
            const size = fs.statSync(d.file).size;
            deadDefs.push({ ...d, testCalls, size });
        }
    }

    console.log('Dead in src count:', deadDefs.length);
    deadDefs.sort((a, b) => b.size - a.size);
    for (const d of deadDefs) {
        console.log(`${d.file} (size ${d.size}) line ${d.line}: ${d.name} (testCalls: ${d.testCalls})`);
    }
});
