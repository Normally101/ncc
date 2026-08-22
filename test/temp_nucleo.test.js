const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('analyzer', () => {
  const fs = require('fs');
  const path = require('path');
  const allJs = fs.readdirSync('.').filter(f => f.endsWith('.js') && !f.startsWith('.'));
  
  const defs = new Map();
  for (const f of allJs) {
      const code = fs.readFileSync(f, 'utf8');
      const lines = code.split('\n');
      lines.forEach((line, idx) => {
          let m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
          if (m) {
              const name = m[1];
              if (!defs.has(name)) defs.set(name, []);
              defs.get(name).push({ file: f, line: idx + 1, type: 'function' });
              return;
          }
          m = line.match(/(?:^|\s)window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/);
          if (m) {
              const name = m[1];
              if (!defs.has(name)) defs.set(name, []);
              defs.get(name).push({ file: f, line: idx + 1, type: 'window' });
              return;
          }
      });
  }
  
  const duplicates = [];
  for (const [name, list] of defs.entries()) {
      const uniqueFiles = new Set(list.map(x => x.file));
      if (uniqueFiles.size > 1) {
          duplicates.push({ name, files: [...uniqueFiles], list });
      }
  }
  console.log('Total duplicates found across all JS files:', duplicates.length);
  for (const d of duplicates) {
      console.log(`- ${d.name} in:`, d.list.map(x => `${x.file}:${x.line}`).join(', '));
  }
});
